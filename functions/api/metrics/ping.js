// Cloudflare Pages Function: POST /api/metrics/ping
// Purpose: mark a visitor as "online" (approx.) using KV with TTL.
// Storage: KV (binding name: PIX_STORE)

const ONLINE_PREFIX = 'online_v1:';
const ONLINE_TTL_SECONDS = 75; // considered online if pinged recently

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  });
}

export async function onRequestPost(context) {
  try {
    let body = null;
    try {
      body = await context.request.json();
    } catch {
      body = null;
    }

    const sid = body && typeof body.sid === 'string' ? body.sid.trim() : '';
    if (!sid || sid.length < 8 || sid.length > 120) {
      // Don't leak details; just acknowledge.
      return json({ ok: true });
    }

    const key = ONLINE_PREFIX + sid;
    const payload = {
      ts: Date.now(),
      path: body && typeof body.path === 'string' ? body.path.slice(0, 200) : undefined,
      ua: context.request.headers.get('user-agent')?.slice(0, 200),
    };

    // KV supports TTL (expirationTtl) so the key auto-expires.
    await context.env.PIX_STORE.put(key, JSON.stringify(payload), { expirationTtl: ONLINE_TTL_SECONDS });

    return json({ ok: true });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
