// Cloudflare Pages Function: POST /api/meta-events
// Purpose: Meta (Facebook/Instagram) Conversions API (CAPI) — envia eventos server-side espelhando o browser pixel.
//
// Variáveis de ambiente (Cloudflare Pages → Settings → Environment Variables):
//   X_META_PID  — ID do Pixel do Meta (Facebook/Instagram)
//   X_META_TK   — Token de acesso da Conversions API (gerado no Events Manager → seu Pixel → Configurações → API de Conversões)
//
// Deduplicação: o browser (fbq) envia o mesmo event_id que este endpoint.
// O Meta detecta o par (browser + server) com o mesmo event_id e mantém apenas 1.

const META_GRAPH_API = 'https://graph.facebook.com/v21.0';

// Mapeamento de eventos personalizados do TikTok -> eventos padrão/permitidos do Meta.
// O Meta só aceita um conjunto fixo de eventos padrão; o resto vai como custom_event.
const STANDARD_META_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'Search',
  'AddToCart',
  'AddToWishlist',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Purchase',
  'Lead',
  'CompleteRegistration',
  'Contact',
  'CustomizeProduct',
  'Donate',
  'FindLocation',
  'Schedule',
  'StartTrial',
  'SubmitApplication',
  'Subscribe',
]);

// Mapas explícitos de nomes legados do fluxo TikTok -> eventos do Meta.
const EVENT_NAME_MAP = {
  CompletePayment: 'Purchase',
  Checkout_Error: null, // mantém como custom (não há equivalente padrão)
};

// Eventos do fluxo antigo que não existem no Meta e viram custom.
const CUSTOM_EVENTS = new Set([
  'Check_Reviews',
  'Interact_Gallery',
  'ScrollDepth',
  'InputCaptured',
  'Pix_Copy_Click',
  'Checkout_Error',
]);

function mapEventName(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'string') return { name: null, isCustom: false };
  if (EVENT_NAME_MAP[rawEvent] !== undefined) {
    const mapped = EVENT_NAME_MAP[rawEvent];
    return mapped ? { name: mapped, isCustom: false } : { name: rawEvent, isCustom: true };
  }
  if (STANDARD_META_EVENTS.has(rawEvent)) return { name: rawEvent, isCustom: false };
  if (CUSTOM_EVENTS.has(rawEvent)) return { name: rawEvent, isCustom: true };
  // Desconhecido: envia como custom para não perder o dado.
  return { name: rawEvent, isCustom: true };
}

const isSha256Hex = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim());

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const normalizeEmail = (value) => (hasText(value) ? value.trim().toLowerCase() : null);

function normalizePhone(value) {
  if (!hasText(value)) return null;
  const raw = String(value).trim().toLowerCase();
  if (isSha256Hex(raw)) return raw;
  // Meta exige country code. Se vier só dígitos e começar com 55 mantém, senão prefixa 55 (Brasil).
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return digits;
}

// Padrão _fbp: fb.{subdomain_index}.{creation_time}.{random_number}  (ex.: fb.1.1234567890.123456)
const isFbp = (value) =>
  typeof value === 'string' && /^fb\.\d+\.\d+\.\d+$/i.test(value.trim());

// Padrão _fbc: fb.{subdomain_index}.{creation_time}.{fbclid}  (ex.: fb.1.1234567890.abc123)
const isFbc = (value) =>
  typeof value === 'string' && /^fb\.\d+\.\d+\.[a-z0-9_-]+$/i.test(value.trim());

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
  try {
    return new URL(request.url).origin;
  } catch {
    return '*';
  }
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
    headers: { ...corsHeaders(context.request), 'cache-control': 'no-store' },
  });
}

