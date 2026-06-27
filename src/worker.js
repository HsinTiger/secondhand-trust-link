const STATUSES = new Set(['created', 'funded', 'shipped', 'inspection', 'released', 'refunded', 'disputed']);
const EVENTS = new Set(['funded', 'shipped', 'delivered', 'buyer_confirmed', 'dispute_opened', 'released', 'refunded', 'note']);
const METHODS = new Set(['寄送', '面交', '宅配', '超商', '其他']);
const INSPECT_WINDOWS = new Set(['24 小時', '48 小時', '72 小時']);
const CARRIERS = new Set(['7-11 店到店', '全家店到店', '萊爾富店到店', '中華郵政', '黑貓宅急便', '宅配通', '面交/自取', '其他']);
const CODE_PATTERN = /^(pub|seller|buyer)_[a-f0-9]{24}$/;
const MAX_JSON_BYTES = 4096;
const RATE_LIMITS = {
  createDeal: { limit: 8, windowSeconds: 15 * 60 },
  createDealGlobal: { limit: 12, windowSeconds: 15 * 60 },
  readDeal: { limit: 120, windowSeconds: 5 * 60 },
  readGlobal: { limit: 240, windowSeconds: 5 * 60 },
  addEvent: { limit: 30, windowSeconds: 15 * 60 },
  feedback: { limit: 20, windowSeconds: 24 * 60 * 60 },
  addShipping: { limit: 10, windowSeconds: 60 * 60 },
  addVerification: { limit: 10, windowSeconds: 60 * 60 },
};
const HIGH_RISK_TERMS = ['票券', '禮品卡', '點數', '遊戲幣', '帳號', '精品', '代儲', '金融', '投資', '虛擬帳戶', '門號'];
const MAX_EVENTS_PER_DEAL = 40;

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
  const enforced = String(env.TURNSTILE_ENFORCED || '').trim() === 'true';
  if (!secret) return enforced ? json({ error: 'turnstile_not_configured' }, 503, cors(request, env)) : null;
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
  const ip = cfIp || 'unknown-ip';
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

