// Cloudflare Pages Function: GET /api/location
// Purpose: return approximate visitor location from Cloudflare metadata.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  });
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
}

function getHeader(request, name) {
  return cleanText(request.headers.get(name));
}

export async function onRequestGet(context) {
  try {
    const request = context.request;
    const cf = request.cf || {};

    const country = cleanText(cf.country) || getHeader(request, 'cf-ipcountry');
    const city = cleanText(cf.city) || getHeader(request, 'cf-ipcity');
    const region = cleanText(cf.region) || getHeader(request, 'cf-region');
    const regionCode = cleanText(cf.regionCode) || getHeader(request, 'cf-region-code');
    const timezone = cleanText(cf.timezone) || getHeader(request, 'cf-timezone');

    const state = regionCode || region;
    const display = city && state ? `${city}, ${state}` : '';

    return json({
      ok: true,
      source: 'cloudflare',
      country,
      city,
      region,
      region_code: regionCode,
      state,
      timezone,
      display,
    });
  } catch {
    return json({ ok: false, error: 'location_unavailable' }, 200);
  }
}

export async function onRequestPost() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
