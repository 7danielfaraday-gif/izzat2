// Cloudflare Pages Function: GET/POST /api/orders
// POST: Save a new order (called from checkout on success)
// GET: List orders (admin only, HTTP Basic Auth)
// Storage: KV (binding name: PIX_STORE)
// Encryption: AES-256-GCM using ADMIN_ENCRYPT_KEY
// PII (name, email, phone, cpf, address) is encrypted at rest in KV.
// Only the admin GET endpoint decrypts for display.

import { buildSafeUser, getTikTokDestinations, normalizeEventSourceUrl, sendTikTokEvent } from './tiktok-events.js';

const ORDERS_KEY = 'orders_enc_v1';
const MAX_ORDERS = 500;
const ATTRIBUTION_CLICK_KEYS = new Set(['ttclid', 'gclid', 'msclkid', 'external_id']);
const SOURCE_EXTRA_FIELDS = new Set(['ttp', 'event_source_url', 'ga_client_id', 'ga_session_id']);
const PRODUCT_ID = 'AFON-12L-BI';
const PRODUCT_NAME = 'Fritadeira Elétrica Forno Oven 12L Mondial AFON-12L-BI';
const DEFAULT_ORDER_VALUE = 197.99;

// --- AES-256-GCM Encryption (Web Crypto API) ---

async function deriveKey(secret) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('izzateletro_orders_salt_v1'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plaintext, secret) {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  // Combine IV + ciphertext, encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(base64, secret) {
  const key = await deriveKey(secret);
  const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

// --- Helpers ---

function cleanString(value, maxLen = 255) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function normalizeSourceKey(key) {
  const normalized = cleanString(String(key || '').toLowerCase(), 64);
  if (!normalized) return '';
  if (normalized === 'eid') return 'external_id';
  if (normalized.startsWith('utm_') || normalized.startsWith('tt_') || ATTRIBUTION_CLICK_KEYS.has(normalized) || SOURCE_EXTRA_FIELDS.has(normalized)) {
    return normalized;
  }
  return '';
}

function sanitizeSource(rawSource) {
  const source = {};
  if (!rawSource || typeof rawSource !== 'object' || Array.isArray(rawSource)) return source;
  for (const [rawKey, rawValue] of Object.entries(rawSource)) {
    const key = normalizeSourceKey(rawKey);
    if (!key) continue;
    const value = cleanString(rawValue, key === 'ttclid' ? 1024 : 255);
    if (!value) continue;
    source[key] = value;
  }
  return source;
}

function buildPurchaseEventId(order) {
  const baseId = cleanString(order && order.id ? String(order.id) : ('ord_' + Date.now()), 128) || ('ord_' + Date.now());
  return `purchase_${baseId}`;
}

async function getOrdersFromStore(env) {
  try {
    const raw = await env.PIX_STORE.get(ORDERS_KEY, { type: 'json' });
    if (Array.isArray(raw)) return raw;
  } catch {}
  return [];
}

function summarizeTikTokResults(results) {
  return Array.isArray(results)
    ? results.map((result) => ({
        label: result.label,
        pixel_id: result.pixel_id,
        ok: !!result.ok,
        status: result.status,
      }))
    : [];
}

function summarizeGAResult(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    ok: !!result.ok,
    status: result.status || 0,
    skipped: result.skipped || false,
    error: result.error || '',
  };
}

async function decryptStoredOrder(order, encryptKey) {
  if (!order || !order.enc) return { pii: order || {} };
  const piiJson = await decrypt(order.enc, encryptKey);
  return { pii: JSON.parse(piiJson) };
}

