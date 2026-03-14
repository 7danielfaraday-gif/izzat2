// Simple "online now" heartbeat for Cloudflare Pages Functions.
// Sends a ping every 20s so the backend can count active sessions.
// FIX: Cookie-first session ID (sessionStorage is wiped between TikTok WebView navigations)

(() => {
  const SID_KEY = 'izzat_sid_v1';

  const getSid = () => {
    // 1) Cookie-first: survives in-app browser navigation
    try {
      var match = document.cookie.match(new RegExp('(?:^|;\\s*)' + SID_KEY + '=([^;]*)'));
      if (match && match[1]) return match[1];
    } catch(e) {}

    // 2) sessionStorage fallback
    try {
      var sid = sessionStorage.getItem(SID_KEY);
      if (sid) {
        try { document.cookie = SID_KEY + '=' + sid + ';path=/;SameSite=Lax'; } catch(e) {}
        return sid;
      }
    } catch(e) {}

    // 3) Generate new
    var newSid = self.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    try { document.cookie = SID_KEY + '=' + newSid + ';path=/;SameSite=Lax'; } catch(e) {}
    try { sessionStorage.setItem(SID_KEY, newSid); } catch(e) {}
    return newSid;
  };

  const send = () => {
    const body = JSON.stringify({ sid: getSid(), path: location.pathname, ts: Date.now() });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/metrics/ping', body);
        return;
      }
    } catch {
      // ignore
    }

    fetch('/api/metrics/ping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  };

  send();
  setInterval(send, 20000);
})();
