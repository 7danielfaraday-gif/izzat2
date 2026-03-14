// Cloudflare Pages Function: POST /api/tiktok-events
// Purpose: TikTok Events API (CAPI) — envia eventos server-side espelhando o browser pixel
//
// Variáveis de ambiente necessárias (Cloudflare Pages → Settings → Environment Variables):
//   TIKTOK_PIXEL_ID      — ID do pixel TikTok (ex: "CXXXXXXXXXXXXXXXX")
//   TIKTOK_ACCESS_TOKEN  — Token gerado no Events Manager → seu pixel → Set Up Web Events → Events API
//   TIKTOK_TEST_CODE     — (opcional) código de teste para validar sem afetar dados reais
//
// Deduplicação: o browser envia o mesmo event_id que este endpoint.
// O TikTok detecta o par (browser + server) com o mesmo event_id e mantém apenas 1.

const TIKTOK_EVENTS_API = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

// Campos aceitos no payload de user para Advanced Matching
const USER_FIELDS = ['email', 'phone_number', 'external_id', 'ttclid', 'ttp'];

// Campos aceitos no payload de properties
const PROPS_FIELDS = [
  'currency', 'value', 'contents', 'content_id', 'content_ids', 'content_type',
  'content_name', 'content_category', 'quantity', 'order_id',
  'event_source_url', 'description'
];

function isSha256Hex(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim());
}

function buildSafeUser(user) {
  const raw = pick(user, USER_FIELDS);
  const safe = {};

  if (isSha256Hex(raw.email)) safe.email = raw.email.trim().toLowerCase();
  if (isSha256Hex(raw.phone_number)) safe.phone_number = raw.phone_number.trim().toLowerCase();
  if (isSha256Hex(raw.external_id)) safe.external_id = raw.external_id.trim().toLowerCase();
  if (raw.ttclid) safe.ttclid = raw.ttclid;
  if (raw.ttp) safe.ttp = raw.ttp;

  return safe;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'access-control-allow-origin': 'https://lojaizzat.shop',
    },
  });
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

export async function onRequestOptions() {
  // CORS preflight — restrito ao domínio da loja
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': 'https://lojaizzat.shop',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  });
}

export async function onRequestPost(context) {
  try {
    const env = context.env;

    // ── Validação de credenciais ──────────────────────────────────────────────
    const pixelId     = env.TIKTOK_PIXEL_ID;
    const accessToken = env.TIKTOK_ACCESS_TOKEN;
    const testCode    = env.TIKTOK_TEST_CODE || undefined;

    if (!pixelId || pixelId.indexOf('REPLACE') !== -1) {
      // Pixel ainda não configurado — ignora silenciosamente para não quebrar o checkout
      return json({ ok: true, skipped: 'pixel_not_configured' });
    }
    if (!accessToken) {
      return json({ ok: false, error: 'access_token_not_configured' }, 500);
    }

    // ── Parse do body enviado pelo browser ───────────────────────────────────
    let body = null;
    try { body = await context.request.json(); } catch { body = {}; }

    const event      = typeof body.event === 'string' ? body.event : null;
    const event_id   = typeof body.event_id === 'string' ? body.event_id : null;
    const properties = body.properties || {};
    const user       = body.user       || {};
    const context_b  = body.context    || {};

    if (!event) return json({ ok: false, error: 'missing_event' }, 400);

    // ── Metadados server-side (mais confiáveis que o browser) ─────────────────
    const ip        = context.request.headers.get('cf-connecting-ip')
                   || context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                   || undefined;
    const userAgent = context.request.headers.get('user-agent') || undefined;

    // ── Monta payload para a Events API ──────────────────────────────────────
    const eventPayload = {
      pixel_code:        pixelId,
      event:             event,
      event_time:        Math.floor(Date.now() / 1000),
      ...(event_id && { event_id }),
      ...(testCode  && { test_event_code: testCode }),

      properties: {
        ...pick(properties, PROPS_FIELDS),
        // Garante content_id sempre presente: extrai do contents[] se não vier no top-level
        ...(
          !properties.content_id &&
          Array.isArray(properties.contents) &&
          properties.contents[0]?.content_id
            ? { content_id: properties.contents[0].content_id }
            : {}
        ),
        // URL confiável: prefere o header Origin/Referer server-side
        event_source_url:
          context.request.headers.get('referer') ||
          properties.event_source_url ||
          undefined,
      },

      user: {
        ...buildSafeUser(user),
        ...(ip        && { ip }),
        ...(userAgent && { user_agent: userAgent }),
      },

      ...(context_b.page && { page: context_b.page }),
    };

    // Remove chaves vazias em properties e user
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

    // ── Disparo para a Events API ─────────────────────────────────────────────
    const apiBody = JSON.stringify({ data: [eventPayload] });

    const apiRes = await fetch(TIKTOK_EVENTS_API, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': accessToken,
      },
      body: apiBody,
    });

    let apiJson = null;
    try { apiJson = await apiRes.json(); } catch { apiJson = null; }

    if (!apiRes.ok) {
      // Loga no Cloudflare Workers Logs mas não quebra o checkout
      console.error('[tiktok-events] API error', apiRes.status, JSON.stringify(apiJson));
      return json({ ok: false, error: 'api_error', status: apiRes.status, detail: apiJson }, 200);
    }

    return json({ ok: true, event, event_id: event_id || null });

  } catch (err) {
    console.error('[tiktok-events] Unexpected error:', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}
