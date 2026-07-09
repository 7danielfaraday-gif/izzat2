/** Storage quota + JS heap - containers/headless anomalias */

import { finding, finalizeResult, parseUserAgent, withTimeout } from '../utils.js?v3';

export async function run() {
  const findings = [];
  const ua = parseUserAgent();
  const raw = {
    memory: null,
    storage: null,
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  };

  if (performance.memory) {
    raw.memory = {
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      usedJSHeapSize: performance.memory.usedJSHeapSize,
    };
    // Absurd tiny heap limit on "desktop"
    if (!ua.isMobile && raw.memory.jsHeapSizeLimit > 0 && raw.memory.jsHeapSizeLimit < 50 * 1024 * 1024) {
      findings.push(
        finding(
          'heap-tiny',
          'medium',
          'jsHeapSizeLimit muito baixo',
          String(raw.memory.jsHeapSizeLimit),
          -8,
          ['HEADLESS', 'BAD_FP'],
          0.75
        )
      );
    }
  }

  if (navigator.storage?.estimate) {
    try {
      const est = await withTimeout(navigator.storage.estimate(), 2000, null);
      if (est) {
        raw.storage = {
          quota: est.quota,
          usage: est.usage,
          quotaGB: est.quota != null ? +(est.quota / 1e9).toFixed(3) : null,
        };
        // Extremely low quota on desktop Chromium is odd
        if (!ua.isMobile && est.quota != null && est.quota < 50 * 1024 * 1024) {
          findings.push(
            finding(
              'storage-quota-low',
              'medium',
              'Quota de storage muito baixa',
              `${raw.storage.quotaGB} GB`,
              -7,
              ['HEADLESS'],
              0.7
            )
          );
        }
        // deviceMemory tiny but huge quota or reverse - soft
        if (navigator.deviceMemory != null && navigator.deviceMemory <= 0.5 && est.quota > 50e9) {
          findings.push(
            finding(
              'storage-vs-memory',
              'low',
              'deviceMemory baixo com quota enorme',
              `mem=${navigator.deviceMemory} quotaGB=${raw.storage.quotaGB}`,
              -3,
              ['BAD_FP'],
              0.55
            )
          );
        }
      }
    } catch (e) {
      raw.storageError = String(e.message || e);
    }
  }

  // IndexedDB presence
  raw.indexedDB = !!window.indexedDB;
  raw.localStorage = safeLocal();
  if (!raw.localStorage && !ua.isMobile) {
    findings.push(
      finding('storage-no-ls', 'low', 'localStorage indisponivel', '', -2, [], 0.5)
    );
  }

  return finalizeResult('storage-heap', 'Storage & Heap', findings, raw);
}

function safeLocal() {
  try {
    const k = '__ig_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
