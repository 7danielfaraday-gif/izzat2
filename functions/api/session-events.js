export async function onRequest() {
  return new Response(JSON.stringify({ ok: false, error: 'gone' }), {
    status: 410,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}
