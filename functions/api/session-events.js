// Cloudflare Pages Function: /api/session-events
// Purpose: anonymous checkout observability logs + server-side Haiku analysis.
// Storage: KV binding PIX_STORE. Secret: HAIKU_API_KEY or ANTHROPIC_API_KEY.

const SESSION_PREFIX = 'obs_session_v1:';
const REPORT_KEY = 'obs_ai_report_v1';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_BATCH_EVENTS = 25;
const MAX_SESSION_EVENTS = 160;
const MAX_LIST_SESSIONS = 120;

const ALLOWED_EVENTS = new Set([
  'LP_View',
  'Checkout_Page_Load',
  'Page_Ready',
  'Env_Info',
  'Perf_Navigation',
  'Perf_Paint',
  'Perf_LCP',
  'Perf_CLS',
  'Perf_Long_Task',
  'Perf_Resource_Slow',
  'LP_CTA_Visible',
  'LP_CTA_Not_Visible_After_Load',
  'LP_Scroll_Depth',
  'LP_Scroll_Stalled',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Checkout_Visible',
  'CTA_Click',
  'Checkout_Open_Timeout',
  'Checkout_Form_Ready',
  'Submit_Attempt',
  'Submit_Blocked',
  'Submit_Valid',
  'Validation_Error',
  'CEP_Input_Complete',
  'Loading_Shown',
  'Pix_Loading_State',
  'Field_Focus',
  'Field_Input_Start',
  'Field_Input_Filled',
  'API_Success',
  'API_Error',
  'Checkout_Error',
  'Submit_Click',
  'Pix_Visible',
  'Pix_Visible_Timeout',
  'Pix_Copy_Click',
  'Pix_Copy_Failed',
  'Page_Hidden',
  'Session_Abandoned',
  'Session_End',
  'JS_Error',
  'Console_Error',
  'Resource_Error',
]);

const SAFE_DATA_FIELDS = new Set([
  'stage',
  'button',
  'field',
  'error_field',
  'error_message',
  'api',
  'status',
  'duration_ms',
  'load_ms',
  'checkout_open_ms',
  'pix_load_ms',
  'hidden_after_ms',
  'path',
  'method',
  'result',
  'reason',
  'order_id_present',
  'value',
  'currency',
  'checkout_entry_source',
  'checkout_visible_source',
  'checkout_ready_state',
  'filename',
  'lineno',
  'colno',
  'stack',
  'tag',
  'selector',
  'resource',
  'resource_name',
  'initiator',
  'ready_state',
  'viewport_w',
  'viewport_h',
  'connection_type',
  'effective_type',
  'downlink',
  'rtt',
  'save_data',
  'ttfb_ms',
  'dcl_ms',
  'dom_interactive_ms',
  'transfer_size',
  'encoded_size',
  'decoded_size',
  'fcp_ms',
  'fp_ms',
  'lcp_ms',
  'cls_milli',
  'longtask_ms',
  'render_ms',
  'enabled',
  'visible',
  'top',
  'bottom',
  'width',
  'height',
  'input_count',
  'required_filled',
  'form_ready_ms',
  'has_submit',
  'submit_top',
  'submit_enabled',
  'active_field',
  'has_value',
  'value_len',
  'is_cross_origin',
  'scroll_depth',
  'scroll_y',
  'doc_height',
  'cta_visible',
  'cta_top',
  'cta_bottom',
  'cta_kind',
  'idle_ms',
]);

const SOURCE_FIELDS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ttclid']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  });
}

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'www-authenticate': 'Basic realm="PIX Admin", charset="UTF-8"',
    },
  });
}

function checkBasicAuth(request, env) {
  const user = env.PIX_ADMIN_USER;
  const pass = env.PIX_ADMIN_PASS;
  if (!user || !pass) return false;

  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Basic\s+(.+)$/i);
  if (!m) return false;

  let decoded = '';
  try {
    decoded = atob(m[1]);
  } catch {
    return false;
  }

  const i = decoded.indexOf(':');
  if (i < 0) return false;

  return decoded.slice(0, i) === user && decoded.slice(i + 1) === pass;
}

function cleanText(value, max = 160) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : undefined;
  if (typeof value === 'boolean') return value;
  return String(value).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function cleanSessionId(value) {
  const cleaned = cleanText(value, 80);
  if (!cleaned || !/^[a-zA-Z0-9:_-]{8,80}$/.test(cleaned)) return null;
  return cleaned;
}

