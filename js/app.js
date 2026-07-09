/**
 * Browser Integrity Guard — orquestração e UI
 */
import { computeScore } from './scorer.js';
import { buildSummaryText, exportJSON, severityLabel } from './report.js';
import { run as runAutomation } from './modules/automation.js';
import { run as runPrototypeLies } from './modules/prototype-lies.js';
import { run as runWorkers } from './modules/workers.js';
import { run as runNavigator } from './modules/navigator-check.js';
import { run as runChrome } from './modules/chrome-runtime.js';
import { run as runCanvas } from './modules/canvas.js';
import { run as runWebgl } from './modules/webgl.js';
import { run as runAudio } from './modules/audio.js';
import { run as runFonts } from './modules/fonts.js';
import { run as runScreen } from './modules/screen.js';
import { run as runClientRects } from './modules/client-rects.js';
import { run as runWebrtc } from './modules/webrtc.js';
import { run as runMediaSpeech } from './modules/media-speech.js';
import { run as runTimezone } from './modules/timezone-locale.js';
import { run as runPermissions } from './modules/permissions.js';
import { run as runTiming } from './modules/timing.js';
import { run as runConsistency } from './modules/consistency.js';

const MODULES = [
  { id: 'automation', label: 'Automação & CDP', run: runAutomation },
  { id: 'prototype-lies', label: 'Prototype Lies', run: runPrototypeLies },
  { id: 'workers', label: 'Workers', run: runWorkers },
  { id: 'navigator', label: 'Navigator & Hints', run: runNavigator },
  { id: 'chrome-runtime', label: 'Chrome & Plugins', run: runChrome },
  { id: 'canvas', label: 'Canvas', run: runCanvas },
  { id: 'webgl', label: 'WebGL', run: runWebgl },
  { id: 'audio', label: 'Audio', run: runAudio },
  { id: 'fonts', label: 'Fontes', run: runFonts },
  { id: 'screen', label: 'Screen & Viewport', run: runScreen },
  { id: 'client-rects', label: 'ClientRects', run: runClientRects },
  { id: 'webrtc', label: 'WebRTC', run: runWebrtc },
  { id: 'media-speech', label: 'Media & Speech', run: runMediaSpeech },
  { id: 'timezone-locale', label: 'Timezone & Locale', run: runTimezone },
  { id: 'permissions', label: 'Permissions', run: runPermissions },
  { id: 'timing', label: 'Timing', run: runTiming },
  { id: 'consistency', label: 'Consistência Cross-API', run: runConsistency },
];

let lastResult = null;

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

function renderScore(result) {
  const scoreEl = $('#score-value');
  const gradeEl = $('#grade-label');
  const descEl = $('#grade-desc');
  const ring = $('#score-ring');
  const tagsEl = $('#tags');

  scoreEl.textContent = result.score;
  gradeEl.textContent = result.grade.label;
  gradeEl.className = `grade-badge ${gradeClass(result.grade.id)}`;
  descEl.textContent = result.grade.description;

  const circ = 2 * Math.PI * 54;
  const offset = circ - (result.score / 100) * circ;
  ring.style.strokeDasharray = `${circ}`;
  ring.style.strokeDashoffset = `${offset}`;
  // SVGElement.className is SVGAnimatedString — use setAttribute
  ring.setAttribute('class', `score-ring ${gradeClass(result.grade.id)}`);

  tagsEl.innerHTML = '';
  if (!result.tags.length) {
    tagsEl.innerHTML = '<span class="tag tag-ok">LIMPO</span>';
  } else {
    for (const t of result.tags) {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = t;
      tagsEl.appendChild(span);
    }
  }
}

