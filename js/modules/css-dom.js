/** CSS computed styles + document.fonts */

import { finding, finalizeResult, parseUserAgent, platformOs, safe } from '../utils.js?v3';

export async function run() {
  const findings = [];
  const ua = parseUserAgent();
  const os = ua.os !== 'unknown' ? ua.os : platformOs();

  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;left:-9999px;top:0;font-family:system-ui,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;font-size:16px;';
  el.textContent = 'CssDomProbe Wwmm';
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const raw = {
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight,
    os,
    fontsReady: null,
    fontCount: null,
  };

  // document.fonts
  if (document.fonts) {
    try {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
      raw.fontsReady = document.fonts.status;
      let n = 0;
      try {
        document.fonts.forEach(() => {
          n++;
        });
      } catch {
        /* ignore */
      }
      raw.fontCount = n;
    } catch (e) {
      raw.fontsError = String(e.message || e);
    }
  }

  // system-ui resolved font should relate to OS
  const ff = (raw.fontFamily || '').toLowerCase();
  if (os === 'windows' && /helvetica neue|san francisco|blinkmacsystemfont/.test(ff) && !/segoe|arial|system-ui/.test(ff)) {
    findings.push(
      finding(
        'css-font-os',
        'medium',
        'font-family computada nao parece Windows',
        raw.fontFamily,
        -8,
        ['BAD_FP'],
        0.7
      )
    );
  }
  if (os === 'macos' && /segoe ui|tahoma|ms shell dlg/.test(ff) && !/system-ui|helvetica|san francisco/.test(ff)) {
    findings.push(
      finding(
        'css-font-os-mac',
        'medium',
        'font-family computada parece Windows em macOS',
        raw.fontFamily,
        -8,
        ['BAD_FP'],
        0.7
      )
    );
  }

  // getComputedStyle native?
  const native = safe(() => /\[native code\]/.test(Function.prototype.toString.call(window.getComputedStyle)));
  if (native === false) {
    findings.push(
      finding(
        'css-gcs-hook',
        'high',
        'getComputedStyle nao nativo',
        '',
        -15,
        ['PROTOTYPE_LIE', 'ANTIDETECT_LIKELY'],
        0.95
      )
    );
  }

  document.body.removeChild(el);

  // Scrollbar width - headless sometimes 0 width always
  const sb = measureScrollbar();
  raw.scrollbarWidth = sb;
  if (sb === 0 && !ua.isMobile && outerWidth - innerWidth === 0 && outerHeight - innerHeight < 20) {
    // weak signal - many OS hide scrollbars
    findings.push(
      finding(
        'css-no-chrome-chrome',
        'info',
        'Sem chrome de janela aparente',
        'outer~inner e scrollbar 0 - pode ser kiosk/headless/fullscreen',
        0,
        ['HEADLESS'],
        0.4
      )
    );
  }

  return finalizeResult('css-dom', 'CSS & DOM', findings, raw);
}

function measureScrollbar() {
  const o = document.createElement('div');
  o.style.cssText = 'position:absolute;left:-9999px;width:100px;height:100px;overflow:scroll';
  document.body.appendChild(o);
  const w = o.offsetWidth - o.clientWidth;
  document.body.removeChild(o);
  return w;
}
