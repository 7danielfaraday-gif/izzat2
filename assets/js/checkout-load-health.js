/**
 * checkout-load-health.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Envia o status real de carregamento do checkout para o painel admin.
 *
 * COMO FUNCIONA:
 *  1. Gera (ou reutiliza) um session_id e persiste em sessionStorage.
 *     → O checkout-analytics.js DEVE ler este ID com:
 *         sessionStorage.getItem('chk_sess_id')
 *       para que ambos os scripts usem a mesma sessão no KV.
 *
 *  2. Escuta o evento 'checkout:load_health' disparado pelo script inline
 *     que foi adicionado ao <head> do checkout.html.
 *
 *  3. Quando o evento chega (status ok / timeout / error), faz um POST
 *     para /api/metrics/checkout-behavior com o load_health preenchido.
 *
 *  4. Também faz um flush de fallback 8 s após o DOMContentLoaded, caso
 *     o evento nunca venha (ex: em versões antigas de browsers).
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ── Constantes ── */
  var SESS_KEY     = 'chk_sess_id';    // chave compartilhada com checkout-analytics.js
  var SESS_TS_KEY  = 'chk_sess_ts';    // ts_start da sessão
  var ENDPOINT     = '/api/metrics/checkout-behavior';
  var FLUSH_TYPE   = 'ping';           // flush de confirmação de carregamento
  var FALLBACK_MS  = 8000;             // envia fallback após 8 s se evento não chegar

  /* ── Gera ou recupera o session_id ── */
  function getOrCreateSessionId() {
    try {
      var existing = sessionStorage.getItem(SESS_KEY);
      if (existing && existing.length >= 8) return existing;

      // Gera novo ID: 'chk' + timestamp36 + random
      var id = 'chk' +
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 9);

      sessionStorage.setItem(SESS_KEY, id);
      sessionStorage.setItem(SESS_TS_KEY, String(Date.now()));
      return id;
    } catch (_) {
      // sessionStorage bloqueado (modo privado restritivo)
      return 'chk' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    }
  }

  function getSessionStart() {
    try {
      var ts = sessionStorage.getItem(SESS_TS_KEY);
      return ts ? parseInt(ts, 10) : Date.now();
    } catch (_) {
      return Date.now();
    }
  }

  /* ── Monta o payload mínimo exigido pelo checkout-behavior.js ── */
  function buildPayload(loadHealth) {
    var sessId   = getOrCreateSessionId();
    var tsStart  = getSessionStart();
    var pageUrl  = (location.pathname || '/checkout').replace(/[^a-zA-Z0-9\/\-_]/g, '').slice(0, 120);

    // ref_code a partir de query string (?ref=... ou ?utm_content=...)
    var ref = '';
    try {
      var params = new URLSearchParams(location.search);
      ref = (params.get('ref') || params.get('utm_content') || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40);
    } catch (_) {}

    // Device mínimo
    var device = {
      type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile'
          : /Tablet|iPad/i.test(navigator.userAgent) ? 'tablet'
          : 'desktop',
      tiktok_webview: /musical_ly|tiktok/i.test(navigator.userAgent),
      screen_w:  screen.width  || 0,
      screen_h:  screen.height || 0,
      vp_w:      window.innerWidth  || 0,
      vp_h:      window.innerHeight || 0,
      pixel_ratio: window.devicePixelRatio || 1,
      touch:     'ontouchstart' in window,
      connection: (navigator.connection && navigator.connection.effectiveType) || 'unknown',
      lang:      (navigator.language || '').replace(/[^a-z\-]/gi, '').slice(0, 10),
      tz_offset: new Date().getTimezoneOffset(),
    };

    return {
      session_id:       sessId,
      page_url:         pageUrl,
      ref_code:         ref,
      device:           device,
      ts_start:         tsStart,
      ts_end:           Date.now(),
      duration_ms:      Date.now() - tsStart,
      funnel:           { page_load: 0 },   // registra pelo menos page_load
      max_step_reached: 0,
      fields:           {},
      errors:           {},
      rage_clicks:      [],
      hesitations:      [],
      scroll_depth:     [],
      back_attempt:     false,
      cep_lookup_count: 0,
      submit_attempts:  0,
      order_id_hint:    null,
      flush_type:       FLUSH_TYPE,
      flush_ts:         Date.now(),
      timeline:         [],
      load_health:      {
        status:   loadHealth.status   || 'unknown',
        ready_ms: loadHealth.ready_ms != null ? loadHealth.ready_ms : null,
        error:    loadHealth.error    || null,
      },
    };
  }

  /* ── Envia o payload (fire-and-forget com retry único) ── */
  var _sent = false;

  function sendLoadHealth(loadHealth) {
    if (_sent) return;   // garante envio único por carregamento de página
    _sent = true;

    var payload = buildPayload(loadHealth);

    // Usa sendBeacon se disponível (mais confiável em mobile/background)
    var body = JSON.stringify(payload);
    var sent = false;

    if (navigator.sendBeacon) {
      try {
        sent = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      } catch (_) {}
    }

    // Fallback: fetch normal
    if (!sent && typeof fetch !== 'undefined') {
      fetch(ENDPOINT, {
        method:      'POST',
        headers:     { 'content-type': 'application/json' },
        body:        body,
        keepalive:   true,
      }).catch(function () {
        // Silencia erros de rede — não afeta o usuário
      });
    }
  }

  /* ── Inicialização ── */
  // Garante que o session_id existe o quanto antes
  getOrCreateSessionId();

  // 1) Escuta o evento disparado pelo script inline do <head>
  document.addEventListener('checkout:load_health', function (e) {
    var lh = (e && e.detail) ? e.detail : (window.__checkoutLoadHealth || { status: 'unknown' });
    sendLoadHealth(lh);
  }, { once: true });

  // 2) Fallback: se após FALLBACK_MS o evento nunca chegou,
  //    envia o que estiver em window.__checkoutLoadHealth (pode ser 'loading', 'ok', etc.)
  setTimeout(function () {
    if (!_sent) {
      var lh = window.__checkoutLoadHealth || { status: 'unknown', ready_ms: null, error: null };
      // Se ainda estiver 'loading' neste ponto, promove para 'timeout'
      if (lh.status === 'loading') {
        lh = { status: 'timeout', ready_ms: null, error: 'fallback_timeout_8s' };
      }
      sendLoadHealth(lh);
    }
  }, FALLBACK_MS);

})();
