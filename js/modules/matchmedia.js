/** matchMedia vs screen/inner/DPR - antidetect costuma spoofar screen e esquecer CSS MQ */

import { finding, finalizeResult, parseUserAgent, safe } from '../utils.js?v5';

function mq(q) {
  try {
    return window.matchMedia(q);
  } catch {
    return null;
  }
}

export async function run() {
  const findings = [];
  const ua = parseUserAgent();
  const dpr = devicePixelRatio || 1;
  const sw = screen.width;
  const sh = screen.height;
  const iw = innerWidth;
  const ih = innerHeight;

  const tests = {
    screenExactW: mq(`(device-width: ${sw}px)`),
    screenExactH: mq(`(device-height: ${sh}px)`),
    screenMinW: mq(`(min-device-width: ${sw}px)`),
    screenMaxW: mq(`(max-device-width: ${sw}px)`),
    innerMaxW: mq(`(max-width: ${iw}px)`),
    innerMinW: mq(`(min-width: ${Math.max(0, iw - 1)}px)`),
    dprExact: mq(`(resolution: ${dpr}dppx)`),
    dprRange: mq(
      `(min-resolution: ${Math.max(0.25, dpr - 0.2)}dppx) and (max-resolution: ${dpr + 0.2}dppx)`
    ),
    aspect: mq(`(device-aspect-ratio: ${sw}/${sh})`),
    color: mq(`(color: ${Math.round((screen.colorDepth || 24) / 3)})`),
    pointerFine: mq('(pointer: fine)'),
    pointerCoarse: mq('(pointer: coarse)'),
    anyPointerFine: mq('(any-pointer: fine)'),
    anyPointerCoarse: mq('(any-pointer: coarse)'),
    hover: mq('(hover: hover)'),
    hoverNone: mq('(hover: none)'),
    reducedMotion: mq('(prefers-reduced-motion: reduce)'),
    colorGamutP3: mq('(color-gamut: p3)'),
    colorGamutSrgb: mq('(color-gamut: srgb)'),
  };

  const raw = {
    screen: `${sw}x${sh}`,
    inner: `${iw}x${ih}`,
    dpr,
    results: {},
  };

  for (const [k, m] of Object.entries(tests)) {
    raw.results[k] = m ? m.matches : null;
  }

  // device-width should match screen.width (allow small browser quirks)
  if (tests.screenExactW && tests.screenExactW.matches === false) {
    // try nearby values - some browsers are picky
    let near = false;
    for (const delta of [-1, 1, -2, 2]) {
      const m = mq(`(device-width: ${sw + delta}px)`);
      if (m?.matches) {
        near = true;
        break;
      }
    }
    if (!near) {
      findings.push(
        finding(
          'mm-screen-mismatch',
          'high',
          'matchMedia device-width != screen.width',
          `screen.width=${sw} mas (device-width: ${sw}px)=false - spoof de screen incompleto`,
          -14,
          ['SPOOF_TELA', 'FP_RUIM', 'ANTIDETECT_PROVAVEL'],
          0.9
        )
      );
    }
  }

  if (tests.dprRange && tests.dprRange.matches === false) {
    findings.push(
      finding(
        'mm-dpr-mismatch',
        'high',
        'matchMedia resolution != devicePixelRatio',
        `dpr=${dpr} nao confirmado por CSS resolution`,
        -12,
        ['SPOOF_TELA', 'FP_RUIM'],
        0.88
      )
    );
  }

  // Viewport: page width should generally match min-width near inner
  if (tests.innerMinW && tests.innerMinW.matches === false && iw > 100) {
    findings.push(
      finding(
        'mm-inner-mismatch',
        'medium',
        'matchMedia min-width != innerWidth',
        `innerWidth=${iw}`,
        -6,
        ['FP_RUIM'],
        0.7
      )
    );
  }

  // Touch/mouse consistency
  const touch = navigator.maxTouchPoints || 0;
  if (ua.isMobile) {
    if (raw.results.pointerFine && !raw.results.pointerCoarse && touch === 0) {
      findings.push(
        finding(
          'mm-mobile-desktop-pointer',
          'high',
          'Mobile UA + pointer fine sem touch',
          '',
          -15,
          ['FP_RUIM', 'ANTIDETECT_PROVAVEL'],
          0.92
        )
      );
    }
  } else if (!ua.isMobile && raw.results.hoverNone && raw.results.pointerCoarse && !raw.results.pointerFine) {
    findings.push(
      finding(
        'mm-desktop-touch-only',
        'low',
        'Desktop UA com perfil so-touch',
        'Pode ser tablet/hybrid - peso baixo',
        -3,
        [],
        0.5
      )
    );
  }

  // color-gamut p3 with low colorDepth is odd
  if (raw.results.colorGamutP3 && screen.colorDepth && screen.colorDepth < 24) {
    findings.push(
      finding(
        'mm-gamut-depth',
        'medium',
        'color-gamut p3 com colorDepth baixo',
        `colorDepth=${screen.colorDepth}`,
        -6,
        ['FP_RUIM'],
        0.75
      )
    );
  }

  return finalizeResult('matchmedia', 'MatchMedia CSS', findings, raw);
}