async function sendManualPurchaseToTikTok(env, storedOrder, pii) {
  const destinations = getTikTokDestinations(env);
  if (!destinations.length) {
    return {
      ok: true,
      skipped: 'pixel_not_configured',
      results: [],
      event_id: buildPurchaseEventId(storedOrder),
    };
  }

  const source = storedOrder.source || {};
  const eventId = storedOrder.purchase_event_id || buildPurchaseEventId(storedOrder);
  const safeUser = await buildSafeUser({
    email: pii.email || '',
    phone: pii.phone || '',
    external_id: source.external_id || '',
    ttclid: source.ttclid || '',
    ttp: source.ttp || '',
  });

  const value = typeof storedOrder.value === 'number' && Number.isFinite(storedOrder.value)
    ? storedOrder.value
    : DEFAULT_ORDER_VALUE;

  const eventPayload = {
    event: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    properties: {
      currency: 'BRL',
      value,
      quantity: 1,
      content_type: 'product',
      content_name: PRODUCT_NAME,
      content_id: PRODUCT_ID,
      content_ids: [PRODUCT_ID],
      contents: [{
        content_id: PRODUCT_ID,
        id: PRODUCT_ID,
        quantity: 1,
        price: value,
        item_price: value,
      }],
      order_id: storedOrder.id,
      event_source_url: normalizeEventSourceUrl(source.event_source_url || 'https://redeizzat.shop/c/'),
    },
    user: {
      ...safeUser,
      ...(pii.ip ? { ip: pii.ip } : {}),
      ...(pii.user_agent ? { user_agent: pii.user_agent } : {}),
    },
  };

  for (const section of ['properties', 'user']) {
    for (const key of Object.keys(eventPayload[section])) {
      if (
        eventPayload[section][key] === undefined ||
        eventPayload[section][key] === null ||
        eventPayload[section][key] === ''
      ) {
        delete eventPayload[section][key];
      }
    }
  }

  const testCode = env.TIKTOK_TEST_CODE || undefined;
  const results = await Promise.all(destinations.map((destination) => {
    return sendTikTokEvent(destination, eventPayload, testCode, 'Purchase', eventId);
  }));
  const ok = results.some((result) => result.ok);

  return {
    ok,
    event_id: eventId,
    results,
    skipped: false,
  };
}

async function sendManualPurchaseToGA4(env, storedOrder) {
  const measurementId = cleanString(env.GA4_MEASUREMENT_ID || env.GA_MEASUREMENT_ID || 'G-QY6B4BXBLF', 64);
  const apiSecret = cleanString(env.GA4_API_SECRET || env.GA_API_SECRET, 512);
  if (!measurementId || !apiSecret) {
    return { ok: true, skipped: 'ga4_api_secret_not_configured', status: 0 };
  }

  const source = storedOrder.source || {};
  const clientId = cleanString(source.ga_client_id, 128);
  if (!clientId) {
    return { ok: true, skipped: 'ga_client_id_missing', status: 0 };
  }

  const value = typeof storedOrder.value === 'number' && Number.isFinite(storedOrder.value)
    ? storedOrder.value
    : DEFAULT_ORDER_VALUE;

  const params = {
    transaction_id: storedOrder.id,
    currency: 'BRL',
    value,
    items: [{
      item_id: PRODUCT_ID,
      item_name: PRODUCT_NAME,
      item_category: 'Eletroportateis',
      price: value,
      quantity: 1,
    }],
    engagement_time_msec: 100,
  };

  const sessionId = cleanString(source.ga_session_id, 64);
  if (sessionId) params.session_id = sessionId;

  const payload = {
    client_id: clientId,
    events: [{
      name: 'purchase',
      params,
    }],
  };

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return {
      ok: response.ok || response.status === 204,
      status: response.status,
      skipped: false,
      error: response.ok || response.status === 204 ? '' : 'ga4_api_error',
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      skipped: false,
      error: 'ga4_network_error',
    };
  }
}

function json(data, status = 200, request = null) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
  };
  if (request) {
    const origin = request.headers.get('origin');
    if (origin) headers['access-control-allow-origin'] = origin;
  }
  return new Response(JSON.stringify(data), { status, headers });
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
  try { decoded = atob(m[1]); } catch { return false; }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  return decoded.slice(0, i) === user && decoded.slice(i + 1) === pass;
}

export async function onRequestOptions(context) {
  const origin = context.request.headers.get('origin');
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin || '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'cache-control': 'no-store',
    },
  });
}

