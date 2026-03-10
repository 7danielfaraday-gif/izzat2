// Deprecated: checkout public no longer writes a parallel checkout log.
// Use POST /api/order-create for internal operational order records.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0' },
  });
}

export async function onRequestPost() {
  return json({ ok: false, error: 'deprecated_use_order_create' }, 410);
}

export async function onRequestGet() {
  return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store, max-age=0' } });
}
