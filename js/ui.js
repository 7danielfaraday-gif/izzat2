/**
 * FP Scan UI — consome window.Fingerprint / window.Creep (engine oficial CreepJS)
 */
import { computeFromCreep, TAG_INFO, gradeForScore } from './score.js';

const $ = (sel) => document.querySelector(sel);

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function severityLabel(sev) {
  return (
    {
      critical: 'Crítico',
      high: 'Alto',
      medium: 'Médio',
      low: 'Baixo',
      info: 'Info',
    }[sev] || sev
  );
}

function setProgress(pct, text) {
  const bar = $('#progress-bar');
  const label = $('#progress-label');
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = text || '';
}

function showBootError(err) {
  const el = $('#boot-error');
  if (!el) return;
  el.hidden = false;
  el.textContent = 'Erro: ' + (err?.message || err);
  console.error(err);
}

/** Espera o CreepJS oficial expor os objetos na window */
function waitForCreep({ timeoutMs = 45000, onTick } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (window.Fingerprint) {
        resolve({
          fp: window.Fingerprint,
          creep: window.Creep || null,
          ms: Date.now() - t0,
        });
        return true;
      }
      if (Date.now() - t0 > timeoutMs) {
        reject(
          new Error(
            'Timeout: CreepJS não expôs window.Fingerprint. Verifique se vendor/creepjs/creep.js carregou.'
          )
        );
        return true;
      }
      onTick?.(Date.now() - t0);
      return false;
    };
    if (tick()) return;
    const iv = setInterval(() => {
      if (tick()) clearInterval(iv);
    }, 80);
  });
}

