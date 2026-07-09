/**
 * Trust score + explicações a partir do Fingerprint real do CreepJS
 * (window.Fingerprint / window.Creep)
 */

export const GRADES = [
  {
    min: 90,
    id: 'trusted',
    label: 'Confiável',
    description: 'Poucas ou nenhuma mentira — fingerprint parece de navegador real',
  },
  {
    min: 70,
    id: 'low',
    label: 'Risco baixo',
    description: 'Sinais leves ou proteções de privacidade',
  },
  {
    min: 45,
    id: 'suspicious',
    label: 'Suspeito',
    description: 'Inconsistências / mentiras típicas de spoof fraco',
  },
  {
    min: 20,
    id: 'high',
    label: 'Risco alto',
    description: 'Muitas mentiras de API ou padrão antidetect',
  },
  {
    min: 0,
    id: 'critical',
    label: 'Crítico',
    description: 'Mentiras óbvias, trash values ou headless forte',
  },
];

/** Tradução das strings de mentira do CreepJS → pt-BR + o que isso prova */
export const LIE_REASON_PT = {
  'failed illegal error':
    'Chamar a função de forma ilegal não gerou o TypeError nativo esperado — comportamento típico de Proxy/hook.',
  'failed undefined properties':
    'Propriedades internas undefined não se comportam como no motor nativo.',
  'failed call interface error':
    'Function.prototype.call na API não falhou como em funções nativas (interface adulterada).',
  'failed apply interface error':
    'Function.prototype.apply na API não falhou como em funções nativas.',
  'failed new instance error':
    'Usar new na função não produziu o erro nativo esperado.',
  'failed class extends error':
    'Estender a função com class não se comportou como API nativa.',
  'failed null conversion error':
    'Conversão de prototype para null não falhou como no nativo.',
  'failed toString':
    'Function.prototype.toString não devolve o formato nativo `[native code]` — a função foi reescrita.',
  'failed "prototype" in function':
    'O operador in sobre prototype da função não bate com o nativo.',
  'failed descriptor':
    'Object.getOwnPropertyDescriptor da função difere do descriptor nativo.',
  'failed own property':
    'hasOwnProperty / own property da função foi adulterado.',
  'failed descriptor keys':
    'Chaves do descriptor da função não batem com o nativo.',
  'failed own property names':
    'Object.getOwnPropertyNames da função difere do nativo.',
  'failed own keys names':
    'Reflect.ownKeys da função difere do nativo.',
  'failed object toString error':
    'Object.prototype.toString não se comporta como em API nativa.',
  'failed at incompatible proxy error':
    'Detectado comportamento de Proxy incompatível (stack/erro).',
  'failed at toString incompatible proxy error':
    'toString expõe padrão de Proxy incompatível.',
  'failed at too much recursion error':
    'Recursão no prototype não falhou como no nativo (Proxy).',
  'failed at too much recursion __proto__ error':
    'Cadeia __proto__ com recursão não se comporta como nativo.',
  'failed at chain cycle error':
    'Ciclo na cadeia de protótipos não gerou o erro esperado.',
  'failed at chain cycle __proto__ error':
    'Ciclo via __proto__ não gerou o erro nativo.',
  'failed at reflect set proto':
    'Reflect.setPrototypeOf não se comporta como no nativo.',
  'failed at reflect set proto proxy':
    'Reflect.setPrototypeOf em Proxy diverge do nativo.',
  'failed at instanceof check error':
    'instanceof / Symbol.hasInstance indica Proxy (comum em Chromium).',
  'failed at define properties':
    'Reflect.defineProperty na função falhou de modo anômalo.',
  'failed descriptor.value undefined':
    'descriptor.value da propriedade está undefined de forma suspeita.',
  'failed prototype test execution':
    'Teste de execução no prototype falhou — API sobrescrita ou bloqueada.',
};

