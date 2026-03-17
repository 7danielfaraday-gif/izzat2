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

    // ── Checkout load health ──────────────────────────────────
    load_health: {
      status: 'loading',  // 'ok' | 'timeout' | 'error'
      ready_ms: null,     // ms from T0 until skeleton hid and checkout was interactive
      error: null,        // error message if something went wrong
    },

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

  /* ─── LOAD HEALTH WATCHDOG ───────────────────────────────── */
  // Se checkoutReady() não for chamado em 25s → timeout
  // 25s cobre o pior caso: Android TikTok + rede 3G + React via CDN de emergência (unpkg.com)
  // Manter em sincronia com o timeout de watchSkeletonHide abaixo.
  var loadWatchdog = setTimeout(function() {
    if (state.load_health.status === 'loading') {
      state.load_health.status = 'timeout';
      state.load_health.error  = 'skeleton_not_hidden_after_25s';
      logTime('load_timeout', { ms: now() });
      flush(false);
    }
  }, 25000);

  // Also catch JS errors that happen during checkout init
  window.addEventListener('error', function(e) {
    if (state.load_health.status === 'loading') {
      state.load_health.status = 'error';
      state.load_health.error  = String(e.message || 'unknown_error').slice(0, 100);
      logTime('load_error');
      flush(false);
    }
  }, { passive: true, once: true });

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

  /* ─── CHECKOUT LOAD DETECTION ───────────────────────────── */
  // Watches for the skeleton element to be hidden (= JS ran + checkout is visible)
  // Also sets a timeout: if skeleton hasn't hidden in 6s → checkout_load_failed
  var loadDetected = false;

  function onCheckoutLoaded() {
    if (loadDetected) return;
    loadDetected = true;
    state.checkout_loaded = true;
    state.checkout_load_ms = now();
    logTime('checkout_loaded', { load_ms: state.checkout_load_ms });
    flush(false);
  }

  function watchSkeletonHide() {
    // Suporta dois IDs: 'skeleton' (projeto zero) e 'skeleton-loader' (projeto bom)
    var skeleton = document.getElementById('skeleton') || document.getElementById('skeleton-loader');
    if (!skeleton) { onCheckoutLoaded(); return; } // no skeleton = already loaded

    if (skeleton.classList.contains('hide') || skeleton.style.display === 'none' || skeleton.style.opacity === '0') {
      onCheckoutLoaded();
      return;
    }

    if (window.MutationObserver) {
      var obs = new MutationObserver(function(muts) {
        for (var m of muts) {
          if (m.type === 'attributes') {
            var el = m.target;
            if (el.classList.contains('hide') || el.style.display === 'none' || el.style.opacity === '0') {
              onCheckoutLoaded();
              obs.disconnect();
            }
          }
        }
      });
      obs.observe(skeleton, { attributes: true, attributeFilter: ['class','style'] });
    }

    // Fallback timeout: if not loaded in 25s → failure
    // Aumentado de 8s para 25s: Android TikTok WebView pode levar 12-18s
    // para carregar React via CDN de emergência (unpkg.com) em rede ruim.
    // O painel lê este evento para exibir "Falha carregamento" — disparar cedo
    // demais marca sessões válidas como falha, distorcendo a métrica.
    setTimeout(function() {
      if (!loadDetected) {
        state.checkout_loaded = false;
        state.checkout_load_ms = null;
        logTime('checkout_load_failed', { timeout_ms: 25000 });
        flush(false);
      }
    }, 25000);
  }

  // Run immediately (skeleton may already be hidden if tracker loads late)
  watchSkeletonHide();

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

  // Mapa: ID do projeto zero → name do projeto bom
  var FIELD_NAME_MAP = {
    'inp-nome': 'name', 'inp-email': 'email', 'inp-tel': 'phone',
    'inp-cpf': 'cpf', 'inp-cep': 'cep', 'inp-rua': 'address',
    'inp-bairro': 'neighborhood', 'inp-num': 'number',
    'inp-comp': 'complement', 'inp-cidade': 'city', 'inp-estado': 'state'
  };

  function findField(id) {
    // Tenta por ID primeiro (projeto zero), depois por name (projeto bom)
    var el = document.getElementById(id);
    if (el) return el;
    var nameAttr = FIELD_NAME_MAP[id];
    if (nameAttr) return document.querySelector('[name="' + nameAttr + '"]');
    return null;
  }

  function attachFieldListeners() {
    FIELD_IDS.forEach(function(id) {
      var el = findField(id);
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
    // Usa event delegation no document — funciona mesmo com React e múltiplos botões
    // Detecta clique em qualquer botão que pareça ser o de finalizar
    document.addEventListener('click', function(e) {
      var el = e.target;
      // Sobe até 3 níveis (caso clique em SVG ou span dentro do botão)
      for (var i = 0; i < 3; i++) {
        if (!el || el === document) break;
        var tag = el.tagName;
        var txt = (el.textContent || '').toLowerCase();
        var cls = (el.className || '').toLowerCase();
        var isBtn = tag === 'BUTTON' || el.getAttribute('role') === 'button';
        var isSubmitType = el.getAttribute('type') === 'submit';
        var isHidden = el.style && el.style.display === 'none';
        var looksLikeSubmit =
          isBtn && !isHidden && (
            isSubmitType ||
            txt.indexOf('finalizar') > -1 ||
            txt.indexOf('comprar') > -1 ||
            txt.indexOf('pagar') > -1 ||
            cls.indexOf('btn-ck') > -1
          );
        if (looksLikeSubmit) {
          touchInteraction();
          state.submit_attempts++;
          state.funnel.submit_click = now();
          if (state.max_step_reached < 3) state.max_step_reached = 3;
          logTime('submit_click', { attempt: state.submit_attempts });
          flush(false);
          break;
        }
        el = el.parentElement;
      }
    }, { passive: true });
  }

  /* ─── CEP LOOKUP COUNTER ─────────────────────────────────── */
  function watchCep() {
    var cep = document.getElementById('inp-cep') || document.querySelector('[name="cep"]');
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
  // Se o checkout já chamou checkoutReady() antes do analytics carregar,
  // o timestamp fica em window.__ckReadyAt — consumimos aqui imediatamente.
  (function checkEarlyEvents() {
    // checkoutReady chamado antes do tracker carregar
    if (window.__ckReadyAt) {
      state.load_health.ready_ms = Math.max(0, now());
      state.load_health.status   = 'ok';
      clearTimeout(loadWatchdog);
      logTime('checkout_ready_early', { ms: state.load_health.ready_ms });
    }
    // pixShown chamado antes do tracker carregar
    if (window.__ckPixShownAt) {
      state.funnel.pix_shown = Math.max(0, now());
      if (state.max_step_reached < 4) state.max_step_reached = 4;
      logTime('pix_shown_early');
    }
    // pixCopied chamado antes do tracker carregar
    if (window.__ckPixCopiedAt) {
      state.funnel.pix_copy_click = Math.max(0, now());
      logTime('pix_copied_early');
    }
    // submit clicado antes do tracker carregar
    if (window.__ckSubmitAt && !state.funnel.submit_click) {
      state.funnel.submit_click = Math.max(0, now());
      state.submit_attempts = Math.max(state.submit_attempts, 1);
      if (state.max_step_reached < 3) state.max_step_reached = 3;
      logTime('submit_click_early');
    }
    if (window.__ckReadyAt || window.__ckPixShownAt || window.__ckPixCopiedAt || window.__ckSubmitAt) {
      flush(false);
    }
  })();

  // Expose hooks for the checkout script to call
  window.__ckTrack = {
    checkoutReady: function() {
      var ms = now();
      state.load_health.ready_ms = ms;
      state.load_health.status   = 'ok';
      clearTimeout(loadWatchdog);
      logTime('checkout_ready', { ms: ms });
      flush(false);
    },
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
    // Projeto bom usa React — inputs só existem no DOM após render (~300-600ms)
    // Tentamos imediatamente e retentamos até encontrar os campos ou atingir 10s
    function tryAttach(attempt) {
      var hasFields = !!(
        document.querySelector('[name="name"]') ||
        document.getElementById('inp-nome')
      );
      if (hasFields) {
        attachFieldListeners();
        watchErrors();
        watchSubmit();
        watchCep();
        logTime('tracker_init', { attempt: attempt });
      } else if (attempt < 20) {
        setTimeout(function() { tryAttach(attempt + 1); }, 500);
      }
    }
    tryAttach(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  logTime('script_loaded');

})();
