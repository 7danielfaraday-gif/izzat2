/**
 * Cloudflare Pages Function: GET /api/metrics/behavior-report
 * ──────────────────────────────────────────────────────────────
 * Retorna dados de analytics do checkout para o dashboard e para
 * exportação para IA.
 *
 * Parâmetros:
 *   ?days=7         — número de dias (padrão: 7, max: 30)
 *   ?mode=daily     — apenas agregados diários (leve)
 *   ?mode=sessions  — sessões individuais do dia especificado
 *   ?mode=ai        — dump massivo otimizado para IA (JSON + resumo)
 *   ?date=2025-01-15 — filtrar por data específica
 *
 * Autenticação: HTTP Basic (PIX_ADMIN_USER / PIX_ADMIN_PASS)
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function authFail() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'www-authenticate': 'Basic realm="Analytics"',
      'cache-control': 'no-store',
    },
  });
}

function checkAuth(request, env) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice(6));
    const [user, ...passParts] = decoded.split(':');
    const pass = passParts.join(':');
    const ok =
      user === (env.PIX_ADMIN_USER || '') &&
      pass === (env.PIX_ADMIN_PASS || '');
    return ok;
  } catch { return false; }
}

function dateKey(ts) {
  const d = new Date(ts || Date.now());
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function dateRange(days) {
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000);
    dates.push(dateKey(d.getTime()));
  }
  return dates;
}

/** Build a human-readable text summary for AI consumption */
function buildAiReport(dailyData, sessions, generatedAt) {
  const lines = [];
  lines.push('=== CHECKOUT BEHAVIORAL ANALYTICS REPORT ===');
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Period: ${dailyData.length} days`);
  lines.push('');

  // Overall funnel
  const totals = {
    sessions: 0, step1: 0, step2: 0, submits: 0,
    pix_shown: 0, pix_copied: 0, ordered: 0,
    rage: 0, hesitation: 0, back_nav: 0,
    mobile: 0, desktop: 0, tablet: 0, tiktok: 0,
  };

  const fieldErrors = {};
  let durationSum = 0, durationCount = 0;
  let s1Sum = 0, s1Count = 0, s2Sum = 0, s2Count = 0;

  for (const d of dailyData) {
    if (!d) continue;
    totals.sessions    += d.sessions_total || 0;
    totals.step1       += d.funnel_step1_starts || 0;
    totals.step2       += d.funnel_step2_starts || 0;
    totals.submits     += d.funnel_submit_clicks || 0;
    totals.pix_shown   += d.funnel_pix_shown || 0;
    totals.pix_copied  += d.funnel_pix_copied || 0;
    totals.ordered     += d.sessions_ordered || 0;
    totals.rage        += d.sessions_with_rage || 0;
    totals.hesitation  += d.sessions_with_hesitation || 0;
    totals.back_nav    += d.sessions_back_nav || 0;
    totals.mobile      += d.device_mobile || 0;
    totals.desktop     += d.device_desktop || 0;
    totals.tablet      += d.device_tablet || 0;
    totals.tiktok      += d.device_tiktok_wv || 0;
    durationSum        += d.duration_sum_ms || 0;
    durationCount      += d.duration_count || 0;
    s1Sum              += d.step1_time_sum_ms || 0;
    s1Count            += d.step1_time_count || 0;
    s2Sum              += d.step2_time_sum_ms || 0;
    s2Count            += d.step2_time_count || 0;
    for (const [f, n] of Object.entries(d.field_errors || {})) {
      fieldErrors[f] = (fieldErrors[f] || 0) + n;
    }
  }

  const pct = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) + '%' : 'N/A';
  const ms2s = (ms) => (ms / 1000).toFixed(1) + 's';
  const ms2m = (ms) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}m${s}s`;
  };

  lines.push('--- FUNNEL OVERVIEW ---');
  lines.push(`Total sessions that loaded checkout: ${totals.sessions}`);
  lines.push(`Started filling Step 1 (Personal Data): ${totals.step1} (${pct(totals.step1, totals.sessions)})`);
  lines.push(`Reached Step 2 (Address): ${totals.step2} (${pct(totals.step2, totals.sessions)})`);
  lines.push(`Clicked Submit: ${totals.submits} (${pct(totals.submits, totals.sessions)})`);
  lines.push(`Reached PIX screen: ${totals.pix_shown} (${pct(totals.pix_shown, totals.sessions)})`);
  lines.push(`Copied PIX code: ${totals.pix_copied} (${pct(totals.pix_copied, totals.sessions)})`);
  lines.push(`Confirmed order: ${totals.ordered} (${pct(totals.ordered, totals.sessions)})`);
  lines.push('');

  lines.push('--- FUNNEL DROPOFF ANALYSIS ---');
  lines.push(`Sessions lost between load → Step1: ${totals.sessions - totals.step1} (${pct(totals.sessions - totals.step1, totals.sessions)})`);
  lines.push(`Sessions lost between Step1 → Step2: ${totals.step1 - totals.step2} (${pct(totals.step1 - totals.step2, totals.step1)})`);
  lines.push(`Sessions lost between Step2 → Submit: ${totals.step2 - totals.submits} (${pct(totals.step2 - totals.submits, totals.step2)})`);
  lines.push(`Sessions lost between Submit → PIX shown: ${totals.submits - totals.pix_shown} (${pct(totals.submits - totals.pix_shown, totals.submits)})`);
  lines.push(`Sessions lost between PIX shown → Copied: ${totals.pix_shown - totals.pix_copied} (${pct(totals.pix_shown - totals.pix_copied, totals.pix_shown)})`);
  lines.push('');

  lines.push('--- TIMING ---');
  if (durationCount > 0) lines.push(`Average session duration: ${ms2m(durationSum / durationCount)} (n=${durationCount})`);
  if (s1Count > 0) lines.push(`Average time filling Step 1 (Personal Data): ${ms2s(s1Sum / s1Count)} (n=${s1Count})`);
  if (s2Count > 0) lines.push(`Average time filling Step 2 (Address): ${ms2s(s2Sum / s2Count)} (n=${s2Count})`);
  lines.push('');

  lines.push('--- FRICTION INDICATORS ---');
  lines.push(`Sessions with rage clicks: ${totals.rage} (${pct(totals.rage, totals.sessions)})`);
  lines.push(`Sessions with hesitations (>20s pauses): ${totals.hesitation} (${pct(totals.hesitation, totals.sessions)})`);
  lines.push(`Sessions where user pressed Back: ${totals.back_nav} (${pct(totals.back_nav, totals.sessions)})`);
  lines.push('');

  lines.push('--- VALIDATION ERRORS (most to least) ---');
  const sortedErrors = Object.entries(fieldErrors).sort((a,b) => b[1]-a[1]);
  if (sortedErrors.length === 0) lines.push('No validation errors recorded yet.');
  for (const [field, count] of sortedErrors) {
    lines.push(`  ${field}: ${count} errors`);
  }
  lines.push('');

  lines.push('--- DEVICE BREAKDOWN ---');
  lines.push(`Mobile: ${totals.mobile} (${pct(totals.mobile, totals.sessions)})`);
  lines.push(`Desktop: ${totals.desktop} (${pct(totals.desktop, totals.sessions)})`);
  lines.push(`Tablet: ${totals.tablet} (${pct(totals.tablet, totals.sessions)})`);
  lines.push(`TikTok WebView: ${totals.tiktok} (${pct(totals.tiktok, totals.sessions)})`);
  lines.push('');

  // Per-day breakdown
  lines.push('--- DAILY BREAKDOWN ---');
  for (const d of [...dailyData].reverse()) {
    if (!d) continue;
    lines.push(`${d.date}: sessions=${d.sessions_total} step1=${d.funnel_step1_starts} step2=${d.funnel_step2_starts} submits=${d.funnel_submit_clicks} pix=${d.funnel_pix_shown} copied=${d.funnel_pix_copied}`);
  }
  lines.push('');

  // Session-level detail (for deep AI analysis)
  if (sessions && sessions.length > 0) {
    lines.push('--- INDIVIDUAL SESSION DETAILS ---');
    lines.push(`(${sessions.length} sessions included)`);
    lines.push('');
    for (const s of sessions) {
      lines.push(`SESSION ${s.session_id}`);
      lines.push(`  Device: ${s.device?.type} | TikTok: ${s.device?.tiktok_webview} | Screen: ${s.device?.screen_w}x${s.device?.screen_h} | Conn: ${s.device?.connection}`);
      lines.push(`  Duration: ${s.duration_ms != null ? ms2m(s.duration_ms) : 'N/A'}`);
      lines.push(`  Max step reached: ${s.max_step_reached}`);
      lines.push(`  Submit attempts: ${s.submit_attempts}`);
      lines.push(`  Back navigation: ${s.back_attempt}`);
      lines.push(`  CEP lookups: ${s.cep_lookup_count}`);
      lines.push(`  Scroll depth: [${(s.scroll_depth||[]).join(', ')}]%`);
      if (s.rage_clicks?.length > 0) {
        lines.push(`  Rage clicks: ${s.rage_clicks.length} event(s)`);
        s.rage_clicks.forEach(rc => lines.push(`    t+${rc.t}ms: ${rc.count} clicks on "${rc.target}"`));
      }
      if (s.hesitations?.length > 0) {
        lines.push(`  Hesitations: ${s.hesitations.length} pause(s)`);
        s.hesitations.forEach(h => lines.push(`    t+${h.t}ms: ${(h.gap_ms/1000).toFixed(0)}s pause`));
      }
      if (Object.keys(s.errors||{}).length > 0) {
        lines.push(`  Validation errors: ${JSON.stringify(s.errors)}`);
      }
      lines.push(`  Field timing:`);
      for (const [field, f] of Object.entries(s.fields||{})) {
        lines.push(`    ${field}: focuses=${f.focus_count} time=${(f.total_time_ms/1000).toFixed(1)}s keys=${f.key_presses} deletes=${f.delete_presses} left_empty=${f.left_empty}`);
      }
      lines.push(`  Funnel timestamps (ms from page load):`);
      for (const [k,v] of Object.entries(s.funnel||{})) {
        if (v != null) lines.push(`    ${k}: +${v}ms`);
      }
      lines.push('');
    }
  }

  lines.push('=== END OF REPORT ===');
  return lines.join('\n');
}

