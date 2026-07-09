/** Motor de Trust Score 0??"100 */

import { clamp } from './utils.js?v2';

export const GRADES = [
  { min: 90, id: 'trusted', label: 'Trusted', description: 'Fingerprint coerente ??" navegador real' },
  { min: 70, id: 'low', label: 'Low Risk', description: 'Sinais menores ou proteções de privacidade' },
  { min: 45, id: 'suspicious', label: 'Suspicious', description: 'Inconsistências típicas de spoof fraco' },
  { min: 20, id: 'high', label: 'High Risk', description: 'Padrão antidetect / automação' },
  { min: 0, id: 'critical', label: 'Critical', description: 'Spoof óbvio, headless ou CDP exposto' },
];

export function gradeForScore(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g;
  }
  return GRADES[GRADES.length - 1];
}

/**
 * @param {Array<{id,label,findings,scoreDelta,raw,status}>} moduleResults
 */
export function computeScore(moduleResults) {
  let totalDelta = 0;
  const allFindings = [];
  const tags = new Set();
  const categoryScores = {};

  for (const mod of moduleResults) {
    const delta = mod.scoreDelta || 0;
    totalDelta += delta;
    for (const f of mod.findings || []) {
      allFindings.push({ ...f, module: mod.id, moduleLabel: mod.label });
      (f.tags || []).forEach((t) => tags.add(t));
    }
    // Category integrity 0??"100 per module
    const modPenalty = Math.abs(Math.min(0, delta));
    categoryScores[mod.id] = {
      label: mod.label,
      score: clamp(100 - modPenalty, 0, 100),
      delta,
      findingCount: (mod.findings || []).length,
      status: mod.status || 'ok',
    };
  }

  const score = clamp(100 + totalDelta, 0, 100);
  const grade = gradeForScore(score);

  // Derived tags
  if (allFindings.some((f) => (f.tags || []).includes('AUTOMATION'))) tags.add('AUTOMATION');
  if (allFindings.some((f) => (f.tags || []).includes('WORKER_MISMATCH'))) tags.add('WORKER_MISMATCH');
  if (allFindings.some((f) => (f.tags || []).includes('PROTOTYPE_LIE'))) tags.add('PROTOTYPE_LIE');
  if (allFindings.some((f) => (f.tags || []).includes('CANVAS_NOISE'))) tags.add('CANVAS_NOISE');
  if (allFindings.some((f) => f.severity === 'critical' || f.severity === 'high')) {
    if (tags.has('PROTOTYPE_LIE') || tags.has('WORKER_MISMATCH') || tags.has('CANVAS_NOISE')) {
      tags.add('ANTIDETECT_LIKELY');
    }
    if (allFindings.filter((f) => f.severity === 'high' || f.severity === 'critical').length >= 3) {
      tags.add('BAD_FP');
    }
  }

  allFindings.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.delta - b.delta;
  });

  return {
    score,
    grade,
    tags: [...tags],
    totalDelta,
    findings: allFindings,
    categoryScores,
    moduleResults,
    timestamp: new Date().toISOString(),
  };
}
