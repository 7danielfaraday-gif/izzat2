// Cloudflare Pages Function: /api/diagnostics
// Purpose: first-party technical diagnostics for TikTok in-app browser and checkout health.
// Privacy: no session replay, no field values, no screen recording.
// Auth: GET is admin-only. POST is public and sanitized.
// Storage: KV (binding name: PIX_STORE)

const PREFIX = 'diag:event:v1:';
const TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_BODY_BYTES = 12 * 1024;
const MAX_EVENTS_PER_GET = 300;
const MAX_KEYS_PER_LIST = 1000;
const DELETE_BATCH_SIZE = 50;

const ALLOWED_EVENTS = new Set([
  'client_boot_started',
  'diagnostics_script_loaded',
  'critical_asset_loaded',
  'critical_asset_missing',
  'zaraz_loaded',
  'diagnostics_session_started',
  'page_loaded',
  'checkout_opened',
  'checkout_app_loaded',
  'checkout_ready',
  'checkout_first_interaction',
  'checkout_first_scroll',
  'checkout_first_field_focus',
  'checkout_keyboard_opened',
  'checkout_field_visibility',
  'checkout_pix_screen_loaded',
  'checkout_pix_copy_attempt',
  'api_error',
  'js_error',
  'resource_error',
  'slow_render',
  'web_vital',
  'ga_event_seen',
]);

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
      'www-authenticate': 'Basic realm="PIX Admin", charset="UTF-8"',
    },
  });
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

  return decoded.slice(0, i) === user && decoded.slice(i + 1) === pass;
}

function cleanString(value, max = 220) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanBool(value) {
  return value === true || value === 'true' || value === 1;
}

function assignMetaNumber(out, key, value) {
  const n = Number(value);
  if (Number.isFinite(n)) out[key] = n;
}

function assignMetaBoolean(out, key, value) {
  if (value === true || value === false) out[key] = value;
}

function assignMetaString(out, key, value, max = 120) {
  const clean = cleanString(value, max);
  if (clean) out[key] = clean;
}

function sanitizeParams(params) {
  const source = params && typeof params === 'object' ? params : {};
  const out = {};
  [
    'ttclid',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'gclid',
    'fbclid',
    'msclkid',
  ].forEach((key) => {
    if (source[key]) out[key] = cleanString(source[key], key === 'ttclid' ? 180 : 120);
  });
  return out;
}

function sanitizeContext(context) {
  const source = context && typeof context === 'object' ? context : {};
  return {
    session_id: cleanString(source.session_id, 80),
    page_path: cleanString(source.page_path, 160),
    page_location: cleanString(source.page_location, 260),
    referrer: cleanString(source.referrer, 260),
    user_agent: cleanString(source.user_agent, 420),
    platform: cleanString(source.platform, 80),
    browser_family: cleanString(source.browser_family, 80),
    is_tiktok_ad: cleanBool(source.is_tiktok_ad),
    is_likely_in_app_browser: cleanBool(source.is_likely_in_app_browser),
    is_likely_tiktok_browser: cleanBool(source.is_likely_tiktok_browser),
    has_visual_viewport: cleanBool(source.has_visual_viewport),
    viewport_width: cleanNumber(source.viewport_width),
    viewport_height: cleanNumber(source.viewport_height),
    visual_viewport_width: cleanNumber(source.visual_viewport_width),
    visual_viewport_height: cleanNumber(source.visual_viewport_height),
    device_pixel_ratio: cleanNumber(source.device_pixel_ratio, 1),
    params: sanitizeParams(source.params),
  };
}

function sanitizeData(data) {
  const source = data && typeof data === 'object' ? data : {};
  const out = {};
  [
    'checkout_entry_source',
    'checkout_visible_source',
    'checkout_scroll_viewport',
    'checkout_ready_state',
    'source',
    'interaction_type',
    'field_name',
    'field_type',
    'api_name',
    'error_name',
    'error_filename',
    'resource_type',
    'asset_name',
    'asset_url',
    'asset_type',
    'asset_status',
    'initiator_type',
    'ready_state',
    'event_name',
    'metric_name',
  ].forEach((key) => {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      out[key] = cleanString(source[key], 120);
    }
  });

  [
    'scroll_top',
    'scroll_height',
    'client_height',
    'time_since_start_ms',
    'duration_ms',
    'lcp',
    'cls',
    'inp',
    'render_ms',
    'start_time_ms',
    'response_end_ms',
    'transfer_size',
    'encoded_body_size',
    'decoded_body_size',
    'focused_field_top',
    'focused_field_bottom',
    'keyboard_delta',
    'http_status',
    'error_lineno',
    'error_colno',
  ].forEach((key) => {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      out[key] = cleanNumber(source[key]);
    }
  });

  [
    'field_visible',
    'checkout_root_found',
    'submit_button_found',
    'first_input_found',
    'overflow_x',
  ].forEach((key) => {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      out[key] = cleanBool(source[key]);
    }
  });

  if (source.error_message) out.error_message = cleanString(source.error_message, 220);
  if (source.error_stack) out.error_stack = cleanString(source.error_stack, 700);
  if (source.resource_url) out.resource_url = cleanString(source.resource_url, 420);
  if (source.asset_url) out.asset_url = cleanString(source.asset_url, 420);
  if (source.event_id) out.event_id = cleanString(source.event_id, 100);

  return out;
}

