/** Formatação de relatório e export */

export function buildSummaryText(result) {
  const lines = [
    '=== Browser Integrity Guard ===',
    `Score: ${result.score}/100`,
    `Grade: ${result.grade.label} (${result.grade.id})`,
    `Tags: ${result.tags.length ? result.tags.join(', ') : 'nenhuma'}`,
    `Findings: ${result.findings.length}`,
    `Timestamp: ${result.timestamp}`,
    '',
  ];

  if (result.findings.length) {
    lines.push('--- Findings ---');
    for (const f of result.findings) {
      lines.push(
        `[${(f.severity || '').toUpperCase()}] ${f.title} (${f.delta}) - ${f.detail}`
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
      tags: result.tags,
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
    critical: 'Crítico',
    high: 'Alto',
    medium: 'Médio',
    low: 'Baixo',
    info: 'Info',
  };
  return map[sev] || sev;
}
