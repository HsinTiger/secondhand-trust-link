const STATUSES = new Set(['created', 'funded', 'shipped', 'inspection', 'released', 'refunded', 'disputed']);
const EVENTS = new Set(['funded', 'shipped', 'delivered', 'buyer_confirmed', 'dispute_opened', 'released', 'refunded', 'note']);
const METHODS = new Set(['寄送', '面交', '宅配', '超商', '其他']);
const INSPECT_WINDOWS = new Set(['24 小時', '48 小時', '72 小時']);
const CODE_PATTERN = /^(pub|seller|buyer)_[a-f0-9]{24}$/;
const MAX_JSON_BYTES = 4096;
const RATE_LIMITS = {
  createDeal: { limit: 8, windowSeconds: 15 * 60 },
  readDeal: { limit: 120, windowSeconds: 5 * 60 },
  addEvent: { limit: 30, windowSeconds: 15 * 60 },
  feedback: { limit: 20, windowSeconds: 24 * 60 * 60 },
};
const HIGH_RISK_TERMS = ['票券', '禮品卡', '點數', '遊戲幣', '帳號', '精品', '代儲', '金融', '投資', '虛擬帳戶', '門號'];

function securityHeaders() {
  return {
    'content-security-policy': "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'cross-origin-resource-policy': 'same-origin',
  };
}

function addSecurityHeaders(response, extraHeaders = {}) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...securityHeaders(),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function cors(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGIN || '').trim();
  const allowedOrigins = allowed.split(',').map((value) => value.trim()).filter(Boolean);
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : '';
  const headers = {
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
  };
  if (allowOrigin) {
    headers['access-control-allow-origin'] = allowOrigin;
    headers.vary = 'Origin';
  }
  return headers;
}

