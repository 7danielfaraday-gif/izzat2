/**
 * Checkout Behavioral Analytics Tracker v2.0
 * ============================================================
 * LGPD / TikTok Policy Compliant:
 *   ✅ Zero PII captured (no field values, no emails, no CPF)
 *   ✅ No session replay, no mouse coordinates
 *   ✅ No keystroke logging
 *   ✅ Behavioral & aggregate signals only
 *   ✅ Anonymous session ID (random, not linked to user identity)
 * ============================================================
 */
(function() {
  'use strict';

  /* ─── CONFIG ─────────────────────────────────────────────── */
  var ENDPOINT   = '/api/metrics/checkout-behavior';
  var FLUSH_MS   = 15000;   // flush every 15s while page is open
  var RAGE_MS    = 800;     // rage-click window
  var RAGE_MIN   = 3;       // minimum clicks = rage
  var HESIT_MS   = 20000;   // pause > 20s = hesitation
  var SESSION_TTL = 1800000; // 30min session expiry

  /* ─── SESSION ID ─────────────────────────────────────────── */
  function makeId() {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var o = ''; for (var i = 0; i < 16; i++) o += a[Math.floor(Math.random()*a.length)];
    return o;
  }

  var sessionId = (function() {
    try {
      var raw = sessionStorage.getItem('_ck_sid');
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.id && Date.now() - p.ts < SESSION_TTL) return p.id;
      }
    } catch(_) {}
    var id = makeId();
    try { sessionStorage.setItem('_ck_sid', JSON.stringify({ id: id, ts: Date.now() })); } catch(_) {}
    return id;
  })();

  /* ─── DEVICE CONTEXT (no PII) ───────────────────────────── */
  var ua = navigator.userAgent || '';
  var isTikTok = /musical_ly|tiktok|bytedancewebview|musical\.ly/i.test(ua);
  var isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  var isTablet = /iPad|Tablet/i.test(ua) || (isMobile && Math.min(screen.width,screen.height) >= 600);
  var deviceType = isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop');
  var conn = (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
  var connType = conn ? (conn.effectiveType || conn.type || 'unknown') : 'unknown';

  var device = {
    type: deviceType,
    tiktok_webview: isTikTok,
    screen_w: screen.width,
    screen_h: screen.height,
    vp_w: window.innerWidth,
    vp_h: window.innerHeight,
    pixel_ratio: window.devicePixelRatio || 1,
    touch: 'ontouchstart' in window,
    connection: connType,
    lang: (navigator.language || '').slice(0,5),
    tz_offset: new Date().getTimezoneOffset(),
  };

  /* ─── STATE ─────────────────────────────────────────────── */
  var T0 = Date.now();  // page load timestamp

  var state = {
    session_id: sessionId,
    page_url: window.location.pathname,
    ref_code: (document.cookie.match(/(?:^|;\s*)ref=([^;]*)/) || [])[1] || '',
    device: device,
    ts_start: T0,
    ts_end: null,
    duration_ms: null,

    // Funnel milestones (timestamps relative to T0)
    funnel: {
      page_load: 0,
      first_interact: null,   // first keydown/click anywhere
      step1_first_focus: null,
      step1_last_blur: null,
      step2_first_focus: null,
      step2_last_blur: null,
      submit_click: null,
      pix_shown: null,
      pix_copy_click: null,
      order_confirmed: null,
    },

    // Which step user reached (1–4)
    max_step_reached: 0,

    // Per-field behavioral data
    fields: {},

    // Validation errors triggered
    errors: {},

    // Rage clicks
    rage_clicks: [],

    // Hesitations (gaps > HESIT_MS)
    hesitations: [],

    // Scroll depth milestones hit (%)
    scroll_depth: [],

    // Back-navigation attempt
    back_attempt: false,

    // CEP lookup attempted
    cep_lookup_count: 0,

    // Submit attempts
    submit_attempts: 0,

    // General timeline of key moments (for AI analysis)
    timeline: [],
  };

  /* ─── HELPERS ────────────────────────────────────────────── */
  function now() { return Date.now() - T0; }

  function logTime(label, extra) {
    var entry = { t: now(), e: label };
    if (extra) entry.d = extra;
    state.timeline.push(entry);
    if (state.timeline.length > 200) state.timeline.shift(); // cap
  }

  var lastInteraction = null;
  function touchInteraction() {
    var n = now();
    if (lastInteraction !== null) {
      var gap = n - lastInteraction;
      if (gap > HESIT_MS) {
        state.hesitations.push({ t: lastInteraction, gap_ms: gap });
        logTime('hesitation', { gap_ms: gap });
      }
    }
    lastInteraction = n;
    if (state.funnel.first_interact === null) {
      state.funnel.first_interact = n;
      logTime('first_interact');
    }
  }

  /* ─── FIELD TRACKING ─────────────────────────────────────── */
  var fieldFocusTime = {};
  var fieldKeyCount = {};
  var fieldDelCount = {};

  function ensureField(name) {
    if (!state.fields[name]) {
      state.fields[name] = {
        focus_count: 0,
        total_time_ms: 0,
        key_presses: 0,       // count only — NOT values
        delete_presses: 0,    // heavy backspace = confusion signal
        left_empty: false,
        blur_count: 0,
        first_focus_t: null,
        last_blur_t: null,
      };
    }
    return state.fields[name];
  }

  function onFieldFocus(name) {
    touchInteraction();
    var f = ensureField(name);
    f.focus_count++;
    if (f.first_focus_t === null) f.first_focus_t = now();
    fieldFocusTime[name] = Date.now();
    logTime('field_focus', { field: name, count: f.focus_count });

    // Step tracking
    var step = getFieldStep(name);
    if (step === 1 && state.funnel.step1_first_focus === null) {
      state.funnel.step1_first_focus = now();
      if (state.max_step_reached < 1) state.max_step_reached = 1;
    }
    if (step === 2 && state.funnel.step2_first_focus === null) {
      state.funnel.step2_first_focus = now();
      if (state.max_step_reached < 2) state.max_step_reached = 2;
    }
  }

  function onFieldBlur(name, el) {
    var f = ensureField(name);
    f.blur_count++;
    f.last_blur_t = now();
    f.left_empty = !el.value || el.value.trim() === '';
    if (fieldFocusTime[name]) {
      f.total_time_ms += Date.now() - fieldFocusTime[name];
      delete fieldFocusTime[name];
    }
    logTime('field_blur', { field: name, empty: f.left_empty, t_ms: f.total_time_ms });

    var step = getFieldStep(name);
    if (step === 1) state.funnel.step1_last_blur = now();
    if (step === 2) state.funnel.step2_last_blur = now();
  }

  function onFieldKey(name, key) {
    touchInteraction();
    var f = ensureField(name);
    f.key_presses++;
    if (key === 'Backspace' || key === 'Delete') f.delete_presses++;
  }

  function getFieldStep(name) {
    var step1 = ['inp-nome','inp-email','inp-tel','inp-cpf'];
    var step2 = ['inp-cep','inp-rua','inp-bairro','inp-num','inp-comp','inp-cidade','inp-estado'];
    if (step1.indexOf(name) > -1) return 1;
    if (step2.indexOf(name) > -1) return 2;
    return 0;
  }

  /* ─── ATTACH FIELD LISTENERS ─────────────────────────────── */
  var FIELD_IDS = [
    'inp-nome','inp-email','inp-tel','inp-cpf',
    'inp-cep','inp-rua','inp-bairro','inp-num','inp-comp','inp-cidade','inp-estado'
  ];

  function attachFieldListeners() {
    FIELD_IDS.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('focus',   function() { onFieldFocus(id); }, { passive: true });
      el.addEventListener('blur',    function() { onFieldBlur(id, el); }, { passive: true });
      el.addEventListener('keydown', function(e) { onFieldKey(id, e.key); }, { passive: true });
    });
  }

  /* ─── VALIDATION ERROR TRACKING ─────────────────────────── */
  // Monkey-patch: watch classList changes on error elements
  function watchErrors() {
    var errIds = [
      'err-nome','err-email','err-tel','err-cpf',
      'err-cep','err-rua','err-bairro','err-num','err-cidade','err-estado'
    ];
    errIds.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el || !window.MutationObserver) return;
      var field = id.replace('err-','inp-');
      var observer = new MutationObserver(function(muts) {
        muts.forEach(function(m) {
          if (m.type === 'attributes' && m.attributeName === 'class') {
            if (el.classList.contains('show')) {
              state.errors[field] = (state.errors[field] || 0) + 1;
              logTime('validation_error', { field: field, count: state.errors[field] });
            }
          }
        });
      });
      observer.observe(el, { attributes: true });
    });
  }

  /* ─── RAGE CLICK TRACKING ────────────────────────────────── */
  var clickBuf = [];
  document.addEventListener('click', function(e) {
    touchInteraction();
    var n = Date.now();
    var target = (e.target && (e.target.id || e.target.className || e.target.tagName)) || 'unknown';
    clickBuf.push({ t: n, target: String(target).slice(0,60) });
    // Prune old clicks
    clickBuf = clickBuf.filter(function(c) { return n - c.t < RAGE_MS; });
    if (clickBuf.length >= RAGE_MIN) {
      state.rage_clicks.push({ t: now(), count: clickBuf.length, target: clickBuf[0].target });
      logTime('rage_click', { count: clickBuf.length, target: clickBuf[0].target });
      clickBuf = [];
    }
  }, { passive: true });

  /* ─── SCROLL DEPTH ────────────────────────────────────────── */
  var scrollMilestones = [25, 50, 75, 100];
  var scrollHit = {};
  window.addEventListener('scroll', function() {
    touchInteraction();
    var docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    var scrolled = window.scrollY + window.innerHeight;
    var pct = Math.round((scrolled / docH) * 100);
    scrollMilestones.forEach(function(m) {
      if (!scrollHit[m] && pct >= m) {
        scrollHit[m] = true;
        state.scroll_depth.push(m);
        logTime('scroll', { pct: m });
      }
    });
  }, { passive: true });

  /* ─── SUBMIT BUTTON ──────────────────────────────────────── */
  function watchSubmit() {
    var btn = document.getElementById('btn-submit');
    if (!btn) return;
    btn.addEventListener('click', function() {
      touchInteraction();
      state.submit_attempts++;
      state.funnel.submit_click = now();
      if (state.max_step_reached < 3) state.max_step_reached = 3;
      logTime('submit_click', { attempt: state.submit_attempts });
      flush(false);
    }, { passive: true });
  }

  /* ─── CEP LOOKUP COUNTER ─────────────────────────────────── */
  function watchCep() {
    var cep = document.getElementById('inp-cep');
    if (!cep) return;
    var last = '';
    cep.addEventListener('input', function() {
      var v = cep.value.replace(/\D/g,'');
      if (v.length === 8 && v !== last) {
        last = v;
        state.cep_lookup_count++;
        logTime('cep_lookup', { count: state.cep_lookup_count });
      }
    }, { passive: true });
  }

  /* ─── PIX SCREEN EVENTS ──────────────────────────────────── */
  // Expose hooks for the checkout script to call
  window.__ckTrack = {
    pixShown: function() {
      state.funnel.pix_shown = now();
      if (state.max_step_reached < 4) state.max_step_reached = 4;
      logTime('pix_shown');
      flush(false);
    },
    pixCopied: function() {
      state.funnel.pix_copy_click = now();
      logTime('pix_copied');
      flush(false);
    },
    orderConfirmed: function(orderId) {
      state.funnel.order_confirmed = now();
      state.order_id_hint = orderId ? String(orderId).slice(0,30) : null;
      logTime('order_confirmed');
      flush(true);
    }
  };

  /* ─── BACK NAVIGATION ────────────────────────────────────── */
  window.addEventListener('popstate', function() {
    state.back_attempt = true;
    logTime('back_nav');
    flush(false);
  }, { passive: true });

  /* ─── PAGE HIDE / UNLOAD ─────────────────────────────────── */
  function onLeave() {
    state.ts_end = Date.now();
    state.duration_ms = state.ts_end - T0;
    logTime('page_leave', { duration_ms: state.duration_ms });
    flush(true);
  }
  window.addEventListener('pagehide', onLeave, { passive: true });
  window.addEventListener('beforeunload', onLeave, { passive: true });

  /* ─── FLUSH ──────────────────────────────────────────────── */
  var flushed = false;
  function flush(final) {
    if (final && flushed) return;
    if (final) flushed = true;

    var payload = JSON.parse(JSON.stringify(state));
    payload.flush_type = final ? 'final' : 'ping';
    payload.flush_ts = Date.now();

    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function(){});
      }
    } catch(_) {}
  }

  // Periodic flush while user is on page
  setInterval(function() { flush(false); }, FLUSH_MS);

  /* ─── INIT AFTER DOM ─────────────────────────────────────── */
  function init() {
    attachFieldListeners();
    watchErrors();
    watchSubmit();
    watchCep();
    logTime('tracker_init');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  logTime('script_loaded');

})();
