/** Timing / precisão de performance */

import { finding, finalizeResult } from '../utils.js?v2';

function measureNowPrecision() {
  const samples = [];
  let last = performance.now();
  for (let i = 0; i < 50; i++) {
    const n = performance.now();
    samples.push(n - last);
    last = n;
  }
  const nonzero = samples.filter((s) => s > 0);
  const minStep = nonzero.length ? Math.min(...nonzero) : 0;
  return { samples: samples.slice(0, 10), minStep, zeroRatio: samples.filter((s) => s === 0).length / samples.length };
}

export async function run() {
  const findings = [];
  const prec = measureNowPrecision();
  const timeOrigin = performance.timeOrigin;
  const now = performance.now();

  const raw = {
    minStep: prec.minStep,
    zeroRatio: prec.zeroRatio,
    timeOrigin,
    now,
    dateNow: Date.now(),
    // Cross-origin isolation / sab
    crossOriginIsolated: globalThis.crossOriginIsolated || false,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  };

  // Coarse timers (privacy) ??" Firefox resistFingerprinting rounds to 100ms etc.
  if (prec.minStep >= 100) {
    findings.push(
      finding(
        'timing-coarse',
        'info',
        'Timers grosseiros (privacidade)',
        `minStep??^${prec.minStep}ms ??" comum em resistFingerprinting.`,
        0,
        ['PRIVACY']
      )
    );
  } else if (prec.minStep >= 2 && prec.minStep < 100) {
    // Slightly reduced precision ??" low signal
    findings.push(
      finding(
        'timing-reduced',
        'info',
        'Precisão de timer reduzida',
        `minStep??^${prec.minStep}ms`,
        0,
        ['PRIVACY']
      )
    );
  }

  // performance.now not advancing at all
  if (prec.zeroRatio === 1) {
    findings.push(
      finding(
        'timing-frozen',
        'medium',
        'performance.now congelado',
        'Ambiente anômalo ou mock de timer.',
        -8,
        ['BAD_FP']
      )
    );
  }

  return finalizeResult('timing', 'Timing', findings, raw);
}
