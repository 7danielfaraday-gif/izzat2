/** Screen, viewport, DPR + visualViewport + matchMedia cross-check (v2) */

import { finding, finalizeResult, parseUserAgent, safe } from '../utils.js?v5';

function mm(q) {
  return safe(() => window.matchMedia(q).matches);
}

export async function run() {
  const findings = [];
  const ua = parseUserAgent();

  const vv = window.visualViewport;
  const dpr = window.devicePixelRatio || 1;

  const raw = {
    width: screen.width,
    height: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
    orientation: screen.orientation ? screen.orientation.type : null,
    devicePixelRatio: dpr,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    screenX: window.screenX,
    screenY: window.screenY,
    visualViewport: vv
      ? {
          width: vv.width,
          height: vv.height,
          scale: vv.scale,
          offsetLeft: vv.offsetLeft,
          offsetTop: vv.offsetTop,
        }
      : null,
    matchMedia: {
      deviceWidth: mm(`(device-width: ${screen.width}px)`),
      deviceWidthLoose: mm(`(max-device-width: ${screen.width + 50}px) and (min-device-width: ${Math.max(0, screen.width - 50)}px)`),
      resolutionDpr: mm(`(resolution: ${dpr}dppx)`),
      resolutionApprox: mm(`(min-resolution: ${Math.max(0.5, dpr - 0.15)}dppx) and (max-resolution: ${dpr + 0.15}dppx)`),
      pointerFine: mm('(pointer: fine)'),
      pointerCoarse: mm('(pointer: coarse)'),
      hoverHover: mm('(hover: hover)'),
      hoverNone: mm('(hover: none)'),
    },
  };

  // Headless classic
  if (raw.outerWidth === 0 && raw.outerHeight === 0) {
    findings.push(
      finding(
        'screen-outer-zero',
        'high',
        'outerWidth/outerHeight = 0',
        'Padrao classico de Chrome headless.',
        -16,
        ['SEM_INTERFACE', 'AUTOMACAO'],
        0.95
      )
    );
  }

  if ((raw.width === 800 && raw.height === 600) || raw.width === 0 || raw.height === 0) {
    findings.push(
      finding(
        'screen-headless-res',
        'high',
        'Resolucao headless / invalida',
        `${raw.width}x${raw.height}`,
        -14,
        ['SEM_INTERFACE'],
        0.9
      )
    );
  }

  if (raw.availWidth > raw.width + 1 || raw.availHeight > raw.height + 1) {
    findings.push(
      finding(
        'screen-avail-gt',
        'high',
        'avail* maior que screen*',
        `screen=${raw.width}x${raw.height} avail=${raw.availWidth}x${raw.availHeight}`,
        -14,
        ['FP_RUIM', 'SPOOF_TELA'],
        0.95
      )
    );
  }

  if (![1, 4, 8, 15, 16, 24, 32, 48].includes(raw.colorDepth)) {
    findings.push(
      finding('screen-colordepth', 'medium', 'colorDepth atipico', String(raw.colorDepth), -7, ['FP_RUIM'], 0.8)
    );
  }

  if (raw.colorDepth !== raw.pixelDepth && raw.pixelDepth != null) {
    findings.push(
      finding(
        'screen-depth-mismatch',
        'low',
        'colorDepth != pixelDepth',
        `${raw.colorDepth} vs ${raw.pixelDepth}`,
        -3,
        ['FP_RUIM'],
        0.7
      )
    );
  }

  if (ua.isMobile && raw.width >= 1920 && dpr <= 1) {
    findings.push(
      finding(
        'screen-mobile-desktop-res',
        'high',
        'UA mobile com resolucao desktop e DPR<=1',
        `${raw.width}x${raw.height} @${dpr}`,
        -14,
        ['FP_RUIM'],
        0.9
      )
    );
  }

  if (!ua.isMobile && raw.width <= 480 && raw.height <= 900 && dpr >= 2) {
    findings.push(
      finding(
        'screen-desktop-phone',
        'medium',
        'UA desktop com tela de smartphone',
        `${raw.width}x${raw.height} @${dpr} - DevTools device mode?`,
        -8,
        ['FP_RUIM'],
        0.75
      )
    );
  }

  if (dpr < 0.5 || dpr > 5) {
    findings.push(
      finding('screen-dpr-absurd', 'medium', 'devicePixelRatio absurdo', String(dpr), -8, ['FP_RUIM'], 0.85)
    );
  }

  // --- inner > screen: severity depends on confirmation ---
  const innerGtW = raw.innerWidth > raw.width + 100;
  const innerGtH = raw.innerHeight > raw.height + 100;
  if (innerGtW || innerGtH) {
    const vvWider = vv && (vv.width > raw.width + 50 || vv.height > raw.height + 50);
    const outerWider = raw.outerWidth > raw.width + 50 || raw.outerHeight > raw.height + 50;
    const confirmed = vvWider || outerWider || raw.matchMedia.deviceWidth === false;

    if (confirmed) {
      findings.push(
        finding(
          'screen-inner-gt',
          'high',
          'inner* maior que screen* (confirmado)',
          `inner=${raw.innerWidth}x${raw.innerHeight} screen=${raw.width}x${raw.height}` +
            (vv ? ` vv=${Math.round(vv.width)}x${Math.round(vv.height)}` : '') +
            ` - spoof tipico de antidetect`,
          -14,
          ['FP_RUIM', 'SPOOF_TELA', 'ANTIDETECT_PROVAVEL'],
          0.92
        )
      );
    } else {
      findings.push(
        finding(
          'screen-inner-gt',
          'medium',
          'inner* maior que screen*',
          `inner=${raw.innerWidth}x${raw.innerHeight} screen=${raw.width}x${raw.height}`,
          -7,
          ['FP_RUIM', 'SPOOF_TELA'],
          0.75
        )
      );
    }
  }

  // DPR vs matchMedia resolution
  if (raw.matchMedia.resolutionApprox === false && raw.matchMedia.resolutionDpr === false) {
    findings.push(
      finding(
        'screen-dpr-mm',
        'high',
        'devicePixelRatio != matchMedia resolution',
        `dpr=${dpr} mas CSS resolution nao confirma - spoof de DPR`,
        -12,
        ['FP_RUIM', 'SPOOF_TELA'],
        0.88
      )
    );
  }

  // outer much larger than screen
  if (raw.outerWidth > raw.width + 120 || raw.outerHeight > raw.height + 120) {
    findings.push(
      finding(
        'screen-outer-gt',
        'high',
        'outer* maior que screen*',
        `outer=${raw.outerWidth}x${raw.outerHeight} screen=${raw.width}x${raw.height}`,
        -12,
        ['FP_RUIM', 'SPOOF_TELA'],
        0.9
      )
    );
  }

  // Mobile UA but pointer fine + hover (desktop)
  if (ua.isMobile && raw.matchMedia.pointerFine && raw.matchMedia.hoverHover && !raw.matchMedia.pointerCoarse) {
    findings.push(
      finding(
        'screen-mobile-pointer-fine',
        'high',
        'UA mobile com pointer:fine (desktop)',
        'matchMedia indica mouse, nao touch primario',
        -14,
        ['FP_RUIM', 'ANTIDETECT_PROVAVEL'],
        0.9
      )
    );
  }

  return finalizeResult('screen', 'Screen & Viewport', findings, raw);
}
