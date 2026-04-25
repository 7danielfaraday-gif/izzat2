// Cloudflare Pages Function: POST /api/tiktok-events
// Purpose: TikTok Events API (CAPI) — envia eventos server-side espelhando o browser pixel
//
// Variáveis de ambiente necessárias (Cloudflare Pages → Settings → Environment Variables):
//   TIKTOK_PIXEL_ID                 — ID do pixel TikTok primario (ex: "D7J5BQJC77U557SHJJC0")
//   TIKTOK_ACCESS_TOKEN             — Token do Events API do pixel primario
//   TIKTOK_PIXEL_ID_SECONDARY       — (opcional) ID do pixel TikTok secundario
//   TIKTOK_ACCESS_TOKEN_SECONDARY   — (opcional) Token do Events API do pixel secundario
//   TIKTOK_PIXEL_ID_TERTIARY        — (opcional) ID do pixel TikTok terciario/backup
//   TIKTOK_ACCESS_TOKEN_TERTIARY    — (opcional) Token do Events API do pixel terciario/backup
//   TIKTOK_TEST_CODE     — (opcional) código de teste para validar sem afetar dados reais
//
// Deduplicação: o browser envia o mesmo event_id que este endpoint.
// O TikTok detecta o par (browser + server) com o mesmo event_id e mantém apenas 1.

const TIKTOK_EVENTS_API = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
export const TIKTOK_EVENT_SOURCE_PRIMARY_HOST = 'oficial.redeizzat.shop';
const TIKTOK_EVENT_SOURCE_ALLOWED_HOSTS = new Set([
  'oficial.redeizzat.shop',
  'redeizzat.shop',
]);

// Campo correto da API v1.3 é "phone" (não "phone_number")
const USER_FIELDS = ['email', 'phone_number', 'phone', 'external_id', 'ttclid', 'ttp'];

const PROPS_FIELDS = [
  'currency', 'value', 'contents', 'content_id', 'content_ids', 'content_type',
  'content_name', 'content_category', 'quantity', 'order_id',
  'event_source_url', 'description'
];