function cleanPath(path) {
  const value = cleanText(path, 80) || '/';
  if (!value.startsWith('/')) return '/';
  return value.split('?')[0].slice(0, 80);
}

function cleanSource(source) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of SOURCE_FIELDS) {
    const value = cleanText(source[key], key === 'ttclid' ? 180 : 90);
    if (value) out[key] = value;
  }
  return out;
}

function cleanData(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const key of SAFE_DATA_FIELDS) {
    const max = key === 'stack' ? 700 : (key === 'resource' || key === 'resource_name' || key === 'filename' || key === 'selector' ? 260 : 180);
    const value = cleanText(data[key], max);
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

function sanitizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.slice(0, MAX_BATCH_EVENTS).map((event) => {
    const name = cleanText(event && event.name, 60);
    if (!name || !ALLOWED_EVENTS.has(name)) return null;
    return {
      name,
      t: Math.max(0, Math.min(1000 * 60 * 30, Number(event.t) || 0)),
      data: cleanData(event.data),
      received_at: Date.now(),
    };
  }).filter(Boolean);
}

function isBot(request) {
  const ua = request.headers.get('user-agent') || '';
  return /bot|crawler|spider|security-polaris/i.test(ua);
}

function detectFlags(events) {
  const flags = [];
  const names = new Set(events.map((event) => event.name));
  const last = events[events.length - 1];

  for (const event of events) {
    if (event.name === 'JS_Error') {
      flags.push({ type: 'js_error', severity: 'high', detail: `${event.data.error_message || 'erro javascript'} ${event.data.filename || event.data.path || ''}`.trim() });
    }
    if (event.name === 'Console_Error') {
      flags.push({ type: 'console_error', severity: 'medium', detail: event.data.error_message || 'console.error' });
    }
    if (event.name === 'Resource_Error') {
      flags.push({ type: 'resource_error', severity: 'high', detail: `${event.data.tag || 'resource'} ${event.data.resource || ''}`.trim() });
    }
    if (event.name === 'Checkout_Error') {
      flags.push({ type: 'checkout_error', severity: 'medium', detail: `${event.data.error_field || 'campo'}: ${event.data.error_message || 'erro'}` });
    }
    if (event.name === 'API_Error') {
      const api = event.data.api || 'api';
      const status = event.data.status || 0;
      flags.push({ type: 'api_error', severity: Number(status) >= 500 || Number(status) === 0 ? 'high' : 'medium', detail: `${api} status ${status}` });
    }
    if (event.name === 'API_Success' && Number(event.data.duration_ms || 0) >= 2500) {
      flags.push({ type: 'api_slow', severity: 'medium', detail: `${event.data.api || 'api'} ${event.data.duration_ms}ms` });
    }
    if (event.name === 'Perf_Resource_Slow' && Number(event.data.duration_ms || 0) >= 1500) {
      flags.push({ type: 'resource_slow', severity: 'medium', detail: `${event.data.resource_name || event.data.resource || 'resource'} ${event.data.duration_ms}ms` });
    }
    if (event.name === 'Perf_Long_Task' && Number(event.data.longtask_ms || 0) >= 200) {
      flags.push({ type: 'long_task', severity: 'medium', detail: `${event.data.longtask_ms}ms` });
    }
    if (event.name === 'Perf_Navigation' && Number(event.data.load_ms || 0) >= 4000) {
      flags.push({ type: 'page_load_slow', severity: 'medium', detail: `${event.data.load_ms}ms` });
    }
    if (event.name === 'LP_CTA_Not_Visible_After_Load') {
      flags.push({ type: 'lp_cta_not_visible', severity: 'high', detail: event.data.reason || 'cta nao visivel' });
    }
    if (event.name === 'LP_Scroll_Stalled') {
      flags.push({ type: 'lp_scroll_stalled', severity: 'medium', detail: `${event.data.scroll_depth || 0}% em ${event.data.idle_ms || 0}ms` });
    }
    if (event.name === 'Checkout_Open_Timeout') {
      flags.push({ type: 'checkout_open_timeout', severity: 'high', detail: `${event.data.duration_ms || 0}ms` });
    }
    if (event.name === 'Pix_Visible_Timeout') {
      flags.push({ type: 'pix_visible_timeout', severity: 'high', detail: `${event.data.duration_ms || 0}ms` });
    }
  }

  if (names.has('Checkout_Visible') && !names.has('Submit_Click') && last && ['Session_Abandoned', 'Page_Hidden'].includes(last.name)) {
    const typed = names.has('Field_Input_Start') ? 'com digitacao' : 'sem digitacao';
    flags.push({ type: 'checkout_abandoned_before_submit', severity: 'medium', detail: `${last.data.stage || 'checkout'} ${typed}` });
  }
  if (names.has('Submit_Click') && !names.has('Pix_Visible')) {
    flags.push({ type: 'submitted_no_pix', severity: 'high', detail: 'cliente enviou formulario e nao viu pix' });
  }
  if (names.has('Pix_Visible') && !names.has('Pix_Copy_Click') && last && ['Session_Abandoned', 'Page_Hidden'].includes(last.name)) {
    flags.push({ type: 'pix_visible_no_copy', severity: 'medium', detail: 'cliente viu pix mas nao copiou' });
  }

  return flags.slice(-12);
}

