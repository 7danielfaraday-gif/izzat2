/** WebGL vendor/renderer, software GL, extensions, hash de render */

import { finding, finalizeResult, hashString, parseUserAgent, safe } from '../utils.js?v3';

const SOFTWARE_GL = [
  /swiftshader/i,
  /llvmpipe/i,
  /software.?rasterizer/i,
  /microsoft basic render/i,
  /mesa.?offscreen/i,
  /virtualbox/i,
  /vmware/i,
  /parallels/i,
];

function getWebGLInfo(webgl2 = false) {
  const canvas = document.createElement('canvas');
  const gl = safe(() =>
    canvas.getContext(webgl2 ? 'webgl2' : 'webgl', { failIfMajorPerformanceCaveat: false })
  ) || safe(() => canvas.getContext('experimental-webgl'));
  if (!gl) return null;

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const vendor = dbg
    ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)
    : gl.getParameter(gl.VENDOR);
  const renderer = dbg
    ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);

  const extensions = gl.getSupportedExtensions() || [];
  const params = {
    VERSION: gl.getParameter(gl.VERSION),
    SHADING_LANGUAGE_VERSION: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    VENDOR: gl.getParameter(gl.VENDOR),
    RENDERER: gl.getParameter(gl.RENDERER),
    MAX_TEXTURE_SIZE: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    MAX_RENDERBUFFER_SIZE: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    MAX_VERTEX_ATTRIBS: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
    MAX_VIEWPORT_DIMS: safe(() => Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS))),
    ALIASED_LINE_WIDTH_RANGE: safe(() => Array.from(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE))),
  };

  // Simple render hash
  let renderHash = null;
  try {
    const vsSrc = 'attribute vec2 a;void main(){gl_Position=vec4(a,0,1);}';
    const fsSrc = 'precision mediump float;void main(){gl_FragColor=vec4(0.2,0.4,0.6,1);}';
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSrc);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSrc);
    gl.compileShader(fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 0, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, 16, 16);
    gl.clearColor(0.1, 0.2, 0.3, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = new Uint8Array(16 * 16 * 4);
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    renderHash = Array.from(pixels.slice(0, 64)).join(',');
  } catch {
    renderHash = 'error';
  }

  return {
    vendor,
    renderer,
    extensions,
    extensionCount: extensions.length,
    params,
    renderHash,
    hasDebugInfo: !!dbg,
  };
}

