/** Canvas fingerprint: estabilidade, noise antidetect, OffscreenCanvas */

import { finding, finalizeResult, hashString, safe } from '../utils.js?v3';

function drawScene(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  canvas.width = 280;
  canvas.height = 80;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f60';
  ctx.fillRect(10, 10, 120, 50);
  ctx.fillStyle = '#069';
  ctx.font = '16px Arial';
  ctx.fillText('BrowserIntegrity Cwm fjordbank smile', 4, 30);
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
  ctx.font = '18px Times New Roman';
  ctx.fillText('glyph-pi-music-inf 0.123456789', 4, 55);
  ctx.beginPath();
  ctx.arc(220, 40, 25, 0, Math.PI * 2);
  ctx.strokeStyle = '#c0f';
  ctx.stroke();
  const grad = ctx.createLinearGradient(0, 0, 280, 0);
  grad.addColorStop(0, 'red');
  grad.addColorStop(0.5, 'green');
  grad.addColorStop(1, 'blue');
  ctx.fillStyle = grad;
  ctx.fillRect(150, 5, 100, 15);
  return canvas;
}

function readDataURL(canvas) {
  return safe(() => canvas.toDataURL()) || '';
}

function pixelSample(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // sample subset for stability compare
    let s = '';
    for (let i = 0; i < data.length; i += 97) s += data[i] + ',';
    return s;
  } catch {
    return 'blocked';
  }
}

export async function run() {
  const findings = [];
  const canvas = document.createElement('canvas');
  drawScene(canvas);

  const reads = [];
  for (let i = 0; i < 5; i++) {
    // redraw each time to catch noise-on-read vs noise-on-draw
    drawScene(canvas);
    reads.push(readDataURL(canvas));
  }

  const unique = new Set(reads);
  const hash = await hashString(reads[0] || '');
  const sample = pixelSample(canvas);

  let offscreenHash = null;
  let offscreenData = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const oc = new OffscreenCanvas(280, 80);
      const ctx = oc.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#f60';
        ctx.fillRect(10, 10, 120, 50);
        ctx.fillStyle = '#069';
        ctx.font = '16px Arial';
        ctx.fillText('BrowserIntegrity Cwm fjordbank smile', 4, 30);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.font = '18px Times New Roman';
        ctx.fillText('glyph-pi-music-inf 0.123456789', 4, 55);
        if (typeof oc.convertToBlob === 'function') {
          const blob = await oc.convertToBlob({ type: 'image/png' });
          offscreenData = `blob:${blob.size}`;
        }
        // Also try transfer to compare via toDataURL path if available
        if (HTMLCanvasElement.prototype.transferControlToOffscreen) {
          /* skip transfer test for stability */
        }
      }
      // Draw same on regular and compare getImageData length
      const c2 = document.createElement('canvas');
      drawScene(c2);
      offscreenHash = await hashString(readDataURL(c2));
    } catch (e) {
      offscreenData = 'error:' + (e.message || e);
    }
  }

  // Second independent canvas same draw ??" must match if no random noise
  const canvasB = document.createElement('canvas');
  drawScene(canvasB);
  const readB = readDataURL(canvasB);
  const crossMatch = readB === reads[reads.length - 1];

  const raw = {
    hash,
    uniqueReads: unique.size,
    sampleBlocked: sample === 'blocked',
    crossMatch,
    offscreenData,
    dataUrlLength: (reads[0] || '').length,
    isBlank: (reads[0] || '').length < 100,
  };

  if (raw.isBlank || !reads[0]) {
    findings.push(
      finding(
        'canvas-blank',
        'medium',
        'Canvas em branco / bloqueado',
        'Possível proteção de privacidade (Tor) ou falha de render.',
        -5,
        ['PRIVACY']
      )
    );
  }

  if (sample === 'blocked') {
    findings.push(
      finding(
        'canvas-read-blocked',
        'low',
        'getImageData bloqueado',
        'Canvas tainted ou política de privacidade.',
        -2,
        ['PRIVACY']
      )
    );
  }

  // Random noise between reads = antidetect classic
  if (unique.size > 1) {
    findings.push(
      finding(
        'canvas-unstable',
        'high',
        'Canvas instável (noise entre leituras)',
        `${unique.size} hashes diferentes em 5 leituras. Antidetect com noise aleatório.`,
        -18,
        ['CANVAS_NOISE', 'ANTIDETECT_LIKELY', 'BAD_FP']
      )
    );
  }

  if (!crossMatch && unique.size === 1) {
    // stable per canvas instance but different instances differ ??" session noise
    findings.push(
      finding(
        'canvas-instance-noise',
        'high',
        'Canvas difere entre instâncias',
        'Noise por canvas/session ??" comum em AdsPower/Multilogin.',
        -14,
        ['CANVAS_NOISE', 'ANTIDETECT_LIKELY']
      )
    );
  }

  // Extremely short or constant known empty png
  if (reads[0] && reads[0].includes('iVBORw0KGgoAAAANSUhEUgAAASwAAABQCAYAAADJHv4T')) {
    /* ignore */
  }

  return finalizeResult('canvas', 'Canvas', findings, raw);
}