// POST — save order (no auth needed, called from client checkout)
export async function onRequestPost(context) {
  try {
    const encryptKey = context.env.ADMIN_ENCRYPT_KEY;
    if (!encryptKey) {
      console.error('[orders] ADMIN_ENCRYPT_KEY not configured');
      return json({ ok: false, error: 'encryption_not_configured' }, 500, context.request);
    }

    let body;
    try { body = await context.request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400, context.request); }
    const source = sanitizeSource(body.source);

    const order = {
      id: typeof body.id === 'string' ? body.id.trim() : ('ord_' + Date.now()),
      name: typeof body.name === 'string' ? body.name.trim() : '',
      email: typeof body.email === 'string' ? body.email.trim() : '',
      phone: typeof body.phone === 'string' ? body.phone.trim() : '',
      cpf: typeof body.cpf === 'string' ? body.cpf.trim() : '',
      cep: typeof body.cep === 'string' ? body.cep.trim() : '',
      address: typeof body.address === 'string' ? body.address.trim() : '',
      number: typeof body.number === 'string' ? body.number.trim() : '',
      neighborhood: typeof body.neighborhood === 'string' ? body.neighborhood.trim() : '',
      complement: typeof body.complement === 'string' ? body.complement.trim() : '',
      city: typeof body.city === 'string' ? body.city.trim() : '',
      value: typeof body.value === 'number' ? body.value : DEFAULT_ORDER_VALUE,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    if (!order.name) return json({ ok: false, error: 'name_required' }, 400, context.request);

    // Encrypt PII fields
    const pii = JSON.stringify({
      name: order.name,
      email: order.email,
      phone: order.phone,
      cpf: order.cpf,
      cep: order.cep,
      address: order.address,
      number: order.number,
      neighborhood: order.neighborhood,
      complement: order.complement,
      city: order.city,
      ip: context.request.headers.get('cf-connecting-ip') || '',
      user_agent: context.request.headers.get('user-agent') || '',
    });

    const encryptedPii = await encrypt(pii, encryptKey);

    // Store only encrypted data + non-PII metadata
    const storedOrder = {
      id: order.id,
      enc: encryptedPii,
      value: order.value,
      status: order.status,
      created_at: order.created_at,
    };
    if (Object.keys(source).length) storedOrder.source = source;

    // Load existing orders
    let orders = await getOrdersFromStore(context.env);

    // Prevent duplicate by order ID
    if (orders.some(o => o.id === order.id)) {
      return json({ ok: true, duplicate: true }, 200, context.request);
    }

    // Add new order at the beginning
    orders.unshift(storedOrder);

    // Keep only last N orders
    if (orders.length > MAX_ORDERS) orders = orders.slice(0, MAX_ORDERS);

    await context.env.PIX_STORE.put(ORDERS_KEY, JSON.stringify(orders));

    return json({ ok: true, order_id: order.id }, 200, context.request);
  } catch (err) {
    console.error('[orders] POST error:', err);
    return json({ ok: false, error: 'server_error' }, 500, context.request);
  }
}

