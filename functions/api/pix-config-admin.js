// Cloudflare Pages Function: GET/POST /api/pix-config-admin
// Protected endpoint for reading/updating PIX config.
// Auth: HTTP Basic (set secrets PIX_ADMIN_USER and PIX_ADMIN_PASS)
// Storage: KV (binding name: PIX_STORE)

const KEY = 'pix_config_v1';

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
      // Browser will show a username/password prompt.
      'www-authenticate': 'Basic realm="PIX Admin", charset="UTF-8"',
    },
  });
}

function badRequest(msg) {
  return json({ ok: false, error: msg || 'bad_request' }, 400);
}

async function getConfig(env) {
  const stored = await env.PIX_STORE.get(KEY, { type: 'json' });
  const fallback = {
    pix_code:
      '00020101021226900014br.gov.bcb.pix2568pix.adyen.com/pixqrcodelocation/pixloc/v1/loc/EXEMPLO5204000053039865802BR5908SEU NOME6009SAO PAULO62070503***6304ABCD',
    qrcode_url: '/assets/img/qrcode.webp',
    updated_at: null,
  };

  if (!stored || typeof stored !== 'object') return fallback;

  return {
    pix_code: typeof stored.pix_code === 'string' ? stored.pix_code : fallback.pix_code,
    // allow null to hide QR
    qrcode_url:
      stored.qrcode_url === null
        ? null
        : typeof stored.qrcode_url === 'string'
          ? stored.qrcode_url
          : fallback.qrcode_url,
    updated_at: stored.updated_at || null,
  };
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

export async function onRequestGet(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();
    const cfg = await getConfig(context.env);
    return json({ ok: true, ...cfg });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();

    let body;
    try {
      body = await context.request.json();
    } catch {
      return badRequest('invalid_json');
    }

    const pix_code = typeof body.pix_code === 'string' ? body.pix_code.trim() : '';
    const qrcode_url =
      body.qrcode_url === null
        ? null
        : typeof body.qrcode_url === 'string'
          ? body.qrcode_url.trim()
          : undefined;

    if (!pix_code || pix_code.length < 20) return badRequest('pix_code_invalid');
    if (qrcode_url !== undefined && qrcode_url !== null && qrcode_url.length < 3) return badRequest('qrcode_url_invalid');

    const payload = {
      pix_code,
      qrcode_url: qrcode_url === undefined ? '/assets/img/qrcode.webp' : qrcode_url,
      updated_at: new Date().toISOString(),
    };

    await context.env.PIX_STORE.put(KEY, JSON.stringify(payload));

    return json({ ok: true, ...payload });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}
