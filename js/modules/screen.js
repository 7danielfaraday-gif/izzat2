/** Screen, viewport, DPR */

import { finding, finalizeResult, parseUserAgent } from '../utils.js';

export async function run() {
  const findings = [];
  const ua = parseUserAgent();

  const raw = {
    width: screen.width,
    height: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
    orientation: screen.orientation ? screen.orientation.type : null,
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    screenX: window.screenX,
    screenY: window.screenY,
  };

  // Headless classic
  if (raw.outerWidth === 0 && raw.outerHeight === 0) {
    findings.push(
      finding(
        'screen-outer-zero',
        'high',
        'outerWidth/outerHeight = 0',
        'Padrão clássico de Chrome headless.',
        -16,
        ['HEADLESS', 'AUTOMATION']
      )
    );
  }

  if ((raw.width === 800 && raw.height === 600) || (raw.width === 0 || raw.height === 0)) {
    findings.push(
      finding(
        'screen-headless-res',
        'high',
        'Resolução headless / inválida',
        `${raw.width}×${raw.height}`,
        -14,
        ['HEADLESS']
      )
    );
  }

  // avail > screen (impossible)
  if (raw.availWidth > raw.width + 1 || raw.availHeight > raw.height + 1) {
    findings.push(
      finding(
        'screen-avail-gt',
        'high',
        'avail* maior que screen*',
        `screen=${raw.width}x${raw.height} avail=${raw.availWidth}x${raw.availHeight}`,
        -14,
        ['BAD_FP']
      )
    );
  }

  // colorDepth
  if (![1, 4, 8, 15, 16, 24, 32, 48].includes(raw.colorDepth)) {
    findings.push(
      finding(
        'screen-colordepth',
        'medium',
        'colorDepth atípico',
        String(raw.colorDepth),
        -7,
        ['BAD_FP']
      )
    );
  }

  if (raw.colorDepth !== raw.pixelDepth && raw.pixelDepth != null) {
    findings.push(
      finding(
        'screen-depth-mismatch',
        'low',
        'colorDepth ≠ pixelDepth',
        `${raw.colorDepth} vs ${raw.pixelDepth}`,
        -3,
        ['BAD_FP']
      )
    );
  }

  // Mobile UA with huge desktop resolution without high DPR nuance
  if (ua.isMobile && raw.width >= 1920 && raw.devicePixelRatio <= 1) {
    findings.push(
      finding(
        'screen-mobile-desktop-res',
        'high',
        'UA mobile com resolução desktop e DPR≤1',
        `${raw.width}×${raw.height} @${raw.devicePixelRatio}`,
        -14,
        ['BAD_FP']
      )
    );
  }

  // Desktop UA with phone-like CSS resolution and high DPR can be ok (device mode)
  if (!ua.isMobile && raw.width <= 480 && raw.height <= 900 && raw.devicePixelRatio >= 2) {
    findings.push(
      finding(
        'screen-desktop-phone',
        'medium',
        'UA desktop com tela de smartphone',
        `${raw.width}×${raw.height} @${raw.devicePixelRatio} — DevTools device mode?`,
        -8,
        ['BAD_FP']
      )
    );
  }

  // DPR absurd
  if (raw.devicePixelRatio < 0.5 || raw.devicePixelRatio > 5) {
    findings.push(
      finding(
        'screen-dpr-absurd',
        'medium',
        'devicePixelRatio absurdo',
        String(raw.devicePixelRatio),
        -8,
        ['BAD_FP']
      )
    );
  }

  // inner > screen significantly
  if (raw.innerWidth > raw.width + 100 || raw.innerHeight > raw.height + 100) {
    findings.push(
      finding(
        'screen-inner-gt',
        'medium',
        'inner* maior que screen*',
        `inner=${raw.innerWidth}x${raw.innerHeight} screen=${raw.width}x${raw.height}`,
        -7,
        ['BAD_FP']
      )
    );
  }

  return finalizeResult('screen', 'Screen & Viewport', findings, raw);
}