// GET — list orders (admin only, decrypts PII)
export async function onRequestGet(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();

    const encryptKey = context.env.ADMIN_ENCRYPT_KEY;
    if (!encryptKey) {
      return json({ ok: false, error: 'encryption_key_not_configured' }, 500);
    }

    let orders = await getOrdersFromStore(context.env);

    // Decrypt PII for each order
    const decrypted = [];
    for (const order of orders) {
      try {
        if (order.enc) {
          const piiJson = await decrypt(order.enc, encryptKey);
          const pii = JSON.parse(piiJson);
          decrypted.push({
            id: order.id,
            ...pii,
            source: order.source || {},
            value: order.value,
            status: order.status,
            created_at: order.created_at,
            paid_at: order.paid_at || '',
            paid_source: order.paid_source || '',
            purchase_event_id: order.purchase_event_id || '',
            purchase_sent_at: order.purchase_sent_at || '',
            purchase_sync_status: order.purchase_sync_status || '',
            ga_purchase_sent_at: order.ga_purchase_sent_at || '',
            ga_purchase_sync_status: order.ga_purchase_sync_status || '',
          });
        } else {
          // Legacy unencrypted order (if any)
          decrypted.push(order);
        }
      } catch (e) {
        // If decryption fails, show order with masked data
        decrypted.push({
          id: order.id,
          name: '[erro ao descriptografar]',
          email: '', phone: '', cpf: '', cep: '', address: '', number: '', neighborhood: '', complement: '', city: '',
          source: order.source || {},
          value: order.value,
          status: order.status,
          created_at: order.created_at,
          paid_at: order.paid_at || '',
          paid_source: order.paid_source || '',
          purchase_event_id: order.purchase_event_id || '',
          purchase_sent_at: order.purchase_sent_at || '',
          purchase_sync_status: order.purchase_sync_status || '',
          ga_purchase_sent_at: order.ga_purchase_sent_at || '',
          ga_purchase_sync_status: order.ga_purchase_sync_status || '',
        });
      }
    }

    return json({ ok: true, orders: decrypted, total: decrypted.length });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

// PUT — mark order as paid and send confirmed Purchase to TikTok (admin only)
export async function onRequestPut(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();

    const encryptKey = context.env.ADMIN_ENCRYPT_KEY;
    if (!encryptKey) {
      return json({ ok: false, error: 'encryption_key_not_configured' }, 500, context.request);
    }

    let body;
    try { body = await context.request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400, context.request); }

    const orderId = cleanString(body.id, 128);
    const requestedStatus = cleanString(body.status, 32).toLowerCase();
    if (!orderId) return json({ ok: false, error: 'id_required' }, 400, context.request);
    if (requestedStatus !== 'paid') return json({ ok: false, error: 'unsupported_status' }, 400, context.request);

    const orders = await getOrdersFromStore(context.env);
    const orderIndex = orders.findIndex((order) => order && order.id === orderId);
    if (orderIndex < 0) return json({ ok: false, error: 'order_not_found' }, 404, context.request);

    const storedOrder = orders[orderIndex];
    const { pii } = await decryptStoredOrder(storedOrder, encryptKey);
    const nowIso = new Date().toISOString();

    if (!storedOrder.status || storedOrder.status !== 'paid') {
      storedOrder.status = 'paid';
      storedOrder.paid_at = nowIso;
      storedOrder.paid_source = 'admin_manual';
    } else if (!storedOrder.paid_at) {
      storedOrder.paid_at = nowIso;
      storedOrder.paid_source = storedOrder.paid_source || 'admin_manual';
    }

    if (storedOrder.purchase_sent_at) {
      let gaResult = null;
      if (!storedOrder.ga_purchase_sent_at) {
        gaResult = await sendManualPurchaseToGA4(context.env, storedOrder);
        storedOrder.ga_purchase_sync_status = gaResult.skipped ? 'skipped' : (gaResult.ok ? 'sent' : 'failed');
        storedOrder.ga_purchase_sync_result = summarizeGAResult(gaResult);
        if (gaResult.ok && !gaResult.skipped) {
          storedOrder.ga_purchase_sent_at = nowIso;
        }
      }
      orders[orderIndex] = storedOrder;
      await context.env.PIX_STORE.put(ORDERS_KEY, JSON.stringify(orders));
      return json({
        ok: true,
        order_id: storedOrder.id,
        status: storedOrder.status,
        paid_at: storedOrder.paid_at,
        purchase_sent_at: storedOrder.purchase_sent_at,
        purchase_sync_status: storedOrder.purchase_sync_status || 'sent',
        ga_purchase_sent_at: storedOrder.ga_purchase_sent_at || '',
        ga_purchase_sync_status: storedOrder.ga_purchase_sync_status || '',
        already_synced: true,
        google_analytics: summarizeGAResult(gaResult) || {
          ok: true,
          status: 0,
          skipped: storedOrder.ga_purchase_sent_at ? 'already_synced' : (storedOrder.ga_purchase_sync_status || 'not_attempted'),
          error: '',
        },
      }, 200, context.request);
    }

    const purchaseResult = await sendManualPurchaseToTikTok(context.env, storedOrder, pii || {});
    const gaResult = await sendManualPurchaseToGA4(context.env, storedOrder);
    storedOrder.purchase_event_id = purchaseResult.event_id || buildPurchaseEventId(storedOrder);
    storedOrder.purchase_sync_status = purchaseResult.skipped ? 'skipped' : (purchaseResult.ok ? 'sent' : 'failed');
    storedOrder.purchase_sync_results = summarizeTikTokResults(purchaseResult.results);
    if (purchaseResult.ok || purchaseResult.skipped) {
      storedOrder.purchase_sent_at = nowIso;
    }
    storedOrder.ga_purchase_sync_status = gaResult.skipped ? 'skipped' : (gaResult.ok ? 'sent' : 'failed');
    storedOrder.ga_purchase_sync_result = summarizeGAResult(gaResult);
    if (gaResult.ok && !gaResult.skipped) {
      storedOrder.ga_purchase_sent_at = nowIso;
    }

    orders[orderIndex] = storedOrder;
    await context.env.PIX_STORE.put(ORDERS_KEY, JSON.stringify(orders));

    return json({
      ok: true,
      order_id: storedOrder.id,
      status: storedOrder.status,
      paid_at: storedOrder.paid_at,
      purchase_event_id: storedOrder.purchase_event_id,
      purchase_sent_at: storedOrder.purchase_sent_at || '',
      purchase_sync_status: storedOrder.purchase_sync_status,
      ga_purchase_sent_at: storedOrder.ga_purchase_sent_at || '',
      ga_purchase_sync_status: storedOrder.ga_purchase_sync_status || '',
      tiktok: {
        ok: !!purchaseResult.ok,
        skipped: purchaseResult.skipped || false,
        results: summarizeTikTokResults(purchaseResult.results),
      },
      google_analytics: summarizeGAResult(gaResult),
    }, 200, context.request);
  } catch (err) {
    console.error('[orders] PUT error:', err);
    return json({ ok: false, error: 'server_error' }, 500, context.request);
  }
}

// DELETE — clear all orders + reset pix copy clicks (admin only)
export async function onRequestDelete(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();

    await Promise.all([
      context.env.PIX_STORE.put(ORDERS_KEY, JSON.stringify([])),
      context.env.PIX_STORE.put('metric_pix_copy_clicks_v1', '0'),
    ]);

    return json({ ok: true, message: 'all_data_cleared' });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}
