/** WebGPU adapter vs WebGL / OS */

import { finding, finalizeResult, parseUserAgent, safe, withTimeout } from '../utils.js?v3';

function getWebGLRenderer() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return null;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  } catch {
    return null;
  }
}

async function getGpuAdapter() {
  if (!navigator.gpu) return { available: false };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { available: true, adapter: null };
    const info = adapter.info || {};
    // requestAdapterInfo deprecated; try both
    let legacy = null;
    if (typeof adapter.requestAdapterInfo === 'function') {
      try {
        legacy = await adapter.requestAdapterInfo();
      } catch {
        /* ignore */
      }
    }
    return {
      available: true,
      adapter: {
        isFallbackAdapter: adapter.isFallbackAdapter,
        features: adapter.features ? [...adapter.features].slice(0, 20) : [],
        info,
        legacy,
        vendor: info.vendor || legacy?.vendor || null,
        architecture: info.architecture || legacy?.architecture || null,
        device: info.device || legacy?.device || null,
        description: info.description || legacy?.description || null,
      },
    };
  } catch (e) {
    return { available: true, error: String(e.message || e) };
  }
}

export async function run() {
  const findings = [];
  const ua = parseUserAgent();
  const gl = getWebGLRenderer();
  const gpu = await withTimeout(getGpuAdapter(), 3000, { available: !!navigator.gpu, error: 'timeout' });

  const raw = { webgl: gl, webgpu: gpu, uaOs: ua.os };

  if (!navigator.gpu) {
    // Chrome 113+ usually has it on desktop; absence alone is weak
    if (ua.isChromium && ua.browserVersion >= 120 && !ua.isMobile) {
      findings.push(
        finding(
          'webgpu-missing-chrome',
          'low',
          'WebGPU ausente em Chrome moderno',
          'Pode ser flag desligada, GPU bloqueada ou ambiente restrito',
          -3,
          [],
          0.45
        )
      );
    }
    return finalizeResult('webgpu', 'WebGPU', findings, raw);
  }

  if (gpu.error) {
    findings.push(
      finding('webgpu-error', 'low', 'Falha ao obter adapter WebGPU', gpu.error, -2, [], 0.5)
    );
    return finalizeResult('webgpu', 'WebGPU', findings, raw, 'partial');
  }

  if (gpu.adapter?.isFallbackAdapter) {
    findings.push(
      finding(
        'webgpu-fallback',
        'medium',
        'WebGPU fallback adapter',
        'Adapter de fallback - GPU limitada/software',
        -8,
        ['HEADLESS'],
        0.8
      )
    );
  }

  const desc = `${gpu.adapter?.vendor || ''} ${gpu.adapter?.device || ''} ${gpu.adapter?.description || ''} ${gpu.adapter?.architecture || ''}`.toLowerCase();
  const glr = `${gl?.vendor || ''} ${gl?.renderer || ''}`.toLowerCase();

  // Software / virtual
  if (/swiftshader|llvmpipe|software|basic render driver/.test(desc + glr)) {
    findings.push(
      finding(
        'webgpu-software',
        'high',
        'GPU software no WebGPU/WebGL',
        desc || glr,
        -16,
        ['HEADLESS', 'BAD_FP'],
        0.9
      )
    );
  }

  // iOS UA with desktop gpu names via webgpu
  if (ua.os === 'ios' && /nvidia|amd|geforce|radeon|intel/.test(desc)) {
    findings.push(
      finding(
        'webgpu-ios-desktop',
        'critical',
        'UA iOS com GPU desktop (WebGPU)',
        desc,
        -24,
        ['BAD_FP', 'ANTIDETECT_LIKELY'],
        0.92
      )
    );
  }

  // WebGL says NVIDIA, WebGPU empty/mismatch brand - soft
  if (gl?.renderer && gpu.adapter) {
    const glNvidia = /nvidia|geforce/i.test(gl.renderer);
    const glAmd = /amd|radeon/i.test(gl.renderer);
    const glIntel = /intel/i.test(gl.renderer);
    const gpNvidia = /nvidia|geforce/i.test(desc);
    const gpAmd = /amd|radeon/i.test(desc);
    const gpIntel = /intel/i.test(desc);
    if ((glNvidia && (gpAmd || gpIntel)) || (glAmd && (gpNvidia || gpIntel)) || (glIntel && (gpNvidia || gpAmd))) {
      findings.push(
        finding(
          'webgpu-webgl-brand',
          'high',
          'WebGPU vendor != WebGL renderer',
          `WebGL=${gl.renderer} WebGPU=${desc}`,
          -15,
          ['BAD_FP', 'ANTIDETECT_LIKELY'],
          0.88
        )
      );
    }
  }

  return finalizeResult('webgpu', 'WebGPU', findings, raw);
}
