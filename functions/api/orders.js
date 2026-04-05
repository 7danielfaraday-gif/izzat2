// Cloudflare Pages Function: GET/POST /api/orders
// POST: Save a new order (called from checkout on success)
// GET: List orders (admin only, HTTP Basic Auth)
// Storage: KV (binding name: PIX_STORE)
// Encryption: AES-256-GCM using ADMIN_ENCRYPT_KEY
// PII (name, email, phone, cpf, address) is encrypted at rest in KV.
// Only the admin GET endpoint decrypts for display.

const ORDERS_KEY = 'orders_enc_v1';
const MAX_ORDERS = 500;

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
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
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

    const order = {
      id: typeof body.id === 'string' ? body.id.trim() : ('ord_' + Date.now()),
      name: typeof body.name === 'string' ? body.name.trim() : '',
      email: typeof body.email === 'string' ? body.email.trim() : '',
      phone: typeof body.phone === 'string' ? body.phone.trim() : '',
      cpf: typeof body.cpf === 'string' ? body.cpf.trim() : '',
      cep: typeof body.cep === 'string' ? body.cep.trim() : '',
      address: typeof body.address === 'string' ? body.address.trim() : '',
      number: typeof body.number === 'string' ? body.number.trim() : '',
      city: typeof body.city === 'string' ? body.city.trim() : '',
      value: typeof body.value === 'number' ? body.value : 197.99,
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
      city: order.city,
      ip: context.request.headers.get('cf-connecting-ip') || '',
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

    // Load existing orders
    let orders = [];
    try {
      const raw = await context.env.PIX_STORE.get(ORDERS_KEY, { type: 'json' });
      if (Array.isArray(raw)) orders = raw;
    } catch {}

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

    let orders = [];
    try {
      const raw = await context.env.PIX_STORE.get(ORDERS_KEY, { type: 'json' });
      if (Array.isArray(raw)) orders = raw;
    } catch {}

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
            value: order.value,
            status: order.status,
            created_at: order.created_at,
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
          email: '', phone: '', cpf: '', cep: '', address: '', number: '', city: '',
          value: order.value,
          status: order.status,
          created_at: order.created_at,
        });
      }
    }

    return json({ ok: true, orders: decrypted, total: decrypted.length });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
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
