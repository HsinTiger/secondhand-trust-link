const STATUSES = new Set(['created', 'funded', 'shipped', 'inspection', 'released', 'refunded', 'disputed']);
const EVENTS = new Set(['funded', 'shipped', 'delivered', 'buyer_confirmed', 'dispute_opened', 'released', 'refunded', 'note']);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function cors(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = env.ALLOWED_ORIGIN || '*';
  const allowOrigin = allowed === '*' || origin.startsWith(allowed) ? origin || allowed : allowed;
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  };
}

function id(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${token}`;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function cleanText(value, max = 160) {
  return String(value || '').trim().slice(0, max);
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
  const body = await readJson(request);
  if (!body) return json({ error: 'invalid_json' }, 400, cors(request, env));

  const item = cleanText(body.item, 120);
  const amount = Number(body.amount_usdc || body.amount || 0);
  const method = cleanText(body.method, 40) || '寄送';
  const shipBy = cleanText(body.ship_by || body.shipBy, 40) || '48 小時內';
  const inspect = cleanText(body.inspect, 40) || '48 小時';
  const sellerContact = cleanText(body.seller_contact, 120);

  if (!item || !Number.isFinite(amount) || amount <= 0 || amount > 1000) {
    return json({ error: 'invalid_deal', message: 'item and amount_usdc 1-1000 are required' }, 400, cors(request, env));
  }

  const now = new Date().toISOString();
  const dealId = id('deal');
  const publicCode = id('pub');
  const sellerCode = id('seller');
  const buyerCode = id('buyer');

  await env.DB.prepare(`
    INSERT INTO deals (id, public_code, seller_code, buyer_code, item, amount_usdc, method, ship_by, inspect, status, seller_contact, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?)
  `).bind(dealId, publicCode, sellerCode, buyerCode, item, amount.toFixed(2), method, shipBy, inspect, sellerContact, now, now).run();

  await env.DB.prepare(`INSERT INTO deal_events (id, deal_id, type, actor, note, created_at) VALUES (?, ?, 'created', 'seller', ?, ?)`).bind(id('evt'), dealId, `建立交易：${item}`, now).run();

  return json({
    deal: { id: dealId, public_code: publicCode, status: 'created', item, amount_usdc: amount.toFixed(2), method, ship_by: shipBy, inspect },
    links: {
      public: `/deal.html?code=${publicCode}`,
      seller: `/deal.html?code=${publicCode}&role=seller&token=${sellerCode}`,
      buyer: `/deal.html?code=${publicCode}&role=buyer&token=${buyerCode}`,
    },
  }, 201, cors(request, env));
}

async function getDeal(request, env, code) {
  const deal = await env.DB.prepare('SELECT id, public_code, item, amount_usdc, method, ship_by, inspect, status, created_at, updated_at FROM deals WHERE public_code = ?').bind(code).first();
  if (!deal) return json({ error: 'not_found' }, 404, cors(request, env));
  const events = await env.DB.prepare('SELECT type, actor, note, created_at FROM deal_events WHERE deal_id = ? ORDER BY created_at ASC').bind(deal.id).all();
  return json({ deal, events: events.results || [] }, 200, cors(request, env));
}

async function addEvent(request, env, code) {
  const body = await readJson(request);
  if (!body) return json({ error: 'invalid_json' }, 400, cors(request, env));
  const eventType = cleanText(body.type, 40);
  if (!EVENTS.has(eventType)) return json({ error: 'invalid_event' }, 400, cors(request, env));

  const token = cleanText(body.token, 80);
  const actor = cleanText(body.actor, 20) || 'system';
  const deal = await env.DB.prepare('SELECT * FROM deals WHERE public_code = ?').bind(code).first();
  if (!deal) return json({ error: 'not_found' }, 404, cors(request, env));

  const sellerAllowed = token && token === deal.seller_code;
  const buyerAllowed = token && token === deal.buyer_code;
  if (!sellerAllowed && !buyerAllowed) return json({ error: 'unauthorized_token' }, 403, cors(request, env));

  if ((eventType === 'shipped' || eventType === 'released') && !sellerAllowed) return json({ error: 'seller_token_required' }, 403, cors(request, env));
  if ((eventType === 'buyer_confirmed' || eventType === 'dispute_opened') && !buyerAllowed) return json({ error: 'buyer_token_required' }, 403, cors(request, env));

  const now = new Date().toISOString();
  const status = nextStatus(eventType, deal.status);
  await env.DB.prepare('INSERT INTO deal_events (id, deal_id, type, actor, note, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id('evt'), deal.id, eventType, actor, cleanText(body.note, 500), now).run();
  if (STATUSES.has(status) && status !== deal.status) {
    await env.DB.prepare('UPDATE deals SET status = ?, updated_at = ? WHERE id = ?').bind(status, now, deal.id).run();
  }
  return getDeal(request, env, code);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    if (url.pathname === '/api/health') return json({ ok: true, service: 'secondhand-safe-trade-api' }, 200, headers);
    if (url.pathname === '/api/deals' && request.method === 'POST') return createDeal(request, env);

    const match = url.pathname.match(/^\/api\/deals\/([^/]+)(?:\/events)?$/);
    if (match && request.method === 'GET') return getDeal(request, env, match[1]);
    if (match && request.method === 'POST' && url.pathname.endsWith('/events')) return addEvent(request, env, match[1]);

    return env.ASSETS.fetch(request);
  },
};
