/** Prototype lies ??" detecta getters sobrescritos / spoof incompleto (estilo CreepJS) */

import { finding, finalizeResult, getDescriptor, isNativeFunction, safe } from '../utils.js?v5';

const NAV_PROPS = [
  'userAgent',
  'platform',
  'hardwareConcurrency',
  'deviceMemory',
  'languages',
  'language',
  'webdriver',
  'vendor',
  'maxTouchPoints',
  'plugins',
  'mimeTypes',
];

const SCREEN_PROPS = ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth'];

function checkNativeToString(fn, name) {
  if (typeof fn !== 'function') return null;
  try {
    const s = Function.prototype.toString.call(fn);
    if (!/\[native code\]/.test(s)) {
      return { name, issue: 'not-native', sample: s.slice(0, 80) };
    }
    // Spoofers sometimes return fake native strings with wrong length/format
    if (s.length > 100 && !s.includes('[native code]')) {
      return { name, issue: 'suspicious-tostring', sample: s.slice(0, 80) };
    }
  } catch (e) {
    return { name, issue: 'tostring-threw', sample: String(e.message) };
  }
  return null;
}

function checkPropOnPrototype(proto, prop, protoName) {
  const issues = [];
  const desc = getDescriptor(proto, prop);
  if (!desc) {
    // Some props only on instance in older browsers ??" soft signal
    issues.push({ prop, proto: protoName, issue: 'missing-descriptor' });
    return issues;
  }
  if (desc.get) {
    const lie = checkNativeToString(desc.get, `${protoName}.${prop} getter`);
    if (lie) issues.push({ prop, proto: protoName, ...lie });
  }
  if (desc.value && typeof desc.value === 'function') {
    const lie = checkNativeToString(desc.value, `${protoName}.${prop}`);
    if (lie) issues.push({ prop, proto: protoName, ...lie });
  }
  // Own property on navigator instance shadowing prototype is common spoof technique
  return issues;
}

function checkInstanceOwnProps() {
  const own = [];
  try {
    const names = Object.getOwnPropertyNames(navigator);
    for (const n of names) {
      if (NAV_PROPS.includes(n) || /userAgent|platform|hardware|webdriver|language/i.test(n)) {
        own.push(n);
      }
    }
  } catch {
    /* ignore */
  }
  return own;
}

function iframeNavigatorSnapshot() {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    iframe.setAttribute('sandbox', 'allow-same-origin');
    document.body.appendChild(iframe);
    const iw = iframe.contentWindow;
    const nav = iw?.navigator;
    const snap = nav
      ? {
          userAgent: nav.userAgent,
          platform: nav.platform,
          hardwareConcurrency: nav.hardwareConcurrency,
          language: nav.language,
          webdriver: nav.webdriver,
          vendor: nav.vendor,
        }
      : null;
    document.body.removeChild(iframe);
    return snap;
  } catch {
    return null;
  }
}