function id(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${token}`;
}

async function verifyTurnstile(request, env, body) {
  const secret = String(env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) return null;
  const token = cleanText(body?.turnstile_token, 2048);
  if (!token) return json({ error: 'turnstile_required' }, 403, cors(request, env));
  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  formData.append('remoteip', request.headers.get('cf-connecting-ip') || '');
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: formData });
  const result = await response.json();
  return result.success ? null : json({ error: 'turnstile_failed' }, 403, cors(request, env));
}

async function readJson(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return null;
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_JSON_BYTES) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cleanText(value, max = 160) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanCode(value) {
  const code = cleanText(value, 32);
  return CODE_PATTERN.test(code) ? code : '';
}

function cleanChoice(value, choices, fallback) {
  const text = cleanText(value, 40);
  return choices.has(text) ? text : fallback;
}

function validateAmount(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(raw)) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000) return null;
  return amount.toFixed(2);
}

function clientFingerprint(request) {
  const cfIp = request.headers.get('cf-connecting-ip') || '';
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ip = cfIp || forwarded.split(',')[0].trim() || 'unknown-ip';
  const userAgent = cleanText(request.headers.get('user-agent') || 'unknown-ua', 120);
  return `${ip}|${userAgent}`;
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function rateLimit(request, env, scope, detail = '') {
  const config = RATE_LIMITS[scope];
  if (!config) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const resetAt = nowSeconds + config.windowSeconds;
  const keyHash = await sha256Hex(`${scope}|${detail}|${clientFingerprint(request)}`);
  const key = `rl_${scope}_${keyHash}`;

  const result = await env.DB.prepare(`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at > ? THEN rate_limits.count + 1 ELSE 1 END,
      reset_at = CASE WHEN rate_limits.reset_at > ? THEN rate_limits.reset_at ELSE excluded.reset_at END
    RETURNING count, reset_at
  `).bind(key, resetAt, nowSeconds, nowSeconds).first();

  const count = Number(result?.count || 1);
  const retryAfter = Math.max(1, Number(result?.reset_at || resetAt) - nowSeconds);
  if (Math.random() < 0.01) {
    await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(nowSeconds - 24 * 60 * 60).run();
  }
  if (count > config.limit) {
    return json({ error: 'rate_limited', retry_after_seconds: retryAfter }, 429, {
      ...cors(request, env),
      'retry-after': String(retryAfter),
    });
  }
  return null;
}

function riskReview({ item, amount, method }) {
  const warnings = [];
  const lowerItem = item.toLowerCase();
  const hits = HIGH_RISK_TERMS.filter((term) => lowerItem.includes(term.toLowerCase()));
  if (hits.length) warnings.push(`商品描述含高風險字詞：${hits.join('、')}。建議暫停交易或要求更多證據。`);
  if (Number(amount) >= 300) warnings.push('金額較高，建議賣方提供序號/實拍照，買方保留開箱影片。');
  if (/iphone|手機|相機|鏡頭|筆電|顯卡|3c/i.test(item)) warnings.push('二手 3C 建議要求序號照片、外觀瑕疵照與開箱影片。');
  if (method.includes('面交')) warnings.push('面交建議約公開場所，事前寫清楚時間、地點、驗貨方式。');
  if (!warnings.length) warnings.push('目前未命中高風險規則；仍建議保留出貨與驗收證據。');
  return { level: hits.length || Number(amount) >= 300 ? 'medium' : 'low', warnings };
}

function nextStatus(eventType, current) {
  if (eventType === 'funded' && current === 'created') return 'funded';
  if (eventType === 'shipped' && ['funded', 'created'].includes(current)) return 'shipped';
  if (eventType === 'delivered' && current === 'shipped') return 'inspection';
  if (eventType === 'buyer_confirmed' && ['inspection', 'shipped', 'funded'].includes(current)) return 'released';
  if (eventType === 'dispute_opened' && !['released', 'refunded'].includes(current)) return 'disputed';
  if (eventType === 'released' && current === 'disputed') return 'released';
  if (eventType === 'refunded' && ['created', 'funded', 'disputed'].includes(current)) return 'refunded';
  return current;
}

async function createDeal(request, env) {
  const limited = await rateLimit(request, env, 'createDeal');
  if (limited) return limited;

  const body = await readJson(request);
  if (!body || Array.isArray(body)) return json({ error: 'invalid_json' }, 400, cors(request, env));
  const turnstileError = await verifyTurnstile(request, env, body);
  if (turnstileError) return turnstileError;

  const item = cleanText(body.item, 120);
  const amount = validateAmount(body.amount_usdc || body.amount);
  const method = cleanChoice(body.method, METHODS, '寄送');
  const shipBy = cleanText(body.ship_by || body.shipBy, 40) || '48 小時內';
  const inspect = cleanChoice(body.inspect, INSPECT_WINDOWS, '48 小時');
  const sellerContact = cleanText(body.seller_contact, 120);

  if (item.length < 2 || !amount) {
    return json({ error: 'invalid_deal', message: 'item and amount_usdc 1-1000 are required' }, 400, cors(request, env));
  }

  const now = new Date().toISOString();
  const dealId = id('deal');
  const publicCode = id('pub');
  const sellerCode = id('seller');
  const buyerCode = id('buyer');
  const risk = riskReview({ item, amount, method });

  await env.DB.prepare(`
    INSERT INTO deals (id, public_code, seller_code, buyer_code, item, amount_usdc, method, ship_by, inspect, status, seller_contact, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?)
  `).bind(dealId, publicCode, sellerCode, buyerCode, item, amount, method, shipBy, inspect, sellerContact, now, now).run();

  await env.DB.prepare(`INSERT INTO deal_events (id, deal_id, type, actor, note, created_at) VALUES (?, ?, 'created', 'seller', ?, ?)`).bind(id('evt'), dealId, `建立交易：${item}`, now).run();

  return json({
    deal: { id: dealId, public_code: publicCode, status: 'created', item, amount_usdc: amount, method, ship_by: shipBy, inspect },
    risk,
    links: {
      public: `/deal.html?code=${publicCode}`,
      seller: `/deal.html?code=${publicCode}&role=seller&token=${sellerCode}`,
      buyer: `/deal.html?code=${publicCode}&role=buyer&token=${buyerCode}`,
    },
  }, 201, cors(request, env));
}

async function getDeal(request, env, code, applyLimit = true) {
  const publicCode = cleanCode(code);
  if (!publicCode || !publicCode.startsWith('pub_')) return json({ error: 'invalid_code' }, 400, cors(request, env));
  const limited = await rateLimit(request, env, 'readDeal', publicCode);
  if (limited) return limited;

  const deal = await env.DB.prepare('SELECT id, public_code, item, amount_usdc, method, ship_by, inspect, status, created_at, updated_at FROM deals WHERE public_code = ?').bind(publicCode).first();
  if (!deal) return json({ error: 'not_found' }, 404, cors(request, env));
  const events = await env.DB.prepare('SELECT type, actor, note, created_at FROM deal_events WHERE deal_id = ? ORDER BY created_at ASC').bind(deal.id).all();
  return json({ deal, events: events.results || [] }, 200, cors(request, env));
}

async function createFeedback(request, env) {
  const limited = await rateLimit(request, env, 'feedback');
  if (limited) return limited;

  const body = await readJson(request);
  if (!body || Array.isArray(body)) return json({ error: 'invalid_json' }, 400, cors(request, env));
  const turnstileError = await verifyTurnstile(request, env, body);
  if (turnstileError) return turnstileError;
  const message = cleanText(body.message, 1000);
  if (message.length < 4) return json({ error: 'message_required' }, 400, cors(request, env));

  const now = new Date().toISOString();
  const feedback = {
    id: id('fb'),
    source: cleanText(body.source, 60) || 'website',
    role: cleanText(body.role, 40) || 'unknown',
    use_case: cleanText(body.use_case, 120),
    willingness: cleanText(body.willingness, 80),
    contact: cleanText(body.contact, 160),
    message,
    created_at: now,
  };

  await env.DB.prepare(`
    INSERT INTO feedback (id, source, role, use_case, willingness, contact, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(feedback.id, feedback.source, feedback.role, feedback.use_case, feedback.willingness, feedback.contact, feedback.message, feedback.created_at).run();

  return json({ ok: true, feedback_id: feedback.id }, 201, cors(request, env));
}

async function addEvent(request, env, code) {
  const publicCode = cleanCode(code);
  if (!publicCode || !publicCode.startsWith('pub_')) return json({ error: 'invalid_code' }, 400, cors(request, env));
  const limited = await rateLimit(request, env, 'addEvent', publicCode);
  if (limited) return limited;

  const body = await readJson(request);
  if (!body || Array.isArray(body)) return json({ error: 'invalid_json' }, 400, cors(request, env));
  const eventType = cleanText(body.type, 40);
  if (!EVENTS.has(eventType)) return json({ error: 'invalid_event' }, 400, cors(request, env));

  const token = cleanCode(body.token);
  const deal = await env.DB.prepare('SELECT * FROM deals WHERE public_code = ?').bind(publicCode).first();
  if (!deal) return json({ error: 'not_found' }, 404, cors(request, env));

  const sellerAllowed = token && token === deal.seller_code;
  const buyerAllowed = token && token === deal.buyer_code;
  if (!sellerAllowed && !buyerAllowed) return json({ error: 'unauthorized_token' }, 403, cors(request, env));
  const actor = sellerAllowed ? 'seller' : 'buyer';

  if ((eventType === 'shipped' || eventType === 'released') && !sellerAllowed) return json({ error: 'seller_token_required' }, 403, cors(request, env));
  if ((eventType === 'buyer_confirmed' || eventType === 'dispute_opened') && !buyerAllowed) return json({ error: 'buyer_token_required' }, 403, cors(request, env));
  if (['released', 'refunded'].includes(deal.status)) return json({ error: 'deal_closed' }, 409, cors(request, env));
  const note = cleanText(body.note, 500);
  if (eventType === 'note' && note.length < 2) return json({ error: 'invalid_note' }, 400, cors(request, env));

  const now = new Date().toISOString();
  const status = nextStatus(eventType, deal.status);
  await env.DB.prepare('INSERT INTO deal_events (id, deal_id, type, actor, note, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id('evt'), deal.id, eventType, actor, note, now).run();
  if (STATUSES.has(status) && status !== deal.status) {
    await env.DB.prepare('UPDATE deals SET status = ?, updated_at = ? WHERE id = ?').bind(status, now, deal.id).run();
  }
  return getDeal(request, env, publicCode, false);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: headers['access-control-allow-origin'] ? 204 : 403, headers: { ...securityHeaders(), ...headers } });
    if (!['GET', 'POST', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405, headers);

    if (url.pathname === '/api/health') return json({ ok: true, service: 'secondhand-safe-trade-api' }, 200, headers);
    if (url.pathname === '/api/deals' && request.method === 'POST') return createDeal(request, env);
    if (url.pathname === '/api/feedback' && request.method === 'POST') return createFeedback(request, env);

    const match = url.pathname.match(/^\/api\/deals\/([^/]+)(?:\/events)?$/);
    if (match && request.method === 'GET') return getDeal(request, env, match[1]);
    if (match && request.method === 'POST' && url.pathname.endsWith('/events')) return addEvent(request, env, match[1]);

    return addSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
