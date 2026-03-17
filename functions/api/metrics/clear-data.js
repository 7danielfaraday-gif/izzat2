// Cloudflare Pages Function: POST /api/metrics/clear-data
// Apaga todos os dados de analytics do KV (sessões, agregados, cliques no PIX).
// Auth: HTTP Basic (PIX_ADMIN_USER / PIX_ADMIN_PASS)

const PREFIXES = ['beh_sess_v1:', 'beh_day_v1:', 'online_v1:'];
const SINGLE_KEYS = ['metric_pix_copy_clicks_v1'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="Analytics"', 'cache-control': 'no-store' },
  });
}

function checkAuth(request, env) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice(6));
    const i = decoded.indexOf(':');
    if (i < 0) return false;
    return decoded.slice(0, i) === (env.PIX_ADMIN_USER || '') &&
           decoded.slice(i + 1) === (env.PIX_ADMIN_PASS || '');
  } catch { return false; }
}

export async function onRequestPost(context) {
  if (!checkAuth(context.request, context.env)) return unauthorized();

  const kv = context.env.PIX_STORE;
  if (!kv) return json({ ok: false, error: 'kv_unavailable' }, 503);

  let deleted = 0;

  // Delete all prefix-based keys
  for (const prefix of PREFIXES) {
    let cursor = undefined;
    while (true) {
      const res = await kv.list({ prefix, limit: 1000, cursor });
      const keys = res.keys || [];
      await Promise.all(keys.map(k => kv.delete(k.name).catch(() => {})));
      deleted += keys.length;
      if (res.list_complete) break;
      cursor = res.cursor;
      if (!cursor) break;
    }
  }

  // Delete single keys
  for (const key of SINGLE_KEYS) {
    const exists = await kv.get(key);
    if (exists !== null) {
      await kv.delete(key).catch(() => {});
      deleted++;
    }
  }

  return json({ ok: true, deleted });
}

export async function onRequestGet() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
