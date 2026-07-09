/** mediaDevices + speechSynthesis voices */

import { finding, finalizeResult, parseUserAgent, withTimeout } from '../utils.js?v3';

async function getDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return { error: 'no-api' };
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      devices: devices.map((d) => ({
        kind: d.kind,
        label: d.label || '',
        deviceId: d.deviceId ? d.deviceId.slice(0, 12) : '',
        groupId: d.groupId ? d.groupId.slice(0, 8) : '',
      })),
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

function getVoices() {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve({ error: 'no-api', voices: [] });
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const voices = speechSynthesis.getVoices().map((v) => ({
        name: v.name,
        lang: v.lang,
        localService: v.localService,
        default: v.default,
      }));
      resolve({ voices });
    };
    const existing = speechSynthesis.getVoices();
    if (existing && existing.length) {
      finish();
      return;
    }
    speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, 800);
  });
}

export async function run() {
  const findings = [];
  const ua = parseUserAgent();
  const devices = await withTimeout(getDevices(), 2000, { error: 'timeout' });
  const speech = await withTimeout(getVoices(), 1500, { error: 'timeout', voices: [] });

  const raw = {
    devices: devices.devices || [],
    deviceError: devices.error || null,
    deviceKinds: {},
    voices: speech.voices || [],
    voiceError: speech.error || null,
    voiceLangs: [...new Set((speech.voices || []).map((v) => v.lang))],
  };

  for (const d of raw.devices) {
    raw.deviceKinds[d.kind] = (raw.deviceKinds[d.kind] || 0) + 1;
  }

  // Zero media devices on desktop chrome is unusual (usually at least defaults)
  if (!devices.error && raw.devices.length === 0 && !ua.isMobile) {
    findings.push(
      finding(
        'media-no-devices',
        'medium',
        'Nenhum media device',
        'enumerateDevices retornou lista vazia.',
        -7,
        ['HEADLESS']
      )
    );
  }

  // Labels present without permission is rare in modern Chrome (usually empty until granted)
  const labeled = raw.devices.filter((d) => d.label);
  if (labeled.length && raw.devices.length) {
    raw.hasLabelsWithoutGesture = true;
    // Not necessarily bad - if permission already granted
  }

  // Voices: desktop usually has some
  if (!speech.error && raw.voices.length === 0) {
    findings.push(
      finding(
        'speech-no-voices',
        'low',
        'Nenhuma voz speechSynthesis',
        'Pode ser headless ou OS sem TTS.',
        -3,
        ['HEADLESS']
      )
    );
  }

  // iOS UA with Microsoft / Windows voices
  if (ua.os === 'ios' || ua.os === 'android') {
    const winVoices = raw.voices.filter((v) =>
      /Microsoft|Windows|Zira|David|Mark/i.test(v.name)
    );
    if (winVoices.length >= 2) {
      findings.push(
        finding(
          'speech-mobile-win-voices',
          'high',
          'UA mobile com vozes Windows',
          winVoices
            .slice(0, 4)
            .map((v) => v.name)
            .join(', '),
          -14,
          ['BAD_FP']
        )
      );
    }
  }

  if (ua.os === 'windows') {
    const appleVoices = raw.voices.filter((v) => /Alex|Samantha|Victoria|Apple/i.test(v.name));
    if (appleVoices.length >= 3 && raw.voices.every((v) => !/Microsoft/i.test(v.name))) {
      findings.push(
        finding(
          'speech-win-apple-voices',
          'medium',
          'UA Windows so com vozes estilo Apple',
          appleVoices
            .slice(0, 3)
            .map((v) => v.name)
            .join(', '),
          -8,
          ['BAD_FP']
        )
      );
    }
  }

  return finalizeResult('media-speech', 'Media & Speech', findings, raw);
}
