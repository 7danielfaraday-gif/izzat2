// Cloudflare Pages Function: GET /api/pix-config
// Public endpoint for the checkout to read the current PIX config.
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
    // allow empty string to hide QR
    qrcode_url:
      stored.qrcode_url === null
        ? null
        : typeof stored.qrcode_url === 'string'
          ? stored.qrcode_url
          : fallback.qrcode_url,
    updated_at: stored.updated_at || null,
  };
}

export async function onRequestGet(context) {
  try {
    const cfg = await getConfig(context.env);
    return json({ ok: true, ...cfg });
  } catch (e) {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestPost() {
  // Updates are handled by /api/pix-config-admin (protected).
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
