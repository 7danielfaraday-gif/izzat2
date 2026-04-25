// Cloudflare Pages Function: GET /api/cep?cep=00000000
// Purpose: resolve Brazilian CEP from the edge, avoiding third-party lookups in the checkout browser path.

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

const PROVIDERS = [
  {
    name: 'viacep',
    timeoutMs: 3200,
    url: cep => `https://viacep.com.br/ws/${cep}/json/`,
    normalize(data) {
      if (!data || data.erro) return null;
      return normalizeAddress({
        cep: data.cep,
        address: data.logradouro,
        neighborhood: data.bairro,
        complement: data.complemento,
        cityName: data.localidade,
        state: data.uf,
      });
    },
  },
  {
    name: 'brasilapi_v2',
    timeoutMs: 3200,
    url: cep => `https://brasilapi.com.br/api/cep/v2/${cep}`,
    normalize(data) {
      if (!data || data.errors || data.message) return null;
      return normalizeAddress({
        cep: data.cep,
        address: data.street,
        neighborhood: data.neighborhood,
        complement: '',
        cityName: data.city,
        state: data.state,
      });
    },
  },
];

function cleanText(value, max = 120) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function cityState(cityName, state) {
  const city = cleanText(cityName, 80);
  const uf = cleanText(state, 2).toUpperCase();
  if (city && uf) return `${city}/${uf}`;
  return city || uf;
}

function normalizeAddress(input) {
  const state = cleanText(input.state, 2).toUpperCase();
  const cityName = cleanText(input.cityName, 80);
  const address = cleanText(input.address, 120);
  const neighborhood = cleanText(input.neighborhood, 80);
  const city = cityState(cityName, state);

  if (!address && !neighborhood && !city) return null;

  return {
    cep: onlyDigits(input.cep),
    address,
    neighborhood,
    complement: cleanText(input.complement, 80),
    city,
    city_name: cityName,
    state,
  };
}

function json(data, status = 200, cacheable = false, extraHeaders = {}) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheable
      ? `public, max-age=86400, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}`
      : 'no-store, max-age=0',
    ...extraHeaders,
  };
  return new Response(JSON.stringify(data), { status, headers });
}

async function fetchProvider(provider, cep, signal) {
  const res = await fetch(provider.url(cep), {
    signal,
    cf: {
      cacheTtl: CACHE_TTL_SECONDS,
      cacheEverything: true,
    },
  });

  if (!res || !res.ok) throw new Error(`${provider.name}_http_${res && res.status}`);

  const data = await res.json();
  const normalized = provider.normalize(data);
  if (!normalized) throw new Error(`${provider.name}_not_found`);

  return {
    ok: true,
    source: provider.name,
    ...normalized,
  };
}

async function firstValidProvider(cep) {
  const inflight = PROVIDERS.map(provider => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), provider.timeoutMs);
    const promise = fetchProvider(provider, cep, controller.signal)
      .finally(() => clearTimeout(timeoutId));
    return { controller, promise };
  });

  try {
    return await Promise.any(inflight.map(item => item.promise));
  } finally {
    for (const item of inflight) {
      try { item.controller.abort('done'); } catch {}
    }
  }
}

function cacheKeyFor(request, cep) {
  const url = new URL(request.url);
  url.search = `?cep=${cep}`;
  return new Request(url.toString(), { method: 'GET' });
}

async function readCache(request, cep) {
  try {
    const cached = await caches.default.match(cacheKeyFor(request, cep));
    if (!cached) return null;
    const headers = new Headers(cached.headers);
    headers.set('x-cep-cache', 'HIT');
    return new Response(cached.body, { status: cached.status, headers });
  } catch {
    return null;
  }
}

async function writeCache(context, request, cep, response) {
  try {
    context.waitUntil(caches.default.put(cacheKeyFor(request, cep), response.clone()));
  } catch {}
}

export async function onRequestGet(context) {
  const request = context.request;
  const url = new URL(request.url);
  const cep = onlyDigits(url.searchParams.get('cep'));

  if (!/^\d{8}$/.test(cep)) {
    return json({ ok: false, error: 'invalid_cep' }, 400);
  }

  const cached = await readCache(request, cep);
  if (cached) return cached;

  try {
    const data = await firstValidProvider(cep);
    const response = json(data, 200, true, { 'x-cep-cache': 'MISS' });
    await writeCache(context, request, cep, response);
    return response;
  } catch {
    return json({ ok: false, error: 'cep_not_found', cep }, 200);
  }
}

export async function onRequestPost() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