function compactSession(session) {
  const events = session.events || [];
  const flags = detectFlags(events);
  return {
    id: session.id,
    started_at: session.started_at,
    updated_at: session.updated_at,
    page: session.page,
    device: session.device,
    source: session.source || {},
    event_count: events.length,
    last_event: events.length ? events[events.length - 1].name : '',
    flags,
    events: events.slice(-20).map((event) => ({
      name: event.name,
      t: event.t,
      data: event.data || {},
    })),
  };
}

function buildStats(sessions) {
  const metricBuckets = {
    lp_load_ms: [],
    lp_ttfb_ms: [],
    lp_fcp_ms: [],
    lp_lcp_ms: [],
    checkout_open_ms: [],
    form_ready_ms: [],
    pix_load_ms: [],
  };

  const stats = {
    sessions: sessions.length,
    anomalies: 0,
    high_severity: 0,
    checkout_visible: 0,
    submit_click: 0,
    pix_visible: 0,
    pix_copy: 0,
    api_errors: 0,
    api_slow: 0,
    js_errors: 0,
    console_errors: 0,
    resource_errors: 0,
    slow_resources: 0,
    long_tasks: 0,
    validation_errors: 0,
    cta_visible: 0,
    cta_not_visible: 0,
    scroll_stalled: 0,
    by_device: {},
    by_source: {},
    top_flags: {},
    speed: {},
    updated_at: new Date().toISOString(),
  };

  for (const session of sessions) {
    const names = new Set((session.events || []).map((event) => event.name));
    if (names.has('Checkout_Visible')) stats.checkout_visible += 1;
    if (names.has('Submit_Click')) stats.submit_click += 1;
    if (names.has('Pix_Visible')) stats.pix_visible += 1;
    if (names.has('Pix_Copy_Click')) stats.pix_copy += 1;
    if (names.has('API_Error')) stats.api_errors += 1;
    if (names.has('JS_Error')) stats.js_errors += 1;
    if (names.has('Console_Error')) stats.console_errors += 1;
    if (names.has('Resource_Error')) stats.resource_errors += 1;
    if (names.has('Perf_Resource_Slow')) stats.slow_resources += 1;
    if (names.has('Perf_Long_Task')) stats.long_tasks += 1;
    if (names.has('Validation_Error')) stats.validation_errors += 1;
    if (names.has('LP_CTA_Visible')) stats.cta_visible += 1;
    if (names.has('LP_CTA_Not_Visible_After_Load')) stats.cta_not_visible += 1;
    if (names.has('LP_Scroll_Stalled')) stats.scroll_stalled += 1;

    for (const event of session.events || []) {
      if (event.name === 'Perf_Navigation') {
        if (event.data.load_ms) metricBuckets.lp_load_ms.push(Number(event.data.load_ms));
        if (event.data.ttfb_ms) metricBuckets.lp_ttfb_ms.push(Number(event.data.ttfb_ms));
      }
      if (event.name === 'Perf_Paint' && event.data.fcp_ms) metricBuckets.lp_fcp_ms.push(Number(event.data.fcp_ms));
      if (event.name === 'Perf_LCP' && event.data.lcp_ms) metricBuckets.lp_lcp_ms.push(Number(event.data.lcp_ms));
      if (event.name === 'Checkout_Visible' && event.data.checkout_open_ms) metricBuckets.checkout_open_ms.push(Number(event.data.checkout_open_ms));
      if (event.name === 'Checkout_Form_Ready' && event.data.form_ready_ms) metricBuckets.form_ready_ms.push(Number(event.data.form_ready_ms));
      if (event.name === 'Pix_Visible' && event.data.pix_load_ms) metricBuckets.pix_load_ms.push(Number(event.data.pix_load_ms));
    }

    const device = session.device || 'unknown';
    stats.by_device[device] = (stats.by_device[device] || 0) + 1;

    const sourceName = (session.source && (session.source.utm_campaign || session.source.utm_source)) || 'sem_origem';
    stats.by_source[sourceName] = (stats.by_source[sourceName] || 0) + 1;

    const flags = detectFlags(session.events || []);
    if (flags.length) stats.anomalies += 1;
    for (const flag of flags) {
      if (flag.severity === 'high') stats.high_severity += 1;
      if (flag.type === 'api_slow') stats.api_slow += 1;
      stats.top_flags[flag.type] = (stats.top_flags[flag.type] || 0) + 1;
    }
  }

  stats.speed = buildSpeedStats(metricBuckets);
  return stats;
}

