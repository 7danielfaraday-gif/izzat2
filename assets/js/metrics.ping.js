// Simple "online now" heartbeat for Cloudflare Pages Functions.
// Sends a lightweight ping so the backend can count active sessions.

(() => {
  const params = new URLSearchParams(location.search);
  const isLabMode = self.__LAB_MODE === true || params.has('lab') || params.get('mode') === 'lab' || /^\/lab(?:\/|$)/i.test(location.pathname);
  if (isLabMode) return;

  const ua = navigator.userAgent || '';
  const isCrawler = /bot|crawler|spider|security-polaris/i.test(ua);
  if (isCrawler) return;

  const SID_KEY = 'izzateletro_sid_v1';
  const PING_INTERVAL_MS = 60000;
  const FIRST_PING_DELAY_MS = 8000;

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
    if (document.visibilityState && document.visibilityState !== 'visible') return;

    const body = JSON.stringify({ sid: getSid(), path: location.pathname, ts: Date.now() });
    try {
      if (navigator.sendBeacon) {
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

  setTimeout(send, FIRST_PING_DELAY_MS);
  setInterval(send, PING_INTERVAL_MS);
})();
