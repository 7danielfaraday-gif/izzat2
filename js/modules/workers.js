/** Worker vs main thread ??" mismatch forte indica spoof no window apenas */

import { finding, finalizeResult, withTimeout } from '../utils.js?v5';

function spawnWorkerSnapshot() {
  return new Promise((resolve) => {
    const code = `
      self.onmessage = function() {
        var nav = self.navigator || {};
        var payload = {
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
          } : null,
          canvasHash: null
        };
        try {
          if (typeof OffscreenCanvas !== 'undefined') {
            var c = new OffscreenCanvas(64, 32);
            var ctx = c.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#f60';
              ctx.fillRect(0, 0, 40, 20);
              ctx.fillStyle = '#069';
              ctx.font = '12px Arial';
              ctx.fillText('WkrFp', 2, 16);
              if (c.convertToBlob) {
                c.convertToBlob().then(function(b) {
                  payload.canvasHash = 'blob:' + b.size + ':' + b.type;
                  self.postMessage(payload);
                }).catch(function() {
                  self.postMessage(payload);
                });
                return;
              }
            }
          }
        } catch (e) {
          payload.canvasError = String(e.message || e);
        }
        self.postMessage(payload);
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
        'Worker ??? Main em múltiplas propriedades',
        `Mismatch em: ${raw.mismatches.map((m) => m.key).join(', ')}. Spoof típico de antidetect incompleto.`,
        -28,
        ['WORKER_DIVERGENTE', 'ANTIDETECT_PROVAVEL', 'FP_RUIM']
      )
    );
  } else if (raw.mismatches.length === 1) {
    const m = raw.mismatches[0];
    const sev = m.key === 'userAgent' || m.key === 'platform' || m.key === 'webdriver' ? 'critical' : 'high';
    findings.push(
      finding(
        'worker-mismatch',
        sev,
        `Worker ??? Main: ${m.key}`,
        `main="${m.main}" worker="${m.worker}"`,
        sev === 'critical' ? -22 : -15,
        ['WORKER_DIVERGENTE', 'ANTIDETECT_PROVAVEL']
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
          ['WORKER_DIVERGENTE', 'AUTOMACAO'],
          0.95
        )
      );
    }
  }

  // Main-thread canvas blob size vs worker OffscreenCanvas
  try {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 40, 20);
    ctx.fillStyle = '#069';
    ctx.font = '12px Arial';
    ctx.fillText('WkrFp', 2, 16);
    const dataUrl = c.toDataURL();
    raw.mainCanvasLen = dataUrl.length;
    if (worker.canvasHash && typeof worker.canvasHash === 'string') {
      raw.workerCanvasHash = worker.canvasHash;
      // both should exist; if worker has canvas and main fails noise tests separately
    }
  } catch {
    /* ignore */
  }

  // userAgentData brands mismatch
  if (worker.userAgentData?.brands && navigator.userAgentData?.brands) {
    const mb = navigator.userAgentData.brands.map((b) => b.brand + b.version).join('|');
    const wb = worker.userAgentData.brands.map((b) => b.brand + b.version).join('|');
    if (mb !== wb) {
      findings.push(
        finding(
          'worker-uad-brands',
          'high',
          'userAgentData.brands main != worker',
          '',
          -14,
          ['WORKER_DIVERGENTE', 'FP_RUIM'],
          0.88
        )
      );
    }
  }

  return finalizeResult('workers', 'Workers', findings, raw);
}
