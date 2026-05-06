export async function onRequest() {
  return new Response('Gone', {
    status: 410,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}
