/** Multi-iframe lab: main vs blank vs srcdoc vs sandboxed */

import { finding, finalizeResult, safe } from '../utils.js?v5';

function navSnap(nav) {
  if (!nav) return null;
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    language: nav.language,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    webdriver: nav.webdriver,
    vendor: nav.vendor,
    maxTouchPoints: nav.maxTouchPoints,
  };
}

function makeFrame(attrs = {}) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px;visibility:hidden';
  Object.entries(attrs).forEach(([k, v]) => iframe.setAttribute(k, v));
  return iframe;
}

function snapFromIframe(iframe) {
  try {
    return navSnap(iframe.contentWindow?.navigator);
  } catch {
    return { error: 'blocked' };
  }
}

function screenSnap(win) {
  try {
    const s = win.screen;
    return {
      width: s.width,
      height: s.height,
      availWidth: s.availWidth,
      devicePixelRatio: win.devicePixelRatio,
      innerWidth: win.innerWidth,
      webdriver: win.navigator?.webdriver,
    };
  } catch {
    return null;
  }
}

export async function run() {
  const findings = [];
  const main = navSnap(navigator);
  const mainScreen = screenSnap(window);
  const raw = { main, frames: {} };

  // 1) about:blank sandbox allow-same-origin
  const f1 = makeFrame({ sandbox: 'allow-same-origin' });
  document.body.appendChild(f1);
  raw.frames.blankSandbox = snapFromIframe(f1);
  raw.frames.blankSandboxScreen = screenSnap(f1.contentWindow);
  document.body.removeChild(f1);

  // 2) srcdoc
  const f2 = makeFrame();
  f2.srcdoc = '<!doctype html><title>x</title><body></body>';
  document.body.appendChild(f2);
  await new Promise((r) => {
    f2.onload = r;
    setTimeout(r, 300);
  });
  raw.frames.srcdoc = snapFromIframe(f2);
  raw.frames.srcdocScreen = screenSnap(f2.contentWindow);
  document.body.removeChild(f2);

  // 3) nested-looking: empty src
  const f3 = makeFrame();
  document.body.appendChild(f3);
  raw.frames.empty = snapFromIframe(f3);
  document.body.removeChild(f3);

  const mismatches = [];
  const keys = ['userAgent', 'platform', 'hardwareConcurrency', 'language', 'webdriver', 'vendor', 'deviceMemory'];

  for (const [name, snap] of Object.entries(raw.frames)) {
    if (!snap || snap.error || name.endsWith('Screen')) continue;
    for (const k of keys) {
      if (snap[k] !== undefined && main[k] !== undefined && String(snap[k]) !== String(main[k])) {
        mismatches.push({ frame: name, key: k, main: main[k], frameVal: snap[k] });
      }
    }
  }

  raw.mismatches = mismatches;

  if (mismatches.length >= 2) {
    findings.push(
      finding(
        'iframe-multi-mismatch',
        'critical',
        'navigator diverge entre iframes e main',
        mismatches
          .slice(0, 6)
          .map((m) => `${m.frame}.${m.key}`)
          .join(', '),
        -26,
        ['API_FALSIFICADA', 'ANTIDETECT_PROVAVEL', 'FP_RUIM'],
        0.95
      )
    );
  } else if (mismatches.length === 1) {
    const m = mismatches[0];
    findings.push(
      finding(
        'iframe-mismatch',
        m.key === 'webdriver' || m.key === 'userAgent' ? 'critical' : 'high',
        `iframe != main: ${m.key}`,
        `${m.frame}: main=${m.main} iframe=${m.frameVal}`,
        m.key === 'webdriver' ? -24 : -16,
        ['API_FALSIFICADA', 'ANTIDETECT_PROVAVEL'],
        0.92
      )
    );
  }

  // screen spoof only on main
  for (const key of ['blankSandboxScreen', 'srcdocScreen']) {
    const s = raw.frames[key];
    if (!s || !mainScreen) continue;
    if (s.width !== mainScreen.width || s.height !== mainScreen.height) {
      findings.push(
        finding(
          'iframe-screen-mismatch',
          'critical',
          'screen diverge no iframe',
          `${key}: ${s.width}x${s.height} vs main ${mainScreen.width}x${mainScreen.height}`,
          -22,
          ['SPOOF_TELA', 'API_FALSIFICADA', 'ANTIDETECT_PROVAVEL'],
          0.93
        )
      );
    }
    if (s.devicePixelRatio !== mainScreen.devicePixelRatio) {
      findings.push(
        finding(
          'iframe-dpr-mismatch',
          'high',
          'devicePixelRatio diverge no iframe',
          `${key}: ${s.devicePixelRatio} vs ${mainScreen.devicePixelRatio}`,
          -14,
          ['SPOOF_TELA', 'API_FALSIFICADA'],
          0.9
        )
      );
    }
  }

  // chrome object in iframe
  try {
    const f = makeFrame({ sandbox: 'allow-same-origin' });
    document.body.appendChild(f);
    const hasChromeMain = !!safe(() => window.chrome);
    const hasChromeIframe = !!safe(() => f.contentWindow.chrome);
    raw.chromeMain = hasChromeMain;
    raw.chromeIframe = hasChromeIframe;
    if (hasChromeMain !== hasChromeIframe) {
      findings.push(
        finding(
          'iframe-chrome-obj',
          'high',
          'window.chrome diverge main/iframe',
          `main=${hasChromeMain} iframe=${hasChromeIframe}`,
          -14,
          ['API_FALSIFICADA', 'FP_RUIM'],
          0.88
        )
      );
    }
    document.body.removeChild(f);
  } catch {
    /* ignore */
  }

  return finalizeResult('iframe-lab', 'Iframe Lab', findings, raw);
}
