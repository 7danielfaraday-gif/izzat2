// Cloudflare Pages Function: GET/POST /api/checkout-log
// Purpose:
// - POST (public): store a "checkout capture" record in KV
// - GET  (admin): list recent records (requires HTTP Basic Auth)
// Auth (GET): Secrets PIX_ADMIN_USER / PIX_ADMIN_PASS (same as /admin)
// Storage: KV (binding name: PIX_STORE)
//
// Notes:
// - KV is key/value; we store each record with a timestamped key so it can be sorted.
// - Optional retention: defaults to 45 days (env CHECKOUT_LOG_TTL_DAYS can override).

const PREFIX = 'checkout_log_v1:';
const DEFAULT_TTL_DAYS = 45;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  });
}

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'www-authenticate': 'Basic realm="PIX Admin", charset="UTF-8"',
    },
  });
}

function checkBasicAuth(request, env) {
  const user = env.PIX_ADMIN_USER;
  const pass = env.PIX_ADMIN_PASS;
  if (!user || !pass) return false;

  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Basic\s+(.+)$/i);
  if (!m) return false;

  let decoded = '';
  try {
    decoded = atob(m[1]);
  } catch {
    return false;
  }

  const i = decoded.indexOf(':');
  if (i < 0) return false;

  const gotUser = decoded.slice(0, i);
  const gotPass = decoded.slice(i + 1);
  return gotUser === user && gotPass === pass;
}

function clampStr(v, max = 240) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function isObject(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

function safePickBody(body) {
  // ✅ Allowlist estrita (Painel separado do TikTok):
  // Guarda SOMENTE o mínimo necessário: nome + telefone + order_id + ref.
  const out = {};
  if (!isObject(body)) return out;

  out.event = clampStr(body.event, 80);
  out.order_id = clampStr(body.order_id, 140);
  out.name = clampStr(body.name, 140);
  out.phone = clampStr(body.phone, 64);
  out.ref = clampStr(body.ref, 32);
  out.ts_client = (typeof body.ts_client === 'number' && Number.isFinite(body.ts_client)) ? body.ts_client : undefined;

  for (const k of Object.keys(out)) {
    if (out[k] === undefined || out[k] === null || out[k] === '') delete out[k];
  }

  return out;
}

function tsKeyPart(d) {
  // YYYYMMDDHHMMSSmmm (sortable)
  const pad = (n, w) => String(n).padStart(w, '0');
  return (
    pad(d.getUTCFullYear(), 4) +
    pad(d.getUTCMonth() + 1, 2) +
    pad(d.getUTCDate(), 2) +
    pad(d.getUTCHours(), 2) +
    pad(d.getUTCMinutes(), 2) +
    pad(d.getUTCSeconds(), 2) +
    pad(d.getUTCMilliseconds(), 3)
  );
}

function randId(len = 10) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function getTtlSeconds(env) {
  const raw = env.CHECKOUT_LOG_TTL_DAYS;
  const n = raw ? parseInt(String(raw), 10) : DEFAULT_TTL_DAYS;
  const days = Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 1), 365) : DEFAULT_TTL_DAYS;
  return days * 24 * 60 * 60;
}

async function listKeys(env, limit) {
  // Best-effort scan: up to 5000 keys to keep it fast.
  const keys = [];
  let cursor = undefined;

  for (let i = 0; i < 5; i++) {
    const res = await env.PIX_STORE.list({ prefix: PREFIX, limit: 1000, cursor });
    keys.push(...(res.keys || []));
    if (res.list_complete) break;
    cursor = res.cursor;
    if (!cursor) break;
  }

  // Sort desc by key name (timestamp is inside)
  keys.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  return keys.slice(0, limit).map((k) => k.name);
}

async function getMany(env, names) {
  // Simple concurrency limiter
  const out = [];
  const concurrency = 25;
  let i = 0;

  async function worker() {
    while (i < names.length) {
      const idx = i++;
      const name = names[idx];
      try {
        const v = await env.PIX_STORE.get(name, { type: 'json' });
        if (v && typeof v === 'object') out[idx] = { key: name, ...v };
        else out[idx] = null;
      } catch {
        out[idx] = null;
      }
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, names.length); w++) workers.push(worker());
  await Promise.all(workers);

  return out.filter(Boolean);
}

export async function onRequestPost(context) {
  try {
    // Keep it non-blocking & never break checkout: accept invalid payloads silently.
    let body = null;
    try {
      body = await context.request.json();
    } catch {
      body = null;
    }

    const now = new Date();
    const key = PREFIX + tsKeyPart(now) + ':' + randId(10);

    const payload = safePickBody(body);
    // Enrich with server-side metadata (trustworthy)
    payload.received_at = now.toISOString();
    // 🔒 Não armazena IP/UA para reduzir risco de coleta excessiva.

    const ttl = getTtlSeconds(context.env);
    await context.env.PIX_STORE.put(key, JSON.stringify(payload), { expirationTtl: ttl });

    return json({ ok: true });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestGet(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();

    const url = new URL(context.request.url);
    const limitRaw = url.searchParams.get('limit') || '80';
    const limitNum = parseInt(limitRaw, 10);
    const limit = Number.isFinite(limitNum) ? Math.min(Math.max(limitNum, 1), 200) : 80;

    const names = await listKeys(context.env, limit);
    const items = await getMany(context.env, names);

    return json({
      ok: true,
      count: items.length,
      items,
      updated_at: new Date().toISOString(),
    });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}
