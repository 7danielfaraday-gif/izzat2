// Cloudflare Pages Function: POST /api/meta-events
// Purpose: Meta Conversions API (CAPI) — envia eventos server-side espelhando o browser pixel
//
// Variáveis de ambiente necessárias (Cloudflare Pages → Settings → Environment Variables):
//   X_META_PID  — ID do pixel Meta configurado
//   X_META_TK   — Token gerado no Events Manager

const META_EVENTS_API_VERSION = 'v20.0';
// API endpoint for Meta CAPI
function getMetaApiUrl(pixelId) {
  return `https://graph.facebook.com/${META_EVENTS_API_VERSION}/${pixelId}/events`;
}

const USER_FIELDS = ['email', 'phone', 'external_id', 'fbp', 'fbc'];

const PROPS_FIELDS = [
  'currency', 'value', 'contents', 'content_ids', 'content_type',
  'content_name', 'content_category', 'order_id',
  'event_source_url'
];

function normalizeEventSourceUrl(value) {
  try {
    const base = value ? new URL(value) : new URL('https://izzatcasa.shop/');
    base.protocol = 'https:';
    base.host = 'izzatcasa.shop';
    return base.toString();
  } catch {
    return 'https://izzatcasa.shop/';
  }
}

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

function normalizeEmail(value) {
  if (!hasText(value)) return null;
  return value.trim().toLowerCase();
}

function normalizePhone(value) {
  if (!hasText(value)) return null;
  const raw = String(value).trim().toLowerCase();
  if (isSha256Hex(raw)) return raw;

  const digits = raw.replace(/\D/g, '');
  return digits || null;
}

async function buildSafeUser(user, ip, userAgent) {
  const raw = pick(user, USER_FIELDS);
  const safe = {};

  if (hasText(raw.email)) {
    const normalizedEmail = normalizeEmail(raw.email);
    if (normalizedEmail) {
      safe.em = [isSha256Hex(normalizedEmail) ? normalizedEmail : await sha256Hex(normalizedEmail)];
    }
  }

  if (hasText(raw.phone)) {
    const normalizedPhone = isSha256Hex(raw.phone) ? raw.phone.trim().toLowerCase() : normalizePhone(raw.phone);
    if (normalizedPhone) {
      safe.ph = [isSha256Hex(normalizedPhone) ? normalizedPhone : await sha256Hex(normalizedPhone)];
    }
  }

  if (hasText(raw.external_id)) {
    const normalizedExternalId = raw.external_id.trim().toLowerCase();
    safe.external_id = [isSha256Hex(normalizedExternalId) ? normalizedExternalId : await sha256Hex(normalizedExternalId)];
  }
  
  if (raw.fbp) safe.fbp = raw.fbp;
  if (raw.fbc) safe.fbc = raw.fbc;
  if (ip) safe.client_ip_address = ip;
  if (userAgent) safe.client_user_agent = userAgent;

  return safe;
}

function json(data, status = 200, request = null) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
  };
  if (request) {
    headers['access-control-allow-origin'] = getAllowedOrigin(request);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function pick(obj, fields) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const f of fields) {
    if (obj[f] !== undefined && obj[f] !== null && obj[f] !== '') {
      out[f] = obj[f];
    }
  }
  return out;
}

function getAllowedOrigin(request) {
  const reqOrigin = request.headers.get('origin');
  if (reqOrigin) return reqOrigin;
  return new URL(request.url).origin;
}

function corsHeaders(request) {
  return {
    'access-control-allow-origin': getAllowedOrigin(request),
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-expose-headers': 'content-type',
  };
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(context.request),
      'cache-control': 'no-store',
    },
  });
}

export async function onRequestPost(context) {
  try {
    const env = context.env;

    const pixelId = env.X_META_PID;
    const accessToken = env.X_META_TK;

    if (!pixelId) {
      return json({ ok: true, skipped: 'pixel_not_configured' }, 200, context.request);
    }
    if (!accessToken) {
      return json({ ok: false, error: 'access_token_not_configured' }, 500, context.request);
    }

    let body = null;
    try { body = await context.request.json(); } catch { body = {}; }

    const eventName = typeof body.event === 'string' ? body.event : null;
    const eventId = typeof body.event_id === 'string' ? body.event_id : null;
    const properties = body.properties || {};
    const user = body.user || {};

    if (!eventName) return json({ ok: false, error: 'missing_event' }, 400, context.request);

    const ip = context.request.headers.get('cf-connecting-ip')
            || context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || undefined;
    const userAgent = context.request.headers.get('user-agent') || undefined;

    const safeUser = await buildSafeUser(user, ip, userAgent);

    const sourceUrl = normalizeEventSourceUrl(
      context.request.headers.get('referer') ||
      properties.event_source_url ||
      undefined
    );

    const customData = {
      ...pick(properties, PROPS_FIELDS)
    };
    if (customData.event_source_url) delete customData.event_source_url;

    // Remove empty custom data keys
    for (const k of Object.keys(customData)) {
      if (customData[k] === undefined || customData[k] === null || customData[k] === '') {
        delete customData[k];
      }
    }

    const eventPayload = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: sourceUrl,
      user_data: safeUser,
      ...(eventId && { event_id: eventId }),
      ...(Object.keys(customData).length > 0 && { custom_data: customData })
    };

    const apiBody = JSON.stringify({
      data: [eventPayload]
    });

    const apiUrl = getMetaApiUrl(pixelId) + '?access_token=' + accessToken;

    const apiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: apiBody,
    });

    let apiJson = null;
    try { apiJson = await apiRes.json(); } catch { apiJson = null; }

    const apiOk = apiRes.ok;

    console.log('[meta-events]', JSON.stringify({
      event: eventName,
      event_id: eventId || null,
      status: apiRes.status,
      response: apiJson
    }));

    if (!apiOk) {
      console.error('[meta-events] API error', JSON.stringify({
        event: eventName,
        event_id: eventId || null,
        status: apiRes.status,
        response: apiJson
      }));
      return json({
        ok: false,
        error: 'api_error',
        status: apiRes.status,
        response: apiJson
      }, 200, context.request); // returning 200 to client even if CAPI fails to not break frontend
    }

    return json({ ok: true, event: eventName, event_id: eventId || null }, 200, context.request);

  } catch (err) {
    console.error('[meta-events] Unexpected error:', err);
    return json({ ok: false, error: 'server_error' }, 500, context.request);
  }
}
