/** Formatacao de relatorio e export v2 */

export function buildSummaryText(result) {
  const lines = [
    '=== Browser Integrity Guard v2 ===',
    `Score: ${result.score}/100`,
    `Grade: ${result.grade.label} (${result.grade.id})`,
    `Mode: ${result.mode || 'strict'} (x${result.modeFactor || 1})`,
    `Avg confidence: ${result.avgConfidence ?? '-'}`,
    `Correlation delta: ${result.correlationDelta ?? 0}`,
    `Tags: ${result.tags.length ? result.tags.join(', ') : 'nenhuma'}`,
    `Findings: ${result.findings.length}`,
    `Timestamp: ${result.timestamp}`,
    '',
  ];

  if (result.clusters?.length) {
    lines.push('--- Clusters ---');
    for (const c of result.clusters) {
      lines.push(`[${c.id}] ${c.label} (${c.delta}) - ${c.detail || ''}`);
    }
    lines.push('');
  }

  if (result.findings.length) {
    lines.push('--- Findings ---');
    for (const f of result.findings) {
      const conf = f.confidence != null ? ` conf=${Math.round(f.confidence * 100)}%` : '';
      const d = f.weightedDelta != null ? f.weightedDelta : f.delta;
      lines.push(
        `[${(f.severity || '').toUpperCase()}] ${f.title} (${d}${conf}) - ${f.detail}`
      );
    }
  } else {
    lines.push('Nenhum finding. Fingerprint aparenta coerente.');
  }

  return lines.join('\n');
}

export function exportJSON(result) {
  return JSON.stringify(
    {
      score: result.score,
      grade: result.grade,
      mode: result.mode,
      modeFactor: result.modeFactor,
      avgConfidence: result.avgConfidence,
      correlationDelta: result.correlationDelta,
      tags: result.tags,
      clusters: result.clusters,
      totalDelta: result.totalDelta,
      timestamp: result.timestamp,
      findings: result.findings,
      categoryScores: result.categoryScores,
      modules: result.moduleResults.map((m) => ({
        id: m.id,
        label: m.label,
        scoreDelta: m.scoreDelta,
        status: m.status,
        findings: m.findings,
        raw: m.raw,
      })),
    },
    null,
    2
  );
}

export function severityLabel(sev) {
  const map = {
    critical: 'Critico',
    high: 'Alto',
    medium: 'Medio',
    low: 'Baixo',
    info: 'Info',
  };
  return map[sev] || sev;
}
