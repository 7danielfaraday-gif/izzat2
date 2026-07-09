/** Captura curta de comportamento (mouse/scroll/focus) - bots lineares / sem input */

import { finding, finalizeResult } from '../utils.js?v3';

const DEFAULT_MS = 3200;

/**
 * @param {{ durationMs?: number, skip?: boolean }} opts
 */
export async function run(opts = {}) {
  if (opts.skip) {
    return finalizeResult(
      'behavior',
      'Comportamento',
      [
        finding('behavior-skipped', 'info', 'Coleta de comportamento desligada', '', 0, [], 1),
      ],
      { skipped: true }
    );
  }

  const durationMs = opts.durationMs || DEFAULT_MS;
  const findings = [];

  const state = {
    moves: 0,
    clicks: 0,
    keys: 0,
    scrolls: 0,
    focuses: 0,
    samples: [],
    start: performance.now(),
    hasPointer: matchMedia('(pointer: fine)').matches || matchMedia('(any-pointer: fine)').matches,
  };

  const onMove = (e) => {
    state.moves++;
    if (state.samples.length < 40) {
      state.samples.push({
        t: performance.now() - state.start,
        x: e.clientX,
        y: e.clientY,
      });
    }
  };
  const onClick = () => {
    state.clicks++;
  };
  const onKey = () => {
    state.keys++;
  };
  const onScroll = () => {
    state.scrolls++;
  };
  const onFocus = () => {
    state.focuses++;
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('click', onClick, { passive: true });
  window.addEventListener('keydown', onKey, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('focus', onFocus, { passive: true });

  await new Promise((r) => setTimeout(r, durationMs));

  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('click', onClick);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('focus', onFocus);

  // Linearity: perfect constant velocity is bot-like
  let linearScore = 0;
  if (state.samples.length >= 8) {
    const dx = [];
    for (let i = 1; i < state.samples.length; i++) {
      const a = state.samples[i - 1];
      const b = state.samples[i];
      const dt = b.t - a.t || 1;
      dx.push({ vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt });
    }
    const avgVx = dx.reduce((s, v) => s + v.vx, 0) / dx.length;
    const avgVy = dx.reduce((s, v) => s + v.vy, 0) / dx.length;
    const varV =
      dx.reduce((s, v) => s + (v.vx - avgVx) ** 2 + (v.vy - avgVy) ** 2, 0) / dx.length;
    linearScore = varV;
    // very low variance with many moves = robotic
    if (state.moves > 15 && varV < 1e-6) {
      findings.push(
        finding(
          'behavior-linear',
          'high',
          'Movimento de mouse robotico (linear)',
          `var~${varV}`,
          -14,
          ['AUTOMATION', 'ANTIDETECT_LIKELY'],
          0.8
        )
      );
    }
  }

  const raw = {
    durationMs,
    moves: state.moves,
    clicks: state.clicks,
    keys: state.keys,
    scrolls: state.scrolls,
    focuses: state.focuses,
    sampleCount: state.samples.length,
    linearVar: linearScore,
    hasPointer: state.hasPointer,
    documentHasFocus: document.hasFocus(),
  };

  // No interaction at all during sample - weak if user just opened page
  if (state.moves === 0 && state.keys === 0 && state.scrolls === 0 && state.clicks === 0) {
    findings.push(
      finding(
        'behavior-idle',
        'low',
        'Nenhuma interacao no periodo de amostragem',
        `${durationMs}ms sem mouse/tecla/scroll - comum se so abriu a pagina`,
        -3,
        [],
        0.4
      )
    );
  }

  // Instant teleport samples (huge jumps each event with 0 intermediate) - bot
  if (state.samples.length >= 3) {
    let bigJumps = 0;
    for (let i = 1; i < state.samples.length; i++) {
      const a = state.samples[i - 1];
      const b = state.samples[i];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const dt = b.t - a.t;
      if (dist > 400 && dt < 8) bigJumps++;
    }
    if (bigJumps >= 3) {
      findings.push(
        finding(
          'behavior-teleport',
          'medium',
          'Saltos de cursor nao-humanos',
          `${bigJumps} jumps grandes em dt<8ms`,
          -9,
          ['AUTOMATION'],
          0.75
        )
      );
    }
  }

  return finalizeResult('behavior', 'Comportamento', findings, raw);
}