function renderScore(result) {
  const scoreEl = $('#score-value');
  const gradeEl = $('#grade-label');
  const descEl = $('#grade-desc');
  const ring = $('#score-ring');
  const tagsEl = $('#tags');
  const confEl = $('#avg-confidence');

  scoreEl.textContent = result.score;
  gradeEl.textContent = result.grade.label;
  gradeEl.className = `grade-badge grade-${result.grade.id}`;
  descEl.textContent = `${result.grade.description} · engine: CreepJS real · ${result.totalLies} prototype lie(s)`;

  if (confEl) {
    confEl.textContent = `Trash: ${result.trashCount} · Seções com lied: ${result.stats.sectionsLied}/${result.stats.sectionsTotal}`;
  }

  const circ = 2 * Math.PI * 54;
  ring.style.strokeDasharray = `${circ}`;
  ring.style.strokeDashoffset = `${circ - (result.score / 100) * circ}`;
  ring.setAttribute('class', `score-ring grade-${result.grade.id}`);

  tagsEl.innerHTML = '';
  if (!result.tags.length) {
    tagsEl.innerHTML = '<span class="tag tag-ok">SEM ALERTAS</span>';
  } else {
    for (const t of result.tags) {
      const info = TAG_INFO[t];
      const span = document.createElement('span');
      span.className = 'tag tag-click';
      span.textContent = info?.titulo || t;
      span.title = info?.desc || t;
      span.addEventListener('click', () => {
        const el = document.getElementById('lies-panel');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      tagsEl.appendChild(span);
    }
  }

  // hero stats
  const box = $('#hero-stats');
  if (box) {
    box.innerHTML = `
      <div class="stat-chip ${result.score >= 70 ? 'ok' : 'warn'}">
        <div class="stat-label">Score</div>
        <div class="stat-value">${result.score}/100</div>
      </div>
      <div class="stat-chip ${result.totalLies ? 'warn' : 'ok'}">
        <div class="stat-label">Prototype lies</div>
        <div class="stat-value">${result.totalLies}</div>
      </div>
      <div class="stat-chip ${result.lies.length ? 'warn' : 'ok'}">
        <div class="stat-label">Alertas listados</div>
        <div class="stat-value">${result.lies.length}</div>
      </div>
      <div class="stat-chip ${result.trashCount ? 'warn' : 'ok'}">
        <div class="stat-label">Trash</div>
        <div class="stat-value">${result.trashCount}</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">Headless ≈</div>
        <div class="stat-value">${Math.round(result.stats.likeHeadless || 0)}%</div>
      </div>
      <div class="stat-chip">
        <div class="stat-label">Δ score</div>
        <div class="stat-value">${result.totalDelta}</div>
      </div>
    `;
  }
}

function renderSnapshot(result) {
  const grid = $('#snapshot-grid');
  if (!grid) return;
  const s = result.snapshot || {};
  const items = [
    { label: 'User-Agent', value: s.userAgent || '—', mono: true },
    { label: 'Platform', value: s.platform || '—', mono: true },
    { label: 'Sistema / device', value: [s.system, s.device].filter(Boolean).join(' · ') || '—' },
    { label: 'CPU / memória', value: `${s.hardwareConcurrency ?? '?'} cores${s.deviceMemory != null ? ` · ${s.deviceMemory} GB` : ''}` },
    { label: 'Idioma', value: Array.isArray(s.languages) ? s.languages.join(', ') : s.language || '—' },
    { label: 'Tela', value: s.screen || '—' },
    { label: 'GPU (WebGL)', value: s.gpu || '—', mono: true },
    { label: 'Vendor GPU', value: s.gpuVendor || '—', mono: true },
    { label: 'Fuso', value: s.timezone || '—' },
    { label: 'Resistência', value: s.resistance || 'nenhuma detectada' },
    { label: 'Prototype lies (CreepJS)', value: String(s.liesTotal ?? 0) },
    { label: 'Like headless', value: `${Math.round(s.headlessLike || 0)}%` },
  ];
  grid.innerHTML = items
    .map(
      (it) => `
    <div class="snap-card">
      <div class="snap-label">${escapeHtml(it.label)}</div>
      <div class="snap-value${it.mono ? ' mono' : ''}">${escapeHtml(it.value)}</div>
    </div>`
    )
    .join('');
}

function renderLies(result) {
  const list = $('#lies-list');
  const countEl = $('#lies-count');
  const panel = $('#lies-panel');
  if (!list) return;

  const lies = result.lies.filter((l) => l.severity !== 'info' || result.tags.includes('PRIVACIDADE'));
  // show all including info in full list - actually show all non-empty
  const show = result.lies;

  if (countEl) {
    countEl.textContent = show.length
      ? `${show.length} achado(s) do motor CreepJS`
      : 'Nenhuma mentira detectada pelo CreepJS';
  }
  panel?.classList.toggle('clean', show.length === 0 || (show.length === 1 && show[0].severity === 'info'));

  if (!show.length) {
    list.innerHTML = `
      <div class="lies-empty">
        <span class="check">✓</span>
        <div>
          O CreepJS não registrou prototype lies nem seções com <code>lied</code>.
          Fingerprint aparenta coerente com um navegador real.
        </div>
      </div>`;
    return;
  }

  list.innerHTML = show
    .map((f) => {
      return `
      <article class="lie-card sev-${escapeHtml(f.severity)}">
        <div class="lie-head">
          <span class="sev sev-${escapeHtml(f.severity)}">${escapeHtml(severityLabel(f.severity))}</span>
          <div class="lie-title">${escapeHtml(f.title)}</div>
        </div>
        <div class="lie-body">
          <div class="lie-block">
            <div class="lb-label">O que mentiu / o que foi detectado</div>
            <div class="lb-text">${escapeHtml(f.what)}</div>
          </div>
          <div class="lie-block">
            <div class="lb-label">Evidência exata (CreepJS)</div>
            <div class="lb-text evidence">${escapeHtml(f.evidence)}</div>
          </div>
          <div class="lie-block">
            <div class="lb-label">Por que chegamos a essa conclusão</div>
            <div class="lb-text">${escapeHtml(f.why)}</div>
          </div>
          <div class="lie-meta">
            <span class="pill">Categoria: ${escapeHtml(f.category)}</span>
            <span class="pill">Fonte: ${escapeHtml(f.source)}</span>
            <span class="pill impact">Impacto no score: ${f.impact}</span>
          </div>
        </div>
      </article>`;
    })
    .join('');
}

function renderSections(result) {
  const grid = $('#category-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const s of result.sections) {
    const score = s.lied ? 25 : 100;
    const color = s.lied ? 'bad' : 'ok';
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.innerHTML = `
      <div class="cat-head">
        <span class="cat-name">${escapeHtml(s.label)}</span>
        <span class="cat-score ${color}">${s.lied ? 'LIED' : 'OK'}</span>
      </div>
      <div class="cat-bar"><div class="cat-bar-fill ${color}" style="width:${score}%"></div></div>
      <div class="cat-meta">${escapeHtml(s.detail || s.id)}${s.hash ? ` · #${escapeHtml(String(s.hash).slice(0, 10))}` : ''}</div>
    `;
    grid.appendChild(card);
  }
}

function renderTagReasons(result) {
  const box = $('#tag-reasons');
  if (!box) return;
  if (!result.tags.length) {
    box.innerHTML = '<div class="cluster-empty">Nenhuma tag ativa.</div>';
    return;
  }
  box.innerHTML = result.tags
    .map((t) => {
      const info = TAG_INFO[t] || { titulo: t, desc: '' };
      const related = result.lies
        .filter((l) => {
          if (t === 'API_FALSIFICADA') return l.category === 'Prototype lie';
          if (t === 'SPOOF_TELA') return l.api === 'screen';
          if (t === 'WORKER_DIVERGENTE') return l.api === 'workerScope' || l.category === 'Worker';
          if (t === 'CANVAS_RUIDO') return l.api === 'canvas2d' || l.api === 'canvasWebgl';
          if (t === 'SEM_INTERFACE' || t === 'AUTOMACAO') return l.category === 'Headless' || l.api === 'headless';
          if (t === 'PRIVACIDADE') return l.category === 'Privacidade';
          return true;
        })
        .slice(0, 6);
      const motivos =
        related.length > 0
          ? `<ul class="motivo-list">${related
              .map((m) => `<li>${escapeHtml(m.title)}: ${escapeHtml(m.evidence).slice(0, 160)}</li>`)
              .join('')}</ul>`
          : `<p class="motivo-vazio">${escapeHtml(info.desc)}</p>`;
      return `
        <div class="tag-reason-card" id="tag-detail-${escapeHtml(t)}">
          <div class="tag-reason-head">
            <span class="tag">${escapeHtml(info.titulo)}</span>
            <code class="tag-code">${escapeHtml(t)}</code>
          </div>
          <p class="tag-reason-desc">${escapeHtml(info.desc)}</p>
          <div class="tag-reason-why"><strong>Evidências que ativaram esta tag:</strong></div>
          ${motivos}
        </div>`;
    })
    .join('');
}

function renderFindingsTable(result) {
  const tbody = $('#findings-body');
  const cards = $('#findings-cards');
  if (cards) {
    cards.innerHTML = result.lies
      .slice(0, 30)
      .map(
        (f) => `
      <div class="finding-card">
        <div><span class="sev sev-${escapeHtml(f.severity)}">${escapeHtml(severityLabel(f.severity))}</span></div>
        <div class="fc-main">
          <h3>${escapeHtml(f.title)}</h3>
          <p class="fc-detail">${escapeHtml(f.evidence)}</p>
          <p class="fc-why"><strong>Por quê:</strong> ${escapeHtml(f.why)}</p>
          <div class="fc-mod">${escapeHtml(f.source)}</div>
        </div>
        <div class="fc-side">
          <div class="delta">${f.impact}</div>
        </div>
      </div>`
      )
      .join('');
  }
  if (!tbody) return;
  if (!result.lies.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Nenhum achado.</td></tr>';
    return;
  }
  tbody.innerHTML = result.lies
    .map(
      (f) => `
    <tr>
      <td><span class="sev sev-${escapeHtml(f.severity)}">${escapeHtml(severityLabel(f.severity))}</span></td>
      <td>${escapeHtml(f.category)}</td>
      <td>${escapeHtml(f.title)}</td>
      <td class="detail">${escapeHtml(f.evidence)}</td>
      <td class="conf">—</td>
      <td class="delta">${f.impact}</td>
    </tr>`
    )
    .join('');
}

function renderClusters(result) {
  const box = $('#clusters');
  if (!box) return;
  const clusters = [];
  if (result.totalLies >= 5) {
    clusters.push({
      label: 'Volume de prototype lies',
      detail: `${result.totalLies} lies no fp.lies (CreepJS)`,
      delta: result.totalLies >= 15 ? -10 : -5,
    });
  }
  if (result.stats.sectionsLied >= 2) {
    clusters.push({
      label: 'Várias seções com lied',
      detail: `${result.stats.sectionsLied} módulos marcaram lied`,
      delta: -8,
    });
  }
  if (result.tags.includes('MULTI_SINAL')) {
    clusters.push({
      label: 'Multi-sinal',
      detail: result.tags.join(', '),
      delta: -6,
    });
  }
  if (!clusters.length) {
    box.innerHTML = '<div class="cluster-empty">Nenhum cluster de risco extra.</div>';
    return;
  }
  box.innerHTML = clusters
    .map(
      (c) => `
    <div class="cluster-card">
      <div class="cluster-title">${escapeHtml(c.label)} <span class="delta">${c.delta}</span></div>
      <div class="cluster-detail">${escapeHtml(c.detail)}</div>
    </div>`
    )
    .join('');
}

function buildSummaryText(result) {
  const lines = [
    '=== FP Scan (motor CreepJS) ===',
    `Score: ${result.score}/100 — ${result.grade.label}`,
    `Prototype lies: ${result.totalLies}`,
    `Trash: ${result.trashCount}`,
    `Tags: ${result.tags.join(', ') || 'nenhuma'}`,
    `Engine: ${result.engine}`,
    `Timestamp: ${result.timestamp}`,
    '',
    '--- Mentiras / achados ---',
  ];
  for (const f of result.lies) {
    lines.push(`[${f.severity}] ${f.title}`);
    lines.push(`  O que: ${f.what}`);
    lines.push(`  Evidência: ${f.evidence}`);
    lines.push(`  Por quê: ${f.why}`);
    lines.push(`  Impacto: ${f.impact}`);
    lines.push('');
  }
  return lines.join('\n');
}

let lastResult = null;

function refresh(result) {
  lastResult = result;
  renderScore(result);
  renderSnapshot(result);
  renderLies(result);
  renderTagReasons(result);
  renderClusters(result);
  renderSections(result);
  renderFindingsTable(result);
  const pre = $('#summary-pre');
  if (pre) pre.textContent = buildSummaryText(result);
  $('#results').hidden = false;
  $('#btn-export').disabled = false;
  $('#btn-copy').disabled = false;
}

async function runAnalysis() {
  const btn = $('#btn-run');
  btn.disabled = true;
  btn.textContent = 'Rodando CreepJS...';
  $('#progress-wrap').hidden = false;
  $('#results').hidden = true;
  const boot = $('#boot-error');
  if (boot) {
    boot.hidden = true;
    boot.textContent = '';
  }

  setProgress(5, 'Carregando motor CreepJS (vendor/creepjs/creep.js)...');

  try {
    // Se Fingerprint ainda não existe, o script defer pode ainda estar rodando
    setProgress(15, 'Aguardando fingerprint completo do CreepJS...');

    const { fp, creep, ms } = await waitForCreep({
      timeoutMs: 60000,
      onTick: (elapsed) => {
        const pct = Math.min(90, 15 + Math.floor(elapsed / 600));
        setProgress(pct, `CreepJS coletando... ${Math.round(elapsed / 1000)}s`);
      },
    });

    setProgress(92, `Fingerprint pronto em ${ms}ms — calculando score...`);
    const result = computeFromCreep(fp, creep);
    result.collectMs = ms;
    refresh(result);
    setProgress(100, `Concluído em ${ms}ms · ${result.totalLies} lies · score ${result.score}`);
    console.log('[FP Scan] window.Fingerprint / window.Creep', fp, creep);
    console.log('[FP Scan] score result', result);
  } catch (e) {
    showBootError(e);
  } finally {
    btn.disabled = false;
    btn.textContent = lastResult ? 'Reexecutar (recarregar página)' : 'Iniciar análise';
  }
}

function downloadJSON() {
  if (!lastResult) return;
  const payload = {
    score: lastResult.score,
    grade: lastResult.grade,
    tags: lastResult.tags,
    totalLies: lastResult.totalLies,
    trashCount: lastResult.trashCount,
    lies: lastResult.lies,
    sections: lastResult.sections,
    snapshot: lastResult.snapshot,
    stats: lastResult.stats,
    timestamp: lastResult.timestamp,
    engine: lastResult.engine,
    // full creep dump
    Fingerprint: lastResult.raw?.fingerprint,
    Creep: lastResult.raw?.creep,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fp-scan-creepjs-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copySummary() {
  if (!lastResult) return;
  try {
    await navigator.clipboard.writeText(buildSummaryText(lastResult));
    const btn = $('#btn-copy');
    const old = btn.textContent;
    btn.textContent = 'Copiado!';
    setTimeout(() => {
      btn.textContent = old;
    }, 1500);
  } catch {
    alert('Não foi possível copiar.');
  }
}

function ensureCreepScript() {
  // script is in HTML; if missing, inject
  if ([...document.scripts].some((s) => (s.src || '').includes('creep.js'))) return;
  const s = document.createElement('script');
  s.src = 'vendor/creepjs/creep.js';
  s.defer = true;
  document.head.appendChild(s);
}

function init() {
  ensureCreepScript();
  const btn = $('#btn-run');
  if (!btn) {
    showBootError(new Error('#btn-run não encontrado'));
    return;
  }

  // Reexecutar = reload (CreepJS IIFE só roda uma vez)
  btn.addEventListener('click', () => {
    if (lastResult) {
      location.reload();
      return;
    }
    runAnalysis();
  });
  $('#btn-export')?.addEventListener('click', downloadJSON);
  $('#btn-copy')?.addEventListener('click', copySummary);
  $('#btn-export').disabled = true;
  $('#btn-copy').disabled = true;

  // auto-run
  setTimeout(() => runAnalysis(), 100);
}

try {
  init();
} catch (e) {
  showBootError(e);
}

// re-export for console
window.FPScan = {
  computeFromCreep,
  gradeForScore,
  get last() {
    return lastResult;
  },
};
