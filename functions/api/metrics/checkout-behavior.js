/**
 * Cloudflare Pages Function: POST /api/metrics/checkout-behavior
 * ──────────────────────────────────────────────────────────────
 * Recebe eventos comportamentais do checkout, valida, sanitiza
 * e persiste no KV em dois níveis:
 *   1. Sessão individual: beh_sess_v1:{date}:{sessionId}  (TTL 30 dias)
 *   2. Agregado diário:   beh_day_v1:{date}               (TTL 90 dias)
 *
 * KV binding: PIX_STORE (mesma que o restante do projeto)
 */

const SESSION_TTL  = 30 * 86400;  // 30 days
const DAILY_TTL    = 90 * 86400;  // 90 days
const MAX_BODY     = 64 * 1024;   // 64 KB max payload

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function dateKey(ts) {
  const d = new Date(ts || Date.now());
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Sanitize incoming payload — strip anything that could contain PII */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const VALID_FIELDS = [
    'inp-nome','inp-email','inp-tel','inp-cpf',
    'inp-cep','inp-rua','inp-bairro','inp-num',
    'inp-comp','inp-cidade','inp-estado'
  ];

  // Sanitize fields object
  const fields = {};
  if (raw.fields && typeof raw.fields === 'object') {
    for (const key of VALID_FIELDS) {
      const f = raw.fields[key];
      if (!f) continue;
      fields[key] = {
        focus_count:    clamp(safeNum(f.focus_count), 0, 50),
        blur_count:     clamp(safeNum(f.blur_count), 0, 50),
        total_time_ms:  clamp(safeNum(f.total_time_ms), 0, 600000),
        key_presses:    clamp(safeNum(f.key_presses), 0, 500),
        delete_presses: clamp(safeNum(f.delete_presses), 0, 200),
        left_empty:     !!f.left_empty,
        first_focus_t:  safeNum(f.first_focus_t),
        last_blur_t:    safeNum(f.last_blur_t),
      };
    }
  }

  // Sanitize errors object
  const errors = {};
  if (raw.errors && typeof raw.errors === 'object') {
    for (const key of VALID_FIELDS) {
      if (typeof raw.errors[key] === 'number') {
        errors[key] = clamp(safeNum(raw.errors[key]), 0, 100);
      }
    }
  }

  // Funnel (numbers only)
  const funnel = {};
  const FUNNEL_KEYS = [
    'page_load','first_interact','step1_first_focus','step1_last_blur',
    'step2_first_focus','step2_last_blur','submit_click','pix_shown',
    'pix_copy_click','order_confirmed'
  ];
  if (raw.funnel && typeof raw.funnel === 'object') {
    for (const k of FUNNEL_KEYS) {
      funnel[k] = raw.funnel[k] != null ? safeNum(raw.funnel[k]) : null;
    }
  }

  // Rage clicks (no coords, just timestamps and target class names)
  const rage_clicks = [];
  if (Array.isArray(raw.rage_clicks)) {
    for (const rc of raw.rage_clicks.slice(0, 20)) {
      if (rc && typeof rc === 'object') {
        rage_clicks.push({
          t: safeNum(rc.t),
          count: clamp(safeNum(rc.count), 0, 30),
          target: String(rc.target || '').replace(/[^a-zA-Z0-9_\- ]/g, '').slice(0, 40),
        });
      }
    }
  }

  // Hesitations
  const hesitations = [];
  if (Array.isArray(raw.hesitations)) {
    for (const h of raw.hesitations.slice(0, 20)) {
      if (h && typeof h === 'object') {
        hesitations.push({ t: safeNum(h.t), gap_ms: safeNum(h.gap_ms) });
      }
    }
  }

  // Device (no UA string to avoid fingerprinting concerns)
  const device = {};
  if (raw.device && typeof raw.device === 'object') {
    device.type          = ['mobile','tablet','desktop'].includes(raw.device.type) ? raw.device.type : 'unknown';
    device.tiktok_webview= !!raw.device.tiktok_webview;
    device.screen_w      = clamp(safeNum(raw.device.screen_w), 0, 5000);
    device.screen_h      = clamp(safeNum(raw.device.screen_h), 0, 5000);
    device.vp_w          = clamp(safeNum(raw.device.vp_w), 0, 5000);
    device.vp_h          = clamp(safeNum(raw.device.vp_h), 0, 5000);
    device.pixel_ratio   = clamp(safeNum(raw.device.pixel_ratio), 0.5, 5);
    device.touch         = !!raw.device.touch;
    device.connection    = String(raw.device.connection || 'unknown').slice(0, 20);
    device.lang          = String(raw.device.lang || '').replace(/[^a-z\-]/gi,'').slice(0,10);
    device.tz_offset     = clamp(safeNum(raw.device.tz_offset), -720, 720);
  }

  // Timeline (sanitize labels only)
  const timeline = [];
  if (Array.isArray(raw.timeline)) {
    for (const ev of raw.timeline.slice(0, 200)) {
      if (ev && typeof ev === 'object') {
        const entry = {
          t: safeNum(ev.t),
          e: String(ev.e || '').replace(/[^a-z_]/gi,'').slice(0, 40),
        };
        if (ev.d && typeof ev.d === 'object') {
          // Only allow numeric/boolean values in detail, no strings that could hold PII
          const d = {};
          for (const [k, v] of Object.entries(ev.d)) {
            const safeKey = String(k).replace(/[^a-z_]/gi,'').slice(0,20);
            if (typeof v === 'number' || typeof v === 'boolean') {
              d[safeKey] = v;
            } else if (typeof v === 'string' && v.length < 60 && !/[@.]/.test(v)) {
              // Allow short non-email strings (field names, etc.)
              d[safeKey] = v.replace(/[^a-zA-Z0-9_\- ]/g,'').slice(0,40);
            }
          }
          if (Object.keys(d).length) entry.d = d;
        }
        timeline.push(entry);
      }
    }
  }

  const sessionId = String(raw.session_id || '').replace(/[^a-z0-9]/gi,'').slice(0, 32);
  if (!sessionId || sessionId.length < 8) return null;

  return {
    session_id:       sessionId,
    page_url:         String(raw.page_url || '/checkout').replace(/[^a-zA-Z0-9\/\-_]/g,'').slice(0,120),
    ref_code:         String(raw.ref_code || '').replace(/[^a-zA-Z0-9_\-]/g,'').slice(0,40),
    device,
    ts_start:         safeNum(raw.ts_start),
    ts_end:           raw.ts_end != null ? safeNum(raw.ts_end) : null,
    duration_ms:      raw.duration_ms != null ? clamp(safeNum(raw.duration_ms), 0, 7200000) : null,
    funnel,
    max_step_reached: clamp(safeNum(raw.max_step_reached), 0, 4),
    fields,
    errors,
    rage_clicks,
    hesitations,
    scroll_depth:     Array.isArray(raw.scroll_depth)
                        ? raw.scroll_depth.filter(n => [25,50,75,100].includes(n))
                        : [],
    back_attempt:     !!raw.back_attempt,
    cep_lookup_count: clamp(safeNum(raw.cep_lookup_count), 0, 20),
    submit_attempts:  clamp(safeNum(raw.submit_attempts), 0, 30),
    order_id_hint:    raw.order_id_hint
                        ? String(raw.order_id_hint).replace(/[^a-zA-Z0-9_\-]/g,'').slice(0,30)
                        : null,
    flush_type:       ['ping','final'].includes(raw.flush_type) ? raw.flush_type : 'unknown',
    flush_ts:         safeNum(raw.flush_ts),
    timeline,
    // Load health
    load_health: (function() {
      const lh = raw.load_health || {};
      return {
        status:   ['ok','timeout','error','loading'].includes(lh.status) ? lh.status : 'unknown',
        ready_ms: lh.ready_ms != null ? clamp(safeNum(lh.ready_ms), 0, 30000) : null,
        error:    lh.error ? String(lh.error).replace(/[^a-zA-Z0-9_\- ]/g,'').slice(0,100) : null,
      };
    })(),
    _saved_at:        Date.now(),
  };
}

