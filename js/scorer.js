/** Motor de Trust Score v2 - correlacao + confidence + modo strict */

import { clamp } from './utils.js?v3';

export const GRADES = [
  {
    min: 90,
    id: 'trusted',
    label: 'Trusted',
    description: 'Fingerprint coerente - navegador real',
  },
  {
    min: 70,
    id: 'low',
    label: 'Low Risk',
    description: 'Sinais menores ou protecoes de privacidade',
  },
  {
    min: 45,
    id: 'suspicious',
    label: 'Suspicious',
    description: 'Inconsistencias tipicas de spoof fraco',
  },
  {
    min: 20,
    id: 'high',
    label: 'High Risk',
    description: 'Padrao antidetect / automacao',
  },
  {
    min: 0,
    id: 'critical',
    label: 'Critical',
    description: 'Spoof obvio, headless ou CDP exposto',
  },
];

export function gradeForScore(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g;
  }
  return GRADES[GRADES.length - 1];
}

const CORRELATION_TAGS = [
  'PROTOTYPE_LIE',
  'WORKER_MISMATCH',
  'CANVAS_NOISE',
  'BAD_FP',
  'AUTOMATION',
  'SCREEN_SPOOF',
  'HEADLESS',
];

/**
 * @param {Array} moduleResults
 * @param {{ mode?: 'strict'|'balanced' }} options
 */
export function computeScore(moduleResults, options = {}) {
  const mode = options.mode === 'balanced' ? 'balanced' : 'strict';
  const modeFactor = mode === 'strict' ? 1.15 : 1.0;

  let totalDelta = 0;
  const allFindings = [];
  const tags = new Set();
  const categoryScores = {};
  let confSum = 0;
  let confCount = 0;

  for (const mod of moduleResults) {
    let modWeighted = 0;
    for (const f of mod.findings || []) {
      const conf = f.confidence != null ? f.confidence : 0.85;
      const wd = (f.delta || 0) * conf * modeFactor;
      const findingOut = {
        ...f,
        confidence: conf,
        weightedDelta: Math.round(wd * 100) / 100,
        module: mod.id,
        moduleLabel: mod.label,
      };
      allFindings.push(findingOut);
      modWeighted += wd;
      confSum += conf;
      confCount++;
      (f.tags || []).forEach((t) => tags.add(t));
    }

    // Prefer weighted sum; fall back to module scoreDelta
    const delta = mod.findings?.length ? modWeighted : (mod.scoreDelta || 0) * modeFactor;
    totalDelta += delta;

    const modPenalty = Math.abs(Math.min(0, delta));
    categoryScores[mod.id] = {
      label: mod.label,
      score: clamp(100 - modPenalty, 0, 100),
      delta: Math.round(delta * 100) / 100,
      findingCount: (mod.findings || []).length,
      status: mod.status || 'ok',
    };
  }

  // --- Correlation clusters ---
  const clusters = [];
  let correlationDelta = 0;

  const has = (t) => tags.has(t) || allFindings.some((f) => (f.tags || []).includes(t));
  const hasId = (id) => allFindings.some((f) => f.id === id);

  const hitCorrTags = CORRELATION_TAGS.filter((t) => has(t));
  if (hitCorrTags.length >= 2) {
    const extra = -Math.min(20, 4 + hitCorrTags.length * 3);
    correlationDelta += extra;
    clusters.push({
      id: 'MULTI_SIGNAL',
      label: 'Multi-sinal correlacionado',
      detail: `Tags: ${hitCorrTags.join(', ')}`,
      delta: extra,
    });
    tags.add('MULTI_SIGNAL');
  }

  // Antidetect confirmed: canvas noise + (worker or prototype)
  if (has('CANVAS_NOISE') && (has('WORKER_MISMATCH') || has('PROTOTYPE_LIE'))) {
    const extra = -15;
    correlationDelta += extra;
    clusters.push({
      id: 'ANTIDETECT_CONFIRMED',
      label: 'Antidetect confirmado',
      detail: 'Canvas noise + spoof de API/worker',
      delta: extra,
    });
    tags.add('ANTIDETECT_CONFIRMED');
    tags.add('ANTIDETECT_LIKELY');
  } else if (has('PROTOTYPE_LIE') || has('WORKER_MISMATCH') || has('CANVAS_NOISE')) {
    if (allFindings.some((f) => f.severity === 'critical' || f.severity === 'high')) {
      tags.add('ANTIDETECT_LIKELY');
    }
  }

  // Screen spoof cluster
  if (
    (has('SCREEN_SPOOF') || hasId('screen-inner-gt') || hasId('mm-screen-mismatch')) &&
    (has('BAD_FP') || hasId('screen-dpr-mm') || hasId('mm-dpr-mismatch'))
  ) {
    const extra = -10;
    correlationDelta += extra;
    clusters.push({
      id: 'SCREEN_SPOOF_CLUSTER',
      label: 'Spoof de tela',
      detail: 'screen/inner/matchMedia inconsistentes entre si',
      delta: extra,
    });
    tags.add('SCREEN_SPOOF');
  }

  // Automation cluster
  if (has('AUTOMATION') && (has('HEADLESS') || has('PROTOTYPE_LIE'))) {
    const extra = -12;
    correlationDelta += extra;
    clusters.push({
      id: 'AUTOMATION_CLUSTER',
      label: 'Automacao reforçada',
      detail: 'WebDriver/CDP + headless ou prototype lies',
      delta: extra,
    });
  }

  if (allFindings.filter((f) => f.severity === 'high' || f.severity === 'critical').length >= 3) {
    tags.add('BAD_FP');
  }

  totalDelta += correlationDelta * modeFactor;
  const score = clamp(Math.round(100 + totalDelta), 0, 100);
  const grade = gradeForScore(score);
  const avgConfidence = confCount ? Math.round((confSum / confCount) * 100) / 100 : 1;

  allFindings.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.weightedDelta - b.weightedDelta;
  });

  return {
    score,
    grade,
    tags: [...tags],
    clusters,
    mode,
    modeFactor,
    avgConfidence,
    totalDelta: Math.round(totalDelta * 100) / 100,
    correlationDelta: Math.round(correlationDelta * modeFactor * 100) / 100,
    findings: allFindings,
    categoryScores,
    moduleResults,
    timestamp: new Date().toISOString(),
  };
}