function getClientMeta(request, cf) {
  const meta = {
    ray_id: cleanString(request.headers.get('cf-ray') || '', 80),
    ip_country: cleanString((cf && cf.country) || request.headers.get('cf-ipcountry') || '', 8),
    colo: cleanString((cf && cf.colo) || '', 16),
    http_protocol: cleanString((cf && cf.httpProtocol) || '', 32),
  };
  assignMetaNumber(meta, 'asn', cf && cf.asn);
  assignMetaString(meta, 'as_organization', cf && cf.asOrganization, 160);
  assignMetaString(meta, 'tls_version', cf && cf.tlsVersion, 32);
  assignMetaString(meta, 'tls_cipher', cf && cf.tlsCipher, 80);
  assignMetaNumber(meta, 'client_tcp_rtt', cf && cf.clientTcpRtt);
  assignMetaNumber(meta, 'client_quic_rtt', cf && cf.clientQuicRtt);

  const bot = cf && cf.botManagement && typeof cf.botManagement === 'object' ? cf.botManagement : null;
  if (bot) {
    const botOut = {};
    assignMetaNumber(botOut, 'score', bot.score);
    assignMetaBoolean(botOut, 'verified_bot', bot.verifiedBot);
    assignMetaBoolean(botOut, 'static_resource', bot.staticResource);
    assignMetaBoolean(botOut, 'corporate_proxy', bot.corporateProxy);
    assignMetaString(botOut, 'ja3_hash', bot.ja3Hash, 120);
    assignMetaString(botOut, 'ja4', bot.ja4, 120);
    if (Array.isArray(bot.detectionIds) && bot.detectionIds.length) {
      botOut.detection_ids = bot.detectionIds.slice(0, 12).map((item) => cleanString(String(item), 40)).filter(Boolean);
    }
    if (Object.keys(botOut).length) meta.bot_management = botOut;
  }

  return meta;
}

function summarize(events) {
  const counts = {};
  const platforms = {};
  let tiktokAdSessions = 0;
  let likelyTikTokBrowser = 0;
  const sessions = new Set();

  events.forEach((event) => {
    counts[event.event] = (counts[event.event] || 0) + 1;
    const platform = event.context && event.context.platform ? event.context.platform : 'unknown';
    platforms[platform] = (platforms[platform] || 0) + 1;
    const sid = event.context && event.context.session_id;
    if (sid) sessions.add(sid);
    if (event.context && event.context.is_tiktok_ad) tiktokAdSessions += 1;
    if (event.context && event.context.is_likely_tiktok_browser) likelyTikTokBrowser += 1;
  });

  return {
    total_events: events.length,
    unique_sessions: sessions.size,
    counts,
    platforms,
    tiktok_ad_events: tiktokAdSessions,
    likely_tiktok_browser_events: likelyTikTokBrowser,
  };
}

async function readJsonBody(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) throw new Error('body_too_large');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error('body_too_large');
  return text ? JSON.parse(text) : {};
}

async function listDiagnosticKeys(kv) {
  const keys = [];
  let cursor;

  do {
    const options = { prefix: PREFIX, limit: MAX_KEYS_PER_LIST };
    if (cursor) options.cursor = cursor;

    const listed = await kv.list(options);
    (listed.keys || []).forEach((item) => {
      if (item && item.name) keys.push(item.name);
    });

    cursor = listed.list_complete ? undefined : listed.cursor;
  } while (cursor);

  return keys;
}

export async function onRequestPost(context) {
  try {
    const payload = await readJsonBody(context.request);
    const eventName = cleanString(payload && payload.event, 80);
    if (!ALLOWED_EVENTS.has(eventName)) return json({ ok: false, error: 'event_not_allowed' }, 400);

    const now = Date.now();
    const contextData = sanitizeContext(payload.context || {});
    if (!contextData.session_id) return json({ ok: false, error: 'missing_session' }, 400);

    const record = {
      id: now + '_' + Math.random().toString(36).slice(2, 10),
      event: eventName,
      created_at: new Date(now).toISOString(),
      context: contextData,
      data: sanitizeData(payload.data || {}),
      edge: getClientMeta(context.request, context.request.cf),
    };

    const key = PREFIX + record.id;
    const write = context.env.PIX_STORE.put(key, JSON.stringify(record), {
      expirationTtl: TTL_SECONDS,
    });

    if (context.waitUntil) context.waitUntil(write);
    else await write;

    return json({ ok: true, id: record.id });
  } catch (error) {
    const message = error && error.message === 'body_too_large' ? 'body_too_large' : 'server_error';
    return json({ ok: false, error: message }, message === 'body_too_large' ? 413 : 500);
  }
}

export async function onRequestGet(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();

    const keys = (await listDiagnosticKeys(context.env.PIX_STORE))
      .sort()
      .reverse()
      .slice(0, MAX_EVENTS_PER_GET);

    const rows = await Promise.all(
      keys.map(async (key) => {
        try {
          return await context.env.PIX_STORE.get(key, { type: 'json' });
        } catch {
          return null;
        }
      }),
    );

    const events = rows.filter(Boolean).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    return json({
      ok: true,
      updated_at: new Date().toISOString(),
      summary: summarize(events),
      events,
    });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestPut() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}

export async function onRequestDelete(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();

    const keys = await listDiagnosticKeys(context.env.PIX_STORE);
    for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
      const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
      await Promise.all(batch.map((key) => context.env.PIX_STORE.delete(key)));
    }

    return json({
      ok: true,
      deleted: keys.length,
      updated_at: new Date().toISOString(),
    });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}