export async function run() {
  const findings = [];
  const raw = { lies: [], ownProps: [], iframe: null, mismatches: [] };

  // Prototype descriptor / native checks
  const proto = Navigator.prototype;
  for (const prop of NAV_PROPS) {
    const issues = checkPropOnPrototype(proto, prop, 'Navigator.prototype');
    raw.lies.push(...issues);
  }

  // Screen
  if (typeof Screen !== 'undefined') {
    for (const prop of SCREEN_PROPS) {
      raw.lies.push(...checkPropOnPrototype(Screen.prototype, prop, 'Screen.prototype'));
    }
  }

  // Common API methods that spoofers hook
  const apiChecks = [
    ['HTMLCanvasElement.prototype.toDataURL', safe(() => HTMLCanvasElement.prototype.toDataURL)],
    ['HTMLCanvasElement.prototype.toBlob', safe(() => HTMLCanvasElement.prototype.toBlob)],
    ['HTMLCanvasElement.prototype.getContext', safe(() => HTMLCanvasElement.prototype.getContext)],
    ['CanvasRenderingContext2D.prototype.getImageData', safe(() => CanvasRenderingContext2D?.prototype?.getImageData)],
    ['CanvasRenderingContext2D.prototype.measureText', safe(() => CanvasRenderingContext2D?.prototype?.measureText)],
    ['WebGLRenderingContext.prototype.getParameter', safe(() => WebGLRenderingContext?.prototype?.getParameter)],
    ['WebGLRenderingContext.prototype.readPixels', safe(() => WebGLRenderingContext?.prototype?.readPixels)],
    ['AudioBuffer.prototype.getChannelData', safe(() => AudioBuffer?.prototype?.getChannelData)],
    ['Navigator.prototype.getBattery', safe(() => Navigator.prototype.getBattery)],
    ['Navigator.prototype.permissions', safe(() => {
      const d = Object.getOwnPropertyDescriptor(Navigator.prototype, 'permissions');
      return d && d.get;
    })],
    ['RTCPeerConnection', safe(() => window.RTCPeerConnection)],
    ['OffscreenCanvas.prototype.getContext', safe(() => OffscreenCanvas?.prototype?.getContext)],
    ['window.matchMedia', safe(() => window.matchMedia)],
    ['window.getComputedStyle', safe(() => window.getComputedStyle)],
  ];
  for (const [name, fn] of apiChecks) {
    if (fn) {
      const lie = checkNativeToString(fn, name);
      if (lie) raw.lies.push(lie);
    }
  }

  // Proxy detection: navigator instanceof or invariant broken
  raw.proxyHints = [];
  try {
    const n = navigator;
    if (typeof Proxy !== 'undefined') {
      // Calling Reflect on navigator props
      const ua1 = Reflect.get(n, 'userAgent');
      const ua2 = n.userAgent;
      if (ua1 !== ua2) raw.proxyHints.push('reflect-userAgent');
    }
    // Illegal constructor patterns
    try {
      // eslint-disable-next-line no-new
      new (n.constructor)();
    } catch {
      /* expected */
    }
  } catch (e) {
    raw.proxyHints.push(String(e.message || e));
  }

  const realLies = raw.lies.filter((l) => l.issue === 'not-native' || l.issue === 'tostring-threw' || l.issue === 'suspicious-tostring');
  if (realLies.length) {
    findings.push(
      finding(
        'proto-lies',
        'high',
        'Prototype lies (APIs não nativas)',
        `${realLies.length} função(ões) com toString não-nativo: ${realLies
          .slice(0, 5)
          .map((l) => l.name || l.prop)
          .join(', ')}`,
        -Math.min(20, 8 + realLies.length * 2),
        ['API_FALSIFICADA', 'ANTIDETECT_PROVAVEL']
      )
    );
  }

  // Own props on navigator (spoof often defines own getters)
  raw.ownProps = checkInstanceOwnProps();
  if (raw.ownProps.length >= 3) {
    findings.push(
      finding(
        'proto-own-nav',
        'high',
        'Propriedades próprias em navigator',
        `navigator tem own properties suspeitas: ${raw.ownProps.join(', ')}. Antidetect costuma redefinir getters no objeto.`,
        -15,
        ['API_FALSIFICADA']
      )
    );
  } else if (raw.ownProps.length > 0) {
    findings.push(
      finding(
        'proto-own-nav-soft',
        'low',
        'Own property em navigator',
        raw.ownProps.join(', '),
        -3,
        ['API_FALSIFICADA']
      )
    );
  }

  // iframe vs main
  const iframeNav = iframeNavigatorSnapshot();
  raw.iframe = iframeNav;
  if (iframeNav) {
    const pairs = [
      ['userAgent', navigator.userAgent, iframeNav.userAgent],
      ['platform', navigator.platform, iframeNav.platform],
      ['hardwareConcurrency', navigator.hardwareConcurrency, iframeNav.hardwareConcurrency],
      ['language', navigator.language, iframeNav.language],
      ['webdriver', navigator.webdriver, iframeNav.webdriver],
      ['vendor', navigator.vendor, iframeNav.vendor],
    ];
    for (const [key, main, iframe] of pairs) {
      if (main !== iframe && iframe !== undefined) {
        raw.mismatches.push({ key, main, iframe });
      }
    }
    if (raw.mismatches.length) {
      findings.push(
        finding(
          'proto-iframe-mismatch',
          'critical',
          'navigator main ??? iframe',
          `Diferenças: ${raw.mismatches.map((m) => m.key).join(', ')}. Spoof aplicado só na janela principal.`,
          -25,
          ['API_FALSIFICADA', 'ANTIDETECT_PROVAVEL', 'FP_RUIM']
        )
      );
    }
  }

  // Function.prototype.toString itself patched?
  if (!isNativeFunction(Function.prototype.toString)) {
    findings.push(
      finding(
        'proto-tostring-patched',
        'critical',
        'Function.prototype.toString patchado',
        'Tecnica classica de antidetect para esconder hooks.',
        -30,
        ['API_FALSIFICADA', 'ANTIDETECT_PROVAVEL'],
        0.98
      )
    );
  }

  // srcdoc iframe extra context
  try {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px';
    f.srcdoc = '<!doctype html><body></body>';
    document.body.appendChild(f);
    const done = () => {
      try {
        const sn = f.contentWindow?.navigator;
        if (sn && sn.userAgent !== navigator.userAgent) {
          findings.push(
            finding(
              'proto-srcdoc-ua',
              'critical',
              'srcdoc iframe userAgent diverge',
              `${sn.userAgent?.slice(0, 40)}...`,
              -24,
              ['API_FALSIFICADA', 'ANTIDETECT_PROVAVEL'],
              0.93
            )
          );
        }
        if (sn && sn.platform !== navigator.platform) {
          findings.push(
            finding(
              'proto-srcdoc-platform',
              'critical',
              'srcdoc iframe platform diverge',
              `${sn.platform} vs ${navigator.platform}`,
              -24,
              ['API_FALSIFICADA', 'ANTIDETECT_PROVAVEL'],
              0.93
            )
          );
        }
      } finally {
        document.body.removeChild(f);
      }
    };
    if (f.contentDocument?.readyState === 'complete') done();
    else {
      await new Promise((r) => {
        f.onload = () => {
          done();
          r();
        };
        setTimeout(() => {
          done();
          r();
        }, 400);
      });
    }
  } catch {
    /* ignore */
  }

  return finalizeResult('prototype-lies', 'Prototype Lies', findings, raw);
}
