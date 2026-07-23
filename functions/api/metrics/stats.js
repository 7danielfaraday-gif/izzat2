// Cloudflare Pages Function: GET /api/metrics/stats
// Purpose: admin-only metrics (online users + PIX copy clicks).
// Auth: HTTP Basic (Secrets: PIX_ADMIN_USER / PIX_ADMIN_PASS)
// Storage: KV (binding name: PIX_STORE)

const ONLINE_PREFIX = 'online_v1:';
const CLICKS_KEY = 'metric_pix_copy_clicks_v1';

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

async function countOnline(env) {
  let total = 0;
  let cursor = undefined;

  // KV list supports pagination by cursor.
  while (true) {
    const res = await env.PIX_STORE.list({ prefix: ONLINE_PREFIX, limit: 1000, cursor });
    total += (res.keys || []).length;

    if (res.list_complete) break;
    cursor = res.cursor;
    if (!cursor) break;
  }

  return total;
}

export async function onRequestGet(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();

    const [online, clicksRaw] = await Promise.all([
      countOnline(context.env),
      context.env.PIX_STORE.get(CLICKS_KEY),
    ]);

    const clicks = clicksRaw ? parseInt(clicksRaw, 10) : 0;

    return json({
      ok: true,
      online_now: online,
      pix_copy_clicks_total: Number.isFinite(clicks) ? clicks : 0,
      updated_at: new Date().toISOString(),
    });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestPost() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
