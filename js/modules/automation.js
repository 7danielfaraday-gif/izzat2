/** Detecção de automação: WebDriver, CDP, Selenium, Puppeteer, Playwright */

import { finding, finalizeResult, safe } from '../utils.js?v3';

const KNOWN_GLOBAL_MARKERS = [
  '__webdriver_evaluate',
  '__selenium_evaluate',
  '__webdriver_script_function',
  '__webdriver_script_func',
  '__webdriver_script_fn',
  '__fxdriver_evaluate',
  '__driver_unwrapped',
  '__webdriver_unwrapped',
  '__driver_evaluate',
  '__selenium_unwrapped',
  '__fxdriver_unwrapped',
  '_Selenium_IDE_Recorder',
  '_selenium',
  'calledSelenium',
  '$cdc_asdjflasutopfhvcZLmcfl_',
  '$chrome_asyncScriptInfo',
  '__$webdriverAsyncExecutor',
  '__nightmare',
  '_phantom',
  'callPhantom',
  'domAutomation',
  'domAutomationController',
  '__puppeteer_evaluation_script__',
  '__playwright',
  '__pwInitScripts',
  '__PUPPETEER_WORLD',
  '__playwright_evaluation_script__',
  '_WEBDRIVER_ELEM_CACHE',
  'ChromeDriverw',
  '__lastWatirAlert',
  '__lastWatirConfirm',
  '__lastWatirPrompt',
  'webdriver_id',
  'domAutomationController',
];

function scanCdcProperties() {
  const hits = [];
  try {
    for (const key of Object.getOwnPropertyNames(window)) {
      if (/^\$?cdc_|__webdriver|__selenium|__fxdriver|__driver/i.test(key)) {
        hits.push(key);
      }
    }
    for (const key of Object.getOwnPropertyNames(document)) {
      if (/^\$?cdc_|__webdriver|__selenium/i.test(key)) {
        hits.push('document.' + key);
      }
    }
  } catch {
    /* ignore */
  }
  return hits;
}

function checkErrorStack() {
  try {
    null[0]();
  } catch (e) {
    const stack = String(e.stack || '');
    const patterns = [
      /puppeteer/i,
      /playwright/i,
      /selenium/i,
      /chromedriver/i,
      /webdriver/i,
      /phantomjs/i,
      /__puppeteer/i,
    ];
    for (const p of patterns) {
      if (p.test(stack)) return { hit: true, stack: stack.slice(0, 400) };
    }
    return { hit: false, stack: stack.slice(0, 200) };
  }
  return { hit: false };
}

export async function run() {
  const findings = [];
  const raw = {};

  // navigator.webdriver
  const wd = safe(() => navigator.webdriver);
  raw.webdriver = wd;
  if (wd === true) {
    findings.push(
      finding(
        'auto-webdriver',
        'critical',
        'navigator.webdriver = true',
        'O navegador anuncia controle por WebDriver (Selenium/CDP).',
        -35,
        ['AUTOMATION']
      )
    );
  }

  // documentElement attribute
  const wdAttr = safe(() => document.documentElement.getAttribute('webdriver'));
  raw.webdriverAttr = wdAttr;
  if (wdAttr != null) {
    findings.push(
      finding(
        'auto-webdriver-attr',
        'critical',
        'Atributo webdriver no HTML',
        `documentElement.webdriver="${wdAttr}"`,
        -30,
        ['AUTOMATION']
      )
    );
  }

  // Known globals (own property or defined value ??" evita false positive de herança)
  const presentGlobals = [];
  for (const name of KNOWN_GLOBAL_MARKERS) {
    const hit = safe(() => {
      if (Object.prototype.hasOwnProperty.call(window, name)) return true;
      try {
        return window[name] !== undefined && name in window;
      } catch {
        return false;
      }
    });
    if (hit) presentGlobals.push(name);
  }
  const cdcHits = scanCdcProperties();
  raw.globals = presentGlobals;
  raw.cdcProperties = cdcHits;

  const allMarkers = [...new Set([...presentGlobals, ...cdcHits])];
  if (allMarkers.length) {
    findings.push(
      finding(
        'auto-markers',
        'critical',
        'Marcadores de automação no window/document',
        `Detectado: ${allMarkers.slice(0, 8).join(', ')}${allMarkers.length > 8 ? '???' : ''}`,
        -40,
        ['AUTOMATION']
      )
    );
  }

  // document.$cdc style
  const docKeys = safe(() => Object.keys(document).filter((k) => /\$cdc|\$chrome_async/i.test(k))) || [];
  raw.documentKeys = docKeys;
  if (docKeys.length) {
    findings.push(
      finding(
        'auto-doc-cdc',
        'critical',
        'Propriedades CDP no document',
        docKeys.join(', '),
        -35,
        ['AUTOMATION']
      )
    );
  }

  // Stack heuristics
  const stackInfo = checkErrorStack();
  raw.errorStackHint = stackInfo;
  if (stackInfo.hit) {
    findings.push(
      finding(
        'auto-stack',
        'high',
        'Stack trace com ferramenta de automação',
        'Error stack menciona puppeteer/playwright/selenium/webdriver.',
        -18,
        ['AUTOMATION']
      )
    );
  }

  // Headless chrome UA
  const ua = navigator.userAgent || '';
  raw.uaHeadless = /HeadlessChrome/i.test(ua);
  if (raw.uaHeadless) {
    findings.push(
      finding(
        'auto-headless-ua',
        'critical',
        'User-Agent HeadlessChrome',
        'UA contém HeadlessChrome ??" navegador headless explícito.',
        -40,
        ['AUTOMATION', 'HEADLESS']
      )
    );
  }

  // Error.prepareStackTrace hooked
  raw.prepareStackTrace = typeof Error.prepareStackTrace;
  if (typeof Error.prepareStackTrace === 'function') {
    try {
      const s = Function.prototype.toString.call(Error.prepareStackTrace);
      if (!/\[native code\]/.test(s)) {
        findings.push(
          finding(
            'auto-prepare-stack',
            'medium',
            'Error.prepareStackTrace customizado',
            'Pode ser instrumentation/automacao',
            -6,
            ['AUTOMATION'],
            0.55
          )
        );
      }
    } catch {
      /* ignore */
    }
  }

  // navigator.webdriver on prototype vs instance
  try {
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
    raw.webdriverProto = desc ? { get: !!desc.get, value: desc.value } : null;
    if (desc && desc.get) {
      const viaProto = desc.get.call(navigator);
      raw.webdriverViaProto = viaProto;
      if (viaProto === true && wd !== true) {
        findings.push(
          finding(
            'auto-webdriver-proto-lie',
            'critical',
            'webdriver true no prototype, false no instance',
            'Spoof classico de stealth plugin',
            -30,
            ['AUTOMATION', 'PROTOTYPE_LIE', 'ANTIDETECT_LIKELY'],
            0.95
          )
        );
      }
    }
  } catch {
    /* ignore */
  }

  const cdpBind =
    safe(() => {
      const keys = Object.getOwnPropertyNames(window);
      return keys.filter((k) => /cdc_|\$chrome_async|__cdp/i.test(k));
    }) || [];
  raw.cdpBind = cdpBind;
  if (cdpBind.length && !allMarkers.length) {
    findings.push(
      finding(
        'auto-cdp-bind',
        'critical',
        'Residuos CDP no window',
        cdpBind.slice(0, 6).join(', '),
        -32,
        ['AUTOMATION'],
        0.9
      )
    );
  }

  return finalizeResult('automation', 'Automacao & CDP', findings, raw);
}
