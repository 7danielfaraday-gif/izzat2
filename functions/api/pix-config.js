// Cloudflare Pages Function: GET /api/pix-config
// Public endpoint for the checkout to read the current PIX config.
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

function normalizePixCode(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidPixCode(value) {
  const code = normalizePixCode(value);
  return code.length >= 20 && /^000201/.test(code) && /br\.gov\.bcb\.pix/i.test(code);
}

async function getConfig(env) {
  const stored = await env.PIX_STORE.get(KEY, { type: 'json' });
  if (!stored || typeof stored !== 'object') return null;

  const pixCode = normalizePixCode(stored.pix_code);
  if (!isValidPixCode(pixCode)) return null;

  return {
    pix_code: pixCode,
    // allow empty string to hide QR
    qrcode_url:
      stored.qrcode_url === null
        ? null
        : typeof stored.qrcode_url === 'string'
          ? stored.qrcode_url.trim()
          : DEFAULT_QRCODE_URL,
    updated_at: stored.updated_at || null,
  };
}

export async function onRequestGet(context) {
  try {
    const cfg = await getConfig(context.env);
    if (!cfg) return json({ ok: false, error: 'pix_config_missing' }, 503);
    return json({ ok: true, ...cfg });
  } catch (e) {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestPost() {
  // Updates are handled by /api/pix-config-admin (protected).
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
