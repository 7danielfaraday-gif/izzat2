/** window.chrome, plugins, mimeTypes ??" headless e spoof fraco */

import { finding, finalizeResult, parseUserAgent, safe } from '../utils.js?v5';

export async function run() {
  const findings = [];
  const ua = parseUserAgent();
  const chrome = safe(() => window.chrome);
  const plugins = safe(() => {
    const list = [];
    for (let i = 0; i < navigator.plugins.length; i++) {
      const p = navigator.plugins[i];
      list.push({ name: p.name, filename: p.filename, description: p.description });
    }
    return list;
  }) || [];
  const mimeTypes = safe(() => {
    const list = [];
    for (let i = 0; i < navigator.mimeTypes.length; i++) {
      const m = navigator.mimeTypes[i];
      list.push({ type: m.type, description: m.description, suffixes: m.suffixes });
    }
    return list;
  }) || [];

  const raw = {
    hasChrome: !!chrome,
    chromeKeys: chrome ? safe(() => Object.keys(chrome)) || [] : [],
    plugins,
    pluginsLength: plugins.length,
    mimeTypes,
    mimeTypesLength: mimeTypes.length,
    pdfViewerEnabled: navigator.pdfViewerEnabled,
  };

  // Chromium should have window.chrome (except some privacy browsers)
  if (ua.isChromium) {
    if (!chrome) {
      findings.push(
        finding(
          'chrome-missing',
          'high',
          'window.chrome ausente',
          'Chromium real expõe window.chrome. Headless/spoof costuma omitir ou fabricar.',
          -14,
          ['FP_RUIM', 'SEM_INTERFACE']
        )
      );
    } else {
      // chrome.runtime exists in extensions; in pages it's often undefined but chrome object exists
      const hasLoadTimes = typeof chrome.loadTimes === 'function';
      const hasCsi = typeof chrome.csi === 'function';
      raw.hasLoadTimes = hasLoadTimes;
      raw.hasCsi = hasCsi;
      // Empty chrome object {} is a common stealth fake
      if (raw.chromeKeys.length === 0) {
        findings.push(
          finding(
            'chrome-empty',
            'high',
            'window.chrome vazio',
            'Objeto chrome sem propriedades ??" spoof comum de stealth plugins.',
            -16,
            ['ANTIDETECT_PROVAVEL', 'FP_RUIM']
          )
        );
      }
    }

    // Plugins: modern Chrome may have 0-5 plugins; headless often 0 with empty mimeTypes
    if (plugins.length === 0 && mimeTypes.length === 0) {
      findings.push(
        finding(
          'chrome-no-plugins',
          'medium',
          'plugins e mimeTypes vazios',
          'Headless Chrome clássico. Chrome recente também pode ter lista vazia ??" peso médio.',
          -6,
          ['SEM_INTERFACE']
        )
      );
    }

    // Spoofed plugins: identical fake PluginArray with only "Chrome PDF Plugin" names but wrong structure
    if (plugins.length > 0) {
      const names = plugins.map((p) => p.name).join('|');
      const looksFake =
        plugins.every((p) => !p.filename) ||
        (plugins.length === 3 &&
          /Chrome PDF Plugin|Chrome PDF Viewer|Native Client/i.test(names) &&
          plugins.every((p) => p.description === '' || p.filename === ''));
      // Check PluginArray methods native
      const refreshNative = safe(() =>
        /\[native code\]/.test(Function.prototype.toString.call(navigator.plugins.refresh))
      );
      raw.pluginsRefreshNative = refreshNative;
      if (refreshNative === false) {
        findings.push(
          finding(
            'chrome-plugins-spoof',
            'high',
            'navigator.plugins.refresh não nativo',
            'PluginArray fabricado por antidetect.',
            -15,
            ['API_FALSIFICADA', 'ANTIDETECT_PROVAVEL']
          )
        );
      }
      // Duplicate plugin names
      const nameSet = new Set(plugins.map((p) => p.name));
      if (nameSet.size < plugins.length) {
        findings.push(
          finding(
            'chrome-plugins-dup',
            'medium',
            'Plugins com nomes duplicados',
            names,
            -8,
            ['FP_RUIM']
          )
        );
      }
      if (looksFake) {
        findings.push(
          finding(
            'chrome-plugins-structure',
            'low',
            'Estrutura de plugins suspeita',
            'Lista de plugins com campos vazios/incompletos.',
            -4,
            ['FP_RUIM']
          )
        );
      }
    }
  }

  // Firefox shouldn't have window.chrome typically
  if (ua.isFirefox && chrome) {
    findings.push(
      finding(
        'chrome-on-firefox',
        'medium',
        'window.chrome presente no Firefox',
        'Incomum ??" possível spoof de UA ou polyfill.',
        -8,
        ['FP_RUIM']
      )
    );
  }

  return finalizeResult('chrome-runtime', 'Chrome & Plugins', findings, raw);
}
