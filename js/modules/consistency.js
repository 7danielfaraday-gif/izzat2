/** Matriz de consistência cross-API ??" cérebro estilo ads/banco */

import { finding, finalizeResult, parseUserAgent, platformOs, safe } from '../utils.js?v5';

function getWebGLRenderer() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return { vendor: null, renderer: null };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  } catch {
    return { vendor: null, renderer: null };
  }
}

export async function run(shared = {}) {
  const findings = [];
  const ua = parseUserAgent();
  const plat = navigator.platform || '';
  const platOs = platformOs(plat);
  const gl = getWebGLRenderer();
  const touch = navigator.maxTouchPoints || 0;
  const uad = safe(() => navigator.userAgentData);

  const raw = {
    uaOs: ua.os,
    platform: plat,
    platformOs: platOs,
    isMobileUa: ua.isMobile,
    maxTouchPoints: touch,
    hasTouchStart: 'ontouchstart' in window,
    webgl: gl,
    userAgentDataMobile: uad ? uad.mobile : null,
    userAgentDataPlatform: uad ? uad.platform : null,
    screen: `${screen.width}x${screen.height}`,
    dpr: devicePixelRatio,
    hw: navigator.hardwareConcurrency,
    mem: navigator.deviceMemory,
  };

  // --- UA OS vs platform ---
  if (ua.os !== 'unknown' && platOs !== 'unknown' && ua.os !== platOs) {
    // ios/mac both MacIntel historically for iPad desktop mode ??" special case
    const ipadDesktop = ua.os === 'ios' && platOs === 'macos';
    const androidLinux = ua.os === 'android' && platOs === 'linux';
    if (!ipadDesktop && !androidLinux) {
      findings.push(
        finding(
          'cons-ua-platform',
          'critical',
          'OS do UA ??? navigator.platform',
          `UA OS=${ua.os}, platform="${plat}" (${platOs})`,
          -25,
          ['FP_RUIM', 'ANTIDETECT_PROVAVEL']
        )
      );
    } else if (ipadDesktop) {
      findings.push(
        finding(
          'cons-ipad-desktop',
          'info',
          'iPad com platform MacIntel',
          'Pode ser Request Desktop Website ??" legítimo.',
          0,
          []
        )
      );
    }
  }

  // --- Mobile UA vs touch ---
  if (ua.isMobile && touch === 0 && !('ontouchstart' in window)) {
    findings.push(
      finding(
        'cons-mobile-no-touch',
        'high',
        'UA mobile sem suporte a touch',
        'maxTouchPoints=0 e sem ontouchstart ??" spoof de UA mobile em desktop.',
        -18,
        ['FP_RUIM', 'ANTIDETECT_PROVAVEL']
      )
    );
  }

  // Desktop UA with many touch points only is ok (Surface). Flag if UA says iPhone
  if (/iPhone/i.test(navigator.userAgent) && touch === 0) {
    findings.push(
      finding(
        'cons-iphone-no-touch',
        'critical',
        'UA iPhone sem maxTouchPoints',
        'iPhone real tem touch points > 0.',
        -22,
        ['FP_RUIM']
      )
    );
  }

  // --- Client Hints mobile vs touch ---
  if (uad && uad.mobile === true && touch === 0) {
    findings.push(
      finding(
        'cons-uad-mobile-touch',
        'high',
        'userAgentData.mobile sem touch',
        'Client Hints diz mobile mas não há touch.',
        -15,
        ['FP_RUIM']
      )
    );
  }
  if (uad && uad.mobile === false && ua.isMobile) {
    findings.push(
      finding(
        'cons-uad-ua-mobile',
        'high',
        'UA mobile mas userAgentData.mobile=false',
        '',
        -15,
        ['FP_RUIM']
      )
    );
  }

  // --- GPU vs OS ---
  const r = `${gl.vendor || ''} ${gl.renderer || ''}`;
  if (ua.os === 'ios' && /NVIDIA|GeForce|Radeon|Direct3D|ANGLE \(NVIDIA|ANGLE \(AMD/i.test(r)) {
    findings.push(
      finding(
        'cons-ios-gpu',
        'critical',
        'iOS + GPU PC (ANGLE/NVIDIA/AMD)',
        gl.renderer || r,
        -28,
        ['FP_RUIM', 'ANTIDETECT_PROVAVEL']
      )
    );
  }
  if (ua.os === 'windows' && /Apple M[0-9]|Apple GPU|Metal/i.test(r) && !/ANGLE/i.test(r)) {
    findings.push(
      finding(
        'cons-win-apple-gpu',
        'critical',
        'Windows + Apple GPU',
        gl.renderer || r,
        -26,
        ['FP_RUIM']
      )
    );
  }
  if (ua.os === 'macos' && /Direct3D|D3D11|D3D12/i.test(r)) {
    findings.push(
      finding(
        'cons-mac-d3d',
        'critical',
        'macOS + Direct3D',
        gl.renderer || r,
        -26,
        ['FP_RUIM']
      )
    );
  }
  if (ua.os === 'linux' && /Direct3D/i.test(r)) {
    findings.push(
      finding(
        'cons-linux-d3d',
        'high',
        'Linux + Direct3D',
        gl.renderer || r,
        -14,
        ['FP_RUIM']
      )
    );
  }

  // --- Screen vs mobile ---
  if (ua.isMobile && screen.width >= 1600 && devicePixelRatio === 1) {
    findings.push(
      finding(
        'cons-mobile-screen',
        'high',
        'Mobile UA + tela larga DPR=1',
        `${screen.width}x${screen.height}`,
        -12,
        ['FP_RUIM']
      )
    );
  }

  // --- Chrome on iOS should be CriOS; desktop Chrome UA on iOS platform ---
  if (platOs === 'ios' && /Chrome\/\d+/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent)) {
    findings.push(
      finding(
        'cons-chrome-ios-ua',
        'high',
        'Chrome desktop UA em platform iOS',
        'iOS usa CriOS, não Chrome/',
        -16,
        ['FP_RUIM']
      )
    );
  }

  // --- Firefox UA but chrome object ---
  if (ua.isFirefox && safe(() => window.chrome) && Object.keys(window.chrome || {}).length) {
    findings.push(
      finding(
        'cons-ff-chrome-obj',
        'medium',
        'Firefox UA com window.chrome',
        '',
        -8,
        ['FP_RUIM']
      )
    );
  }

  // --- Safari UA on Windows ---
  if (ua.isSafari && ua.os === 'windows') {
    findings.push(
      finding(
        'cons-safari-windows',
        'critical',
        'Safari UA em Windows',
        'Safari não roda nativamente no Windows (desde 2012).',
        -30,
        ['FP_RUIM', 'ANTIDETECT_PROVAVEL']
      )
    );
  }

  // --- hardware vs mobile ---
  if (ua.isMobile && navigator.hardwareConcurrency >= 24) {
    findings.push(
      finding(
        'cons-mobile-many-cores',
        'medium',
        'Mobile com muitos cores',
        `hardwareConcurrency=${navigator.hardwareConcurrency}`,
        -6,
        ['FP_RUIM']
      )
    );
  }

  // shared data from other modules if provided
  if (shared.canvasUnstable) {
    findings.push(
      finding(
        'cons-canvas-shared',
        'info',
        'Canvas noise ja reportado',
        'Correlacionado com modulo Canvas.',
        0,
        ['CANVAS_RUIDO'],
        1
      )
    );
  }

  // pointer / hover vs mobile (matchMedia)
  try {
    const fine = matchMedia('(pointer: fine)').matches;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const hover = matchMedia('(hover: hover)').matches;
    raw.pointerFine = fine;
    raw.pointerCoarse = coarse;
    raw.hover = hover;
    if (ua.isMobile && fine && hover && touch === 0) {
      findings.push(
        finding(
          'cons-mm-mobile-desktop',
          'high',
          'UA mobile com pointer:fine + hover',
          'Perfil de mouse desktop sob UA mobile',
          -15,
          ['FP_RUIM', 'ANTIDETECT_PROVAVEL'],
          0.9
        )
      );
    }
    if (!ua.isMobile && !fine && coarse && touch > 0 && screen.width <= 500) {
      findings.push(
        finding(
          'cons-desktop-phone-pointer',
          'medium',
          'UA desktop com pointer coarse de telefone',
          '',
          -7,
          ['FP_RUIM'],
          0.7
        )
      );
    }
  } catch {
    /* ignore */
  }

  // color-gamut vs colorDepth
  try {
    if (matchMedia('(color-gamut: p3)').matches && screen.colorDepth && screen.colorDepth <= 16) {
      findings.push(
        finding(
          'cons-gamut-depth',
          'medium',
          'color-gamut p3 com colorDepth baixo',
          `colorDepth=${screen.colorDepth}`,
          -6,
          ['FP_RUIM'],
          0.75
        )
      );
    }
  } catch {
    /* ignore */
  }

  // Software GPU + high deviceMemory odd
  const rSoft = `${gl.vendor || ''} ${gl.renderer || ''}`;
  if (/swiftshader|llvmpipe|software/i.test(rSoft) && navigator.deviceMemory >= 8) {
    findings.push(
      finding(
        'cons-softgpu-ram',
        'medium',
        'GPU software com muita RAM reportada',
        rSoft,
        -7,
        ['SEM_INTERFACE', 'FP_RUIM'],
        0.75
      )
    );
  }

  return finalizeResult('consistency', 'Consistencia Cross-API', findings, raw);
}
