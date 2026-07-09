/** Detecção de fontes instaladas vs OS declarado */

import { finding, finalizeResult, parseUserAgent, platformOs } from '../utils.js?v2';

const FONT_SETS = {
  windows: [
    'Segoe UI',
    'Tahoma',
    'Calibri',
    'Cambria',
    'Consolas',
    'MS Sans Serif',
    'Microsoft YaHei',
  ],
  macos: [
    'Helvetica Neue',
    'SF Pro Text',
    'Menlo',
    'Avenir',
    'Geneva',
    'Lucida Grande',
    'Apple Color Emoji',
  ],
  linux: ['Ubuntu', 'DejaVu Sans', 'Liberation Sans', 'Noto Sans', 'FreeSans', 'Cantarell'],
  android: ['Roboto', 'Noto Sans', 'Droid Sans', 'Cutive Mono'],
  ios: ['San Francisco', 'Helvetica Neue', 'UIFont', 'Arial Rounded MT Bold'],
};

const BASE_FONTS = ['monospace', 'sans-serif', 'serif'];

function measureFont(fontFamily) {
  const span = document.createElement('span');
  span.style.cssText =
    'position:absolute;left:-9999px;top:-9999px;font-size:72px;visibility:hidden;white-space:nowrap;';
  span.style.fontFamily = fontFamily;
  span.textContent = 'mmmmmmmmmmlli@Ww0123456789';
  document.body.appendChild(span);
  const w = span.offsetWidth;
  const h = span.offsetHeight;
  document.body.removeChild(span);
  return { w, h };
}

function detectFonts(fontList) {
  const base = {};
  for (const b of BASE_FONTS) {
    base[b] = measureFont(b);
  }
  const detected = [];
  for (const font of fontList) {
    let found = false;
    for (const b of BASE_FONTS) {
      const m = measureFont(`'${font}', ${b}`);
      if (m.w !== base[b].w || m.h !== base[b].h) {
        found = true;
        break;
      }
    }
    if (found) detected.push(font);
  }
  return detected;
}

export async function run() {
  const findings = [];
  const ua = parseUserAgent();
  const platOs = platformOs();
  const os = ua.os !== 'unknown' ? ua.os : platOs;

  const allProbe = [
    ...new Set([
      ...FONT_SETS.windows,
      ...FONT_SETS.macos,
      ...FONT_SETS.linux,
      ...FONT_SETS.android,
      'Comic Sans MS',
      'Wingdings',
      'Papyrus',
    ]),
  ];

  const detected = detectFonts(allProbe);
  const raw = { os, platformOs: platOs, detected, counts: {} };

  for (const [name, list] of Object.entries(FONT_SETS)) {
    raw.counts[name] = list.filter((f) => detected.includes(f)).length;
  }

  const expected = FONT_SETS[os] || [];
  const expectedHits = expected.filter((f) => detected.includes(f)).length;
  raw.expectedHits = expectedHits;
  raw.expectedTotal = expected.length;

  // Mobile UA but desktop-only fonts dominate
  if ((os === 'ios' || os === 'android') && raw.counts.windows >= 3 && expectedHits === 0) {
    findings.push(
      finding(
        'fonts-mobile-windows',
        'high',
        'UA mobile com fontes Windows',
        `Detectadas: ${detected.filter((f) => FONT_SETS.windows.includes(f)).join(', ')}`,
        -16,
        ['BAD_FP', 'ANTIDETECT_LIKELY']
      )
    );
  }

  // Windows UA without any Windows fonts but many mac fonts
  if (os === 'windows' && raw.counts.windows === 0 && raw.counts.macos >= 2) {
    findings.push(
      finding(
        'fonts-win-mac',
        'high',
        'UA Windows com fontes macOS, sem fontes Windows',
        `mac hits=${raw.counts.macos}, win hits=0`,
        -15,
        ['BAD_FP']
      )
    );
  }

  // macOS UA with Wingdings/Segoe but no Mac fonts
  if (os === 'macos' && raw.counts.macos === 0 && raw.counts.windows >= 3) {
    findings.push(
      finding(
        'fonts-mac-win',
        'high',
        'UA macOS com fontes Windows dominantes',
        `win hits=${raw.counts.windows}, mac hits=0`,
        -15,
        ['BAD_FP']
      )
    );
  }

  // No fonts detected at all beyond base ??" privacy or headless
  if (detected.length === 0) {
    findings.push(
      finding(
        'fonts-none',
        'low',
        'Nenhuma fonte extra detectada',
        'Ambiente mínimo, headless ou bloqueio de medição.',
        -3,
        ['HEADLESS']
      )
    );
  }

  // Expected OS fonts mostly missing on desktop
  if ((os === 'windows' || os === 'macos') && expected.length && expectedHits === 0 && detected.length > 0) {
    findings.push(
      finding(
        'fonts-expected-missing',
        'medium',
        'Fontes do OS declarado ausentes',
        `OS=${os}, hits esperados=0, outras fontes=${detected.length}`,
        -9,
        ['BAD_FP']
      )
    );
  }

  return finalizeResult('fonts', 'Fontes', findings, raw);
}
