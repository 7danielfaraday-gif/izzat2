/**
 * Browser Integrity Guard v2 - orquestracao e UI
 */
import { computeScore, TAG_INFO } from './scorer.js?v5';
import { buildSummaryText, exportJSON, severityLabel } from './report.js?v5';
import { run as runAutomation } from './modules/automation.js?v5';
import { run as runPrototypeLies } from './modules/prototype-lies.js?v5';
import { run as runWorkers } from './modules/workers.js?v5';
import { run as runNavigator } from './modules/navigator-check.js?v5';
import { run as runChrome } from './modules/chrome-runtime.js?v5';
import { run as runCanvas } from './modules/canvas.js?v5';
import { run as runWebgl } from './modules/webgl.js?v5';
import { run as runAudio } from './modules/audio.js?v5';
import { run as runFonts } from './modules/fonts.js?v5';
import { run as runScreen } from './modules/screen.js?v5';
import { run as runClientRects } from './modules/client-rects.js?v5';
import { run as runWebrtc } from './modules/webrtc.js?v5';
import { run as runMediaSpeech } from './modules/media-speech.js?v5';
import { run as runTimezone } from './modules/timezone-locale.js?v5';
import { run as runPermissions } from './modules/permissions.js?v5';
import { run as runTiming } from './modules/timing.js?v5';
import { run as runConsistency } from './modules/consistency.js?v5';
import { run as runMatchMedia } from './modules/matchmedia.js?v5';
import { run as runIframeLab } from './modules/iframe-lab.js?v5';
import { run as runMathEngine } from './modules/math-engine.js?v5';
import { run as runWebgpu } from './modules/webgpu.js?v5';
import { run as runStorageHeap } from './modules/storage-heap.js?v5';
import { run as runCssDom } from './modules/css-dom.js?v5';
import { run as runBatterySensors } from './modules/battery-sensors.js?v5';
import { run as runBehavior } from './modules/behavior.js?v5';

const PHASE_A = [
  { id: 'automation', label: 'Automacao & CDP', run: runAutomation },
  { id: 'prototype-lies', label: 'Prototype Lies', run: runPrototypeLies },
  { id: 'navigator', label: 'Navigator & Hints', run: runNavigator },
  { id: 'chrome-runtime', label: 'Chrome & Plugins', run: runChrome },
  { id: 'screen', label: 'Screen & Viewport', run: runScreen },
  { id: 'matchmedia', label: 'MatchMedia CSS', run: runMatchMedia },
  { id: 'math-engine', label: 'Math Engine', run: runMathEngine },
  { id: 'timing', label: 'Timing', run: runTiming },
  { id: 'permissions', label: 'Permissions', run: runPermissions },
  { id: 'timezone-locale', label: 'Timezone & Locale', run: runTimezone },
  { id: 'css-dom', label: 'CSS & DOM', run: runCssDom },
  { id: 'storage-heap', label: 'Storage & Heap', run: runStorageHeap },
  { id: 'consistency', label: 'Consistencia Cross-API', run: runConsistency },
];

const PHASE_B = [
  { id: 'workers', label: 'Workers', run: runWorkers },
  { id: 'iframe-lab', label: 'Iframe Lab', run: runIframeLab },
  { id: 'canvas', label: 'Canvas', run: runCanvas },
  { id: 'webgl', label: 'WebGL', run: runWebgl },
  { id: 'webgpu', label: 'WebGPU', run: runWebgpu },
  { id: 'audio', label: 'Audio', run: runAudio },
  { id: 'fonts', label: 'Fontes', run: runFonts },
  { id: 'client-rects', label: 'ClientRects', run: runClientRects },
  { id: 'webrtc', label: 'WebRTC', run: runWebrtc },
  { id: 'media-speech', label: 'Media & Speech', run: runMediaSpeech },
  { id: 'battery-sensors', label: 'Battery & Sensors', run: runBatterySensors },
];

let lastResult = null;
let scoreMode = 'strict';
let behaviorEnabled = true;

const $ = (sel) => document.querySelector(sel);

function setProgress(pct, text) {
  const bar = $('#progress-bar');
  const label = $('#progress-label');
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = text || '';
}

function gradeClass(id) {
  return `grade-${id}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  gradeEl.className = `grade-badge ${gradeClass(result.grade.id)}`;
  const modoPt = result.mode === 'balanced' ? 'equilibrado' : 'estrito';
  descEl.textContent =
    result.grade.description +
    ` | modo ${modoPt}` +
    (result.correlationDelta ? ` | correlacao ${result.correlationDelta}` : '');

  if (confEl) {
    confEl.textContent = `Confianca media: ${Math.round((result.avgConfidence || 0) * 100)}%`;
  }

  const circ = 2 * Math.PI * 54;
  const offset = circ - (result.score / 100) * circ;
  ring.style.strokeDasharray = `${circ}`;
  ring.style.strokeDashoffset = `${offset}`;
  ring.setAttribute('class', `score-ring ${gradeClass(result.grade.id)}`);

  tagsEl.innerHTML = '';
  if (!result.tags.length) {
    tagsEl.innerHTML = '<span class="tag tag-ok" title="Nenhum sinal de risco relevante">SEM ALERTAS</span>';
  } else {
    for (const t of result.tags) {
      const info = TAG_INFO[t] || result.tagDetails?.[t];
      const span = document.createElement('span');
      span.className = 'tag tag-click';
      span.textContent = info?.titulo || t;
      span.title = 'Clique para ver os motivos';
      span.dataset.tag = t;
      span.addEventListener('click', () => {
        const el = document.getElementById(`tag-detail-${t}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      tagsEl.appendChild(span);
    }
  }

  renderTagReasons(result);
  renderClusters(result.clusters || []);
}

