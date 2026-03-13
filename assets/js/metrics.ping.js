// Simple "online now" heartbeat for Cloudflare Pages Functions.
// Sends a ping every 20s so the backend can count active sessions.

(() => {
  const SID_KEY = 'izzat_sid_v1';

  const getSid = () => {
    try {
      // FIX: Tenta localStorage primeiro (mais resiliente em WebViews que bloqueiam sessionStorage)
      let sid = null;
      try { sid = localStorage.getItem(SID_KEY); } catch(e) {}
      if (!sid) { try { sid = sessionStorage.getItem(SID_KEY); } catch(e) {} }
      if (!sid) {
        try { sid = crypto.randomUUID(); } catch(_e) {
        sid = Date.now().toString(36) + Math.random().toString(36).slice(2);
      }
        try { localStorage.setItem(SID_KEY, sid); } catch(e) {}
        try { sessionStorage.setItem(SID_KEY, sid); } catch(e) {}
      }
      return sid;
    } catch {
      return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
  };

  const send = () => {
    const body = JSON.stringify({ sid: getSid(), path: location.pathname, ts: Date.now() });
    try {
      if (navigator.sendBeacon) {
        // FIX: Usa Blob com Content-Type correto para que o server-side parse JSON corretamente
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/metrics/ping', blob);
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
