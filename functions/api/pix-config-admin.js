// Cloudflare Pages Function: GET/POST /api/pix-config-admin
// Protected endpoint for reading/updating PIX config.
// Auth: HTTP Basic (set secrets PIX_ADMIN_USER and PIX_ADMIN_PASS)
// Storage: KV (binding name: PIX_STORE)

const KEY = 'pix_config_v1';
const DEFAULT_QRCODE_URL = '/assets/img/qrcode.webp';

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

function normalizePixCode(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidPixCode(value) {
  const code = normalizePixCode(value);
  return code.length >= 20 && /^000201/.test(code) && /br\.gov\.bcb\.pix/i.test(code);
}

async function getConfig(env) {
  const stored = await env.PIX_STORE.get(KEY, { type: 'json' });
  const fallback = {
    pix_code: '',
    qrcode_url: DEFAULT_QRCODE_URL,
    updated_at: null,
    needs_config: true,
  };

  if (!stored || typeof stored !== 'object') return fallback;
  const pixCode = normalizePixCode(stored.pix_code);

  return {
    pix_code: isValidPixCode(pixCode) ? pixCode : '',
    // allow null to hide QR
    qrcode_url:
      stored.qrcode_url === null
        ? null
        : typeof stored.qrcode_url === 'string'
          ? stored.qrcode_url.trim()
          : DEFAULT_QRCODE_URL,
    updated_at: stored.updated_at || null,
    needs_config: !isValidPixCode(pixCode),
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

    const pix_code = normalizePixCode(body.pix_code);
    const qrcode_url =
      body.qrcode_url === null
        ? null
        : typeof body.qrcode_url === 'string'
          ? body.qrcode_url.trim()
          : undefined;

    if (!isValidPixCode(pix_code)) return badRequest('pix_code_invalid');
    if (qrcode_url !== undefined && qrcode_url !== null && qrcode_url.length < 3) return badRequest('qrcode_url_invalid');

    const payload = {
      pix_code,
      qrcode_url: qrcode_url === undefined ? DEFAULT_QRCODE_URL : qrcode_url,
      updated_at: new Date().toISOString(),
    };

    await context.env.PIX_STORE.put(KEY, JSON.stringify(payload));

    return json({ ok: true, ...payload });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}
