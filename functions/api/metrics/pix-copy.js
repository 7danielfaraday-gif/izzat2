// Cloudflare Pages Function: POST /api/metrics/pix-copy
// Purpose: count clicks on the "Copiar código PIX" button.
// Storage: KV (binding name: PIX_STORE)

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

export async function onRequestPost(context) {
  try {
    // best-effort increment (KV doesn't provide atomic increment)
    const raw = await context.env.PIX_STORE.get(CLICKS_KEY);
    const cur = raw ? parseInt(raw, 10) : 0;
    const next = Number.isFinite(cur) ? cur + 1 : 1;

    await context.env.PIX_STORE.put(CLICKS_KEY, String(next));

    return json({ ok: true, total: next });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
