// Cloudflare Pages Function: POST /api/fb-events
// Purpose: Meta (Facebook) Conversions API (CAPI)
//
// Variáveis de ambiente necessárias no Cloudflare Pages:
//   X_META_PID   — ID do pixel do Facebook
//   X_META_TK    — Token de acesso (Conversions API)
//   X_META_TEST  — (opcional) código de teste, ex: TEST12345

const FB_EVENTS_API_VERSION = 'v20.0';

function isSha256Hex(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim());
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function json(data, status = 200, request = null) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
  };
  if (request) {
    headers['access-control-allow-origin'] = request.headers.get('origin') || new URL(request.url).origin;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export async function onRequestOptions(context) {
  const reqOrigin = context.request.headers.get('origin') || new URL(context.request.url).origin;
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': reqOrigin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-expose-headers': 'content-type',
      'cache-control': 'no-store',
    },
  });
}

export async function onRequestPost(context) {
  try {
    const env = context.env;
    const pixelId = env.X_META_PID;
    const accessToken = env.X_META_TK;
    const testCode = env.X_META_TEST || undefined;

    if (!pixelId) {
      return json({ ok: true, skipped: 'pixel_not_configured' }, 200, context.request);
    }
    if (!accessToken) {
      return json({ ok: false, error: 'access_token_not_configured' }, 500, context.request);
    }

    let body = null;
    try { body = await context.request.json(); } catch { body = {}; }

    let eventName = typeof body.event === 'string' ? body.event : null;
    const eventId = typeof body.event_id === 'string' ? body.event_id : null;
    const properties = body.properties || {};
    const user = body.user || {};

    if (!eventName) return json({ ok: false, error: 'missing_event' }, 400, context.request);

    // Mapeamento de Eventos (Se for CompletePayment ou Pix_Copy_Click, vira Purchase no FB)
    if (eventName === 'CompletePayment' || eventName === 'Pix_Copy_Click') {
        eventName = 'Purchase';
    } else if (eventName === 'ViewContent') {
        eventName = 'ViewContent';
    } else if (eventName === 'InitiateCheckout') {
        eventName = 'InitiateCheckout';
    }

    const ip = context.request.headers.get('cf-connecting-ip')
            || context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || undefined;
    const userAgent = context.request.headers.get('user-agent') || undefined;

    // Dados do usuário
    const userData = {};
    if (ip) userData.client_ip_address = ip;
    if (userAgent) userData.client_user_agent = userAgent;

    if (hasText(user.email)) {
      const em = user.email.trim().toLowerCase();
      userData.em = isSha256Hex(em) ? em : await sha256Hex(em);
    }
    
    if (hasText(user.phone) || hasText(user.phone_number)) {
      const rawPhone = user.phone || user.phone_number;
      const ph = isSha256Hex(rawPhone) ? rawPhone.trim().toLowerCase() : rawPhone.replace(/\D/g, '');
      if (ph) {
        userData.ph = isSha256Hex(ph) ? ph : await sha256Hex(ph);
      }
    }

    if (hasText(user.external_id)) {
      const ext = user.external_id.trim().toLowerCase();
      userData.external_id = isSha256Hex(ext) ? ext : await sha256Hex(ext);
    }

    if (user.fbp) userData.fbp = user.fbp;
    if (user.fbc) userData.fbc = user.fbc;

    // Custom data (properties)
    const customData = {};
    if (properties.currency) customData.currency = properties.currency;
    if (properties.value) customData.value = Number(properties.value);
    if (properties.content_name) customData.content_name = properties.content_name;
    if (properties.content_ids) customData.content_ids = properties.content_ids;
    if (properties.content_type) customData.content_type = properties.content_type || 'product';

    const eventPayload = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: properties.event_source_url || context.request.headers.get('referer') || undefined,
      user_data: userData,
      custom_data: customData,
    };

    if (eventId) {
      eventPayload.event_id = eventId;
    }

    const apiBody = {
      data: [eventPayload]
    };
    if (testCode) {
      apiBody.test_event_code = testCode;
    }

    const fbUrl = `https://graph.facebook.com/${FB_EVENTS_API_VERSION}/${pixelId}/events?access_token=${accessToken}`;
    
    const apiRes = await fetch(fbUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(apiBody),
    });

    let apiJson = null;
    try { apiJson = await apiRes.json(); } catch { apiJson = null; }

    if (!apiRes.ok) {
      console.error('[fb-events] API error', JSON.stringify({
        event: eventName,
        status: apiRes.status,
        response: apiJson
      }));
      return json({ ok: false, error: 'api_error', details: apiJson }, 200, context.request);
    }

    return json({ ok: true, event: eventName, event_id: eventId }, 200, context.request);

  } catch (err) {
    console.error('[fb-events] Unexpected error:', err);
    return json({ ok: false, error: 'server_error' }, 500, context.request);
  }
}
