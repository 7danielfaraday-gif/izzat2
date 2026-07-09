/** WebRTC ICE candidates ??" IPs e mDNS */

import { finding, finalizeResult, withTimeout } from '../utils.js?v5';

function gatherIce(timeoutMs = 3500) {
  return new Promise((resolve) => {
    const candidates = [];
    let pc;
    try {
      const RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
      if (!RTC) {
        resolve({ error: 'no-api', candidates });
        return;
      }
      pc = new RTC({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
    } catch (e) {
      resolve({ error: String(e.message || e), candidates });
      return;
    }

    const done = () => {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      resolve({ candidates, error: null });
    };

    const timer = setTimeout(done, timeoutMs);

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) {
        clearTimeout(timer);
        done();
        return;
      }
      const c = ev.candidate.candidate || '';
      candidates.push({
        candidate: c,
        type: ev.candidate.type,
        protocol: ev.candidate.protocol,
        address: ev.candidate.address,
        relatedAddress: ev.candidate.relatedAddress,
      });
    };

    pc.createDataChannel('integrity');
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch((e) => {
        clearTimeout(timer);
        resolve({ error: String(e.message || e), candidates });
      });
  });
}

function parseCandidateIps(candidates) {
  const ips = [];
  const mdns = [];
  for (const c of candidates) {
    const str = c.candidate || '';
    const m = str.match(
      /([0-9]{1,3}(?:\.[0-9]{1,3}){3})|([a-f0-9:]+:+[a-f0-9:]+)|([a-zA-Z0-9\-]+\.local)/
    );
    if (m) {
      if (m[3] || /\.local/.test(str)) mdns.push(m[3] || str);
      else if (m[1]) ips.push(m[1]);
      else if (m[2]) ips.push(m[2]);
    }
    if (c.address) {
      if (/\.local/i.test(c.address)) mdns.push(c.address);
      else ips.push(c.address);
    }
  }
  return {
    ips: [...new Set(ips)],
    mdns: [...new Set(mdns)],
  };
}

function isPrivateIp(ip) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|::1|fc|fd)/i.test(ip);
}

export async function run() {
  const findings = [];
  const result = await withTimeout(gatherIce(3500), 4500, { error: 'timeout', candidates: [] });
  const parsed = parseCandidateIps(result.candidates || []);
  const raw = {
    error: result.error,
    candidateCount: (result.candidates || []).length,
    ...parsed,
    publicIps: parsed.ips.filter((ip) => !isPrivateIp(ip)),
    privateIps: parsed.ips.filter((ip) => isPrivateIp(ip)),
  };

  if (result.error === 'no-api') {
    findings.push(
      finding('webrtc-no-api', 'info', 'WebRTC indisponível', '', 0, ['PRIVACIDADE'])
    );
    return finalizeResult('webrtc', 'WebRTC', findings, raw, 'partial');
  }

  if (result.error === 'timeout' || (raw.candidateCount === 0 && result.error)) {
    findings.push(
      finding(
        'webrtc-blocked',
        'info',
        'WebRTC sem candidates / bloqueado',
        'Comum com extensões de privacidade ??" não indica antidetect sozinho.',
        0,
        ['PRIVACIDADE']
      )
    );
    return finalizeResult('webrtc', 'WebRTC', findings, raw, 'partial');
  }

  // Many public IPs can indicate leak through multiple interfaces ??" info only
  if (raw.publicIps.length > 1) {
    findings.push(
      finding(
        'webrtc-multi-public',
        'low',
        'Múltiplos IPs públicos via WebRTC',
        raw.publicIps.join(', '),
        -2,
        []
      )
    );
  }

  // Host candidates with private IP while "privacy" profile ??" informational
  if (raw.privateIps.length && raw.publicIps.length) {
    raw.leakHint = true;
    findings.push(
      finding(
        'webrtc-ip-leak',
        'info',
        'WebRTC expõe IP local e público',
        `local=${raw.privateIps.join(', ')} public=${raw.publicIps.join(', ')}`,
        0,
        []
      )
    );
  }

  return finalizeResult('webrtc', 'WebRTC', findings, raw);
}
