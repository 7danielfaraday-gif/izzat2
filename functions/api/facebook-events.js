// Cloudflare Pages Function: POST /api/facebook-events
// Meta Pixel + Conversions API bridge
// Env vars:
//   META_PIXEL_ID / FACEBOOK_PIXEL_ID
//   META_ACCESS_TOKEN / FACEBOOK_ACCESS_TOKEN
//   META_TEST_EVENT_CODE (optional)

const META_GRAPH_API_VERSION = 'v23.0';
const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
const META_ALLOWED_HOSTS = new Set([
  'redeizzat.shop',
  'oficial.redeizzat.shop',
]);
const META_SUPPORTED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Purchase',
]);
const META_USER_FIELDS = ['email', 'em', 'phone', 'phone_number', 'ph', 'external_id', 'fbp', 'fbc'];

function cleanText(value, maxLen = 512) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
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

function normalizeEmail(value) {
  if (!hasText(value)) return null;
  return value.trim().toLowerCase();
}

function normalizePhone(value) {
  if (!hasText(value)) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length ? digits : null;
}

function cleanNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function pick(obj, fields) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const field of fields) {
    if (obj[field] !== undefined && obj[field] !== null && obj[field] !== '') out[field] = obj[field];
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

function json(data, status = 200, request = null) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
  };
  if (request) Object.assign(headers, corsHeaders(request));
  return new Response(JSON.stringify(data), { status, headers });
}

function normalizeEventSourceUrl(value) {
  try {
    const base = value ? new URL(value) : new URL('https://redeizzat.shop/');
    const hostname = String(base.hostname || '').toLowerCase();
    base.protocol = 'https:';
    base.port = '';
    if (META_ALLOWED_HOSTS.has(hostname)) {
      base.hostname = hostname;
    } else if (hostname === 'www.redeizzat.shop') {
      base.hostname = 'redeizzat.shop';
    } else {
      base.hostname = 'redeizzat.shop';
    }
    return base.toString();
  } catch {
    return 'https://redeizzat.shop/';
  }
}

function getMetaConfig(env) {
  const pixelId = cleanText(env.META_PIXEL_ID || env.FACEBOOK_PIXEL_ID, 64);
  const accessToken = cleanText(env.META_ACCESS_TOKEN || env.FACEBOOK_ACCESS_TOKEN, 2048);
  const testEventCode = cleanText(env.META_TEST_EVENT_CODE, 128);
  if (!pixelId || !accessToken) return null;
  return { pixelId, accessToken, testEventCode: testEventCode || undefined };
}

function sanitizeContents(contents) {
  if (!Array.isArray(contents)) return undefined;
  const normalized = contents.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const id = cleanText(item.id || item.content_id, 128);
    if (!id) return null;
    const out = { id };
    const quantity = cleanNumber(item.quantity);
    const itemPrice = cleanNumber(item.item_price ?? item.price);
    if (quantity !== null) out.quantity = quantity;
    if (itemPrice !== null) out.item_price = itemPrice;
    return out;
  }).filter(Boolean);
  return normalized.length ? normalized : undefined;
}

function sanitizeCustomData(properties) {
  if (!properties || typeof properties !== 'object') return {};

  const customData = {};
  const currency = cleanText(properties.currency, 8).toUpperCase();
  const value = cleanNumber(properties.value);
  const contentName = cleanText(properties.content_name, 255);
  const contentCategory = cleanText(properties.content_category, 255);
  const contentType = cleanText(properties.content_type, 64);
  const orderId = cleanText(properties.order_id, 128);

  if (currency) customData.currency = currency;
  if (value !== null) customData.value = value;
  if (contentName) customData.content_name = contentName;
  if (contentCategory) customData.content_category = contentCategory;
  if (contentType) customData.content_type = contentType;
  if (orderId) customData.order_id = orderId;

  const contentIds = Array.isArray(properties.content_ids)
    ? properties.content_ids.map((id) => cleanText(String(id), 128)).filter(Boolean)
    : [];
  if (!contentIds.length) {
    const fallbackContentId = cleanText(properties.content_id, 128);
    if (fallbackContentId) contentIds.push(fallbackContentId);
  }
  if (contentIds.length) customData.content_ids = contentIds;

  const contents = sanitizeContents(properties.contents);
  if (contents) customData.contents = contents;

  const quantity = cleanNumber(properties.quantity);
  if (quantity !== null) {
    customData.num_items = quantity;
  } else if (contents) {
    customData.num_items = contents.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }

  return customData;
}