export async function onRequestPost(context) {
  try {
    const env = context.env;

    const pixelId = env.X_META_PID;
    const accessToken = env.X_META_TK;

    if (!pixelId || String(pixelId).indexOf('REPLACE') !== -1) {
      return json({ ok: true, skipped: 'pixel_not_configured' }, 200, context.request);
    }
    if (!accessToken) {
      return json({ ok: false, error: 'access_token_not_configured' }, 500, context.request);
    }

    let body = null;
    try {
      body = await context.request.json();
    } catch {
      body = {};
    }

    const event = typeof body.event === 'string' ? body.event : null;
    const event_id = typeof body.event_id === 'string' ? body.event_id : null;
    const properties = body.properties || {};
    const user = body.user || {};

    if (!event) return json({ ok: false, error: 'missing_event' }, 400, context.request);

    const { name: metaEventName, isCustom } = mapEventName(event);
    if (!metaEventName) {
      return json({ ok: true, skipped: 'event_unmapped' }, 200, context.request);
    }

    // Metadados server-side (mais confiáveis que o browser)
    const ip =
      context.request.headers.get('cf-connecting-ip') ||
      (context.request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      undefined;
    const userAgent = context.request.headers.get('user-agent') || undefined;

    // --- user_data (Meta) ---
    const user_data = {};

    if (hasText(user.email)) {
      const normalizedEmail = normalizeEmail(user.email);
      if (normalizedEmail) {
        user_data.em = isSha256Hex(normalizedEmail) ? [normalizedEmail] : [await sha256Hex(normalizedEmail)];
      }
    }
    if (hasText(user.phone)) {
      const normalizedPhone = isSha256Hex(user.phone) ? user.phone.trim().toLowerCase() : normalizePhone(user.phone);
      if (normalizedPhone) {
        user_data.ph = isSha256Hex(normalizedPhone) ? [normalizedPhone] : [await sha256Hex(normalizedPhone)];
      }
    }
    if (hasText(user.external_id)) {
      const normalizedExternalId = user.external_id.trim().toLowerCase();
      user_data.external_id = isSha256Hex(normalizedExternalId)
        ? [normalizedExternalId]
        : [await sha256Hex(normalizedExternalId)];
    }

    // _fbc / _fbp (Facebook click/browser id) — principais chaves de matching
    const rawFbc = hasText(properties.fbc) ? properties.fbc : hasText(user.fbc) ? user.fbc : null;
    const rawFbp = hasText(properties.fbp) ? properties.fbp : hasText(user.fbp) ? user.fbp : null;
    const rawFbclid = hasText(properties.fbclid) ? properties.fbclid : hasText(user.fbclid) ? user.fbclid : null;

    if (rawFbc && isFbc(rawFbc)) user_data.fbc = rawFbc;
    else if (rawFbclid) {
      // Constrói _fbc se só tivermos o fbclid: fb.{subdomain_index}.{now}.{fbclid}
      user_data.fbc = 'fb.1.' + Math.floor(Date.now() / 1000) + '.' + rawFbclid;
    }
    if (rawFbp && isFbp(rawFbp)) user_data.fbp = rawFbp;

    if (user_data.fbp === undefined && user_data.fbc === undefined && rawFbp === undefined) {
      // Sem _fbp nem _fbc: ainda assim envia fbclid bruto no fbc para matching.
    }

    if (ip) user_data.client_ip_address = ip;
    if (userAgent) user_data.client_user_agent = userAgent;

    // --- custom_data (valor/conteúdo/UTMs) ---
    const custom_data = pick(properties, [
      'currency',
      'value',
      'contents',
      'content_ids',
      'content_type',
      'content_name',
      'content_category',
      'order_id',
      'num_items',
      'predicted_ltv',
    ]);

    // UTMs e contexto extra (Meta aceita campos arbitrários em custom_data)
    const extraContext = pick(properties, [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'fbclid',
      'msclkid',
      'ttclid',
      'description',
    ]);
    Object.assign(custom_data, extraContext);

    const event_source_url = normalizeEventSourceUrl(
      context.request.headers.get('referer') || properties.event_source_url || undefined
    );

    const eventPayload = {
      event_name: metaEventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url,
      ...(event_id && { event_id }),
      user_data,
    };
    if (Object.keys(custom_data).length > 0) eventPayload.custom_data = custom_data;

    const apiBody = JSON.stringify({
      data: [eventPayload],
      ...(env.X_META_TEST_CODE && { test_event_code: env.X_META_TEST_CODE }),
      // Recomendado pelo Meta para reduzir Event Match Quality reprovado (não obrigatório).
      // 'partner_agent': 'cf-pages-capi',
    });

    const url = `${META_GRAPH_API}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: apiBody,
    });

    let apiJson = null;
    try {
      apiJson = await apiRes.json();
    } catch {
      apiJson = null;
    }

    const apiOk = !!apiJson && apiJson.success !== false && apiRes.ok;
    const receivedEventId = apiJson && apiJson.events_received ? apiJson.events_received[0] : null;

    console.log('[meta-events]', JSON.stringify({
      event,
      meta_event: metaEventName,
      custom: isCustom,
      event_id: event_id || null,
      status: apiRes.status,
      success: apiJson && apiJson.success,
      fb_trace_id: apiJson && apiJson.fb_trace_id,
      match_keys: {
        em: !!user_data.em,
        ph: !!user_data.ph,
        external_id: !!user_data.external_id,
        fbp: !!user_data.fbp,
        fbc: !!user_data.fbc,
        client_ip: !!user_data.client_ip_address,
        client_ua: !!user_data.client_user_agent,
      },
    }));

    if (!apiOk) {
      console.error('[meta-events] API error', JSON.stringify({
        event,
        event_id: event_id || null,
        status: apiRes.status,
        body: apiJson,
      }));
      return json(
        {
          ok: false,
          error: 'api_error',
          status: apiRes.status,
          api_response: apiJson,
        },
        200,
        context.request
      );
    }

    return json(
      { ok: true, event, meta_event: metaEventName, event_id: event_id || null, received: receivedEventId },
      200,
      context.request
    );
  } catch (err) {
    console.error('[meta-events] Unexpected error:', err);
    return json({ ok: false, error: 'server_error' }, 500, context.request);
  }
}
