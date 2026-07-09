/** Timing / precisao de performance + drift Date vs performance */

import { finding, finalizeResult } from '../utils.js?v5';

function measureNowPrecision() {
  const samples = [];
  let last = performance.now();
  for (let i = 0; i < 80; i++) {
    const n = performance.now();
    samples.push(n - last);
    last = n;
  }
  const nonzero = samples.filter((s) => s > 0);
  const minStep = nonzero.length ? Math.min(...nonzero) : 0;
  return {
    samples: samples.slice(0, 10),
    minStep,
    zeroRatio: samples.filter((s) => s === 0).length / samples.length,
  };
}

function measureDateDrift() {
  const pairs = [];
  for (let i = 0; i < 20; i++) {
    const p0 = performance.now();
    const d0 = Date.now();
    let x = 0;
    for (let j = 0; j < 5000; j++) x += j;
    const p1 = performance.now();
    const d1 = Date.now();
    pairs.push({ dp: p1 - p0, dd: d1 - d0, sink: x });
  }
  const ratios = pairs.filter((p) => p.dp > 0.5).map((p) => p.dd / p.dp);
  const avg = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
  return { pairs: pairs.slice(0, 5), avgRatio: avg };
}

export async function run() {
  const findings = [];
  const prec = measureNowPrecision();
  const drift = measureDateDrift();

  const raw = {
    minStep: prec.minStep,
    zeroRatio: prec.zeroRatio,
    timeOrigin: performance.timeOrigin,
    now: performance.now(),
    dateNow: Date.now(),
    driftAvgRatio: drift.avgRatio,
    crossOriginIsolated: globalThis.crossOriginIsolated || false,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  };

  if (prec.minStep >= 100) {
    findings.push(
      finding(
        'timing-coarse',
        'info',
        'Timers grosseiros (privacidade)',
        `minStep~${prec.minStep}ms - comum em resistFingerprinting`,
        0,
        ['PRIVACIDADE'],
        0.9
      )
    );
  } else if (prec.minStep >= 2 && prec.minStep < 100) {
    findings.push(
      finding(
        'timing-reduced',
        'info',
        'Precisao de timer reduzida',
        `minStep~${prec.minStep}ms`,
        0,
        ['PRIVACIDADE'],
        0.7
      )
    );
  }

  if (prec.zeroRatio === 1) {
    findings.push(
      finding(
        'timing-frozen',
        'medium',
        'performance.now congelado',
        'Ambiente anomalo ou mock de timer',
        -8,
        ['FP_RUIM'],
        0.85
      )
    );
  }

  // Date.now and performance.now should advance ~together (ratio ~1)
  if (drift.avgRatio > 0 && (drift.avgRatio < 0.2 || drift.avgRatio > 5)) {
    findings.push(
      finding(
        'timing-date-drift',
        'medium',
        'Drift Date.now vs performance.now',
        `ratio medio=${drift.avgRatio.toFixed(3)}`,
        -7,
        ['FP_RUIM'],
        0.7
      )
    );
  }

  // Artificial clamping to exact 100ms multiples only
  if (prec.minStep >= 99 && prec.minStep <= 101 && prec.zeroRatio > 0.5) {
    findings.push(
      finding(
        'timing-clamped-100',
        'low',
        'Timer clamped ~100ms',
        'Padrao de privacy.resistFingerprinting',
        -2,
        ['PRIVACIDADE'],
        0.8
      )
    );
  }

  return finalizeResult('timing', 'Timing', findings, raw);
}
