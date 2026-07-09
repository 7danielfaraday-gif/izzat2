/** Worker vs main thread — mismatch forte indica spoof no window apenas */

import { finding, finalizeResult, withTimeout } from '../utils.js';

function spawnWorkerSnapshot() {
  return new Promise((resolve) => {
    const code = `
      self.onmessage = function() {
        var nav = self.navigator || {};
        self.postMessage({
          userAgent: nav.userAgent,
          platform: nav.platform,
          language: nav.language,
          languages: nav.languages ? Array.from(nav.languages) : [],
          hardwareConcurrency: nav.hardwareConcurrency,
          deviceMemory: nav.deviceMemory,
          webdriver: nav.webdriver,
          vendor: nav.vendor,
          userAgentData: nav.userAgentData ? {
            mobile: nav.userAgentData.mobile,
            platform: nav.userAgentData.platform,
            brands: nav.userAgentData.brands
          } : null
        });
      };
    `;
    let worker;
    try {
      const blob = new Blob([code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      worker = new Worker(url);
      URL.revokeObjectURL(url);
    } catch (e) {
      resolve({ error: String(e.message || e) });
      return;
    }

    const timer = setTimeout(() => {
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
      resolve({ error: 'timeout' });
    }, 3000);

    worker.onmessage = (ev) => {
      clearTimeout(timer);
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
      resolve(ev.data);
    };
    worker.onerror = (err) => {
      clearTimeout(timer);
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
      resolve({ error: String(err.message || 'worker error') });
    };
    worker.postMessage('go');
  });
}

export async function run() {
  const findings = [];
  const main = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: navigator.languages ? [...navigator.languages] : [],
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
    webdriver: navigator.webdriver,
    vendor: navigator.vendor,
  };

  const worker = await withTimeout(spawnWorkerSnapshot(), 4000, { error: 'timeout' });
  const raw = { main, worker, mismatches: [] };

  if (worker?.error) {
    findings.push(
      finding(
        'worker-unavailable',
        'info',
        'Worker indisponível',
        `Não foi possível comparar WorkerNavigator: ${worker.error}`,
        0,
        []
      )
    );
    return finalizeResult('workers', 'Workers', findings, raw, 'partial');
  }

  const keys = [
    'userAgent',
    'platform',
    'language',
    'hardwareConcurrency',
    'deviceMemory',
    'webdriver',
    'vendor',
  ];

  for (const k of keys) {
    const mv = main[k];
    const wv = worker[k];
    if (wv === undefined) continue;
    if (String(mv) !== String(wv)) {
      raw.mismatches.push({ key: k, main: mv, worker: wv });
    }
  }

  // languages array
  if (
    Array.isArray(worker.languages) &&
    Array.isArray(main.languages) &&
    main.languages.join('|') !== worker.languages.join('|')
  ) {
    raw.mismatches.push({
      key: 'languages',
      main: main.languages,
      worker: worker.languages,
    });
  }

  if (raw.mismatches.length >= 2) {
    findings.push(
      finding(
        'worker-multi-mismatch',
        'critical',
        'Worker ≠ Main em múltiplas propriedades',
        `Mismatch em: ${raw.mismatches.map((m) => m.key).join(', ')}. Spoof típico de antidetect incompleto.`,
        -28,
        ['WORKER_MISMATCH', 'ANTIDETECT_LIKELY', 'BAD_FP']
      )
    );
  } else if (raw.mismatches.length === 1) {
    const m = raw.mismatches[0];
    const sev = m.key === 'userAgent' || m.key === 'platform' || m.key === 'webdriver' ? 'critical' : 'high';
    findings.push(
      finding(
        'worker-mismatch',
        sev,
        `Worker ≠ Main: ${m.key}`,
        `main="${m.main}" worker="${m.worker}"`,
        sev === 'critical' ? -22 : -15,
        ['WORKER_MISMATCH', 'ANTIDETECT_LIKELY']
      )
    );
  }

  // webdriver true only on one side
  if (main.webdriver !== worker.webdriver && (main.webdriver === true || worker.webdriver === true)) {
    if (!raw.mismatches.some((x) => x.key === 'webdriver')) {
      findings.push(
        finding(
          'worker-webdriver-split',
          'critical',
          'webdriver divergente main/worker',
          `main=${main.webdriver} worker=${worker.webdriver}`,
          -25,
          ['WORKER_MISMATCH', 'AUTOMATION']
        )
      );
    }
  }

  return finalizeResult('workers', 'Workers', findings, raw);
}