/** Merge session data into daily aggregate */
function mergeDailyAggregate(existing, session) {
  const agg = existing || {
    date: null,
    sessions_total: 0,
    sessions_completed: 0,  // reached pix screen
    sessions_copied_pix: 0,
    sessions_ordered: 0,
    // Funnel dropoffs
    funnel_step1_starts: 0,
    funnel_step2_starts: 0,
    funnel_submit_clicks: 0,
    funnel_pix_shown: 0,
    funnel_pix_copied: 0,
    // Device breakdown
    device_mobile: 0,
    device_tablet: 0,
    device_desktop: 0,
    device_tiktok_wv: 0,
    // Connection
    conn_4g: 0,
    conn_3g: 0,
    conn_slow2g: 0,
    conn_wifi: 0,
    conn_other: 0,
    // Field error totals
    field_errors: {},
    // Rage click sessions
    sessions_with_rage: 0,
    // Hesitation sessions
    sessions_with_hesitation: 0,
    // Back nav sessions
    sessions_back_nav: 0,
    // Aggregate durations (for computing avg)
    duration_sum_ms: 0,
    duration_count: 0,
    // Step1 time sum
    step1_time_sum_ms: 0,
    step1_time_count: 0,
    // Step2 time sum
    step2_time_sum_ms: 0,
    step2_time_count: 0,
    // Max scroll depth distribution
    scroll_25: 0, scroll_50: 0, scroll_75: 0, scroll_100: 0,
    // Submit attempts distribution
    submit_1: 0, submit_2plus: 0,
    // Load health
    load_ok: 0, load_timeout: 0, load_error: 0,
    load_ready_ms_sum: 0, load_ready_ms_count: 0,
    _updated_at: null,
  };

  agg.sessions_total++;

  // Funnel
  if (session.funnel.step1_first_focus != null) agg.funnel_step1_starts++;
  if (session.funnel.step2_first_focus != null) agg.funnel_step2_starts++;
  if (session.funnel.submit_click != null)       agg.funnel_submit_clicks++;
  if (session.funnel.pix_shown != null)          agg.funnel_pix_shown++;
  if (session.funnel.pix_copy_click != null)     agg.funnel_pix_copied++;
  if (session.funnel.pix_shown != null)          agg.sessions_completed++;
  if (session.funnel.pix_copy_click != null)     agg.sessions_copied_pix++;
  if (session.order_id_hint)                     agg.sessions_ordered++;

  // Device
  if (session.device.type === 'mobile')  agg.device_mobile++;
  if (session.device.type === 'tablet')  agg.device_tablet++;
  if (session.device.type === 'desktop') agg.device_desktop++;
  if (session.device.tiktok_webview)     agg.device_tiktok_wv++;

  // Connection
  const c = (session.device.connection || '').toLowerCase();
  if (c.includes('4g'))        agg.conn_4g++;
  else if (c.includes('3g'))   agg.conn_3g++;
  else if (c.includes('2g'))   agg.conn_slow2g++;
  else if (c.includes('wifi') || c.includes('ethernet')) agg.conn_wifi++;
  else                         agg.conn_other++;

  // Field errors
  for (const [field, count] of Object.entries(session.errors || {})) {
    agg.field_errors[field] = (agg.field_errors[field] || 0) + count;
  }

  // Rage, hesitation, back
  if (session.rage_clicks.length > 0)   agg.sessions_with_rage++;
  if (session.hesitations.length > 0)   agg.sessions_with_hesitation++;
  if (session.back_attempt)             agg.sessions_back_nav++;

  // Durations
  if (session.duration_ms != null) {
    agg.duration_sum_ms += session.duration_ms;
    agg.duration_count++;
  }

  // Step timing
  const f = session.funnel;
  if (f.step1_first_focus != null && f.step1_last_blur != null) {
    agg.step1_time_sum_ms += (f.step1_last_blur - f.step1_first_focus);
    agg.step1_time_count++;
  }
  if (f.step2_first_focus != null && f.step2_last_blur != null) {
    agg.step2_time_sum_ms += (f.step2_last_blur - f.step2_first_focus);
    agg.step2_time_count++;
  }

  // Scroll depth
  const sd = session.scroll_depth || [];
  if (sd.includes(25))  agg.scroll_25++;
  if (sd.includes(50))  agg.scroll_50++;
  if (sd.includes(75))  agg.scroll_75++;
  if (sd.includes(100)) agg.scroll_100++;

  // Submit attempts
  if (session.submit_attempts === 1)       agg.submit_1++;
  else if (session.submit_attempts >= 2)   agg.submit_2plus++;

  // Load health
  const lh = session.load_health || {};
  if (lh.status === 'ok')      agg.load_ok++;
  if (lh.status === 'timeout') agg.load_timeout++;
  if (lh.status === 'error')   agg.load_error++;
  if (lh.ready_ms != null) {
    agg.load_ready_ms_sum   += lh.ready_ms;
    agg.load_ready_ms_count++;
  }

  agg._updated_at = Date.now();
  return agg;
}

