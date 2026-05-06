(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.IzzatDiagnosticsAnalyzer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var EVENT_LABELS = {
    client_boot_started: 'Boot inline iniciado',
    diagnostics_script_loaded: 'Script diagnostico carregado',
    critical_asset_loaded: 'Asset critico carregado',
    critical_asset_missing: 'Asset critico falhou',
    zaraz_loaded: 'Zaraz carregado',
    diagnostics_session_started: 'Sessao iniciada',
    page_loaded: 'Pagina carregada',
    checkout_opened: 'Checkout aberto',
    checkout_app_loaded: 'App do checkout carregado',
    checkout_ready: 'Checkout pronto',
    checkout_first_interaction: 'Primeira interacao',
    checkout_first_scroll: 'Primeiro scroll',
    checkout_first_field_focus: 'Primeiro toque no campo',
    checkout_keyboard_opened: 'Teclado aberto',
    checkout_field_visibility: 'Campo visivel no foco',
    checkout_pix_screen_loaded: 'Tela PIX carregada',
    checkout_pix_copy_attempt: 'Tentativa de copiar PIX',
    server_page_hit: 'Entrada server-side',
    server_asset_hit: 'Asset pedido no servidor',
    api_error: 'Erro de API',
    js_error: 'Erro de JavaScript',
    resource_error: 'Erro de recurso',
    slow_render: 'Renderizacao lenta',
    web_vital: 'Web Vital',
    ga_event_seen: 'Evento GA visto',
  };

  var STATUS = {
    critical: {
      label: 'Critico',
      severity: 'critical',
      hint: 'Erro de JS, API ou asset essencial sem recuperacao.',
    },
    warning: {
      label: 'Alerta',
      severity: 'warning',
      hint: 'Sessao carregou, mas registrou sinal tecnico que merece observacao.',
    },
    ok: {
      label: 'OK',
      severity: 'ok',
      hint: 'JS executou e carregamento principal foi confirmado.',
    },
    crawler: {
      label: 'Crawler/preview',
      severity: 'noise',
      hint: 'Sessao automatizada ou renderizador externo; nao tratar como visita humana.',
    },
    html_only: {
      label: 'HTML only',
      severity: 'noise',
      hint: 'Cloudflare entregou HTML, mas nao houve sinal de JS/asset executado.',
    },
    asset_no_js: {
      label: 'Assets sem JS',
      severity: 'warning',
      hint: 'Assets foram pedidos, mas a pagina nao confirmou execucao do diagnostico.',
    },
    interrupted: {
      label: 'Interrompida cedo',
      severity: 'warning',
      hint: 'O inline rodou, mas a sessao nao confirmou carregamento completo.',
    },
    unknown: {
      label: 'Indefinida',
      severity: 'unknown',
      hint: 'Sinais insuficientes para uma classificacao confiavel.',
    },
  };

  function eventTimeMs(iso) {
    var t = Date.parse(iso || '');
    return Number.isFinite(t) ? t : 0;
  }

  function getSessionId(ev) {
    return ev && ev.context && ev.context.session_id ? String(ev.context.session_id) : 'sem_sessao';
  }

  function lower(value) {
    return String(value || '').toLowerCase();
  }

  function getUserAgent(ev) {
    return (ev && ev.context && ev.context.user_agent) || '';
  }

  function isCrawlerUserAgent(ua) {
    var text = lower(ua);
    return /bot|crawler|spider|externalhit|meta-externalagent|facebookexternalhit|preview|google-read-aloud|read aloud|googlebot|adsbot|lighthouse|pagespeed/.test(text);
  }

  function getBotScore(ev) {
    var bot = ev && ev.edge && ev.edge.bot_management ? ev.edge.bot_management : null;
    return bot && bot.score !== undefined && bot.score !== null && bot.score !== '' ? bot.score : '';
  }

  function getAssetName(ev) {
    return String((ev && ev.data && ev.data.asset_name) || '');
  }

  function getResourceUrl(ev) {
    var data = (ev && ev.data) || {};
    return String(data.resource_url || data.asset_url || '');
  }

  function eventKey(ev) {
    return getSessionId(ev) + '|' + String(ev && ev.event) + '|' + String(ev && ev.created_at) + '|' + getResourceUrl(ev);
  }

  function uniqueEvents(events) {
    var seen = {};
    var out = [];
    (Array.isArray(events) ? events : []).forEach(function (ev) {
      if (!ev || typeof ev !== 'object') return;
      var key = eventKey(ev);
      if (seen[key]) return;
      seen[key] = true;
      out.push(ev);
    });
    return out;
  }

  function getMetricStatus(ev) {
    var data = (ev && ev.data) || {};
    var name = String(data.metric_name || '').toUpperCase();
    var value = Number(data.lcp || data.inp || data.cls);
    if (!Number.isFinite(value)) return null;

    if (name === 'LCP') {
      if (value > 4000) return { severity: 'warning', reason: 'LCP ruim: ' + value + 'ms' };
      if (value > 2500) return { severity: 'warning', reason: 'LCP precisa melhorar: ' + value + 'ms' };
      return { severity: 'ok', reason: 'LCP bom: ' + value + 'ms' };
    }
    if (name === 'INP') {
      if (value > 500) return { severity: 'warning', reason: 'INP ruim: ' + value + 'ms' };
      if (value > 200) return { severity: 'warning', reason: 'INP precisa melhorar: ' + value + 'ms' };
      return { severity: 'ok', reason: 'INP bom: ' + value + 'ms' };
    }
    if (name === 'CLS') {
      if (value > 0.25) return { severity: 'warning', reason: 'CLS ruim: ' + value };
      if (value > 0.1) return { severity: 'warning', reason: 'CLS precisa melhorar: ' + value };
      return { severity: 'ok', reason: 'CLS bom: ' + value };
    }
    return null;
  }

  function annotateEvents(session) {
    var loadedAssets = {};
    (session.events || []).forEach(function (ev) {
      if (ev.event === 'critical_asset_loaded') loadedAssets[getAssetName(ev)] = true;
      if (ev.event === 'server_asset_hit' && ev.data && ev.data.asset_status === 'requested') {
        loadedAssets[getAssetName(ev)] = true;
      }
    });

    return (session.events || []).map(function (ev) {
      var data = ev.data || {};
      var assetName = getAssetName(ev);
      var resourceUrl = getResourceUrl(ev);
      var resourceType = String(data.resource_type || data.asset_type || '').toUpperCase();
      var note = '';
      var severity = 'info';

      if (ev.event === 'js_error') {
        severity = 'critical';
        note = data.error_message === 'Script error.' && !data.error_filename
          ? 'Erro de script terceiro/cross-origin ocultado pelo navegador.'
          : 'Erro de JavaScript executado no navegador.';
      } else if (ev.event === 'api_error') {
        severity = 'critical';
        note = 'Erro de API registrado pelo checkout/site.';
      } else if (ev.event === 'critical_asset_missing') {
        var recovered = !!loadedAssets[assetName] || (assetName === 'checkout_tailwind_css' && session.has_page_loaded);
      if (recovered) {
          severity = 'info';
          note = 'Asset sinalizou falha/preload, mas a sessao recuperou depois.';
        } else if (assetName === 'diagnostics_js' || assetName === 'checkout_app_js') {
          severity = 'critical';
          note = 'Script essencial nao confirmou carregamento.';
        } else {
          severity = 'warning';
          note = 'Asset nao confirmou recuperacao nesta amostra.';
        }
      } else if (ev.event === 'resource_error') {
        if (/analytics\.tiktok\.com/i.test(resourceUrl)) {
          severity = 'warning';
          note = 'Script externo do TikTok falhou nesta sessao; pode afetar tracking, nao o layout.';
        } else if (session.is_crawler && (resourceType === 'IMG' || /\.(webp|png|jpe?g|svg)(\?|$)/i.test(resourceUrl))) {
          severity = 'noise';
          note = 'Erro de imagem em crawler/renderizador; validar URL antes de tratar como quebra real.';
        } else if (/google|doubleclick|facebook|connect\.facebook|hotjar|clarity|analytics/i.test(resourceUrl)) {
          severity = 'warning';
          note = 'Recurso terceiro falhou; observar repeticao antes de agir.';
        } else {
          severity = 'warning';
          note = 'Recurso do navegador falhou nesta sessao.';
        }
      } else if (ev.event === 'web_vital') {
        var metric = getMetricStatus(ev);
        if (metric) {
          severity = metric.severity;
          note = metric.reason;
        }
      } else if (ev.event === 'server_page_hit' && !session.has_browser_event) {
        severity = 'noise';
        note = 'Apenas HTML entregue; pode ser preload, preview, crawler ou abandono antes do JS.';
      }

      return {
        event: ev,
        severity: severity,
        note: note,
      };
    });
  }

  function buildSessions(events) {
    var map = {};
    uniqueEvents(events).forEach(function (ev) {
      var sid = getSessionId(ev);
      var ctx = ev.context || {};
      var t = eventTimeMs(ev.created_at);
      if (!map[sid]) {
        map[sid] = {
          id: sid,
          events: [],
          count: 0,
          first_at: ev.created_at || '',
          last_at: ev.created_at || '',
          first_ms: t,
          last_ms: t,
          ctx: ctx,
          bot_score: '',
          has_server: false,
          has_server_asset: false,
          has_server_js: false,
          has_server_css: false,
          has_client_boot: false,
          has_diag_script: false,
          has_css: false,
          has_checkout_script: false,
          has_zaraz: false,
          has_page_loaded: false,
          has_checkout: false,
          has_ready: false,
          has_field: false,
          has_pix: false,
          has_error: false,
          has_browser_event: false,
          is_crawler: false,
        };
      }

      var s = map[sid];
      s.events.push(ev);
      s.count += 1;

      var botScore = getBotScore(ev);
      if (botScore !== '' && s.bot_score === '') s.bot_score = botScore;
      if (t && (!s.first_ms || t < s.first_ms)) {
        s.first_ms = t;
        s.first_at = ev.created_at || '';
      }
      if (t && (!s.last_ms || t > s.last_ms)) {
        s.last_ms = t;
        s.last_at = ev.created_at || '';
        s.ctx = ctx;
      }

      var ua = getUserAgent(ev);
      if (isCrawlerUserAgent(ua)) s.is_crawler = true;
      if (ev.event === 'server_page_hit') s.has_server = true;
      if (ev.event === 'server_asset_hit') {
        s.has_server_asset = true;
        if (ev.data && ev.data.asset_type === 'script') s.has_server_js = true;
        if (ev.data && ev.data.asset_type === 'style') s.has_server_css = true;
      }
      if (ev.event === 'client_boot_started') s.has_client_boot = true;
      if (ev.event === 'diagnostics_script_loaded' || ev.event === 'diagnostics_session_started') s.has_diag_script = true;
      if (ev.event === 'page_loaded') s.has_page_loaded = true;
      if (ev.event === 'zaraz_loaded' || (ev.data && /^zaraz_/.test(String(ev.data.asset_name || '')))) s.has_zaraz = true;
      if (ev.data && ev.data.asset_name === 'checkout_tailwind_css') s.has_css = true;
      if (ev.data && ev.data.asset_name === 'checkout_app_js') s.has_checkout_script = true;
      if (ev.event === 'checkout_opened') s.has_checkout = true;
      if (ev.event === 'checkout_ready') s.has_ready = true;
      if (ev.event === 'checkout_first_field_focus') s.has_field = true;
      if (ev.event === 'checkout_pix_copy_attempt') s.has_pix = true;
      if (ev.event === 'api_error' || ev.event === 'js_error' || ev.event === 'resource_error' || ev.event === 'critical_asset_missing') s.has_error = true;
      if (ev.event && ev.event !== 'server_page_hit' && ev.event !== 'server_asset_hit') s.has_browser_event = true;
    });

    return Object.keys(map).map(function (key) {
      var session = map[key];
      session.events.sort(function (a, b) { return eventTimeMs(a.created_at) - eventTimeMs(b.created_at); });
      session.event_analysis = annotateEvents(session);
      session.analysis = classifySession(session);
      return session;
    }).sort(function (a, b) { return b.last_ms - a.last_ms; });
  }

  function classifySession(session) {
    var notes = session.event_analysis || [];
    var critical = notes.filter(function (item) { return item.severity === 'critical'; });
    var warnings = notes.filter(function (item) { return item.severity === 'warning'; });
    var noise = notes.filter(function (item) { return item.severity === 'noise'; });
    var reasons = [];

    critical.forEach(function (item) {
      if (item.note) reasons.push(item.note);
    });
    warnings.slice(0, 3).forEach(function (item) {
      if (item.note) reasons.push(item.note);
    });

    var status = STATUS.unknown;
    if (critical.length) {
      status = STATUS.critical;
    } else if (session.is_crawler) {
      status = STATUS.crawler;
    } else if (session.has_server && !session.has_server_asset && !session.has_browser_event) {
      status = STATUS.html_only;
    } else if (session.has_server_asset && !session.has_browser_event) {
      status = STATUS.asset_no_js;
    } else if (warnings.length) {
      status = STATUS.warning;
    } else if (session.has_pix || session.has_field || session.has_checkout || session.has_page_loaded || session.has_diag_script) {
      status = STATUS.ok;
    } else if (session.has_client_boot) {
      status = STATUS.interrupted;
    }

    if (!reasons.length) reasons.push(status.hint);

    return {
      label: status.label,
      severity: status.severity,
      hint: status.hint,
      reasons: reasons.filter(Boolean).slice(0, 5),
      critical_count: critical.length,
      warning_count: warnings.length,
      noise_count: noise.length,
      is_actionable: status.severity === 'critical' || status.severity === 'warning',
      is_human_candidate: !session.is_crawler && !!session.has_browser_event,
    };
  }

  function summarize(sessions, events) {
    var summary = {
      total_events: events.length,
      unique_sessions: sessions.length,
      ok_sessions: 0,
      warning_sessions: 0,
      critical_sessions: 0,
      crawler_sessions: 0,
      html_only_sessions: 0,
      confirmed_loads: 0,
      checkout_sessions: 0,
      tiktok_ad_sessions: 0,
      likely_tiktok_browser_sessions: 0,
      js_errors: 0,
      api_errors: 0,
      third_party_tracking_warnings: 0,
      counts: {},
      platforms: {},
    };

    events.forEach(function (ev) {
      summary.counts[ev.event] = (summary.counts[ev.event] || 0) + 1;
      var platform = (ev.context && ev.context.platform) || 'unknown';
      summary.platforms[platform] = (summary.platforms[platform] || 0) + 1;
      if (ev.event === 'js_error') summary.js_errors += 1;
      if (ev.event === 'api_error') summary.api_errors += 1;
      if (ev.event === 'resource_error' && /analytics\.tiktok\.com/i.test(getResourceUrl(ev))) {
        summary.third_party_tracking_warnings += 1;
      }
    });

    sessions.forEach(function (s) {
      var severity = s.analysis && s.analysis.severity;
      if (severity === 'critical') summary.critical_sessions += 1;
      else if (severity === 'warning') summary.warning_sessions += 1;
      else if (severity === 'noise') {
        summary.crawler_sessions += s.is_crawler ? 1 : 0;
        summary.html_only_sessions += s.analysis && s.analysis.label === STATUS.html_only.label ? 1 : 0;
      } else if (severity === 'ok') summary.ok_sessions += 1;
      if (s.has_page_loaded || s.has_diag_script) summary.confirmed_loads += 1;
      if (s.has_checkout) summary.checkout_sessions += 1;
      if (s.ctx && s.ctx.is_tiktok_ad) summary.tiktok_ad_sessions += 1;
      if (s.ctx && s.ctx.is_likely_tiktok_browser) summary.likely_tiktok_browser_sessions += 1;
    });

    return summary;
  }

  function verdict(summary) {
    if (summary.critical_sessions > 0 || summary.js_errors > 0 || summary.api_errors > 0) {
      return {
        label: 'Atencao critica',
        severity: 'critical',
        text: 'Existe erro real de JS/API ou asset essencial em pelo menos uma sessao.',
      };
    }
    if (summary.warning_sessions > 0 || summary.third_party_tracking_warnings > 0) {
      return {
        label: 'Operacao estavel com alertas',
        severity: 'warning',
        text: 'O site carregou, mas ha sinais tecnicos que merecem acompanhamento.',
      };
    }
    return {
      label: 'Operacao saudavel',
      severity: 'ok',
      text: 'Nao ha erro critico nas sessoes analisadas.',
    };
  }

  function extractEvents(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.events)) return payload.events;
    if (payload && Array.isArray(payload.sessions)) {
      return payload.sessions.reduce(function (all, session) {
        return all.concat(Array.isArray(session.events) ? session.events : []);
      }, []);
    }
    return [];
  }

  function analyzeDiagnostics(payloadOrEvents) {
    var events = uniqueEvents(extractEvents(payloadOrEvents)).sort(function (a, b) {
      return eventTimeMs(a.created_at) - eventTimeMs(b.created_at);
    });
    var sessions = buildSessions(events);
    var summary = summarize(sessions, events);
    return {
      generated_at: new Date().toISOString(),
      summary: summary,
      verdict: verdict(summary),
      sessions: sessions,
      events: events,
    };
  }

  return {
    EVENT_LABELS: EVENT_LABELS,
    STATUS: STATUS,
    analyzeDiagnostics: analyzeDiagnostics,
    buildSessions: buildSessions,
    classifySession: classifySession,
    eventTimeMs: eventTimeMs,
    getSessionId: getSessionId,
  };
});