function prohibitedTerms(item) {
  const lowerItem = item.toLowerCase();
  return HIGH_RISK_TERMS.filter((term) => lowerItem.includes(term.toLowerCase()));
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
  const globalLimited = await rateLimit(request, env, 'createDealGlobal');
  if (globalLimited) return globalLimited;

  const body = await readJson(request);
  if (!body || Array.isArray(body)) return json({ error: 'invalid_json' }, 400, cors(request, env));
  const turnstileError = await verifyTurnstile(request, env, body);
  if (turnstileError) return turnstileError;

  const item = cleanText(body.item, 120);
  const description = cleanText(body.description, 500);
  const amount = validateAmount(body.amount_usdc || body.amount);
  const currency = cleanText(body.currency, 10) || 'USDC';
  const method = cleanChoice(body.method, METHODS, '寄送');
  const shipBy = cleanText(body.ship_by || body.shipBy, 40) || '48 小時內';
  const inspect = cleanChoice(body.inspect, INSPECT_WINDOWS, '48 小時');
  const sellerContact = cleanText(body.seller_contact, 120);

  if (item.length < 2 || !amount) {
    return json({ error: 'invalid_deal', message: 'item and amount_usdc 1-1000 are required' }, 400, cors(request, env));
  }
  const prohibited = prohibitedTerms(item);
  if (prohibited.length) {
    return json({ error: 'prohibited_item', terms: prohibited, message: '此類品項容易被用於詐騙或違規交易，MVP 暫不開放建立交易。' }, 400, cors(request, env));
  }

  const now = new Date().toISOString();
  const dealId = id('deal');
  const publicCode = id('pub');
  const sellerCode = id('seller');
  const buyerCode = id('buyer');
  const risk = riskReview({ item, amount, method });

  await env.DB.prepare(`
    INSERT INTO deals (id, public_code, seller_code, buyer_code, item, description, amount_usdc, currency, method, ship_by, inspect, status, seller_contact, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?)
  `).bind(dealId, publicCode, sellerCode, buyerCode, item, description, amount, currency, method, shipBy, inspect, sellerContact, now, now).run();

  await env.DB.prepare(`INSERT INTO deal_events (id, deal_id, type, actor, note, created_at) VALUES (?, ?, 'created', 'seller', ?, ?)`).bind(id('evt'), dealId, `建立交易：${item}`, now).run();

  return json({
    deal: { id: dealId, public_code: publicCode, status: 'created', item, description, amount_usdc: amount, currency, method, ship_by: shipBy, inspect },
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
  if (applyLimit) {
    const globalLimited = await rateLimit(request, env, 'readGlobal');
    if (globalLimited) return globalLimited;
  }

  const deal = await env.DB.prepare('SELECT id, public_code, item, description, amount_usdc, currency, method, ship_by, inspect, status, seller_code, buyer_code, created_at, updated_at FROM deals WHERE public_code = ?').bind(publicCode).first();
  if (!deal) return json({ error: 'not_found' }, 404, cors(request, env));
  const events = await env.DB.prepare('SELECT type, actor, note, created_at FROM deal_events WHERE deal_id = ? ORDER BY created_at ASC').bind(deal.id).all();
  const shipping = await env.DB.prepare('SELECT carrier, tracking_number, shipped_at, delivered_at FROM shipping WHERE deal_id = ?').bind(deal.id).first();
  const verifications = await env.DB.prepare('SELECT check_type, provider, score, verdict, created_at FROM verifications WHERE deal_id = ? ORDER BY created_at ASC').bind(deal.id).all();
  return json({ deal, events: events.results || [], shipping: shipping || null, verifications: verifications.results || [] }, 200, cors(request, env));
}

async function getMetrics(request, env) {
  const limited = await rateLimit(request, env, 'readGlobal', 'metrics');
  if (limited) return limited;

  const [dealTotal, dealsByStatus, feedbackTotal, feedbackByRole, feedbackByWillingness, feedbackByUseCase] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM deals').first(),
    env.DB.prepare('SELECT status, COUNT(*) AS count FROM deals GROUP BY status ORDER BY count DESC, status ASC').all(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM feedback').first(),
    env.DB.prepare('SELECT role, COUNT(*) AS count FROM feedback GROUP BY role ORDER BY count DESC, role ASC').all(),
    env.DB.prepare('SELECT willingness, COUNT(*) AS count FROM feedback GROUP BY willingness ORDER BY count DESC, willingness ASC').all(),
    env.DB.prepare('SELECT use_case, COUNT(*) AS count FROM feedback WHERE use_case IS NOT NULL AND use_case != "" GROUP BY use_case ORDER BY count DESC, use_case ASC LIMIT 12').all(),
  ]);

  return json({
    generated_at: new Date().toISOString(),
    privacy: 'aggregate_only_no_contact_no_tokens',
    deals: {
      total: Number(dealTotal?.count || 0),
      by_status: dealsByStatus.results || [],
    },
    feedback: {
      total: Number(feedbackTotal?.count || 0),
      by_role: feedbackByRole.results || [],
      by_willingness: feedbackByWillingness.results || [],
      by_use_case: feedbackByUseCase.results || [],
    },
    targets: {
      seven_day_feedback: 10,
      seven_day_deals: 30,
      signal: '先看真實賣家是否願意分享交易連結，不急著做金流。',
    },
  }, 200, { ...cors(request, env), 'cache-control': 'no-store' });
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
  if (eventType === 'released') return json({ error: 'buyer_confirmation_required' }, 403, cors(request, env));
  if (eventType === 'buyer_confirmed' && !['shipped', 'inspection'].includes(deal.status)) return json({ error: 'not_ready_for_confirmation' }, 409, cors(request, env));
  if (['released', 'refunded'].includes(deal.status)) return json({ error: 'deal_closed' }, 409, cors(request, env));
  const eventCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM deal_events WHERE deal_id = ?').bind(deal.id).first();
  if (Number(eventCount?.count || 0) >= MAX_EVENTS_PER_DEAL) return json({ error: 'too_many_events' }, 429, cors(request, env));
  if (eventType !== 'note') {
    const duplicate = await env.DB.prepare('SELECT id FROM deal_events WHERE deal_id = ? AND type = ? LIMIT 1').bind(deal.id, eventType).first();
    if (duplicate) return json({ error: 'duplicate_event' }, 409, cors(request, env));
  }
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

async function addShipping(request, env, code) {
  const publicCode = cleanCode(code);
  if (!publicCode || !publicCode.startsWith('pub_')) return json({ error: 'invalid_code' }, 400, cors(request, env));
  const limited = await rateLimit(request, env, 'addShipping', publicCode);
  if (limited) return limited;

  const body = await readJson(request);
  if (!body || Array.isArray(body)) return json({ error: 'invalid_json' }, 400, cors(request, env));

  const token = cleanCode(body.token);
  const deal = await env.DB.prepare('SELECT id, seller_code, status FROM deals WHERE public_code = ?').bind(publicCode).first();
  if (!deal) return json({ error: 'not_found' }, 404, cors(request, env));
  if (!token || token !== deal.seller_code) return json({ error: 'seller_token_required' }, 403, cors(request, env));

  const carrier = cleanChoice(body.carrier, CARRIERS, '其他');
  const trackingNumber = cleanText(body.tracking_number, 60);
  if (!trackingNumber.length) return json({ error: 'tracking_number_required' }, 400, cors(request, env));

  const now = new Date().toISOString();
  const existing = await env.DB.prepare('SELECT id FROM shipping WHERE deal_id = ?').bind(deal.id).first();
  if (existing) {
    await env.DB.prepare('UPDATE shipping SET carrier = ?, tracking_number = ?, shipped_at = ? WHERE deal_id = ?').bind(carrier, trackingNumber, now, deal.id).run();
  } else {
    await env.DB.prepare('INSERT INTO shipping (id, deal_id, carrier, tracking_number, shipped_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id('ship'), deal.id, carrier, trackingNumber, now, now).run();
  }

  if (['created', 'funded'].includes(deal.status)) {
    await env.DB.prepare('UPDATE deals SET status = ?, updated_at = ? WHERE id = ?').bind('shipped', now, deal.id).run();
    await env.DB.prepare("INSERT INTO deal_events (id, deal_id, type, actor, note, created_at) VALUES (?, ?, 'shipped', 'seller', ?, ?)").bind(id('evt'), deal.id, `已出貨：${carrier} ${trackingNumber}`, now).run();
  }

  const shipping = await env.DB.prepare('SELECT carrier, tracking_number, shipped_at, delivered_at FROM shipping WHERE deal_id = ?').bind(deal.id).first();
  return json({ ok: true, shipping }, 200, cors(request, env));
}

async function addVerification(request, env, code) {
  const publicCode = cleanCode(code);
  if (!publicCode || !publicCode.startsWith('pub_')) return json({ error: 'invalid_code' }, 400, cors(request, env));
  const limited = await rateLimit(request, env, 'addVerification', publicCode);
  if (limited) return limited;

  const body = await readJson(request);
  if (!body || Array.isArray(body)) return json({ error: 'invalid_json' }, 400, cors(request, env));

  const token = cleanCode(body.token);
  const deal = await env.DB.prepare('SELECT id, seller_code, item, description FROM deals WHERE public_code = ?').bind(publicCode).first();
  if (!deal) return json({ error: 'not_found' }, 404, cors(request, env));
  if (!token || token !== deal.seller_code) return json({ error: 'seller_token_required' }, 403, cors(request, env));

  const checkType = cleanText(body.check_type, 20);
  if (!['pre_shipment', 'post_receipt'].includes(checkType)) return json({ error: 'invalid_check_type' }, 400, cors(request, env));
  const photoUrl = cleanText(body.photo_url, 500);
  if (!photoUrl.length) return json({ error: 'photo_url_required' }, 400, cors(request, env));

  let score = 50;
  let verdict = 'pending';
  let result = {};

  try {
    const description = deal.description || deal.item;
    const aiPrompt = `You are a secondhand goods verification assistant. Compare the product description with the uploaded photo.\n\nProduct: ${description}\nPhoto URL: ${photoUrl}\n\nRespond ONLY with a JSON object (no markdown): { "object_detected": "string", "color_match_score": 0-100, "visible_damage": "string or null", "description_consistency": "pass|warn|fail", "overall_score": 0-100, "verdict": "pass|warn|fail", "warnings": ["string"] }`;

    const aiResponse = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
      messages: [{ role: 'user', content: [{ type: 'image', image: photoUrl }, { type: 'text', text: aiPrompt }] }],
      max_tokens: 512,
    });

    const rawText = aiResponse?.response || aiResponse?.choices?.[0]?.message?.content || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
      score = Number(result.overall_score) || 50;
      verdict = result.verdict || (score >= 70 ? 'pass' : score >= 40 ? 'warn' : 'fail');
    } else {
      result = { raw_response: rawText, parse_failed: true };
      verdict = 'error';
    }
  } catch (aiError) {
    result = { error: String(aiError) };
    verdict = 'error';
  }

  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO verifications (id, deal_id, check_type, provider, result_json, score, verdict, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id('vr'), deal.id, checkType, 'cloudflare', JSON.stringify(result), score, verdict, now).run();

  return json({ ok: true, verification: { check_type: checkType, score, verdict, result } }, 200, cors(request, env));
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
    if (url.pathname === '/api/metrics' && request.method === 'GET') return getMetrics(request, env);

    const shippingMatch = url.pathname.match(/^\/api\/deals\/([^/]+)\/shipping$/);
    if (shippingMatch && request.method === 'POST') return addShipping(request, env, shippingMatch[1]);

    const verifyMatch = url.pathname.match(/^\/api\/deals\/([^/]+)\/verify$/);
    if (verifyMatch && request.method === 'POST') return addVerification(request, env, verifyMatch[1]);

    const match = url.pathname.match(/^\/api\/deals\/([^/]+)(?:\/events)?$/);
    if (match && request.method === 'GET') return getDeal(request, env, match[1]);
    if (match && request.method === 'POST' && url.pathname.endsWith('/events')) return addEvent(request, env, match[1]);

    return addSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