/**
 * Called on subsequent flushes (pings) for an already-counted session.
 * Only increments funnel metrics if the session reached a NEW milestone
 * compared to its previous state — prevents double-counting.
 */
function updateDailyFunnelOnly(agg, prevSession, newSession) {
  if (!agg) return mergeDailyAggregate(null, newSession); // safety fallback

  const pf = prevSession.funnel || {};
  const nf = newSession.funnel  || {};

  // Only increment a funnel counter if it's newly reached (was null before, now has a value)
  if (pf.step1_first_focus == null && nf.step1_first_focus != null) agg.funnel_step1_starts++;
  if (pf.step2_first_focus == null && nf.step2_first_focus != null) agg.funnel_step2_starts++;
  if (pf.submit_click      == null && nf.submit_click      != null) agg.funnel_submit_clicks++;
  if (pf.pix_shown         == null && nf.pix_shown         != null) {
    agg.funnel_pix_shown++;
    agg.sessions_completed++;
  }
  if (pf.pix_copy_click    == null && nf.pix_copy_click    != null) {
    agg.funnel_pix_copied++;
    agg.sessions_copied_pix++;
  }
  if (!prevSession.order_id_hint && newSession.order_id_hint) agg.sessions_ordered++;

  // Update back_attempt if newly set
  if (!prevSession.back_attempt && newSession.back_attempt) agg.sessions_back_nav++;

  // Update rage/hesitation if newly appeared
  const hadRage  = (prevSession.rage_clicks  || []).length > 0;
  const hadHesit = (prevSession.hesitations  || []).length > 0;
  if (!hadRage  && (newSession.rage_clicks  || []).length > 0) agg.sessions_with_rage++;
  if (!hadHesit && (newSession.hesitations  || []).length > 0) agg.sessions_with_hesitation++;

  // Add any new field errors (delta only)
  for (const [field, newCount] of Object.entries(newSession.errors || {})) {
    const prevCount = (prevSession.errors || {})[field] || 0;
    const delta = newCount - prevCount;
    if (delta > 0) agg.field_errors[field] = (agg.field_errors[field] || 0) + delta;
  }

  // Update scroll depth if newly reached
  const prevSd = new Set(prevSession.scroll_depth || []);
  const newSd  = newSession.scroll_depth || [];
  if (!prevSd.has(25)  && newSd.includes(25))  agg.scroll_25++;
  if (!prevSd.has(50)  && newSd.includes(50))  agg.scroll_50++;
  if (!prevSd.has(75)  && newSd.includes(75))  agg.scroll_75++;
  if (!prevSd.has(100) && newSd.includes(100)) agg.scroll_100++;

  // Update duration (replace prev contribution with new one)
  if (prevSession.duration_ms != null) {
    agg.duration_sum_ms  -= prevSession.duration_ms;
    agg.duration_count   = Math.max(0, agg.duration_count - 1);
  }
  if (newSession.duration_ms != null) {
    agg.duration_sum_ms += newSession.duration_ms;
    agg.duration_count++;
  }

  agg._updated_at = Date.now();
  return agg;
}