export function normalizeEventSourceUrl(value) {
  try {
    const base = value ? new URL(value) : new URL(`https://${TIKTOK_EVENT_SOURCE_PRIMARY_HOST}/`);
    const hostname = base.hostname.toLowerCase();
    base.protocol = 'https:';
    if (TIKTOK_EVENT_SOURCE_ALLOWED_HOSTS.has(hostname)) {
      base.hostname = hostname;
    } else if (hostname === 'www.redeizzat.shop') {
      base.hostname = 'redeizzat.shop';
    } else {
      base.hostname = TIKTOK_EVENT_SOURCE_PRIMARY_HOST;
    }
    base.port = '';
    return base.toString();
  } catch {
    return `https://${TIKTOK_EVENT_SOURCE_PRIMARY_HOST}/`;
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
  const digits = String(value).replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

function getFallbackContentId(properties) {
  if (!properties || typeof properties !== 'object') return null;

  if (hasText(properties.content_id)) return properties.content_id.trim();

  if (Array.isArray(properties.contents)) {
    for (const item of properties.contents) {
      if (!item || typeof item !== 'object') continue;
      if (hasText(item.content_id)) return item.content_id.trim();
      if (hasText(item.id)) return item.id.trim();
    }
  }

  if (Array.isArray(properties.content_ids)) {
    for (const id of properties.content_ids) {
      if (hasText(id)) return id.trim();
    }
  }

  return null;
}

function getFallbackContentCategory(properties) {
  if (!properties || typeof properties !== 'object') return null;

  if (hasText(properties.content_category)) return properties.content_category.trim();
  if (hasText(properties.category)) return properties.category.trim();

  return null;
}

export async function buildSafeUser(user) {
  const raw = pick(user, USER_FIELDS);
  const safe = {};

  if (hasText(raw.email)) {
    const normalizedEmail = normalizeEmail(raw.email);
    if (normalizedEmail) {
      safe.email = isSha256Hex(normalizedEmail)
        ? normalizedEmail
        : await sha256Hex(normalizedEmail);
    }
  }

  // Aceita tanto "phone" quanto "phone_number" do browser,
  // mas envia sempre como "phone" (campo correto da API v1.3)
  const rawPhone = raw.phone || raw.phone_number;
  if (hasText(rawPhone)) {
    const normalizedPhone = isSha256Hex(rawPhone)
      ? rawPhone.trim().toLowerCase()
      : normalizePhone(rawPhone);
    if (normalizedPhone) {
      safe.phone = isSha256Hex(normalizedPhone)
        ? normalizedPhone
        : await sha256Hex(normalizedPhone);
    }
  }

  if (hasText(raw.external_id)) {
    const normalizedExternalId = raw.external_id.trim().toLowerCase();
    safe.external_id = isSha256Hex(normalizedExternalId)
      ? normalizedExternalId
      : await sha256Hex(normalizedExternalId);
  }
  if (raw.ttclid) safe.ttclid = raw.ttclid;
  if (raw.ttp) safe.ttp = raw.ttp;

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

function cleanEnvText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getTikTokDestinations(env) {
  const candidates = [
    {
      label: 'primary',
      pixelId: env.TIKTOK_PIXEL_ID,
      accessToken: env.TIKTOK_ACCESS_TOKEN,
    },
    {
      label: 'secondary',
      pixelId: env.TIKTOK_PIXEL_ID_SECONDARY || env.TIKTOK_PIXEL_ID_2 || env.TIKTOK_SECONDARY_PIXEL_ID,
      accessToken: env.TIKTOK_ACCESS_TOKEN_SECONDARY || env.TIKTOK_ACCESS_TOKEN_2 || env.TIKTOK_SECONDARY_ACCESS_TOKEN,
    },
    {
      label: 'tertiary',
      pixelId: env.TIKTOK_PIXEL_ID_TERTIARY || env.TIKTOK_PIXEL_ID_3 || env.TIKTOK_TERTIARY_PIXEL_ID,
      accessToken: env.TIKTOK_ACCESS_TOKEN_TERTIARY || env.TIKTOK_ACCESS_TOKEN_3 || env.TIKTOK_TERTIARY_ACCESS_TOKEN,
    },
  ];

  const destinations = [];
  for (const candidate of candidates) {
    const pixelId = cleanEnvText(candidate.pixelId);
    const accessToken = cleanEnvText(candidate.accessToken);
    if (!pixelId || pixelId.indexOf('REPLACE') !== -1 || !accessToken) continue;
    destinations.push({ label: candidate.label, pixelId, accessToken });
  }
  return destinations;
}

export async function sendTikTokEvent(destination, eventPayload, testCode, event, eventId) {
  const apiBody = JSON.stringify({
    event_source: 'web',
    event_source_id: destination.pixelId,
    ...(testCode && { test_event_code: testCode }),
    data: [eventPayload],
  });

  try {
    const apiRes = await fetch(TIKTOK_EVENTS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': destination.accessToken,
      },
      body: apiBody,
    });

    let apiJson = null;
    try { apiJson = await apiRes.json(); } catch { apiJson = null; }

    const ok = apiRes.ok;
    const result = {
      label: destination.label,
      pixel_id: destination.pixelId,
      ok,
      status: apiRes.status,
      response: apiJson,
    };

    console.log('[tiktok-events]', JSON.stringify({
      event,
      event_id: eventId || null,
      destination: destination.label,
      pixel_id: destination.pixelId,
      status: apiRes.status,
      response: apiJson,
    }));

    if (!ok) {
      console.error('[tiktok-events] API error', JSON.stringify(result));
    }

    return result;
  } catch (err) {
    const result = {
      label: destination.label,
      pixel_id: destination.pixelId,
      ok: false,
      status: 0,
      error: 'network_error',
    };
    console.error('[tiktok-events] Fetch error', JSON.stringify(result), err);
    return result;
  }
}

export async function onRequestPost(context) {
  try {
    const env = context.env;

    const destinations = getTikTokDestinations(env);
    const testCode = env.TIKTOK_TEST_CODE || undefined;

    if (!destinations.length) {
      return json({ ok: true, skipped: 'pixel_not_configured' }, 200, context.request);
    }

    let body = null;
    try { body = await context.request.json(); } catch { body = {}; }

    const event      = typeof body.event === 'string' ? body.event.trim() : null;
    const event_id   = typeof body.event_id === 'string' ? body.event_id : null;
    const properties = body.properties || {};
    const user       = body.user       || {};

    if (!event) return json({ ok: false, error: 'missing_event' }, 400, context.request);
    if (event === 'Purchase' || event === 'CompletePayment') {
      return json({
        ok: true,
        skipped: 'purchase_requires_admin_confirmation',
        event,
        event_id: event_id || null,
      }, 200, context.request);
    }

    // Metadados server-side (mais confiáveis que o browser)
    const ip        = context.request.headers.get('cf-connecting-ip')
                   || context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                   || undefined;
    const userAgent = context.request.headers.get('user-agent') || undefined;

    const fallbackContentId = getFallbackContentId(properties);
    const fallbackContentCategory = getFallbackContentCategory(properties);

    const safeUser = await buildSafeUser(user);

    const eventPayload = {
      event:             event,
      event_time:        Math.floor(Date.now() / 1000),
      ...(event_id && { event_id }),

      properties: {
        ...pick(properties, PROPS_FIELDS),
        ...(!hasText(properties.content_id) && fallbackContentId ? { content_id: fallbackContentId } : {}),
        ...(!hasText(properties.content_category) && fallbackContentCategory ? { content_category: fallbackContentCategory } : {}),
        event_source_url: normalizeEventSourceUrl(
          properties.event_source_url ||
          context.request.headers.get('referer') ||
          undefined
        ),
      },

      user: {
        ...safeUser,
        ...(ip        && { ip }),
        ...(userAgent && { user_agent: userAgent }),
      },
    };

    // Remove chaves vazias
    for (const section of ['properties', 'user']) {
      for (const k of Object.keys(eventPayload[section])) {
        if (
          eventPayload[section][k] === undefined ||
          eventPayload[section][k] === null ||
          eventPayload[section][k] === ''
        ) {
          delete eventPayload[section][k];
        }
      }
    }

    const results = await Promise.all(destinations.map((destination) => {
      return sendTikTokEvent(destination, eventPayload, testCode, event, event_id);
    }));

    const failures = results.filter((result) => !result.ok);
    if (failures.length === results.length) {
      return json({ ok: false, error: 'api_error', event, event_id: event_id || null, results }, 200, context.request);
    }

    return json({ ok: true, event, event_id: event_id || null, results }, 200, context.request);

  } catch (err) {
    console.error('[tiktok-events] Unexpected error:', err);
    return json({ ok: false, error: 'server_error' }, 500, context.request);
  }
}
