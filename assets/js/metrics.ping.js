// Simple "online now" heartbeat for Cloudflare Pages Functions.
// Sends a ping every 20s so the backend can count active sessions.

(() => {
  const SID_KEY = 'izzat_sid_v1';

  const getSid = () => {
    try {
      let sid = sessionStorage.getItem(SID_KEY);
      if (!sid) {
        sid = self.crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2);
        sessionStorage.setItem(SID_KEY, sid);
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
