// Cloudflare Pages Function: POST /api/order-create
// Purpose: criar um pedido interno mínimo (nome + telefone) para uso operacional no admin.
// Não envia esses dados ao TikTok. Não é um 'log paralelo': é o registro interno do pedido.
//
// Variáveis de ambiente necessárias:
//   PIX_STORE          — KV binding
//   ADMIN_ENCRYPT_KEY  — mesma chave do admin para descriptografia

const PREFIX = 'order_v1:';
const DEFAULT_TTL_DAYS = 45;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0' },
  });
}

function clampStr(v, max = 240) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function isObject(x) { return x && typeof x === 'object' && !Array.isArray(x); }

function tsKeyPart(d) {
  const pad = (n, w) => String(n).padStart(w, '0');
  return pad(d.getUTCFullYear(),4)+pad(d.getUTCMonth()+1,2)+pad(d.getUTCDate(),2)+
         pad(d.getUTCHours(),2)+pad(d.getUTCMinutes(),2)+pad(d.getUTCSeconds(),2)+
         pad(d.getUTCMilliseconds(),3);
}

function randId(len = 8) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let o = '';
  for (let i = 0; i < len; i++) o += a[Math.floor(Math.random()*a.length)];
  return o;
}

function buildOrderId(now) {
  return 'ord_' + now.getTime() + '_' + randId(6);
}

function getTtlSeconds(env) {
  const n = parseInt(String(env.ORDER_TTL_DAYS || env.CHECKOUT_LOG_TTL_DAYS || DEFAULT_TTL_DAYS), 10);
  const days = Number.isFinite(n) && n > 0 ? Math.min(Math.max(n,1),365) : DEFAULT_TTL_DAYS;
  return days * 86400;
}

function sameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  if (origin) {
    try {
      return new URL(origin).host === url.host;
    } catch {
      return false;
    }
  }
  if (referer) {
    try {
      return new URL(referer).host === url.host;
    } catch {
      return false;
    }
  }
  return true;
}

async function deriveKey(secret) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('izzat-checkout-salt-v1'), iterations: 100_000, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptField(key, plaintext) {
  if (!plaintext) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { ciphertext: b64(encrypted), iv: b64(iv) };
}

export async function onRequestOptions(context) {
  const origin = new URL(context.request.url).origin;
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  });
}

export async function onRequestGet() {
  return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store, max-age=0' } });
}

export async function onRequestPost(context) {
  try {
    if (!sameOrigin(context.request)) return json({ ok: false, error: 'forbidden_origin' }, 403);

    let body = null;
    try { body = await context.request.json(); } catch { body = null; }
    if (!isObject(body)) body = {};

    const rawName = clampStr(body.name, 140);
    const rawPhone = clampStr(body.phone, 64);
    if (!rawName || !rawPhone) return json({ ok: false, error: 'missing_required_fields' }, 400);

    const now = new Date();
    const orderId = buildOrderId(now);
    const kvKey = PREFIX + tsKeyPart(now) + ':' + randId(10);

    const payload = {
      event: 'order_create',
      status: clampStr(body.status, 40) || 'pending',
      source: clampStr(body.source, 40) || 'checkout_public',
      order_id: orderId,
      ref: clampStr(body.ref, 32) || undefined,
      received_at: now.toISOString(),
    };

    const secret = context.env.ADMIN_ENCRYPT_KEY;
    if (secret) {
      try {
        const aesKey = await deriveKey(secret);
        const nameEnc = await encryptField(aesKey, rawName);
        const phoneEnc = await encryptField(aesKey, rawPhone);
        if (nameEnc) { payload.name_enc = nameEnc.ciphertext; payload.name_iv = nameEnc.iv; }
        if (phoneEnc) { payload.phone_enc = phoneEnc.ciphertext; payload.phone_iv = phoneEnc.iv; }
      } catch (e) {
        console.error('[order-create] encryption error:', e);
      }
    }

    await context.env.PIX_STORE.put(kvKey, JSON.stringify(payload), { expirationTtl: getTtlSeconds(context.env) });
    return json({ ok: true, order_id: orderId, stored_pii: Boolean(payload.name_enc && payload.phone_enc) });
  } catch (e) {
    console.error('[order-create] unexpected error:', e);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}