const SECTION_LABELS = {
  navigator: 'Navigator',
  screen: 'Tela (Screen)',
  canvas2d: 'Canvas 2D',
  canvasWebgl: 'WebGL / GPU',
  fonts: 'Fontes',
  voices: 'Vozes (Speech)',
  media: 'Media devices',
  maths: 'Motor Math',
  consoleErrors: 'Erros de console (engine)',
  timezone: 'Fuso horário',
  clientRects: 'DOMRect / ClientRects',
  offlineAudioContext: 'Áudio (OfflineAudioContext)',
  svg: 'SVG',
  resistance: 'Resistência / privacidade',
  headless: 'Headless',
  workerScope: 'Web Worker',
  windowFeatures: 'Window features',
  htmlElementVersion: 'HTMLElement',
  cssMedia: 'CSS Media',
  css: 'CSS',
  intl: 'Intl',
  features: 'Features do engine',
  lies: 'Prototype lies',
  trash: 'Trash (valores lixo)',
  capturedErrors: 'Erros capturados',
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function gradeForScore(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g;
  }
  return GRADES[GRADES.length - 1];
}

export function translateLie(lie) {
  const key = String(lie || '').trim();
  if (LIE_REASON_PT[key]) {
    return { original: key, reason: LIE_REASON_PT[key] };
  }
  // partial match
  for (const [k, v] of Object.entries(LIE_REASON_PT)) {
    if (key.includes(k) || k.includes(key)) {
      return { original: key, reason: v };
    }
  }
  return {
    original: key,
    reason:
      'O CreepJS marcou esta API porque o comportamento diverge do motor nativo (hook, Proxy ou spoof incompleto).',
  };
}

function sectionLied(section) {
  if (!section || typeof section !== 'object') return false;
  if (section.lied === true || section.lied > 0) return true;
  return false;
}

/**
 * @param {object} fp window.Fingerprint
 * @param {object} [creep] window.Creep
 */