export async function onRequestPost(context) {
  try {
    const kv = context.env.PIX_STORE;
    if (!kv) return json({ ok: false, error: 'kv_unavailable' }, 503);

    // Read and size-limit body
    const ct = context.request.headers.get('content-type') || '';
    if (!ct.includes('application/json') && !ct.includes('text/plain')) {
      return json({ ok: false, error: 'bad_content_type' }, 400);
    }

    const bodyText = await context.request.text();
    if (!bodyText || bodyText.length > MAX_BODY) {
      return json({ ok: false, error: 'payload_too_large' }, 413);
    }

    let raw;
    try { raw = JSON.parse(bodyText); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }

    const session = sanitize(raw);
    if (!session) return json({ ok: false, error: 'invalid_payload' }, 400);

    const date     = dateKey(session.ts_start || Date.now());
    const sessKey  = `beh_sess_v1:${date}:${session.session_id}`;
    const dailyKey = `beh_day_v1:${date}`;

    // ── Check if this session already exists (ping vs new session) ──
    // A session sends multiple flushes (periodic pings + final).
    // We only count it as a NEW session the FIRST time we see its ID.
    let existingSession = null;
    try {
      const prev = await kv.get(sessKey, { type: 'text' });
      if (prev) existingSession = JSON.parse(prev);
    } catch(_) {}

    const isNewSession = existingSession === null;

    // Always update the session record (latest state wins)
    await kv.put(sessKey, JSON.stringify(session), { expirationTtl: SESSION_TTL });

    // ── Update daily aggregate ──
    let existingDaily = null;
    try {
      const raw2 = await kv.get(dailyKey, { type: 'text' });
      if (raw2) existingDaily = JSON.parse(raw2);
    } catch(_) {}

    let merged;
    if (isNewSession) {
      // First time we see this session → full merge including sessions_total++
      merged = mergeDailyAggregate(existingDaily, session);
    } else {
      // Subsequent flush (ping/update) → only update funnel completion metrics
      // that could have progressed since the last flush, without re-counting the session
      merged = updateDailyFunnelOnly(existingDaily, existingSession, session);
    }

    merged.date = date;
    await kv.put(dailyKey, JSON.stringify(merged), { expirationTtl: DAILY_TTL });

    return json({ ok: true });
  } catch (err) {
    console.error('checkout-behavior error:', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
