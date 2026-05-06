// Cloudflare Pages middleware: first-party server-side page entry diagnostics.
// Captures HTML page entries even when browser-side diagnostics JS is blocked or fails.

const DIAG_PREFIX = 'diag:event:v1:';
const DIAG_TTL_SECONDS = 7 * 24 * 60 * 60;
const SERVER_SESSION_COOKIE = 'izz_diag_session_id';

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

function assignNumber(out, key, value) {
  const n = Number(value);
  if (Number.isFinite(n)) out[key] = n;
}

function assignBoolean(out, key, value) {
  if (value === true || value === false) out[key] = value;
}

function assignString(out, key, value, max = 120) {
  const clean = cleanString(value, max);
  if (clean) out[key] = clean;
}

function parseCookie(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    if (!key) return;
    out[key] = part.slice(idx + 1).trim();
  });
  return out;
}

function createSessionId() {
  return 'diag_srv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function detectPlatform(ua) {
  const lower = String(ua || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(lower)) return 'ios';
  if (/android/.test(lower)) return 'android';
  if (/windows/.test(lower)) return 'windows';
  if (/mac os/.test(lower)) return 'macos';
  return 'unknown';
}

function detectBrowserFamily(ua) {
  const lower = String(ua || '').toLowerCase();
  if (/tiktok|musical_ly|bytedance|aweme/.test(lower)) return 'tiktok_in_app';
  if (/instagram/.test(lower)) return 'instagram_in_app';
  if (/fbav|fban|facebook/.test(lower)) return 'facebook_in_app';
  if (/ wv\)|; wv|version\/4\.0 chrome\//.test(lower)) return 'android_webview';
  if (/crios|chrome/.test(lower)) return 'chrome';
  if (/safari/.test(lower)) return 'safari';
  return 'unknown';
}

function sanitizeParams(url) {
  const out = {};
  ['ttclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'msclkid'].forEach((key) => {
    const value = url.searchParams.get(key);
    if (value) out[key] = cleanString(value, key === 'ttclid' ? 180 : 120);
  });
  return out;
}

function getEdgeMeta(request) {
  const cf = request && request.cf && typeof request.cf === 'object' ? request.cf : {};
  const meta = {
    ray_id: cleanString(request.headers.get('cf-ray') || '', 80),
    ip_country: cleanString(cf.country || request.headers.get('cf-ipcountry') || '', 8),
    colo: cleanString(cf.colo || '', 16),
    http_protocol: cleanString(cf.httpProtocol || '', 32),
  };
  assignNumber(meta, 'asn', cf.asn);
  assignString(meta, 'as_organization', cf.asOrganization, 160);
  assignString(meta, 'tls_version', cf.tlsVersion, 32);
  assignString(meta, 'tls_cipher', cf.tlsCipher, 80);
  assignNumber(meta, 'client_tcp_rtt', cf.clientTcpRtt);
  assignNumber(meta, 'client_quic_rtt', cf.clientQuicRtt);

  const bot = cf.botManagement && typeof cf.botManagement === 'object' ? cf.botManagement : null;
  if (bot) {
    const botOut = {};
    assignNumber(botOut, 'score', bot.score);
    assignBoolean(botOut, 'verified_bot', bot.verifiedBot);
    assignBoolean(botOut, 'static_resource', bot.staticResource);
    assignBoolean(botOut, 'corporate_proxy', bot.corporateProxy);
    assignString(botOut, 'ja3_hash', bot.ja3Hash, 120);
    assignString(botOut, 'ja4', bot.ja4, 120);
    if (Array.isArray(bot.detectionIds) && bot.detectionIds.length) {
      botOut.detection_ids = bot.detectionIds.slice(0, 12).map((item) => cleanString(String(item), 40)).filter(Boolean);
    }
    if (Object.keys(botOut).length) meta.bot_management = botOut;
  }

  return meta;
}

function shouldCapturePageEntry(request, url) {
  if (!request || request.method !== 'GET') return false;
  const path = url.pathname || '/';
  if (path === '/' || path === '/c' || path === '/c/') return true;
  return false;
}

function getCriticalAssetName(url) {
  const path = String((url && url.pathname) || '').toLowerCase();
  if (path === '/assets/js/diagnostics.js') return 'diagnostics_js';
  if (path === '/assets/js/checkout.app.js') return 'checkout_app_js';
  if (path === '/assets/js/index.bundle.js') return 'index_bundle_js';
  if (path === '/assets/js/sentry-init.js') return 'sentry_init_js';
  if (path === '/assets/css/checkout.tailwind.css') return 'checkout_tailwind_css';
  return '';
}

