(() => {
  const params = new URLSearchParams(location.search);
  const isLabMode = self.__LAB_MODE === true || params.has('lab') || params.get('mode') === 'lab' || /^\/lab(?:\/|$)/i.test(location.pathname);
  if (isLabMode) return;

  const ua = navigator.userAgent || '';
  if (/bot|crawler|spider|security-polaris/i.test(ua)) return;

  const SID_KEY = 'izz_obs_sid_v1';
  const MAX_EVENTS = 50;
  const MAX_QUEUE = 12;
  const FLUSH_DELAY = 2500;
  const START = performance.now ? performance.now() : Date.now();

  let sentCount = 0;
  let queue = [];
  let timer = 0;
  let lastFocus = '';
  let lastActivity = Date.now();
  let checkoutOpenStart = 0;
  let pixLoadingStart = 0;
  let reachedCheckout = false;
  let reachedPix = false;
  let copiedPix = false;
  let submitted = false;

  function nowMs() {
    return Math.max(0, Math.round((performance.now ? performance.now() : Date.now()) - START));
  }

  function sid() {
    try {
      let value = sessionStorage.getItem(SID_KEY);
      if (!value) {
        value = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('obs_' + Date.now().toString(36) + Math.random().toString(36).slice(2));
        sessionStorage.setItem(SID_KEY, value);
      }
      return value;
    } catch {
      return 'obs_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
  }

  function classifyDevice() {
    const s = ua.toLowerCase();
    const inTikTok = /tiktok|musical_ly|bytedance|aweme|trill/i.test(ua);
    if (/android/i.test(ua)) return inTikTok ? 'android_tiktok' : 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return inTikTok ? 'ios_tiktok' : 'ios';
    return inTikTok ? 'desktop_tiktok' : 'desktop';
  }

  function clean(value, max) {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : undefined;
    if (typeof value === 'boolean') return value;
    return String(value).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max || 140);
  }

  function source() {
    const out = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ttclid'].forEach((key) => {
      const value = params.get(key);
      if (value) out[key] = clean(value, key === 'ttclid' ? 180 : 90);
    });
    return out;
  }

  function safeData(data) {
    const allowed = [
      'stage', 'button', 'field', 'error_field', 'error_message', 'api', 'status',
      'duration_ms', 'load_ms', 'checkout_open_ms', 'pix_load_ms', 'hidden_after_ms',
      'path', 'method', 'result', 'reason', 'order_id_present', 'value', 'currency'
    ];
    const out = {};
    if (!data || typeof data !== 'object') return out;
    allowed.forEach((key) => {
      const value = clean(data[key], 180);
      if (value !== undefined && value !== '') out[key] = value;
    });
    return out;
  }

  function flush(sync) {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    if (!queue.length) return;
    const events = queue.splice(0, MAX_QUEUE);
    const payload = JSON.stringify({
      session_id: sid(),
      page: location.pathname,
      device: classifyDevice(),
      source: source(),
      events,
      sent_at: Date.now()
    });
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/session-events', blob);
        return;
      }
    } catch {}
    fetch('/api/session-events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: !!sync
    }).catch(() => {});
  }

  function record(name, data) {
    if (sentCount >= MAX_EVENTS) return;
    sentCount += 1;
    lastActivity = Date.now();
    const event = {
      name: clean(name, 60),
      t: nowMs(),
      data: safeData(data)
    };
    if (!event.name) return;
    queue.push(event);
    if (queue.length >= MAX_QUEUE) {
      flush(false);
      return;
    }
    if (!timer) timer = setTimeout(() => flush(false), FLUSH_DELAY);
  }

  self.__obs = record;

  record(location.pathname.indexOf('/c') === 0 ? 'Checkout_Page_Load' : 'LP_View', { stage: location.pathname.indexOf('/c') === 0 ? 'checkout' : 'lp' });

  if (document.readyState === 'complete') {
    record('Page_Ready', { load_ms: nowMs() });
  } else {
    addEventListener('load', () => record('Page_Ready', { load_ms: nowMs() }), { once: true });
  }

  document.addEventListener('click', (event) => {
    const target = event.target && event.target.closest ? event.target.closest('button,a,[role="button"]') : null;
    if (!target) return;
    if (target.id === 'buy-now' || target.classList.contains('buy-btn')) {
      checkoutOpenStart = nowMs();
      record('CTA_Click', { button: 'buy_now', stage: 'lp' });
      setTimeout(() => {
        if (!reachedCheckout) record('Checkout_Open_Timeout', { duration_ms: nowMs() - checkoutOpenStart });
      }, 6500);
      return;
    }
    const text = (target.textContent || '').toLowerCase();
    if (text.includes('confirmar') || text.includes('finalizar')) {
      submitted = true;
      pixLoadingStart = nowMs();
      record('Submit_Click', { button: 'confirm_purchase', stage: 'checkout' });
      setTimeout(() => {
        if (!reachedPix) record('Pix_Visible_Timeout', { duration_ms: nowMs() - pixLoadingStart });
      }, 8500);
      return;
    }
    if (text.includes('copiar') && text.includes('pix')) {
      copiedPix = true;
      record('Pix_Copy_Click', { button: 'copy_pix_code', stage: 'pix' });
    }
  }, true);

  document.addEventListener('focusin', (event) => {
    const el = event.target;
    if (!el || !el.name || !/INPUT|TEXTAREA|SELECT/.test(el.tagName || '')) return;
    const field = clean(el.name, 40);
    if (!field || field === lastFocus) return;
    lastFocus = field;
    record('Field_Focus', { field, stage: location.pathname.indexOf('/c') === 0 ? 'checkout' : 'lp' });
  }, true);

  const nativeFetch = self.fetch;
  if (typeof nativeFetch === 'function') {
    self.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = (init && init.method) || (input && input.method) || 'GET';
      const shouldMeasure = /^\/api\/(cep|orders|location|pix-config)/.test(url) || /\/api\/(cep|orders|location|pix-config)/.test(url);
      if (!shouldMeasure) return nativeFetch.apply(this, arguments);
      const started = nowMs();
      return nativeFetch.apply(this, arguments).then((response) => {
        const duration = nowMs() - started;
        const apiName = (url.match(/\/api\/([^?]+)/) || [])[1] || 'api';
        record(response.ok ? 'API_Success' : 'API_Error', {
          api: apiName,
          method,
          status: response.status,
          duration_ms: duration
        });
        return response;
      }).catch((error) => {
        const apiName = (url.match(/\/api\/([^?]+)/) || [])[1] || 'api';
        record('API_Error', {
          api: apiName,
          method,
          status: 0,
          duration_ms: nowMs() - started,
          error_message: error && error.name ? error.name : 'fetch_failed'
        });
        throw error;
      });
    };
  }

  addEventListener('error', (event) => {
    record('JS_Error', {
      error_message: event && event.message ? event.message : 'script_error',
      path: event && event.filename ? event.filename.split('/').slice(-1)[0] : ''
    });
  });

  addEventListener('unhandledrejection', (event) => {
    const reason = event && event.reason;
    record('JS_Error', {
      error_message: reason && reason.message ? reason.message : 'promise_rejection'
    });
  });

  addEventListener('pagehide', () => {
    if (reachedPix && copiedPix) {
      record('Session_End', { stage: 'pix_copied', hidden_after_ms: Date.now() - lastActivity });
    } else if (reachedPix) {
      record('Session_Abandoned', { stage: 'pix_visible_no_copy', hidden_after_ms: Date.now() - lastActivity });
    } else if (submitted) {
      record('Session_Abandoned', { stage: 'submitted_no_pix', hidden_after_ms: Date.now() - lastActivity });
    } else if (reachedCheckout) {
      record('Session_Abandoned', { stage: 'checkout_no_submit', hidden_after_ms: Date.now() - lastActivity });
    }
    flush(true);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (reachedPix && !copiedPix) record('Page_Hidden', { stage: 'pix_visible_no_copy', hidden_after_ms: Date.now() - lastActivity });
    flush(true);
  });

  const originalObs = record;
  self.__obs = function(name, data) {
    if (name === 'checkout__Visible' || name === 'Checkout_Visible') {
      reachedCheckout = true;
      originalObs('Checkout_Visible', Object.assign({ checkout_open_ms: checkoutOpenStart ? nowMs() - checkoutOpenStart : undefined }, data || {}));
      return;
    }
    if (name === 'pix__Visible' || name === 'Pix_Visible') {
      reachedPix = true;
      originalObs('Pix_Visible', Object.assign({ pix_load_ms: pixLoadingStart ? nowMs() - pixLoadingStart : undefined }, data || {}));
      return;
    }
    originalObs(name, data);
  };
})();
