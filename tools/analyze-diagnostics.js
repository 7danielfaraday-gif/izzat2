#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const analyzer = require('../assets/js/diagnostics-analyzer.js');

function usage() {
  console.error('Uso: node tools/analyze-diagnostics.js <arquivo-json> [--no-write]');
  process.exit(2);
}

const file = process.argv[2];
if (!file || file === '-h' || file === '--help') usage();

const shouldWrite = !process.argv.includes('--no-write');
const inputPath = path.resolve(file);

let payload;
try {
  payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (error) {
  console.error('Falha ao ler JSON:', error.message);
  process.exit(1);
}

const analysis = analyzer.analyzeDiagnostics(payload);
const summary = analysis.summary;
const critical = analysis.sessions.filter((session) => session.analysis.severity === 'critical');
const warnings = analysis.sessions.filter((session) => session.analysis.severity === 'warning');
const crawlers = analysis.sessions.filter((session) => session.analysis.severity === 'noise');

function line(text = '') {
  process.stdout.write(text + '\n');
}

function fmtSession(session) {
  const ctx = session.ctx || {};
  const reasons = (session.analysis.reasons || []).join(' / ');
  return [
    session.id,
    session.analysis.label,
    `${ctx.platform || '-'} / ${ctx.browser_family || '-'}`,
    `${session.count} eventos`,
    reasons,
  ].filter(Boolean).join(' | ');
}

line('DIAGNOSTICO IZZAT');
line('Arquivo: ' + inputPath);
line('Veredito: ' + analysis.verdict.label + ' - ' + analysis.verdict.text);
line('Eventos: ' + summary.total_events);
line('Sessoes: ' + summary.unique_sessions);
line('OK: ' + summary.ok_sessions + ' | Alertas: ' + summary.warning_sessions + ' | Criticas: ' + summary.critical_sessions + ' | Crawler/HTML-only: ' + crawlers.length);
line('JS errors: ' + summary.js_errors + ' | API errors: ' + summary.api_errors + ' | Tracking terceiro: ' + summary.third_party_tracking_warnings);
line('');

if (critical.length) {
  line('SESSOES CRITICAS');
  critical.forEach((session) => line('- ' + fmtSession(session)));
  line('');
}

if (warnings.length) {
  line('SESSOES COM ALERTA');
  warnings.forEach((session) => line('- ' + fmtSession(session)));
  line('');
}

if (!critical.length && !warnings.length) {
  line('Nenhuma sessao critica ou com alerta acionavel.');
  line('');
}

line('RESUMO POR EVENTO');
Object.keys(summary.counts).sort().forEach((name) => {
  line('- ' + name + ': ' + summary.counts[name]);
});

if (shouldWrite) {
  const outPath = inputPath.replace(/\.json$/i, '') + '.analysis.json';
  fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2));
  line('');
  line('Analise salva em: ' + outPath);
}