function renderCategories(result) {
  const grid = $('#category-grid');
  grid.innerHTML = '';
  const entries = Object.entries(result.categoryScores);
  for (const [id, cat] of entries) {
    const card = document.createElement('div');
    card.className = 'cat-card';
    const color =
      cat.score >= 90 ? 'ok' : cat.score >= 70 ? 'low' : cat.score >= 45 ? 'mid' : 'bad';
    card.innerHTML = `
      <div class="cat-head">
        <span class="cat-name">${escapeHtml(cat.label)}</span>
        <span class="cat-score ${color}">${cat.score}</span>
      </div>
      <div class="cat-bar"><div class="cat-bar-fill ${color}" style="width:${cat.score}%"></div></div>
      <div class="cat-meta">${cat.findingCount} finding(s) · Δ ${cat.delta}</div>
    `;
    grid.appendChild(card);
  }
}

function renderFindings(result) {
  const tbody = $('#findings-body');
  tbody.innerHTML = '';
  if (!result.findings.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="empty">Nenhum finding. Fingerprint aparenta coerente.</td></tr>';
    return;
  }
  for (const f of result.findings) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="sev sev-${f.severity}">${escapeHtml(severityLabel(f.severity))}</span></td>
      <td>${escapeHtml(f.moduleLabel || f.module || '')}</td>
      <td>${escapeHtml(f.title)}</td>
      <td class="detail">${escapeHtml(f.detail || '')}</td>
      <td class="delta">${f.delta}</td>
    `;
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function runModuleSafe(mod) {
  try {
    const result = await mod.run();
    return result || {
      id: mod.id,
      label: mod.label,
      findings: [],
      scoreDelta: 0,
      raw: {},
      status: 'empty',
    };
  } catch (e) {
    return {
      id: mod.id,
      label: mod.label,
      findings: [
        {
          id: `${mod.id}-crash`,
          severity: 'low',
          title: 'Módulo falhou',
          detail: String(e.message || e),
          delta: -1,
          tags: [],
        },
      ],
      scoreDelta: -1,
      raw: { error: String(e.message || e) },
      status: 'error',
    };
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
  btn.textContent = 'Analisando…';
  $('#progress-wrap').hidden = false;
  resultsPanel.hidden = true;
  setProgress(0, 'Iniciando…');

  try {
    const moduleResults = [];
    const total = MODULES.length;

    for (let i = 0; i < MODULES.length; i += 4) {
      const batch = MODULES.slice(i, i + 4);
      const batchResults = await Promise.all(batch.map((m) => runModuleSafe(m)));
      moduleResults.push(...batchResults);
      const done = moduleResults.length;
      setProgress(
        Math.round((done / total) * 100),
        `${done}/${total} — ${batch.map((b) => b.label).join(', ')}`
      );
    }

    const result = computeScore(moduleResults);
    lastResult = result;

    renderScore(result);
    renderCategories(result);
    renderFindings(result);

    $('#summary-pre').textContent = buildSummaryText(result);
    resultsPanel.hidden = false;
    setProgress(100, 'Concluído');
    $('#btn-export').disabled = false;
    $('#btn-copy').disabled = false;
  } finally {
    btn.disabled = false;
    btn.textContent = lastResult ? 'Reexecutar análise' : 'Iniciar análise';
  }
}

function downloadJSON() {
  if (!lastResult) return;
  const blob = new Blob([exportJSON(lastResult)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `integrity-report-${Date.now()}.json`;
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
    alert('Não foi possível copiar. Selecione o resumo manualmente.');
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
    showBootError(new Error('Botão #btn-run não encontrado no DOM'));
    return;
  }
  btn.addEventListener('click', () => {
    runAnalysis().catch((e) => {
      showBootError(e);
      btn.disabled = false;
      btn.textContent = 'Iniciar análise';
    });
  });
  $('#btn-export').addEventListener('click', downloadJSON);
  $('#btn-copy').addEventListener('click', copySummary);
  $('#btn-export').disabled = true;
  $('#btn-copy').disabled = true;

  // Auto-run on load for convenience
  setTimeout(() => {
    runAnalysis().catch((e) => {
      showBootError(e);
      btn.disabled = false;
      btn.textContent = 'Iniciar análise';
    });
  }, 200);
}

try {
  init();
} catch (e) {
  showBootError(e);
}