function shouldCaptureCriticalAsset(request, url) {
  if (!request || request.method !== 'GET') return false;
  return !!getCriticalAssetName(url);
}

function buildBaseContext(request, url, sessionId) {
  const ua = request.headers.get('user-agent') || '';
  const params = sanitizeParams(url);
  const browserFamily = detectBrowserFamily(ua);
  const isLikelyTikTokBrowser = browserFamily === 'tiktok_in_app' || /tiktok|musical_ly|bytedance|aweme/i.test(ua);
  const isLikelyInApp = isLikelyTikTokBrowser || /instagram|fbav|fban| wv\)|; wv/i.test(ua);

  return {
    session_id: cleanString(sessionId, 90),
    page_path: cleanString(url.pathname || '/', 160),
    page_location: cleanString(url.href, 260),
    referrer: cleanString(request.headers.get('referer') || '', 260),
    user_agent: cleanString(ua, 420),
    platform: detectPlatform(ua),
    browser_family: browserFamily,
    is_tiktok_ad: !!params.ttclid || /tiktok/i.test(params.utm_source || '') || /tiktok/i.test(request.headers.get('referer') || ''),
    is_likely_in_app_browser: isLikelyInApp,
    is_likely_tiktok_browser: isLikelyTikTokBrowser,
    has_visual_viewport: false,
    viewport_width: 0,
    viewport_height: 0,
    visual_viewport_width: 0,
    visual_viewport_height: 0,
    device_pixel_ratio: 0,
    params,
  };
}

function buildPageEntryRecord(request, url, sessionId, status) {
  const now = Date.now();
  return {
    id: now + '_' + Math.random().toString(36).slice(2, 10),
    event: 'server_page_hit',
    created_at: new Date(now).toISOString(),
    context: buildBaseContext(request, url, sessionId),
    data: {
      source: 'server_middleware',
      http_status: cleanNumber(status, 0),
    },
    edge: getEdgeMeta(request),
  };
}

function buildCriticalAssetRecord(request, url, sessionId, status) {
  const now = Date.now();
  const assetName = getCriticalAssetName(url);
  return {
    id: now + '_' + Math.random().toString(36).slice(2, 10),
    event: 'server_asset_hit',
    created_at: new Date(now).toISOString(),
    context: buildBaseContext(request, url, sessionId),
    data: {
      source: 'server_middleware',
      http_status: cleanNumber(status, 0),
      asset_name: assetName,
      asset_url: cleanString(url.pathname + url.search, 420),
      asset_type: assetName === 'checkout_tailwind_css' ? 'style' : 'script',
      asset_status: status >= 200 && status < 400 ? 'requested' : 'request_failed',
    },
    edge: getEdgeMeta(request),
  };
}

async function writeDiagnosticRecord(context, record) {
  if (!context.env || !context.env.PIX_STORE || !record) return;
  const key = DIAG_PREFIX + record.id;
  const write = context.env.PIX_STORE.put(key, JSON.stringify(record), {
    expirationTtl: DIAG_TTL_SECONDS,
  });
  if (context.waitUntil) context.waitUntil(write);
  else await write;
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const shouldCapturePage = shouldCapturePageEntry(request, url);
  const shouldCaptureAsset = shouldCaptureCriticalAsset(request, url);
  const cookies = parseCookie(request.headers.get('cookie') || '');
  const existingSession = cleanString(cookies[SERVER_SESSION_COOKIE], 90);
  const sessionId = existingSession || createSessionId();

  const response = await context.next();
  if (shouldCapturePage) {
    await writeDiagnosticRecord(context, buildPageEntryRecord(request, url, sessionId, response.status));
  } else if (shouldCaptureAsset && existingSession) {
    await writeDiagnosticRecord(context, buildCriticalAssetRecord(request, url, existingSession, response.status));
  }

  if (!shouldCapturePage || existingSession) return response;

  const nextResponse = new Response(response.body, response);
  nextResponse.headers.append(
    'set-cookie',
    SERVER_SESSION_COOKIE + '=' + sessionId + '; Path=/; Max-Age=' + DIAG_TTL_SECONDS + '; SameSite=Lax; Secure'
  );
  return nextResponse;
}
