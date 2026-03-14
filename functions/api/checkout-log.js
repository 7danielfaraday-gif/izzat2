// Cloudflare Pages Function: POST /api/checkout-log
// Purpose: store a "checkout capture" record in KV with AES-256-GCM encryption
//
// Variáveis de ambiente necessárias:
//   PIX_STORE          — KV binding
//   ADMIN_ENCRYPT_KEY  — string secreta de 32+ chars (deve ser IGUAL no projeto admin)
//
// O que fica no KV:
//   { order_id, ref, event, ts_client, received_at, name_enc, name_iv, phone_enc, phone_iv }
//   name e phone são encriptados — nunca ficam em texto claro no KV.

const PREFIX = 'checkout_log_v1:';
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

function randId(len = 10) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let o = ''; for (let i = 0; i < len; i++) o += a[Math.floor(Math.random()*a.length)]; return o;
}

function getTtlSeconds(env) {
  const n = parseInt(String(env.CHECKOUT_LOG_TTL_DAYS || DEFAULT_TTL_DAYS), 10);
  const days = Number.isFinite(n) && n > 0 ? Math.min(Math.max(n,1),365) : DEFAULT_TTL_DAYS;
  return days * 86400;
}

// ── AES-256-GCM helpers ──────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────

export async function onRequestPost(context) {
  try {
    let body = null;
    try { body = await context.request.json(); } catch { body = null; }
    if (!isObject(body)) body = {};

    const now = new Date();
    const kvKey = PREFIX + tsKeyPart(now) + ':' + randId(10);

    const payload = {};
    payload.event      = clampStr(body.event, 80)    || undefined;
    payload.order_id   = clampStr(body.order_id, 140) || undefined;
    payload.ref        = clampStr(body.ref, 32)       || undefined;
    payload.ts_client  = (typeof body.ts_client === 'number' && Number.isFinite(body.ts_client)) ? body.ts_client : undefined;
    payload.received_at = now.toISOString();

    // Encripta nome e telefone antes de salvar no KV
    const secret = context.env.ADMIN_ENCRYPT_KEY;
    const rawName  = clampStr(body.name, 140);
    const rawPhone = clampStr(body.phone, 64);

    if (secret && (rawName || rawPhone)) {
      try {
        const aesKey = await deriveKey(secret);
        if (rawName) {
          const r = await encryptField(aesKey, rawName);
          if (r) { payload.name_enc = r.ciphertext; payload.name_iv = r.iv; }
        }
        if (rawPhone) {
          const r = await encryptField(aesKey, rawPhone);
          if (r) { payload.phone_enc = r.ciphertext; payload.phone_iv = r.iv; }
        }
      } catch(e) {
        console.error('[checkout-log] encryption error:', e);
        // Fail-safe: não salva dados sensíveis se encriptação falhar
      }
    }
    // Se ADMIN_ENCRYPT_KEY não configurado → salva só order_id/ref (não salva PII)

    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined || payload[k] === null || payload[k] === '') delete payload[k];
    }

    await context.env.PIX_STORE.put(kvKey, JSON.stringify(payload), { expirationTtl: getTtlSeconds(context.env) });
    return json({ ok: true });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestGet(context) {
  return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store, max-age=0' } });
}