export function computeFromCreep(fp, creep = null) {
  if (!fp) {
    return {
      score: 0,
      grade: gradeForScore(0),
      lies: [],
      tags: ['SEM_DADOS'],
      sections: [],
      snapshot: {},
      stats: {},
      raw: { fp: null, creep: null },
    };
  }

  let delta = 0;
  const lieCards = [];
  const tags = new Set();
  const sections = [];

  // --- Prototype lies (core CreepJS) ---
  const liesData = fp.lies?.data || {};
  const totalLies = fp.lies?.totalLies ?? Object.values(liesData).reduce((a, arr) => a + (arr?.length || 0), 0);

  for (const [apiName, list] of Object.entries(liesData)) {
    const items = Array.isArray(list) ? list : [list];
    for (const lie of items) {
      const tr = translateLie(lie);
      const impact = -3;
      delta += impact;
      lieCards.push({
        severity: 'high',
        category: 'Prototype lie',
        title: `Mentira em ${apiName}`,
        what: `A API/função "${apiName}" não se comporta como nativa.`,
        evidence: tr.original,
        why: tr.reason,
        impact,
        source: 'fp.lies.data',
        api: apiName,
      });
    }
  }

  if (totalLies > 0) {
    tags.add('API_FALSIFICADA');
    if (totalLies >= 5) tags.add('ANTIDETECT_PROVAVEL');
    if (totalLies >= 15) {
      tags.add('ANTIDETECT_CONFIRMADO');
      delta -= 10;
    }
  }

  // Extra mass penalty for many lies
  if (totalLies >= 8) delta -= Math.min(25, (totalLies - 7) * 1.5);

  // --- Sections with .lied ---
  for (const [key, label] of Object.entries(SECTION_LABELS)) {
    const sec = fp[key];
    if (!sec) continue;
    const lied = sectionLied(sec);
    sections.push({
      id: key,
      label,
      lied: !!lied,
      hash: sec.$hash || null,
      detail: summarizeSection(key, sec),
    });
    if (lied && key !== 'lies') {
      const impact = key === 'headless' || key === 'workerScope' ? -12 : -8;
      delta += impact;
      lieCards.push({
        severity: key === 'headless' ? 'critical' : 'high',
        category: 'Seção mentiu',
        title: `${label} reportou mentira (lied)`,
        what: `O módulo CreepJS "${label}" marcou lied=true (ou contagem > 0).`,
        evidence: formatEvidence(sec),
        why: whySectionLied(key),
        impact,
        source: `fp.${key}.lied`,
        api: key,
      });
      if (key === 'screen') tags.add('SPOOF_TELA');
      if (key === 'canvas2d' || key === 'canvasWebgl') tags.add('CANVAS_RUIDO');
      if (key === 'workerScope') tags.add('WORKER_DIVERGENTE');
      if (key === 'headless') tags.add('SEM_INTERFACE');
      tags.add('FP_RUIM');
    }
  }

  // --- Trash bin ---
  const trashBin = fp.trash?.trashBin || [];
  for (const t of trashBin) {
    const impact = -6;
    delta += impact;
    lieCards.push({
      severity: 'medium',
      category: 'Trash',
      title: `Valor lixo: ${t.name}`,
      what: 'Valor inconsistente ou “lixo” capturado pelo CreepJS (trustInteger / gibberish / proxy).',
      evidence: `${t.name} = ${stringify(t.value)}`,
      why: 'Valores que não deveriam existir em um browser íntegro (ex.: inteiro inválido, string gibberish de GPU, proxy behavior).',
      impact,
      source: 'fp.trash.trashBin',
      api: t.name,
    });
    tags.add('FP_RUIM');
  }
  if (trashBin.length >= 3) {
    delta -= 8;
    tags.add('ANTIDETECT_PROVAVEL');
  }

  // --- Headless scores ---
  const headless = fp.headless || {};
  const likeHeadless = num(headless.likeHeadless);
  const headlessPct = num(headless.headless);
  const stealth = num(headless.stealth);
  if (likeHeadless >= 50 || headlessPct >= 40 || stealth >= 40) {
    const impact = -Math.min(30, Math.round((likeHeadless + headlessPct + stealth) / 8));
    delta += impact;
    lieCards.push({
      severity: 'critical',
      category: 'Headless',
      title: 'Sinais de headless / stealth',
      what: 'Heurísticas do CreepJS indicam ambiente automatizado ou headless.',
      evidence: `likeHeadless≈${likeHeadless}% · headless≈${headlessPct}% · stealth≈${stealth}%`,
      why: 'Chrome headless, Puppeteer stealth e VMs deixam rastros em platform hints, UA, WebGL software, etc.',
      impact,
      source: 'fp.headless',
      api: 'headless',
    });
    tags.add('SEM_INTERFACE');
    tags.add('AUTOMACAO');
  }

  // --- Resistance / privacy (soft) ---
  const resistance = fp.resistance || {};
  if (resistance.privacy && /tor|firefox|brave|resist/i.test(String(resistance.privacy))) {
    delta -= 4;
    tags.add('PRIVACIDADE');
    lieCards.push({
      severity: 'info',
      category: 'Privacidade',
      title: `Modo de privacidade: ${resistance.privacy}`,
      what: 'O CreepJS detectou proteção de privacidade / resistance fingerprinting.',
      evidence: formatEvidence(resistance),
      why: 'Não é necessariamente fraude — Tor, RFP e Brave Strict reduzem entropia e podem parecer “anômalos”.',
      impact: -4,
      source: 'fp.resistance',
      api: 'resistance',
    });
  }

  // --- Worker vs main mismatches (if present in workerScope) ---
  const ws = fp.workerScope || {};
  if (ws.lied || ws.localeEntropyIsTrusty === false || ws.localeIntlEntropyIsTrusty === false) {
    if (!lieCards.some((c) => c.api === 'workerScope')) {
      const impact = -10;
      delta += impact;
      tags.add('WORKER_DIVERGENTE');
      lieCards.push({
        severity: 'high',
        category: 'Worker',
        title: 'Worker / locale não confiável',
        what: 'Entropia de locale/Intl no worker não é trusty ou o worker mentiu.',
        evidence: formatEvidence({
          lied: ws.lied,
          localeEntropyIsTrusty: ws.localeEntropyIsTrusty,
          localeIntlEntropyIsTrusty: ws.localeIntlEntropyIsTrusty,
          userAgent: ws.userAgent,
          platform: ws.platform,
        }),
        why: 'Spoof na página principal costuma não se propagar ao Web Worker — o CreepJS compara os dois contextos.',
        impact,
        source: 'fp.workerScope',
        api: 'workerScope',
      });
    }
  }

  // Sort by severity
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  lieCards.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9));

  // Multi-signal correlation
  const hardTags = ['API_FALSIFICADA', 'WORKER_DIVERGENTE', 'CANVAS_RUIDO', 'SPOOF_TELA', 'SEM_INTERFACE', 'AUTOMACAO'];
  const hit = hardTags.filter((t) => tags.has(t));
  if (hit.length >= 2) {
    delta -= 4 + hit.length * 2;
    tags.add('MULTI_SINAL');
  }

  const score = clamp(Math.round(100 + delta), 0, 100);
  const grade = gradeForScore(score);

  const snapshot = buildSnapshot(fp, creep);

  return {
    score,
    grade,
    totalDelta: Math.round(delta * 100) / 100,
    totalLies,
    trashCount: trashBin.length,
    lies: lieCards,
    tags: [...tags],
    sections,
    snapshot,
    stats: {
      totalLies,
      trashCount: trashBin.length,
      sectionsLied: sections.filter((s) => s.lied).length,
      sectionsTotal: sections.length,
      likeHeadless,
      headless: headlessPct,
      stealth,
    },
    creepHash: creep ? summarizeCreep(creep) : null,
    raw: { fingerprint: fp, creep },
    timestamp: new Date().toISOString(),
    engine: 'CreepJS (vendor/creepjs/creep.js)',
  };
}

