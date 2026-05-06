(function () {
  if (window.__IZZAT_DIAGNOSTICS_READY) return;
  window.__IZZAT_DIAGNOSTICS_READY = true;

  var startedAt = window.__izzatEarlyDiagStartedAt || Date.now();
  var sentOnce = window.__izzatDiagnosticsSentOnce || {};
  window.__izzatDiagnosticsSentOnce = sentOnce;
  var endpoint = '/api/diagnostics';

  function isLabMode() {
    return !!(window.__LAB_MODE || window.__TEST_MODE);
  }

  function safeString(value, max) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/\s+/g, ' ').trim().slice(0, max || 180);
  }

  function getParams() {
    var out = {};
    try {
      var params = new URLSearchParams(window.location.search || '');
      ['ttclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'msclkid'].forEach(function (key) {
        var value = params.get(key);
        if (value) out[key] = safeString(value, key === 'ttclid' ? 180 : 120);
      });
    } catch (e) { }
    return out;
  }

  function getCookie(name) {
    try {
      var parts = String(document.cookie || '').split(';');
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i].trim();
        if (part.indexOf(name + '=') === 0) return part.slice(name.length + 1);
      }
    } catch (e) { }
    return '';
  }

  function getSessionId() {
    var key = 'izz_diag_session_id';
    var earlySession = safeString(window.__izzatEarlyDiagSessionId, 90);
    var cookieSession = safeString(getCookie(key), 90);
    try {
      if (earlySession) {
        sessionStorage.setItem(key, earlySession);
        return earlySession;
      }
      if (cookieSession) {
        sessionStorage.setItem(key, cookieSession);
        return cookieSession;
      }
      var existing = sessionStorage.getItem(key);
      if (existing) return existing;
      var next = 'diag_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(key, next);
      return next;
    } catch (e) {
      return 'diag_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
  }

  var sessionId = getSessionId();
  var initialViewportHeight = window.innerHeight || 0;

  function detectPlatform(ua) {
    var lower = String(ua || '').toLowerCase();
    if (/iphone|ipad|ipod/.test(lower)) return 'ios';
    if (/android/.test(lower)) return 'android';
    if (/windows/.test(lower)) return 'windows';
    if (/mac os/.test(lower)) return 'macos';
    return 'unknown';
  }

  function detectBrowserFamily(ua) {
    var lower = String(ua || '').toLowerCase();
    if (/tiktok|musical_ly|bytedance|aweme/.test(lower)) return 'tiktok_in_app';
    if (/instagram/.test(lower)) return 'instagram_in_app';
    if (/fbav|fban|facebook/.test(lower)) return 'facebook_in_app';
    if (/ wv\)|; wv|version\/4\.0 chrome\//.test(lower)) return 'android_webview';
    if (/crios|chrome/.test(lower)) return 'chrome';
    if (/safari/.test(lower)) return 'safari';
    return 'unknown';
  }

  function getContext() {
    var ua = navigator.userAgent || '';
    var params = getParams();
    var browserFamily = detectBrowserFamily(ua);
    var isLikelyTikTokBrowser = browserFamily === 'tiktok_in_app' || /tiktok|musical_ly|bytedance|aweme/i.test(ua);
    var isLikelyInApp = isLikelyTikTokBrowser || /instagram|fbav|fban| wv\)|; wv/i.test(ua);
    var vv = window.visualViewport;
    return {
      session_id: sessionId,
      page_path: window.location.pathname || '',
      page_location: window.location.href || '',
      referrer: document.referrer || '',
      user_agent: ua,
      platform: detectPlatform(ua),
      browser_family: browserFamily,
      is_tiktok_ad: !!params.ttclid || /tiktok/i.test(params.utm_source || ''),
      is_likely_in_app_browser: isLikelyInApp,
      is_likely_tiktok_browser: isLikelyTikTokBrowser,
      has_visual_viewport: !!vv,
      viewport_width: window.innerWidth || 0,
      viewport_height: window.innerHeight || 0,
      visual_viewport_width: vv ? vv.width : 0,
      visual_viewport_height: vv ? vv.height : 0,
      device_pixel_ratio: window.devicePixelRatio || 1,
      params: params
    };
  }

  function sendPayload(event, data) {
    if (isLabMode()) return;
    var payload = JSON.stringify({
      event: event,
      context: getContext(),
      data: Object.assign({ time_since_start_ms: Date.now() - startedAt }, data || {})
    });

    function sendBeaconFallback() {
      try {
        if (navigator.sendBeacon) {
          var blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(endpoint, blob);
        }
      } catch (e) { }
    }

    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true,
        cache: 'no-store'
      }).catch(sendBeaconFallback);
    } catch (e) { sendBeaconFallback(); }
  }

  function track(event, data) {
    sendPayload(event, data || {});
  }

  function trackOnce(key, event, data) {
    if (sentOnce[key]) return false;
    sentOnce[key] = true;
    track(event, data || {});
    return true;
  }

  function getCheckoutScrollContainer() {
    try {
      var wrapper = document.getElementById('spa-checkout-wrapper');
      if (wrapper && window.getComputedStyle(wrapper).display !== 'none') return wrapper;
    } catch (e) { }
    return document.scrollingElement || document.documentElement || document.body;
  }

  function getScrollMetrics() {
    var scroller = getCheckoutScrollContainer();
    try {
      return {
        scroll_top: Math.max(0, Math.round(scroller === window ? (window.scrollY || 0) : (scroller.scrollTop || 0))),
        scroll_height: Math.round(scroller.scrollHeight || document.documentElement.scrollHeight || 0),
        client_height: Math.round(scroller.clientHeight || window.innerHeight || 0)
      };
    } catch (e) {
      return { scroll_top: 0, scroll_height: 0, client_height: 0 };
    }
  }

  function getCheckoutState() {
    var root = document.getElementById('checkout-root');
    var submit = root ? root.querySelector('button[type="submit"], [data-testid="checkout-form"] button') : null;
    var firstInput = root ? root.querySelector('input, textarea, select') : null;
    var overflowX = false;
    try {
      overflowX = Math.max(document.documentElement.scrollWidth || 0, document.body.scrollWidth || 0) > (window.innerWidth + 1);
    } catch (e) { }
    return {
      checkout_root_found: !!root,
      submit_button_found: !!submit,
      first_input_found: !!firstInput,
      overflow_x: !!overflowX
    };
  }

  function trackCheckoutOpened(source) {
    trackOnce('checkout_opened', 'checkout_opened', Object.assign({
      checkout_entry_source: window.__checkoutEntrySource === 'lp' ? 'lp' : 'direct',
      checkout_visible_source: source || 'unknown'
    }, getCheckoutState()));
  }

  function trackCheckoutReady(source) {
    trackOnce('checkout_ready', 'checkout_ready', Object.assign({
      checkout_entry_source: window.__checkoutEntrySource === 'lp' ? 'lp' : 'direct',
      checkout_visible_source: source || 'unknown'
    }, getCheckoutState()));
  }

  function trackFieldVisibility(field) {
    if (!field || !field.getBoundingClientRect) return;
    try {
      var rect = field.getBoundingClientRect();
      var vv = window.visualViewport;
      var bottom = vv ? vv.height : window.innerHeight;
      var visible = rect.top >= 0 && rect.bottom <= bottom;
      trackOnce('checkout_field_visibility', 'checkout_field_visibility', {
        field_name: safeString(field.name || field.id || field.getAttribute('autocomplete') || field.tagName, 80),
        field_type: safeString(field.type || field.tagName, 50),
        field_visible: visible,
        focused_field_top: Math.round(rect.top),
        focused_field_bottom: Math.round(rect.bottom)
      });
    } catch (e) { }
  }

  function setupGlobalListeners() {
    window.addEventListener('error', function (event) {
      if (event && event.target && event.target !== window) {
        var resourceUrl = event.target.currentSrc || event.target.src || event.target.href || '';
        var isCheckoutCssPrefetch = false;
        try {
          isCheckoutCssPrefetch = event.target.hasAttribute &&
            event.target.hasAttribute('data-checkout-tailwind-preload') &&
            /\/assets\/css\/checkout\.tailwind\.css/i.test(resourceUrl || '');
        } catch (e) { }
        if (isCheckoutCssPrefetch) return;
        trackOnce('resource_error:' + (resourceUrl || event.target.tagName), 'resource_error', {
          resource_type: safeString(event.target.tagName || 'resource', 40),
          resource_url: safeString(resourceUrl, 420)
        });
        return;
      }
      track('js_error', {
        error_name: safeString(event && event.error && event.error.name || 'Error', 80),
        error_message: safeString(event && event.message || '', 220),
        error_filename: safeString(event && event.filename || '', 260),
        error_lineno: event && event.lineno ? event.lineno : 0,
        error_colno: event && event.colno ? event.colno : 0,
        error_stack: safeString(event && event.error && event.error.stack || '', 700)
      });
    }, true);

    window.addEventListener('unhandledrejection', function (event) {
      var reason = event && event.reason;
      track('js_error', {
        error_name: 'UnhandledRejection',
        error_message: safeString(reason && (reason.message || reason) || '', 220),
        error_stack: safeString(reason && reason.stack || '', 700)
      });
    });

    document.addEventListener('focusin', function (event) {
      var target = event.target;
      if (!target || !target.closest || !target.closest('#checkout-root')) return;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '')) return;
      setTimeout(function () { trackFieldVisibility(target); }, 450);
    }, true);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () {
        var current = window.visualViewport.height || 0;
        var delta = initialViewportHeight - current;
        if (delta > 120) {
          trackOnce('checkout_keyboard_opened', 'checkout_keyboard_opened', {
            keyboard_delta: Math.round(delta)
          });
        }
      }, { passive: true });
    }
  }

  function setupPerformanceObservers() {
    try {
      if (!('PerformanceObserver' in window)) return;

      new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        entries.forEach(function (entry) {
          if (entry && entry.startTime) {
            trackOnce('web_vital_lcp', 'web_vital', {
              metric_name: 'LCP',
              lcp: Math.round(entry.startTime)
            });
          }
        });
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      var cls = 0;
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          if (!entry.hadRecentInput) cls += entry.value || 0;
        });
        if (cls > 0.1) {
          trackOnce('web_vital_cls', 'web_vital', {
            metric_name: 'CLS',
            cls: Number(cls.toFixed(4))
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });

      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          var duration = entry.interactionId ? entry.duration : 0;
          if (duration > 180) {
            trackOnce('web_vital_inp', 'web_vital', {
              metric_name: 'INP',
              inp: Math.round(duration)
            });
          }
        });
      }).observe({ type: 'event', buffered: true, durationThreshold: 104 });

      if (PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.indexOf('resource') !== -1) {
        new PerformanceObserver(function (list) {
          list.getEntries().forEach(trackCriticalResource);
        }).observe({ type: 'resource', buffered: true });
      }
    } catch (e) { }
  }

  function getCriticalAssetName(url) {
    var clean = String(url || '');
    if (/\/assets\/js\/diagnostics\.js/i.test(clean)) return 'diagnostics_js';
    if (/\/assets\/js\/checkout\.app\.js/i.test(clean)) return 'checkout_app_js';
    if (/\/assets\/css\/checkout\.tailwind\.css/i.test(clean)) return 'checkout_tailwind_css';
    if (/\/cdn-cgi\/zaraz\/s\.js/i.test(clean)) return 'zaraz_script';
    if (/\/cdn-cgi\/zaraz\/t/i.test(clean)) return 'zaraz_track';
    return '';
  }

  function getResourceTimingData(entry, assetName) {
    return {
      asset_name: assetName,
      asset_url: safeString(entry && entry.name || '', 420),
      asset_type: safeString(entry && entry.initiatorType || '', 80),
      initiator_type: safeString(entry && entry.initiatorType || '', 80),
      ready_state: safeString(document.readyState || '', 40),
      start_time_ms: entry && entry.startTime ? Math.round(entry.startTime) : 0,
      duration_ms: entry && entry.duration ? Math.round(entry.duration) : 0,
      response_end_ms: entry && entry.responseEnd ? Math.round(entry.responseEnd) : 0,
      transfer_size: entry && entry.transferSize ? Math.round(entry.transferSize) : 0,
      encoded_body_size: entry && entry.encodedBodySize ? Math.round(entry.encodedBodySize) : 0,
      decoded_body_size: entry && entry.decodedBodySize ? Math.round(entry.decodedBodySize) : 0
    };
  }

  function trackCriticalResource(entry) {
    var assetName = getCriticalAssetName(entry && entry.name);
    if (!assetName) return;
    var eventName = assetName === 'diagnostics_js' ? 'diagnostics_script_loaded' : (assetName === 'zaraz_script' ? 'zaraz_loaded' : 'critical_asset_loaded');
    trackOnce('critical_asset:' + assetName, eventName, getResourceTimingData(entry, assetName));
  }

  function scanCriticalResources() {
    try {
      var resources = performance && performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
      resources.forEach(trackCriticalResource);
    } catch (e) { }
  }

  window.__izzatDiagnostics = {
    track: track,
    trackOnce: trackOnce,
    trackCheckoutOpened: trackCheckoutOpened,
    trackCheckoutReady: trackCheckoutReady,
    getScrollMetrics: getScrollMetrics,
    getCheckoutState: getCheckoutState,
    sessionId: sessionId
  };

  setupGlobalListeners();
  setupPerformanceObservers();
  scanCriticalResources();
  setTimeout(scanCriticalResources, 1500);
  setTimeout(scanCriticalResources, 5000);

  trackOnce('critical_asset:diagnostics_js', 'diagnostics_script_loaded', {
    asset_name: 'diagnostics_js',
    asset_type: 'script',
    ready_state: document.readyState || ''
  });
  trackOnce('diagnostics_session_started', 'diagnostics_session_started', {});

  if (document.readyState === 'complete') {
    trackOnce('page_loaded', 'page_loaded', {});
  } else {
    window.addEventListener('load', function () {
      trackOnce('page_loaded', 'page_loaded', {});
    }, { once: true });
  }
})();