function percentile(values, p) {
  const arr = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const idx = Math.min(arr.length - 1, Math.ceil((p / 100) * arr.length) - 1);
  return Math.round(arr[idx]);
}

function average(values) {
  const arr = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (!arr.length) return 0;
  return Math.round(arr.reduce((sum, value) => sum + value, 0) / arr.length);
}

function buildSpeedStats(metricBuckets) {
  const out = {};
  for (const key of Object.keys(metricBuckets)) {
    const values = metricBuckets[key];
    out[key] = {
      count: values.length,
      avg: average(values),
      p75: percentile(values, 75),
      p90: percentile(values, 90),
    };
  }
  return out;
}

async function listSessions(env) {
  const listed = await env.PIX_STORE.list({ prefix: SESSION_PREFIX, limit: MAX_LIST_SESSIONS });
  const sessions = [];
  await Promise.all((listed.keys || []).map(async (key) => {
    try {
      const item = await env.PIX_STORE.get(key.name, { type: 'json' });
      if (item && item.id) sessions.push(item);
    } catch {}
  }));
  sessions.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return sessions.slice(0, MAX_LIST_SESSIONS);
}

async function deleteObservabilityLogs(env) {
  let deleted = 0;
  let cursor = undefined;
  while (true) {
    const listed = await env.PIX_STORE.list({ prefix: SESSION_PREFIX, limit: 1000, cursor });
    const keys = listed.keys || [];
    await Promise.all(keys.map((key) => env.PIX_STORE.delete(key.name).then(() => { deleted += 1; }).catch(() => {})));
    if (listed.list_complete) break;
    cursor = listed.cursor;
    if (!cursor) break;
  }
  await env.PIX_STORE.delete(REPORT_KEY).catch(() => {});
  return deleted;
}

function buildHaikuPrompt(stats, sessions) {
  const suspicious = sessions
    .map(compactSession)
    .filter((session) => session.flags && session.flags.length)
    .slice(0, 35);

  return [
    'Voce e um analista tecnico de funil ecommerce mobile.',
    'Analise somente problemas tecnicos e friccoes de UX a partir de logs anonimos.',
    'Nao use nem solicite dados pessoais. Foque em bugs, lentidao, pontos de abandono e priorizacao.',
    'Nao gere checklist generico de testes se os logs nao sustentarem isso.',
    'Cite os erros exatos registrados nos logs quando existirem: nome do evento, device, origem, campo, api, status, duracao e mensagem.',
    'Responda em portugues do Brasil, direto, com secoes: Resumo, Erros exatos, Hipotese provavel, Prioridade, Proximo ajuste recomendado.',
    '',
    'ESTATISTICAS:',
    JSON.stringify(stats, null, 2),
    '',
    'SESSOES COM SINAIS DE PROBLEMA:',
    JSON.stringify(suspicious, null, 2),
  ].join('\n');
}

