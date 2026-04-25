(() => {
  const params = new URLSearchParams(location.search);
  const isLabMode = self.__LAB_MODE === true || params.has('lab') || params.get('mode') === 'lab' || /^\/lab(?:\/|$)/i.test(location.pathname);
  if (isLabMode) return;

  const ua = navigator.userAgent || '';
  if (/bot|crawler|spider|security-polaris/i.test(ua)) return;

  const SID_KEY = 'izz_obs_sid_v1';
  const MAX_EVENTS = 140;
  const MAX_QUEUE = 20;
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
  let clsValue = 0;
  let lastLcp = 0;
  const typedFields = {};
  const filledFields = {};
  const consoleErrors = { count: 0 };
  const isCheckoutPage = location.pathname.indexOf('/c') === 0;
  const scrollDepthMarks = { 25: false, 50: false, 75: false, 90: false };
  let maxScrollDepth = 0;
  let ctaSeen = false;
  let ctaClicked = false;
  let scrollTicking = false;
  let lastScrollCheckAt = 0;
  let longTaskSamples = 0;

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

  function safeUrl(value) {
    if (!value) return '';
    try {
      const u = new URL(String(value), location.href);
      return (u.origin === location.origin ? '' : u.origin) + u.pathname.split('/').slice(-2).join('/');
    } catch {
      return clean(String(value).split('?')[0], 180) || '';
    }
  }

  function elementLabel(el) {
    if (!el || !el.tagName) return '';
    const tag = String(el.tagName).toLowerCase();
    const id = el.id ? ('#' + clean(el.id, 40)) : '';
    const cls = el.className && typeof el.className === 'string' ? ('.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')) : '';
    const name = el.name ? ('[name=' + clean(el.name, 40) + ']') : '';
    return clean(tag + id + name + cls, 140);
  }

  function elementMetrics(el) {
    if (!el || !el.getBoundingClientRect) return {};
    try {
      const r = el.getBoundingClientRect();
      return {
        visible: !!(r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height)
      };
    } catch {
      return {};
    }
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
      'path', 'method', 'result', 'reason', 'order_id_present', 'value', 'currency',
      'filename', 'lineno', 'colno', 'stack', 'tag', 'selector', 'resource', 'resource_name',
      'initiator', 'ready_state', 'viewport_w', 'viewport_h', 'connection_type', 'effective_type',
      'downlink', 'rtt', 'save_data', 'ttfb_ms', 'dcl_ms', 'dom_interactive_ms', 'transfer_size',
      'encoded_size', 'decoded_size', 'fcp_ms', 'fp_ms', 'lcp_ms', 'cls_milli', 'longtask_ms',
      'render_ms', 'enabled', 'visible', 'top', 'bottom', 'width', 'height', 'input_count',
      'required_filled', 'form_ready_ms', 'has_submit', 'submit_top', 'submit_enabled',
      'active_field', 'has_value', 'value_len', 'is_cross_origin', 'scroll_depth',
      'scroll_y', 'doc_height', 'cta_visible', 'cta_top', 'cta_bottom', 'cta_kind', 'idle_ms'
      , 'checkout_ready_state', 'checkout_entry_source', 'checkout_visible_source'
    ];
    const out = {};
    if (!data || typeof data !== 'object') return out;
    allowed.forEach((key) => {
      const max = key === 'stack' ? 700 : (key === 'resource' || key === 'resource_name' || key === 'filename' || key === 'selector' ? 260 : 180);
      const value = clean(data[key], max);
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

  function scheduleIdle(fn, timeout) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn, { timeout: timeout || 1500 });
      return;
    }
    setTimeout(fn, Math.min(timeout || 1500, 800));
  }

  scheduleIdle(() => {
    const viewport = window.visualViewport;
    record('Env_Info', {
      stage: location.pathname.indexOf('/c') === 0 ? 'checkout' : 'lp',
      viewport_w: viewport ? viewport.width : window.innerWidth,
      viewport_h: viewport ? viewport.height : window.innerHeight,
      connection_type: navigator.connection && navigator.connection.type,
      effective_type: navigator.connection && navigator.connection.effectiveType,
      downlink: navigator.connection && navigator.connection.downlink,
      rtt: navigator.connection && navigator.connection.rtt,
      save_data: navigator.connection && navigator.connection.saveData
    });
  }, 1800);

  record(location.pathname.indexOf('/c') === 0 ? 'Checkout_Page_Load' : 'LP_View', { stage: location.pathname.indexOf('/c') === 0 ? 'checkout' : 'lp' });

  if (document.readyState === 'complete') {
    record('Page_Ready', { load_ms: nowMs() });
    recordNavigationTiming();
    setTimeout(() => scheduleIdle(recordResourceSummary, 2500), 1200);
  } else {
    addEventListener('load', () => {
      record('Page_Ready', { load_ms: nowMs() });
      setTimeout(recordNavigationTiming, 0);
      setTimeout(() => scheduleIdle(recordResourceSummary, 2500), 1200);
    }, { once: true });
  }

  function recordNavigationTiming() {
    try {
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (!nav) return;
      record('Perf_Navigation', {
        ttfb_ms: nav.responseStart,
        dom_interactive_ms: nav.domInteractive,
        dcl_ms: nav.domContentLoadedEventEnd,
        load_ms: nav.loadEventEnd,
        transfer_size: nav.transferSize,
        encoded_size: nav.encodedBodySize,
        decoded_size: nav.decodedBodySize
      });
    } catch {}
  }

  function recordResourceSummary() {
    try {
      const entries = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
      entries
        .filter((entry) => entry && entry.duration > 250 && !/\/api\/session-events/.test(entry.name || ''))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 8)
        .forEach((entry) => {
          record('Perf_Resource_Slow', {
            resource: safeUrl(entry.name),
            resource_name: safeUrl(entry.name),
            initiator: entry.initiatorType || '',
            duration_ms: entry.duration,
            transfer_size: entry.transferSize,
            encoded_size: entry.encodedBodySize
          });
        });
    } catch {}
  }

  function setupPerformanceObservers() {
    if (typeof PerformanceObserver !== 'function') return;
    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.name === 'first-contentful-paint') record('Perf_Paint', { fcp_ms: entry.startTime });
          if (entry.name === 'first-paint') record('Perf_Paint', { fp_ms: entry.startTime });
        });
      }).observe({ type: 'paint', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          lastLcp = Math.round(entry.startTime || 0);
        });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) clsValue += entry.value || 0;
        });
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration >= 120 && (longTaskSamples < 6 || entry.duration >= 300)) {
            longTaskSamples += 1;
            record('Perf_Long_Task', { longtask_ms: entry.duration });
          }
        });
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
  }
  setupPerformanceObservers();

  function getLPCTA() {
    return document.getElementById('buy-now') || document.querySelector('.buy-btn,[data-checkout-target]');
  }

  function getScrollDepth() {
    const doc = document.documentElement;
    const body = document.body;
    const height = Math.max(doc.scrollHeight || 0, body ? body.scrollHeight || 0 : 0);
    const viewport = innerHeight || doc.clientHeight || 1;
    const scrollable = Math.max(1, height - viewport);
    const y = pageYOffset || doc.scrollTop || 0;
    return {
      y: Math.round(y),
      height: Math.round(height),
      depth: Math.max(0, Math.min(100, Math.round((y / scrollable) * 100)))
    };
  }

  function recordLPCTAState(reason) {
    if (isCheckoutPage) return;
    if (reason === 'scroll' && ctaSeen) return;
    const cta = getLPCTA();
    if (!cta) {
      if (reason === 'after_load') record('LP_CTA_Not_Visible_After_Load', { stage: 'lp', reason: 'missing' });
      return;
    }
    const metrics = elementMetrics(cta);
    const visible = !!metrics.visible;
    if (visible && !ctaSeen) {
      ctaSeen = true;
      record('LP_CTA_Visible', Object.assign({ stage: 'lp', cta_visible: true, cta_kind: cta.id === 'buy-now' ? 'buy_now' : 'checkout_cta', reason }, metrics, { cta_top: metrics.top, cta_bottom: metrics.bottom }));
    } else if (!visible && reason === 'after_load') {
      record('LP_CTA_Not_Visible_After_Load', Object.assign({ stage: 'lp', cta_visible: false, cta_kind: cta.id === 'buy-now' ? 'buy_now' : 'checkout_cta', reason }, metrics, { cta_top: metrics.top, cta_bottom: metrics.bottom }));
    }
  }

  function recordLPScrollDepth() {
    if (isCheckoutPage) return;
    const s = getScrollDepth();
    if (s.depth > maxScrollDepth) maxScrollDepth = s.depth;
    [25, 50, 75, 90].forEach((mark) => {
      if (!scrollDepthMarks[mark] && s.depth >= mark) {
        scrollDepthMarks[mark] = true;
        record('LP_Scroll_Depth', { stage: 'lp', scroll_depth: mark, scroll_y: s.y, doc_height: s.height });
      }
    });
  }

  function setupLPDiagnostics() {
    if (isCheckoutPage) return;
    const onScroll = () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        scrollTicking = false;
        const t = nowMs();
        if (t - lastScrollCheckAt < 600) return;
        lastScrollCheckAt = t;
        recordLPScrollDepth();
        if (!ctaSeen) recordLPCTAState('scroll');
      });
    };
    addEventListener('scroll', onScroll, { passive: true });
    setTimeout(() => {
      recordLPCTAState('after_load');
      recordLPScrollDepth();
    }, 900);
    setTimeout(() => {
      const s = getScrollDepth();
      const viewport = innerHeight || document.documentElement.clientHeight || 1;
      if (!ctaClicked && s.height > viewport * 1.8 && maxScrollDepth < 10) {
        record('LP_Scroll_Stalled', { stage: 'lp', scroll_depth: maxScrollDepth, scroll_y: s.y, doc_height: s.height, idle_ms: 12000 });
      }
    }, 12000);
  }
  setupLPDiagnostics();

  document.addEventListener('click', (event) => {
    const target = event.target && event.target.closest ? event.target.closest('button,a,[role="button"]') : null;
    if (!target) return;
    if (target.id === 'buy-now' || target.classList.contains('buy-btn')) {
      ctaClicked = true;
      checkoutOpenStart = nowMs();
      const metrics = elementMetrics(target);
      record('CTA_Click', Object.assign({ button: 'buy_now', stage: 'lp', cta_kind: target.id === 'buy-now' ? 'buy_now' : 'checkout_cta', cta_visible: !!metrics.visible, cta_top: metrics.top, cta_bottom: metrics.bottom }, metrics));
      setTimeout(() => {
        if (!reachedCheckout) record('Checkout_Open_Timeout', { duration_ms: nowMs() - checkoutOpenStart });
      }, 6500);
      return;
    }
    const text = (target.textContent || '').toLowerCase();
    if (text.includes('confirmar') || text.includes('finalizar')) {
      submitted = true;
      pixLoadingStart = nowMs();
      record('Submit_Click', Object.assign({ button: 'confirm_purchase', stage: 'checkout' }, elementMetrics(target)));
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
    record('Field_Focus', Object.assign({ field, stage: location.pathname.indexOf('/c') === 0 ? 'checkout' : 'lp', has_value: !!el.value, value_len: el.value ? String(el.value).length : 0 }, elementMetrics(el)));
  }, true);

  document.addEventListener('input', (event) => {
    const el = event.target;
    if (!el || !el.name || !/INPUT|TEXTAREA|SELECT/.test(el.tagName || '')) return;
    const field = clean(el.name, 40);
    if (!field) return;
    const len = el.value ? String(el.value).length : 0;
    if (!typedFields[field]) {
      typedFields[field] = true;
      record('Field_Input_Start', { field, stage: location.pathname.indexOf('/c') === 0 ? 'checkout' : 'lp', value_len: len });
    }
    if (len >= 3 && !filledFields[field]) {
      filledFields[field] = true;
      record('Field_Input_Filled', { field, stage: location.pathname.indexOf('/c') === 0 ? 'checkout' : 'lp', value_len: len });
    }
  }, true);

  const nativeFetch = self.fetch;
  if (typeof nativeFetch === 'function') {
    self.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = (init && init.method) || (input && input.method) || 'GET';
      const shouldMeasure = /^\/api\/(cep|orders|location|pix-config|tiktok-events)/.test(url) || /\/api\/(cep|orders|location|pix-config|tiktok-events)/.test(url);
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
    const target = event && event.target;
    if (target && target !== window && (target.src || target.href)) {
      record('Resource_Error', {
        tag: target.tagName || '',
        resource: safeUrl(target.src || target.href),
        selector: elementLabel(target)
      });
      return;
    }
    const err = event && event.error;
    const filename = event && event.filename ? safeUrl(event.filename) : '';
    record('JS_Error', {
      error_message: event && event.message ? event.message : 'script_error',
      filename,
      path: filename,
      lineno: event && event.lineno,
      colno: event && event.colno,
      stack: err && err.stack ? clean(err.stack, 500) : '',
      is_cross_origin: (event && event.message === 'Script error.' && !filename) || false,
      ready_state: document.readyState
    });
  });

  addEventListener('unhandledrejection', (event) => {
    const reason = event && event.reason;
    record('JS_Error', {
      error_message: reason && reason.message ? reason.message : 'promise_rejection',
      stack: reason && reason.stack ? clean(reason.stack, 500) : '',
      ready_state: document.readyState
    });
  });

  try {
    const nativeConsoleError = console.error;
    console.error = function() {
      if (consoleErrors.count < 5) {
        consoleErrors.count += 1;
        const first = arguments && arguments.length ? arguments[0] : '';
        record('Console_Error', {
          error_message: first && first.message ? first.message : clean(first, 220),
          stack: first && first.stack ? clean(first.stack, 500) : ''
        });
      }
      return nativeConsoleError.apply(this, arguments);
    };
  } catch {}

  addEventListener('pagehide', () => {
    if (lastLcp) record('Perf_LCP', { lcp_ms: lastLcp });
    if (clsValue) record('Perf_CLS', { cls_milli: Math.round(clsValue * 1000) });
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
      setTimeout(() => {
        try {
          const form = document.getElementById('checkout-form');
          const submit = form ? form.querySelector('button[type="submit"]:not([style*="display: none"])') : document.querySelector('button[type="submit"]');
          originalObs('Checkout_Form_Ready', Object.assign({
            stage: 'checkout',
            form_ready_ms: nowMs(),
            has_submit: !!submit,
            submit_enabled: submit ? !submit.disabled : false,
            submit_top: submit && submit.getBoundingClientRect ? Math.round(submit.getBoundingClientRect().top) : undefined,
            input_count: form ? form.querySelectorAll('input,textarea,select').length : 0,
            required_filled: form ? Array.prototype.slice.call(form.querySelectorAll('input[required]')).filter((input) => input.value && String(input.value).trim()).length : 0
          }, elementMetrics(submit)));
        } catch {}
      }, 250);
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