export async function onRequestGet(context) {
  if (!checkAuth(context.request, context.env)) return authFail();

  const kv = context.env.PIX_STORE;
  if (!kv) return json({ ok: false, error: 'kv_unavailable' }, 503);

  const url    = new URL(context.request.url);
  const mode   = url.searchParams.get('mode') || 'daily';
  const days   = Math.min(30, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10)));
  const date   = url.searchParams.get('date') || dateKey(Date.now());

  try {
    if (mode === 'daily') {
      const dates = dateRange(days);
      const daily = await Promise.all(
        dates.map(async d => {
          try {
            const v = await kv.get(`beh_day_v1:${d}`, { type: 'text' });
            return v ? JSON.parse(v) : null;
          } catch { return null; }
        })
      );
      return json({ ok: true, mode, days, data: daily.filter(Boolean) });
    }

    if (mode === 'sessions') {
      // List all sessions for a given date
      const list = await kv.list({ prefix: `beh_sess_v1:${date}:` });
      const sessions = await Promise.all(
        (list.keys || []).slice(0, 500).map(async k => {
          try {
            const v = await kv.get(k.name, { type: 'text' });
            return v ? JSON.parse(v) : null;
          } catch { return null; }
        })
      );
      return json({ ok: true, mode, date, count: sessions.filter(Boolean).length, sessions: sessions.filter(Boolean) });
    }

    if (mode === 'ai') {
      // Build full AI-optimized dump
      const dates     = dateRange(days);
      const dailyData = await Promise.all(
        dates.map(async d => {
          try {
            const v = await kv.get(`beh_day_v1:${d}`, { type: 'text' });
            return v ? JSON.parse(v) : null;
          } catch { return null; }
        })
      );

      // Fetch recent sessions (last 2 days for detail)
      const recentDates = dates.slice(0, 2);
      let sessions = [];
      for (const d of recentDates) {
        try {
          const list = await kv.list({ prefix: `beh_sess_v1:${d}:` });
          const batch = await Promise.all(
            (list.keys || []).slice(0, 200).map(async k => {
              try {
                const v = await kv.get(k.name, { type: 'text' });
                return v ? JSON.parse(v) : null;
              } catch { return null; }
            })
          );
          sessions = sessions.concat(batch.filter(Boolean));
        } catch(_) {}
      }

      const generatedAt = new Date().toISOString();
      const textReport  = buildAiReport(dailyData.filter(Boolean), sessions, generatedAt);

      return json({
        ok: true,
        mode: 'ai',
        generated_at: generatedAt,
        period_days: days,
        daily_aggregates: dailyData.filter(Boolean),
        recent_sessions: sessions,
        ai_text_report: textReport,
      });
    }

    return json({ ok: false, error: 'unknown_mode' }, 400);
  } catch (err) {
    console.error('behavior-report error:', err);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function onRequestPost() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