async function runHaiku(env, stats, sessions) {
  const apiKey = env.HAIKU_API_KEY || env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: 'haiku_secret_missing',
      message: 'Configure o secret HAIKU_API_KEY na Cloudflare para liberar a analise.',
    };
  }

  const requestedModel = cleanText(env.HAIKU_MODEL, 80);
  const models = [
    requestedModel,
    'claude-haiku-4-5-20251001',
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-20240307',
  ].filter((model, index, list) => model && list.indexOf(model) === index);

  let lastError = null;
  for (const model of models) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 3200,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: buildHaikuPrompt(stats, sessions),
          },
        ],
      }),
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errorPayload = await response.json();
        detail = cleanText(errorPayload && errorPayload.error && errorPayload.error.message, 220) || '';
      } catch {}
      lastError = {
        status: response.status,
        model,
        detail,
      };
      if (response.status === 404) continue;
      break;
    }

    const data = await response.json();
    const text = ((data.content || []).find((part) => part && part.type === 'text') || {}).text || '';
    return {
      ok: true,
      model: data.model || model,
      text,
      stop_reason: data.stop_reason || '',
      usage: data.usage || null,
      generated_at: new Date().toISOString(),
    };
  }

  return {
    ok: false,
    error: 'haiku_request_failed',
    status: lastError ? lastError.status : 0,
    model: lastError ? lastError.model : '',
    detail: lastError ? lastError.detail : '',
  };
}

export async function onRequestPost(context) {
  try {
    if (isBot(context.request)) return json({ ok: true, ignored: 'bot' });
    if (!context.env.PIX_STORE) return json({ ok: false, error: 'kv_not_configured' }, 500);

    const raw = await context.request.text();
    if (!raw || raw.length > 12000) return json({ ok: false, error: 'invalid_payload' }, 400);

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const id = cleanSessionId(payload.session_id);
    if (!id) return json({ ok: false, error: 'invalid_session' }, 400);

    const events = sanitizeEvents(payload.events);
    if (!events.length) return json({ ok: true, stored: 0 });

    const key = SESSION_PREFIX + id;
    const existing = await context.env.PIX_STORE.get(key, { type: 'json' });
    const nowIso = new Date().toISOString();
    const session = existing && existing.id ? existing : {
      id,
      started_at: nowIso,
      events: [],
    };

    session.updated_at = nowIso;
    session.page = cleanPath(payload.page);
    session.device = cleanText(payload.device, 40) || 'unknown';
    session.source = Object.assign({}, session.source || {}, cleanSource(payload.source));
    session.events = (session.events || []).concat(events).slice(-MAX_SESSION_EVENTS);

    await context.env.PIX_STORE.put(key, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
    return json({ ok: true, stored: events.length });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestGet(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();
    if (!context.env.PIX_STORE) return json({ ok: false, error: 'kv_not_configured' }, 500);

    const sessions = await listSessions(context.env);
    const stats = buildStats(sessions);
    let report = null;
    try {
      report = await context.env.PIX_STORE.get(REPORT_KEY, { type: 'json' });
    } catch {}

    return json({
      ok: true,
      stats,
      sessions: sessions.map(compactSession).slice(0, 80),
      ai_report: report || null,
    });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestPut(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();
    if (!context.env.PIX_STORE) return json({ ok: false, error: 'kv_not_configured' }, 500);

    const sessions = await listSessions(context.env);
    const stats = buildStats(sessions);
    if (!stats.anomalies) {
      const cleanReport = {
        ok: true,
        text: 'Nenhuma anomalia tecnica relevante encontrada nas sessoes recentes. Nao acionei o Haiku para economizar custo.',
        generated_at: new Date().toISOString(),
        skipped: 'no_anomalies',
      };
      await context.env.PIX_STORE.put(REPORT_KEY, JSON.stringify(Object.assign({}, cleanReport, { stats_snapshot: stats })), { expirationTtl: SESSION_TTL_SECONDS });
      return json({ ok: true, ai_report: cleanReport });
    }

    const report = await runHaiku(context.env, stats, sessions);
    const stored = Object.assign({}, report, { stats_snapshot: stats });
    await context.env.PIX_STORE.put(REPORT_KEY, JSON.stringify(stored), { expirationTtl: SESSION_TTL_SECONDS });

    return json({ ok: report.ok, ai_report: stored });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    if (!checkBasicAuth(context.request, context.env)) return unauthorized();
    if (!context.env.PIX_STORE) return json({ ok: false, error: 'kv_not_configured' }, 500);

    const deleted = await deleteObservabilityLogs(context.env);
    return json({
      ok: true,
      deleted,
      cleared_at: new Date().toISOString(),
    });
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestOptions() {
  return json({ ok: true });
}
