// Simple "online now" heartbeat for Cloudflare Pages Functions.
// Sends a ping every 20s so the backend can count active sessions.

(() => {
  const SID_KEY = 'izzat_sid_v1';
  let intervalId = null;

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

  const canPingNow = () => {
    const preloadReady = !window.__preloadGuard || window.__preloadGuard.isReady();
    return preloadReady && document.visibilityState === 'visible';
  };

  const send = () => {
    if (!canPingNow()) return;

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

  const start = () => {
    if (intervalId) return;
    send();
    intervalId = setInterval(send, 20000);
  };

  const stop = () => {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
  };

  const sync = () => {
    if (canPingNow()) start();
    else stop();
  };

  document.addEventListener('visibilitychange', sync, { passive: true });
  window.addEventListener('pageshow', sync, { passive: true });
  window.addEventListener('pagehide', stop, { passive: true });

  if (window.__runWhenTrackingReady) {
    window.__runWhenTrackingReady(sync);
  } else {
    sync();
  }
})();