function renderTagReasons(result) {
  const box = $('#tag-reasons');
  if (!box) return;
  box.innerHTML = '';
  const details = result.tagDetails || {};
  const tags = result.tags || [];
  if (!tags.length) {
    box.innerHTML =
      '<div class="cluster-empty">Nenhuma tag ativa — fingerprint sem alertas relevantes.</div>';
    return;
  }

  for (const t of tags) {
    const d = details[t] || {
      id: t,
      titulo: TAG_INFO[t]?.titulo || t,
      descricao: TAG_INFO[t]?.desc || '',
      motivos: [],
    };
    const card = document.createElement('div');
    card.className = 'tag-reason-card';
    card.id = `tag-detail-${t}`;

    const motivos = d.motivos?.length
      ? `<ul class="motivo-list">${d.motivos
          .map((m) => `<li>${escapeHtml(m)}</li>`)
          .join('')}</ul>`
      : '<p class="motivo-vazio">Nenhum detalhe tecnico anexado (tag derivada de regra geral).</p>';

    card.innerHTML = `
      <div class="tag-reason-head">
        <span class="tag">${escapeHtml(d.titulo || t)}</span>
        <code class="tag-code">${escapeHtml(t)}</code>
      </div>
      <p class="tag-reason-desc">${escapeHtml(d.descricao || '')}</p>
      <div class="tag-reason-why"><strong>Por que esta tag foi ativada:</strong></div>
      ${motivos}
    `;
    box.appendChild(card);
  }
}

function renderClusters(clusters) {
  const box = $('#clusters');
  if (!box) return;
  box.innerHTML = '';
  if (!clusters.length) {
    box.innerHTML = '<div class="cluster-empty">Nenhum cluster de risco correlacionado.</div>';
    return;
  }
  for (const c of clusters) {
    const div = document.createElement('div');
    div.className = 'cluster-card';
    div.innerHTML = `
      <div class="cluster-title">${escapeHtml(c.label)} <span class="delta">${c.delta}</span></div>
      <div class="cluster-detail">${escapeHtml(c.detail || '')}</div>
    `;
    box.appendChild(div);
  }
}

function renderCategories(result) {
  const grid = $('#category-grid');
  grid.innerHTML = '';
  for (const [, cat] of Object.entries(result.categoryScores)) {
    const card = document.createElement('div');
    card.className = 'cat-card';
    const color =
      cat.score >= 90 ? 'ok' : cat.score >= 70 ? 'low' : cat.score >= 45 ? 'mid' : 'bad';
    card.innerHTML = `
      <div class="cat-head">
        <span class="cat-name">${escapeHtml(cat.label)}</span>
        <span class="cat-score ${color}">${Math.round(cat.score)}</span>
      </div>
      <div class="cat-bar"><div class="cat-bar-fill ${color}" style="width:${cat.score}%"></div></div>
      <div class="cat-meta">${cat.findingCount} finding(s) - d ${cat.delta}</div>
    `;
    grid.appendChild(card);
  }
}