function num(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const m = String(v).match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

function stringify(v) {
  try {
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function formatEvidence(obj) {
  try {
    const slim = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (k === '$hash' || k === 'pixels' || k === 'dataURI' || k === 'emojiDataURI') continue;
      if (typeof v === 'function') continue;
      if (typeof v === 'object' && v !== null) {
        slim[k] = Array.isArray(v) ? `Array(${v.length})` : '{…}';
      } else {
        slim[k] = v;
      }
    }
    return JSON.stringify(slim, null, 2).slice(0, 1200);
  } catch {
    return String(obj);
  }
}

function summarizeSection(key, sec) {
  if (key === 'canvasWebgl') {
    return sec.gpu?.compressedGPU || sec.parameters?.UNMASKED_RENDERER_WEBGL || sec.$hash || '';
  }
  if (key === 'navigator') {
    return [sec.platform, sec.userAgent?.slice?.(0, 60)].filter(Boolean).join(' · ');
  }
  if (key === 'screen') {
    return `${sec.width}×${sec.height}`;
  }
  return sec.$hash ? String(sec.$hash).slice(0, 16) : '';
}

function whySectionLied(key) {
  const map = {
    navigator: 'UA, platform, hardware ou plugins foram forjados de forma inconsistente com o restante do browser.',
    screen: 'Resolução/DPR/avail não batem com o que um dispositivo real exporia (spoof de tela).',
    canvas2d: 'Canvas 2D foi bloqueado, ruidoso ou incoerente — típico de CanvasBlocker / antidetect.',
    canvasWebgl: 'WebGL renderer/vendor ou pixels foram adulterados ou são de GPU software.',
    fonts: 'Lista de fontes não combina com o SO declarado ou foi randomizada.',
    voices: 'Vozes de speechSynthesis inconsistentes ou mentindo.',
    maths: 'Resultados de Math divergem do engine esperado para o UA.',
    timezone: 'Fuso / offset inconsistente com locale ou com o worker.',
    clientRects: 'DOMRect/emoji rects adulterados (spoof de geometria).',
    offlineAudioContext: 'Fingerprint de áudio bloqueado ou com ruído.',
    workerScope: 'Worker reporta dados diferentes da main thread.',
    headless: 'Heurísticas de headless/stealth dispararam.',
    resistance: 'Extensão ou modo de resistência a fingerprint detectado.',
  };
  return (
    map[key] ||
    'O CreepJS marcou lied nesta seção porque os testes internos encontraram inconsistência ou adulteração.'
  );
}

function buildSnapshot(fp, creep) {
  const nav = fp.navigator || {};
  const screen = fp.screen || {};
  const webgl = fp.canvasWebgl || {};
  const tz = fp.timezone || {};
  const ws = fp.workerScope || {};
  const gpu =
    webgl.gpu?.compressedGPU ||
    webgl.parameters?.UNMASKED_RENDERER_WEBGL ||
    ws.webglRenderer ||
    '—';
  const vendor = webgl.parameters?.UNMASKED_VENDOR_WEBGL || '—';

  return {
    userAgent: nav.userAgent || ws.userAgent || navigator.userAgent,
    platform: nav.platform || ws.platform || navigator.platform,
    vendor: nav.vendor || '',
    hardwareConcurrency: nav.hardwareConcurrency ?? ws.hardwareConcurrency ?? navigator.hardwareConcurrency,
    deviceMemory: nav.deviceMemory ?? ws.deviceMemory ?? navigator.deviceMemory,
    language: nav.language || (nav.languages && nav.languages[0]) || navigator.language,
    languages: nav.languages || navigator.languages,
    screen: screen.width && screen.height ? `${screen.width}×${screen.height}` : `${window.screen.width}×${window.screen.height}`,
    pixelDepth: screen.pixelDepth ?? window.screen.pixelDepth,
    gpu: String(gpu).slice(0, 100),
    gpuVendor: String(vendor).slice(0, 80),
    timezone: tz.zone || tz.locale || Intl.DateTimeFormat().resolvedOptions().timeZone,
    system: nav.system || '',
    device: nav.device || '',
    liesTotal: fp.lies?.totalLies ?? 0,
    resistance: fp.resistance?.privacy || fp.resistance?.mode || '',
    headlessLike: fp.headless ? num(fp.headless.likeHeadless) : 0,
  };
}

function summarizeCreep(creep) {
  try {
    return {
      keys: Object.keys(creep || {}),
      hasNavigator: !!creep?.navigator,
      hasScreen: !!creep?.screen,
      liesUnique: Array.isArray(creep?.lies) ? creep.lies.length : null,
    };
  } catch {
    return null;
  }
}

export const TAG_INFO = {
  API_FALSIFICADA: {
    titulo: 'API falsificada (mentira)',
    desc: 'Prototype lies do CreepJS: funções nativas reescritas ou com Proxy.',
  },
  WORKER_DIVERGENTE: {
    titulo: 'Worker divergente',
    desc: 'Main thread e Web Worker não batem — spoof incompleto.',
  },
  CANVAS_RUIDO: {
    titulo: 'Canvas / WebGL mentiu',
    desc: 'Seção canvas2d ou canvasWebgl com lied no CreepJS.',
  },
  SPOOF_TELA: {
    titulo: 'Spoof de tela',
    desc: 'Módulo screen do CreepJS marcou mentira.',
  },
  AUTOMACAO: {
    titulo: 'Automação / headless',
    desc: 'Heurísticas de headless ou stealth do CreepJS.',
  },
  SEM_INTERFACE: {
    titulo: 'Sem interface (headless)',
    desc: 'Ambiente parece headless, VM ou GPU software.',
  },
  ANTIDETECT_PROVAVEL: {
    titulo: 'Antidetect provável',
    desc: 'Volume alto de lies/trash típico de browser antidetect.',
  },
  ANTIDETECT_CONFIRMADO: {
    titulo: 'Antidetect confirmado',
    desc: 'Muitas prototype lies (≥15) — padrão forte de antidetect.',
  },
  FP_RUIM: {
    titulo: 'Fingerprint ruim',
    desc: 'Seções do fingerprint com lied ou trash values.',
  },
  PRIVACIDADE: {
    titulo: 'Privacidade',
    desc: 'Tor / RFP / Brave — proteção legítima, não fraude sozinha.',
  },
  MULTI_SINAL: {
    titulo: 'Multi-sinal',
    desc: 'Várias categorias de risco ao mesmo tempo.',
  },
  SEM_DADOS: {
    titulo: 'Sem dados',
    desc: 'Fingerprint do CreepJS não ficou disponível.',
  },
};
