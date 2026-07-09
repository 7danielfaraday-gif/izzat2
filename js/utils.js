/** Utilitários compartilhados - Browser Integrity Guard */

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export async function safeAsync(fn, fallback = null) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export function withTimeout(promise, ms = 5000, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Hash SHA-256 (hex). Fallback djb2 se crypto.subtle indisponível (file://). */
export async function hashString(str) {
  const data = new TextEncoder().encode(String(str));
  if (globalThis.crypto?.subtle) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      /* fall through */
    }
  }
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

export function isNativeFunction(fn) {
  if (typeof fn !== 'function') return false;
  try {
    const s = Function.prototype.toString.call(fn);
    return /\[native code\]/.test(s) && !/\/\*|proxy|spoof/i.test(s);
  } catch {
    return false;
  }
}

export function getDescriptor(obj, prop) {
  try {
    return Object.getOwnPropertyDescriptor(obj, prop);
  } catch {
    return null;
  }
}

export function parseUserAgent(ua = navigator.userAgent) {
  const out = {
    ua,
    browser: 'unknown',
    browserVersion: null,
    os: 'unknown',
    isMobile: /Mobile|Android|iPhone|iPad|iPod/i.test(ua),
    isChromium: /Chrome|CriOS|Edg|OPR|Brave/i.test(ua) && !/Firefox/i.test(ua),
    isFirefox: /Firefox|FxiOS/i.test(ua),
    isSafari: /Safari/i.test(ua) && !/Chrome|CriOS|Edg|OPR/i.test(ua),
  };

  if (/Windows NT/i.test(ua)) out.os = 'windows';
  else if (/Android/i.test(ua)) out.os = 'android';
  else if (/iPhone|iPad|iPod/i.test(ua)) out.os = 'ios';
  else if (/Mac OS X|Macintosh/i.test(ua)) out.os = 'macos';
  else if (/Linux|X11/i.test(ua)) out.os = 'linux';
  else if (/CrOS/i.test(ua)) out.os = 'chromeos';

  const chrome = ua.match(/(?:Chrome|CriOS|Edg|OPR)\/(\d+)/);
  const ff = ua.match(/Firefox\/(\d+)/);
  const saf = ua.match(/Version\/(\d+).*Safari/);
  if (out.isChromium && chrome) {
    out.browser = /Edg\//.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : 'chrome';
    out.browserVersion = parseInt(chrome[1], 10);
  } else if (out.isFirefox && ff) {
    out.browser = 'firefox';
    out.browserVersion = parseInt(ff[1], 10);
  } else if (out.isSafari && saf) {
    out.browser = 'safari';
    out.browserVersion = parseInt(saf[1], 10);
  }

  return out;
}

export function platformOs(platform = navigator.platform) {
  const p = (platform || '').toLowerCase();
  if (/win/i.test(p)) return 'windows';
  if (/mac/i.test(p)) return 'macos';
  if (/iphone|ipad|ipod/i.test(p)) return 'ios';
  if (/android|linux arm|linux aarch/i.test(p)) return 'android';
  if (/linux/i.test(p)) return 'linux';
  return 'unknown';
}

export function finding(id, severity, title, detail, delta, tags = []) {
  return { id, severity, title, detail, delta, tags };
}

export function emptyResult(moduleId, label) {
  return {
    id: moduleId,
    label,
    findings: [],
    scoreDelta: 0,
    raw: {},
    status: 'ok',
  };
}

export function finalizeResult(moduleId, label, findings, raw = {}, status = 'ok') {
  const scoreDelta = findings.reduce((s, f) => s + (f.delta || 0), 0);
  return { id: moduleId, label, findings, scoreDelta, raw, status };
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}
