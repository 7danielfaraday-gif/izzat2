// Cloudflare Pages Middleware (scoped): /admin/checkout-log/*
// Protects the static panel under /admin/checkout-log with HTTP Basic Auth.
// Secrets required: PIX_ADMIN_USER, PIX_ADMIN_PASS

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
  try { decoded = atob(m[1]); } catch { return false; }
  const i = decoded.indexOf(':');
  if (i < 0) return false;

  const gotUser = decoded.slice(0, i);
  const gotPass = decoded.slice(i + 1);
  return gotUser === user && gotPass === pass;
}

export async function onRequest(context) {
  if (!checkBasicAuth(context.request, context.env)) return unauthorized();
  return context.next();
}