async function buildUserData(user, request) {
  const raw = pick(user, META_USER_FIELDS);
  const safe = {};

  const email = normalizeEmail(raw.email || raw.em);
  if (email) safe.em = [isSha256Hex(email) ? email : await sha256Hex(email)];

  const phoneValue = raw.phone || raw.phone_number || raw.ph;
  const normalizedPhone = isSha256Hex(phoneValue) ? phoneValue.trim().toLowerCase() : normalizePhone(phoneValue);
  if (normalizedPhone) safe.ph = [isSha256Hex(normalizedPhone) ? normalizedPhone : await sha256Hex(normalizedPhone)];

  if (hasText(raw.external_id)) {
    const externalId = raw.external_id.trim().toLowerCase();
    safe.external_id = [isSha256Hex(externalId) ? externalId : await sha256Hex(externalId)];
  }

  const fbp = cleanText(raw.fbp, 512);
  const fbc = cleanText(raw.fbc, 1024);
  if (fbp) safe.fbp = fbp;
  if (fbc) safe.fbc = fbc;

  const clientIp = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '';
  const userAgent = cleanText(request.headers.get('user-agent') || '', 2048);
  if (clientIp) safe.client_ip_address = clientIp;
  if (userAgent) safe.client_user_agent = userAgent;

  return safe;
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
    const config = getMetaConfig(context.env);
    if (!config) {
      return json({ ok: true, skipped: 'pixel_not_configured' }, 200, context.request);
    }

    let body = {};
    try { body = await context.request.json(); } catch { body = {}; }

    const event = cleanText(body.event, 64);
    const eventId = cleanText(body.event_id, 128);
    const properties = body.properties || {};
    const user = body.user || {};

    if (!event) return json({ ok: false, error: 'missing_event' }, 400, context.request);
    if (!META_SUPPORTED_EVENTS.has(event)) {
      return json({ ok: true, skipped: 'unsupported_event', event }, 200, context.request);
    }

    const userData = await buildUserData(user, context.request);
    const eventPayload = {
      event_name: event,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: normalizeEventSourceUrl(properties.event_source_url),
      user_data: userData,
    };
    if (eventId) eventPayload.event_id = eventId;

    const customData = sanitizeCustomData(properties);
    if (Object.keys(customData).length) eventPayload.custom_data = customData;

    const apiUrl = `${META_GRAPH_API_BASE}/${encodeURIComponent(config.pixelId)}/events?access_token=${encodeURIComponent(config.accessToken)}`;
    const apiBody = {
      data: [eventPayload],
    };
    if (config.testEventCode) apiBody.test_event_code = config.testEventCode;

    const apiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiBody),
    });

    let apiJson = null;
    try { apiJson = await apiRes.json(); } catch { apiJson = null; }

    console.log('[facebook-events]', JSON.stringify({
      event,
      event_id: eventId || null,
      pixel_id: config.pixelId,
      status: apiRes.status,
      response: apiJson,
    }));

    if (!apiRes.ok) {
      console.error('[facebook-events] API error', JSON.stringify({
        event,
        event_id: eventId || null,
        pixel_id: config.pixelId,
        status: apiRes.status,
        response: apiJson,
      }));
    }

    return json({
      ok: apiRes.ok,
      status: apiRes.status,
      pixel_id: config.pixelId,
      response: apiJson,
    }, apiRes.ok ? 200 : 502, context.request);
  } catch (error) {
    console.error('[facebook-events] server error', error);
    return json({ ok: false, error: 'server_error' }, 500, context.request);
  }
}
