/** Math / JS engine fingerprint - UA mentindo engine */

import { finding, finalizeResult, hashString, parseUserAgent } from '../utils.js?v5';

function mathSnapshot() {
  const vals = [
    Math.tan(-1e300),
    Math.sin(Math.PI / 2) === 1,
    Math.cos(Math.PI) + 1,
    Math.exp(1),
    Math.log(Math.E),
    Math.sqrt(2),
    Math.pow(Math.PI, -100),
    Math.atan2(1e-310, 1e-310),
    Math.acos(0.5),
    Math.asin(0.5),
    0.1 + 0.2,
    Number.EPSILON,
    Number.MAX_SAFE_INTEGER,
    Math.hypot(1e308, 1e308),
    Math.fround(1.337),
    Math.imul(0xffffffff, 5),
    Math.clz32(1),
  ];
  return vals.map((v) => (typeof v === 'number' ? (Object.is(v, -0) ? '-0' : String(v)) : String(v)));
}

export async function run() {
  const findings = [];
  const ua = parseUserAgent();
  const snap = mathSnapshot();
  const hash = await hashString(snap.join('|'));

  // Chrome and Firefox differ slightly on some edge math; store hash
  const raw = {
    hash,
    sample: snap.slice(0, 8),
    browser: ua.browser,
    isChromium: ua.isChromium,
    isFirefox: ua.isFirefox,
    isSafari: ua.isSafari,
  };

  // 0.1+0.2 must be classic float
  if (snap[10] !== '0.30000000000000004' && snap[10] !== String(0.1 + 0.2)) {
    // if completely wrong, engine spoof / polyfill
    if (!String(0.1 + 0.2).startsWith('0.3')) {
      findings.push(
        finding(
          'math-float-broken',
          'high',
          'Aritmetica float anomala',
          `0.1+0.2=${snap[10]}`,
          -14,
          ['FP_RUIM'],
          0.85
        )
      );
    }
  }

  // MAX_SAFE_INTEGER
  if (Number.MAX_SAFE_INTEGER !== 9007199254740991) {
    findings.push(
      finding(
        'math-max-safe',
        'medium',
        'MAX_SAFE_INTEGER inesperado',
        String(Number.MAX_SAFE_INTEGER),
        -8,
        ['FP_RUIM'],
        0.9
      )
    );
  }

  // Engine vs UA: rough check - if Safari UA but Chrome-like Intl/Math environment is hard;
  // Check toString of native Math methods
  try {
    const s = Function.prototype.toString.call(Math.tan);
    if (!/\[native code\]/.test(s)) {
      findings.push(
        finding(
          'math-tan-hooked',
          'high',
          'Math.tan nao nativo',
          s.slice(0, 60),
          -16,
          ['API_FALSIFICADA', 'ANTIDETECT_PROVAVEL'],
          0.95
        )
      );
    }
  } catch {
    /* ignore */
  }

  // performance.now exists and Math random entropy light check
  const r1 = Math.random();
  const r2 = Math.random();
  if (r1 === r2 && r1 === 0) {
    findings.push(
      finding('math-random-zero', 'medium', 'Math.random suspeito', 'valores iguais/zero', -8, ['FP_RUIM'], 0.7)
    );
  }

  raw.note = 'Hash de quirks para correlacao; sozinho nao prova spoof';

  return finalizeResult('math-engine', 'Math Engine', findings, raw);
}
