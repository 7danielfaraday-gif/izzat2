/** Navigator, Client Hints e combinações de hardware */

import { finding, finalizeResult, parseUserAgent, safe } from '../utils.js?v2';

export async function run() {
  const findings = [];
  const uaInfo = parseUserAgent();
  const uad = safe(() => navigator.userAgentData);

  const raw = {
    ua: uaInfo,
    platform: navigator.platform,
    vendor: navigator.vendor,
    productSub: navigator.productSub,
    appVersion: navigator.appVersion,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
    maxTouchPoints: navigator.maxTouchPoints,
    language: navigator.language,
    languages: navigator.languages ? [...navigator.languages] : [],
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack,
    pdfViewerEnabled: navigator.pdfViewerEnabled,
    userAgentData: null,
  };

  if (uad) {
    raw.userAgentData = {
      mobile: uad.mobile,
      platform: uad.platform,
      brands: uad.brands ? uad.brands.map((b) => ({ brand: b.brand, version: b.version })) : [],
    };
    try {
      if (typeof uad.getHighEntropyValues === 'function') {
        const he = await uad.getHighEntropyValues([
          'architecture',
          'bitness',
          'model',
          'platformVersion',
          'fullVersionList',
          'uaFullVersion',
        ]);
        raw.userAgentData.highEntropy = he;
      }
    } catch {
      /* privacy blocked */
    }
  }

  // Empty languages
  if (!raw.languages.length) {
    findings.push(
      finding(
        'nav-no-languages',
        'medium',
        'navigator.languages vazio',
        'Browsers reais quase sempre expõem ao menos um idioma.',
        -8,
        ['BAD_FP']
      )
    );
  }

  // hardwareConcurrency sanity
  const hc = raw.hardwareConcurrency;
  if (hc === 0 || hc === undefined || hc === null) {
    findings.push(
      finding('nav-hc-missing', 'medium', 'hardwareConcurrency ausente/zero', String(hc), -6, ['BAD_FP'])
    );
  } else if (hc > 128 || (typeof hc === 'number' && hc % 1 !== 0)) {
    findings.push(
      finding(
        'nav-hc-absurd',
        'high',
        'hardwareConcurrency absurdo',
        `Valor: ${hc}`,
        -14,
        ['BAD_FP']
      )
    );
  }

  // deviceMemory sanity (Chromium)
  const dm = raw.deviceMemory;
  if (uaInfo.isChromium && dm != null) {
    const allowed = [0.25, 0.5, 1, 2, 4, 8];
    if (!allowed.includes(dm) && dm > 8) {
      // values above 8 are bucketed to 8 in real Chrome usually
      findings.push(
        finding(
          'nav-dm-unusual',
          'low',
          'deviceMemory fora do bucket típico',
          `deviceMemory=${dm} (Chrome costuma limitar a 8)`,
          -3,
          ['BAD_FP']
        )
      );
    }
    // impossible combo: many cores, tiny memory
    if (hc >= 16 && dm <= 0.5) {
      findings.push(
        finding(
          'nav-hc-dm-impossible',
          'high',
          'CPU/RAM inconsistentes',
          `${hc} cores com ${dm} GB ??" combinação implausível.`,
          -16,
          ['BAD_FP', 'ANTIDETECT_LIKELY']
        )
      );
    }
    if (hc === 1 && dm >= 8 && !uaInfo.isMobile) {
      findings.push(
        finding(
          'nav-hc-dm-odd',
          'medium',
          '1 core com muita RAM',
          `${hc} core(s), ${dm} GB`,
          -7,
          ['BAD_FP']
        )
      );
    }
  }

  // productSub: Chrome/Safari = 20030107
  if (uaInfo.isChromium || uaInfo.isSafari) {
    if (raw.productSub && raw.productSub !== '20030107') {
      findings.push(
        finding(
          'nav-productsub',
          'medium',
          'productSub inesperado',
          `productSub=${raw.productSub} (esperado 20030107 em Chrome/Safari)`,
          -8,
          ['BAD_FP']
        )
      );
    }
  }

  // vendor checks
  if (uaInfo.isChromium && raw.vendor && raw.vendor !== 'Google Inc.' && raw.vendor !== '') {
    // Edge might still be Google Inc. for vendor
    if (!/Google|empty/i.test(raw.vendor) && raw.vendor !== '') {
      findings.push(
        finding(
          'nav-vendor-chrome',
          'low',
          'vendor atípico para Chromium',
          `vendor="${raw.vendor}"`,
          -4,
          ['BAD_FP']
        )
      );
    }
  }

  // Client Hints vs UA mobile
  if (raw.userAgentData && typeof raw.userAgentData.mobile === 'boolean') {
    if (raw.userAgentData.mobile !== uaInfo.isMobile) {
      findings.push(
        finding(
          'nav-uad-mobile-mismatch',
          'high',
          'userAgentData.mobile ??? UA mobile',
          `Client Hints mobile=${raw.userAgentData.mobile}, UA mobile=${uaInfo.isMobile}`,
          -15,
          ['BAD_FP', 'ANTIDETECT_LIKELY']
        )
      );
    }
    if (raw.userAgentData.platform) {
      const p = raw.userAgentData.platform.toLowerCase();
      const os = uaInfo.os;
      const ok =
        (os === 'windows' && p.includes('win')) ||
        (os === 'macos' && (p.includes('mac') || p.includes('macos'))) ||
        (os === 'linux' && p.includes('linux')) ||
        (os === 'android' && p.includes('android')) ||
        (os === 'ios' && (p.includes('ios') || p.includes('iphone') || p.includes('ipad'))) ||
        (os === 'chromeos' && p.includes('chrome'));
      if (!ok && os !== 'unknown') {
        findings.push(
          finding(
            'nav-uad-platform',
            'high',
            'userAgentData.platform ??? OS do UA',
            `platform="${raw.userAgentData.platform}" vs OS UA="${os}"`,
            -14,
            ['BAD_FP']
          )
        );
      }
    }

    // brands empty on chromium
    if (uaInfo.isChromium && (!raw.userAgentData.brands || !raw.userAgentData.brands.length)) {
      findings.push(
        finding(
          'nav-uad-no-brands',
          'medium',
          'Client Hints sem brands',
          'Chromium moderno expõe brands; ausência é suspeita.',
          -8,
          ['BAD_FP']
        )
      );
    }
  } else if (uaInfo.isChromium && uaInfo.browserVersion >= 90) {
    findings.push(
      finding(
        'nav-uad-missing',
        'medium',
        'userAgentData ausente em Chrome moderno',
        'Chrome 90+ normalmente expõe navigator.userAgentData.',
        -7,
        ['BAD_FP']
      )
    );
  }

  // appVersion vs userAgent mismatch
  if (raw.appVersion && !raw.appVersion.includes('Mozilla') && uaInfo.isChromium) {
    // appVersion often mirrors part of UA
  }
  if (raw.appVersion && navigator.userAgent && !navigator.userAgent.includes(raw.appVersion.slice(0, 20).replace(/^[^0-9A-Za-z]+/, ''))) {
    // soft: many browsers have appVersion as substring of UA
    const av = raw.appVersion;
    if (av.length > 10 && !navigator.userAgent.includes(av.substring(0, Math.min(30, av.length)))) {
      // Only flag if clearly different OS tokens
      const avOs = /Windows|Mac|Linux|Android|iPhone/i.exec(av);
      const uaOs = /Windows|Mac|Linux|Android|iPhone/i.exec(navigator.userAgent);
      if (avOs && uaOs && avOs[0] !== uaOs[0]) {
        findings.push(
          finding(
            'nav-appversion-os',
            'high',
            'appVersion OS ??? userAgent OS',
            `appVersion tem "${avOs[0]}", UA tem "${uaOs[0]}"`,
            -14,
            ['BAD_FP']
          )
        );
      }
    }
  }

  return finalizeResult('navigator', 'Navigator & Hints', findings, raw);
}
