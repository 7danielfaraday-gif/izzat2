/** OfflineAudioContext fingerprint + estabilidade */

import { finding, finalizeResult, hashString, safe, withTimeout } from '../utils.js?v2';

function collectAudioFingerprint() {
  return new Promise((resolve) => {
    try {
      const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Ctx) {
        resolve({ error: 'no-api' });
        return;
      }
      const ctx = new Ctx(1, 44100, 44100);
      const oscillator = ctx.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 10000;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value = 40;
      compressor.ratio.value = 12;
      compressor.attack.value = 0;
      compressor.release.value = 0.25;
      oscillator.connect(compressor);
      compressor.connect(ctx.destination);
      oscillator.start(0);
      ctx.startRendering();
      ctx.oncomplete = (event) => {
        const buffer = event.renderedBuffer.getChannelData(0);
        let sum = 0;
        const samples = [];
        for (let i = 4500; i < 5000; i++) {
          sum += Math.abs(buffer[i]);
          samples.push(buffer[i]);
        }
        resolve({ sum, sample: samples.slice(0, 30).join(',') });
      };
    } catch (e) {
      resolve({ error: String(e.message || e) });
    }
  });
}

export async function run() {
  const findings = [];
  const r1 = await withTimeout(collectAudioFingerprint(), 4000, { error: 'timeout' });
  const r2 = await withTimeout(collectAudioFingerprint(), 4000, { error: 'timeout' });

  const hash1 = r1.sample ? await hashString(r1.sample) : null;
  const hash2 = r2.sample ? await hashString(r2.sample) : null;

  const raw = {
    first: r1.error ? r1 : { sum: r1.sum, hash: hash1 },
    second: r2.error ? r2 : { sum: r2.sum, hash: hash2 },
    stable: hash1 && hash2 ? hash1 === hash2 : null,
  };

  if (r1.error === 'no-api') {
    findings.push(
      finding('audio-no-api', 'low', 'OfflineAudioContext indisponível', '', -2, ['PRIVACY'])
    );
    return finalizeResult('audio', 'Audio', findings, raw);
  }

  if (r1.error) {
    findings.push(
      finding('audio-error', 'low', 'Falha ao gerar áudio fingerprint', r1.error, -2, [])
    );
    return finalizeResult('audio', 'Audio', findings, raw, 'partial');
  }

  if (raw.stable === false) {
    findings.push(
      finding(
        'audio-noise',
        'high',
        'Audio fingerprint instável',
        'Noise entre medições ??" spoof de AudioContext.',
        -14,
        ['ANTIDETECT_LIKELY', 'BAD_FP']
      )
    );
  }

  // getChannelData hooked
  const native = safe(() =>
    /\[native code\]/.test(Function.prototype.toString.call(AudioBuffer.prototype.getChannelData))
  );
  if (native === false) {
    findings.push(
      finding(
        'audio-hook',
        'high',
        'AudioBuffer.getChannelData hookado',
        'Função não nativa.',
        -15,
        ['PROTOTYPE_LIE', 'ANTIDETECT_LIKELY']
      )
    );
  }

  // sum near zero = silent / blocked
  if (typeof r1.sum === 'number' && r1.sum < 1e-7) {
    findings.push(
      finding(
        'audio-silent',
        'medium',
        'Audio fingerprint silencioso',
        'Output ~0 ??" bloqueio ou spoof.',
        -6,
        ['PRIVACY']
      )
    );
  }

  return finalizeResult('audio', 'Audio', findings, raw);
}