export async function run() {
  const findings = [];
  const ua = parseUserAgent();
  const gl1 = getWebGLInfo(false);
  const gl2 = getWebGLInfo(true);

  const raw = {
    webgl: gl1,
    webgl2: gl2
      ? {
          vendor: gl2.vendor,
          renderer: gl2.renderer,
          extensionCount: gl2.extensionCount,
          renderHash: gl2.renderHash ? await hashString(gl2.renderHash) : null,
        }
      : null,
  };

  if (gl1?.renderHash) {
    raw.webglRenderHash = await hashString(gl1.renderHash);
  }

  if (!gl1) {
    findings.push(
      finding(
        'webgl-disabled',
        'medium',
        'WebGL indisponível',
        'Desabilitado ou bloqueado ??" suspeito em desktop moderno, comum em privacy.',
        -6,
        ['PRIVACY']
      )
    );
    return finalizeResult('webgl', 'WebGL', findings, raw);
  }

  const vendor = gl1.vendor || '';
  const renderer = gl1.renderer || '';
  const combo = `${vendor} ${renderer}`;

  // Software / VM GL
  for (const re of SOFTWARE_GL) {
    if (re.test(combo)) {
      findings.push(
        finding(
          'webgl-software',
          'high',
          'GPU software / VM detectada',
          `renderer="${renderer}" ??" típico de headless, VM ou server-side browser.`,
          -18,
          ['HEADLESS', 'BAD_FP', 'ANTIDETECT_LIKELY']
        )
      );
      break;
    }
  }

  // Empty vendor/renderer after unmask
  if (!vendor || !renderer || vendor === 'Google Inc.' && /ANGLE \(Google,? Vulkan,? 16\.0\.0\)/i.test(renderer)) {
    // Google SwiftShader often shows specific strings already caught
  }
  if (!renderer || renderer === 'null' || renderer === 'undefined') {
    findings.push(
      finding(
        'webgl-empty-renderer',
        'high',
        'WebGL renderer vazio',
        'Spoof incompleto de getParameter.',
        -14,
        ['BAD_FP', 'PROTOTYPE_LIE']
      )
    );
  }

  // Very few extensions
  if (gl1.extensionCount < 5) {
    findings.push(
      finding(
        'webgl-few-ext',
        'medium',
        'Poucas extensões WebGL',
        `Apenas ${gl1.extensionCount} extensões ??" headless/restrito.`,
        -7,
        ['HEADLESS']
      )
    );
  }

  // iOS UA with desktop GPU
  if (ua.os === 'ios' && /nvidia|amd|geforce|radeon|intel\(r\)|quadro/i.test(combo)) {
    findings.push(
      finding(
        'webgl-ios-desktop-gpu',
        'critical',
        'UA iOS com GPU desktop',
        `renderer="${renderer}"`,
        -25,
        ['BAD_FP', 'ANTIDETECT_LIKELY']
      )
    );
  }

  // Android UA with desktop discrete GPU names sometimes ok (some devices) ??" NVIDIA on Android exists (Shield)
  if (ua.os === 'android' && /geforce gtx|radeon rx|intel iris/i.test(combo)) {
    findings.push(
      finding(
        'webgl-android-desktop-gpu',
        'high',
        'UA Android com GPU desktop PC',
        renderer,
        -16,
        ['BAD_FP']
      )
    );
  }

  // Windows UA with Apple GPU
  if (ua.os === 'windows' && /apple gpu|m1|m2|m3|m4/i.test(combo)) {
    findings.push(
      finding(
        'webgl-win-apple-gpu',
        'critical',
        'UA Windows com Apple GPU',
        renderer,
        -25,
        ['BAD_FP', 'ANTIDETECT_LIKELY']
      )
    );
  }

  // macOS with NVIDIA (old macs exist but rare in 2024+)
  if (ua.os === 'macos' && /geforce|nvidia/i.test(combo) && !/apple/i.test(combo)) {
    findings.push(
      finding(
        'webgl-mac-nvidia',
        'low',
        'macOS com NVIDIA (raro em hardware recente)',
        renderer,
        -3,
        []
      )
    );
  }

  // WebGL2 missing on modern Chrome
  if (ua.isChromium && ua.browserVersion >= 56 && !gl2) {
    findings.push(
      finding(
        'webgl2-missing',
        'low',
        'WebGL2 ausente em Chrome moderno',
        'Pode ser política ou ambiente restrito.',
        -3,
        []
      )
    );
  }

  // MAX_TEXTURE_SIZE absurd
  const mts = gl1.params?.MAX_TEXTURE_SIZE;
  if (mts && (mts < 1024 || mts > 32768)) {
    findings.push(
      finding(
        'webgl-texture-size',
        'medium',
        'MAX_TEXTURE_SIZE atípico',
        String(mts),
        -6,
        ['BAD_FP']
      )
    );
  }

  // getParameter not native
  const gpNative = safe(() =>
    /\[native code\]/.test(Function.prototype.toString.call(WebGLRenderingContext.prototype.getParameter))
  );
  if (gpNative === false) {
    findings.push(
      finding(
        'webgl-getparameter-hook',
        'high',
        'WebGL getParameter hookado',
        'Função não nativa ??" spoof de vendor/renderer.',
        -16,
        ['PROTOTYPE_LIE', 'ANTIDETECT_LIKELY']
      )
    );
  }

  return finalizeResult('webgl', 'WebGL', findings, raw);
}