function renderFindings(result) {
  const tbody = $('#findings-body');
  tbody.innerHTML = '';
  if (!result.findings.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty">Nenhum finding. Fingerprint aparenta coerente.</td></tr>';
    return;
  }
  for (const f of result.findings) {
    const tr = document.createElement('tr');
    const conf = f.confidence != null ? Math.round(f.confidence * 100) + '%' : '-';
    tr.innerHTML = `
      <td><span class="sev sev-${f.severity}">${escapeHtml(severityLabel(f.severity))}</span></td>
      <td>${escapeHtml(f.moduleLabel || f.module || '')}</td>
      <td>${escapeHtml(f.title)}</td>
      <td class="detail">${escapeHtml(f.detail || '')}</td>
      <td class="conf">${conf}</td>
      <td class="delta">${f.weightedDelta != null ? f.weightedDelta : f.delta}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function runModuleSafe(mod, opts) {
  try {
    const result = await mod.run(opts);
    return (
      result || {
        id: mod.id,
        label: mod.label,
        findings: [],
        scoreDelta: 0,
        raw: {},
        status: 'empty',
      }
    );
  } catch (e) {
    return {
      id: mod.id,
      label: mod.label,
      findings: [
        {
          id: `${mod.id}-crash`,
          severity: 'low',
          title: 'Modulo falhou',
          detail: String(e.message || e),
          delta: -1,
          confidence: 1,
          weightedDelta: -1,
          tags: [],
        },
      ],
      scoreDelta: -1,
      raw: { error: String(e.message || e) },
      status: 'error',
    };
  }
}

async function runBatch(list, basePct, spanPct, moduleResults) {
  const total = list.length;
  for (let i = 0; i < list.length; i += 4) {
    const batch = list.slice(i, i + 4);
    const batchResults = await Promise.all(batch.map((m) => runModuleSafe(m)));
    moduleResults.push(...batchResults);
    const done = moduleResults.length;
    const pct = basePct + Math.round((Math.min(done, PHASE_A.length + PHASE_B.length) / (PHASE_A.length + PHASE_B.length)) * spanPct);
    setProgress(pct, `${done} modulos - ${batch.map((b) => b.label).join(', ')}`);
  }
}

async function runAnalysis() {
  const btn = $('#btn-run');
  const resultsPanel = $('#results');
  const bootErr = document.getElementById('boot-error');
  if (bootErr) {
    bootErr.hidden = true;
    bootErr.textContent = '';
  }
  btn.disabled = true;
  btn.textContent = 'Analisando...';
  $('#progress-wrap').hidden = false;
  resultsPanel.hidden = true;
  setProgress(0, 'Fase A - checks rapidos...');

  try {
    const moduleResults = [];

    // Phase A
    await runBatch(PHASE_A, 0, 40, moduleResults);

    // Phase B
    setProgress(45, 'Fase B - fingerprint profundo...');
    await runBatch(PHASE_B, 40, 40, moduleResults);

    // Phase C behavior
    setProgress(85, behaviorEnabled ? 'Fase C - comportamento (3s)...' : 'Fase C - comportamento off');
    const behaviorMod = {
      id: 'behavior',
      label: 'Comportamento',
      run: (o) => runBehavior({ ...o, skip: !behaviorEnabled, durationMs: 3200 }),
    };
    moduleResults.push(await runModuleSafe(behaviorMod));

    setProgress(95, 'Calculando score com correlacao...');
    const result = computeScore(moduleResults, { mode: scoreMode });
    lastResult = result;

    renderScore(result);
    renderCategories(result);
    renderFindings(result);
    $('#summary-pre').textContent = buildSummaryText(result);
    resultsPanel.hidden = false;
    setProgress(100, 'Concluido');
    $('#btn-export').disabled = false;
    $('#btn-copy').disabled = false;
  } catch (e) {
    showBootError(e);
  } finally {
    btn.disabled = false;
    btn.textContent = lastResult ? 'Reexecutar analise' : 'Iniciar analise';
  }
}

function downloadJSON() {
  if (!lastResult) return;
  const blob = new Blob([exportJSON(lastResult)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `integrity-report-v2-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copySummary() {
  if (!lastResult) return;
  const text = buildSummaryText(lastResult);
  try {
    await navigator.clipboard.writeText(text);
    const btn = $('#btn-copy');
    const old = btn.textContent;
    btn.textContent = 'Copiado!';
    setTimeout(() => {
      btn.textContent = old;
    }, 1500);
  } catch {
    alert('Nao foi possivel copiar. Selecione o resumo manualmente.');
  }
}

function showBootError(err) {
  const el = document.getElementById('boot-error');
  if (el) {
    el.hidden = false;
    el.textContent = 'Erro ao carregar o app: ' + (err?.message || err);
  }
  console.error(err);
}

function init() {
  const btn = $('#btn-run');
  if (!btn) {
    showBootError(new Error('Botao #btn-run nao encontrado'));
    return;
  }

  const modeSel = $('#score-mode');
  if (modeSel) {
    scoreMode = modeSel.value || 'strict';
    modeSel.addEventListener('change', () => {
      scoreMode = modeSel.value;
      if (lastResult) {
        // recompute from cached modules if available
        const result = computeScore(lastResult.moduleResults, { mode: scoreMode });
        lastResult = result;
        renderScore(result);
        renderCategories(result);
        renderFindings(result);
        $('#summary-pre').textContent = buildSummaryText(result);
      }
    });
  }

  const beh = $('#behavior-toggle');
  if (beh) {
    behaviorEnabled = beh.checked;
    beh.addEventListener('change', () => {
      behaviorEnabled = beh.checked;
    });
  }

  btn.addEventListener('click', () => {
    runAnalysis().catch((e) => {
      showBootError(e);
      btn.disabled = false;
      btn.textContent = 'Iniciar analise';
    });
  });
  $('#btn-export').addEventListener('click', downloadJSON);
  $('#btn-copy').addEventListener('click', copySummary);
  $('#btn-export').disabled = true;
  $('#btn-copy').disabled = true;

  setTimeout(() => {
    runAnalysis().catch((e) => {
      showBootError(e);
      btn.disabled = false;
      btn.textContent = 'Iniciar analise';
    });
  }, 250);
}

try {
  init();
} catch (e) {
  showBootError(e);
}
