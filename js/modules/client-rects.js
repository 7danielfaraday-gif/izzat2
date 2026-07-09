/** ClientRects / emoji geometry ??" varia por OS e fonte do sistema */

import { finding, finalizeResult, parseUserAgent, platformOs } from '../utils.js?v3';

function measureEmoji() {
  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;left:-9999px;top:0;font-size:64px;line-height:normal;font-family:sans-serif;';
  el.textContent = 'AaWw 中 ا';
  document.body.appendChild(el);
  const rects = el.getClientRects();
  const br = el.getBoundingClientRect();
  const result = {
    count: rects.length,
    width: br.width,
    height: br.height,
    x: br.x,
    y: br.y,
  };
  // Individual char widths
  el.textContent = '';
  const chars = ['a', 'W', '中', 'ا', 'g'];
  result.chars = {};
  for (const ch of chars) {
    el.textContent = ch;
    const r = el.getBoundingClientRect();
    result.chars[ch] = { w: +r.width.toFixed(4), h: +r.height.toFixed(4) };
  }
  document.body.removeChild(el);
  return result;
}

function measureDomShift() {
  // Some spoofers add noise to getClientRects
  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;left:10px;top:10px;width:100.5px;height:20.25px;font-size:14px;';
  el.textContent = 'rect-noise-test';
  document.body.appendChild(el);
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const r = el.getBoundingClientRect();
    samples.push(`${r.x},${r.y},${r.width},${r.height}`);
  }
  document.body.removeChild(el);
  return { samples, unique: new Set(samples).size };
}

export async function run() {
  const findings = [];
  const ua = parseUserAgent();
  const emoji = measureEmoji();
  const rectNoise = measureDomShift();

  const raw = { emoji, rectNoise, os: ua.os, platformOs: platformOs() };

  if (rectNoise.unique > 1) {
    findings.push(
      finding(
        'rects-noise',
        'high',
        'getBoundingClientRect instável',
        `${rectNoise.unique} valores em 5 leituras ??" noise de antidetect.`,
        -15,
        ['ANTIDETECT_LIKELY', 'BAD_FP']
      )
    );
  }

  // Zero size elements when text present = broken env
  if (emoji.width === 0 || emoji.height === 0) {
    findings.push(
      finding(
        'rects-zero',
        'medium',
        'Medição de texto com tamanho zero',
        'Ambiente de render anômalo.',
        -7,
        ['HEADLESS']
      )
    );
  }

  // Emoji width often ~64-80+ depending on OS; identical perfect integers can be spoofed
  const ew = emoji.chars?.['中']?.w;
  if (ew === 0) {
    findings.push(
      finding(
        'rects-cjk-zero',
        'low',
        'Caractere CJK com largura zero',
        'Fonte do sistema ausente ou bloqueada.',
        -3,
        []
      )
    );
  }

  return finalizeResult('client-rects', 'ClientRects', findings, raw);
}
