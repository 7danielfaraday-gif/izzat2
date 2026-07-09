/** Motor de Trust Score v2 - correlacao + confidence + motivos das tags */

import { clamp } from './utils.js?v5';

export const GRADES = [
  {
    min: 90,
    id: 'trusted',
    label: 'Confiavel',
    description: 'Fingerprint coerente - navegador real',
  },
  {
    min: 70,
    id: 'low',
    label: 'Risco baixo',
    description: 'Sinais menores ou protecoes de privacidade',
  },
  {
    min: 45,
    id: 'suspicious',
    label: 'Suspeito',
    description: 'Inconsistencias tipicas de spoof fraco',
  },
  {
    min: 20,
    id: 'high',
    label: 'Risco alto',
    description: 'Padrao antidetect / automacao',
  },
  {
    min: 0,
    id: 'critical',
    label: 'Critico',
    description: 'Spoof obvio, headless ou CDP exposto',
  },
];

/** Legendas das tags (PT) para UI */
export const TAG_INFO = {
  FP_RUIM: {
    titulo: 'Fingerprint ruim',
    desc: 'Varios sinais do fingerprint nao batem entre si (UA, GPU, tela, fontes, etc.).',
  },
  SPOOF_TELA: {
    titulo: 'Spoof de tela',
    desc: 'Resolucao/DPR/viewport inconsistentes - comum quando o antidetect finge outra tela.',
  },
  ANTIDETECT_PROVAVEL: {
    titulo: 'Antidetect provavel',
    desc: 'Padrao tipico de browser antidetect (AdsPower, Multilogin, etc.), ainda nao 100% confirmado.',
  },
  ANTIDETECT_CONFIRMADO: {
    titulo: 'Antidetect confirmado',
    desc: 'Combinacao forte: ruido de canvas + API reescrita e/ou worker divergente.',
  },
  SEM_INTERFACE: {
    titulo: 'Sem interface (headless)',
    desc: 'Sinais de Chrome headless, VM, GPU software ou ambiente sem tela real.',
  },
  MULTI_SINAL: {
    titulo: 'Multi-sinal',
    desc: 'Varias categorias de risco ao mesmo tempo - a correlacao aumenta a penalidade.',
  },
  AUTOMACAO: {
    titulo: 'Automacao',
    desc: 'WebDriver, Selenium, Puppeteer, Playwright ou residuos de CDP.',
  },
  API_FALSIFICADA: {
    titulo: 'API falsificada',
    desc: 'Funcoes nativas reescritas (prototype lies) - spoof incompleto de fingerprint.',
  },
  WORKER_DIVERGENTE: {
    titulo: 'Worker divergente',
    desc: 'Main thread e Web Worker reportam valores diferentes - spoof so na janela principal.',
  },
  CANVAS_RUIDO: {
    titulo: 'Canvas com ruido',
    desc: 'Hash do canvas muda entre leituras - ruido aleatorio tipico de antidetect.',
  },
  PRIVACIDADE: {
    titulo: 'Privacidade',
    desc: 'Protecao de privacidade (Tor, resistFingerprinting). Nao significa fraude sozinho.',
  },
};

export function gradeForScore(score) {
  for (const g of GRADES) {
    if (score >= g.min) return g;
  }
  return GRADES[GRADES.length - 1];
}

const CORRELATION_TAGS = [
  'API_FALSIFICADA',
  'WORKER_DIVERGENTE',
  'CANVAS_RUIDO',
  'FP_RUIM',
  'AUTOMACAO',
  'SPOOF_TELA',
  'SEM_INTERFACE',
];

function findingReason(f) {
  const mod = f.moduleLabel || f.module || 'modulo';
  const det = (f.detail || '').trim();
  const title = f.title || f.id || 'check';
  return det ? `[${mod}] ${title}: ${det}` : `[${mod}] ${title}`;
}

function findingsWithTag(allFindings, tag) {
  return allFindings.filter((f) => (f.tags || []).includes(tag));
}

function reasonsFromFindings(list, max = 8) {
  return list.slice(0, max).map(findingReason);
}

/**
 * Monta objeto de detalhes por tag com motivos concretos.
 */
function buildTagDetails(tags, allFindings, clusters, extraReasons = {}) {
  const details = {};

  for (const tag of tags) {
    const info = TAG_INFO[tag] || { titulo: tag, desc: '' };
    const linked = findingsWithTag(allFindings, tag);
    let motivos = reasonsFromFindings(linked);
    let regra = info.desc;

    // Motivos extras de regras de correlacao
    if (extraReasons[tag]?.length) {
      motivos = [...extraReasons[tag], ...motivos];
    }

    // Tags derivadas: se nao ha finding com a tag, usar findings relacionados
    if (!motivos.length) {
      if (tag === 'ANTIDETECT_PROVAVEL' || tag === 'ANTIDETECT_CONFIRMADO') {
        const related = allFindings.filter((f) =>
          (f.tags || []).some((t) =>
            ['CANVAS_RUIDO', 'WORKER_DIVERGENTE', 'API_FALSIFICADA', 'SPOOF_TELA', 'AUTOMACAO'].includes(t)
          )
        );
        motivos = reasonsFromFindings(related);
      }
      if (tag === 'MULTI_SINAL') {
        const hit = CORRELATION_TAGS.filter((t) =>
          tags.includes(t) || allFindings.some((f) => (f.tags || []).includes(t))
        );
        motivos = [
          `Foram detectadas ${hit.length} categorias de risco ao mesmo tempo: ${hit.join(', ')}.`,
          ...reasonsFromFindings(
            allFindings.filter((f) =>
              (f.tags || []).some((t) => CORRELATION_TAGS.includes(t))
            ),
            6
          ),
        ];
      }
      if (tag === 'FP_RUIM') {
        const high = allFindings.filter((f) => f.severity === 'high' || f.severity === 'critical');
        if (high.length >= 3) {
          motivos = [
            `Regra: ${high.length} findings de severidade alta/critica (limite: 3).`,
            ...reasonsFromFindings(high, 6),
          ];
        } else {
          motivos = reasonsFromFindings(findingsWithTag(allFindings, 'FP_RUIM'));
        }
      }
      if (tag === 'SPOOF_TELA') {
        const screenF = allFindings.filter(
          (f) =>
            (f.tags || []).includes('SPOOF_TELA') ||
            f.id === 'screen-inner-gt' ||
            f.id === 'mm-screen-mismatch' ||
            f.id === 'screen-dpr-mm' ||
            f.id === 'mm-dpr-mismatch' ||
            f.id === 'screen-outer-gt'
        );
        motivos = reasonsFromFindings(screenF);
      }
    }

    // Dedup motivos
    const seen = new Set();
    motivos = motivos.filter((m) => {
      if (seen.has(m)) return false;
      seen.add(m);
      return true;
    });

    details[tag] = {
      id: tag,
      titulo: info.titulo,
      descricao: info.desc,
      regra,
      motivos,
      findingIds: linked.map((f) => f.id).filter(Boolean),
      findingCount: linked.length || motivos.length,
    };
  }

  // Anexar motivos dos clusters tambem
  for (const c of clusters) {
    if (!details[c.id] && TAG_INFO[c.id]) {
      details[c.id] = {
        id: c.id,
        titulo: TAG_INFO[c.id].titulo,
        descricao: TAG_INFO[c.id].desc,
        regra: c.detail,
        motivos: [c.detail, ...(extraReasons[c.id] || [])],
        findingIds: [],
        findingCount: 0,
      };
    }
  }

  return details;
}

/**
 * @param {Array} moduleResults
 * @param {{ mode?: 'strict'|'balanced' }} options
 */
export function computeScore(moduleResults, options = {}) {
  const mode = options.mode === 'balanced' ? 'balanced' : 'strict';
  const modeFactor = mode === 'strict' ? 1.15 : 1.0;

  let totalDelta = 0;
  const allFindings = [];
  const tags = new Set();
  const categoryScores = {};
  let confSum = 0;
  let confCount = 0;
  const extraReasons = {};

  for (const mod of moduleResults) {
    let modWeighted = 0;
    for (const f of mod.findings || []) {
      const conf = f.confidence != null ? f.confidence : 0.85;
      const wd = (f.delta || 0) * conf * modeFactor;
      const findingOut = {
        ...f,
        confidence: conf,
        weightedDelta: Math.round(wd * 100) / 100,
        module: mod.id,
        moduleLabel: mod.label,
      };
      allFindings.push(findingOut);
      modWeighted += wd;
      confSum += conf;
      confCount++;
      (f.tags || []).forEach((t) => tags.add(t));
    }

    const delta = mod.findings?.length ? modWeighted : (mod.scoreDelta || 0) * modeFactor;
    totalDelta += delta;

    const modPenalty = Math.abs(Math.min(0, delta));
    categoryScores[mod.id] = {
      label: mod.label,
      score: clamp(100 - modPenalty, 0, 100),
      delta: Math.round(delta * 100) / 100,
      findingCount: (mod.findings || []).length,
      status: mod.status || 'ok',
    };
  }

  const clusters = [];
  let correlationDelta = 0;

  const has = (t) => tags.has(t) || allFindings.some((f) => (f.tags || []).includes(t));
  const hasId = (id) => allFindings.some((f) => f.id === id);
  const getById = (id) => allFindings.find((f) => f.id === id);

  const hitCorrTags = CORRELATION_TAGS.filter((t) => has(t));
  if (hitCorrTags.length >= 2) {
    const extra = -Math.min(20, 4 + hitCorrTags.length * 3);
    correlationDelta += extra;
    const exemplos = reasonsFromFindings(
      allFindings.filter((f) => (f.tags || []).some((t) => hitCorrTags.includes(t))),
      5
    );
    clusters.push({
      id: 'MULTI_SINAL',
      label: 'Multi-sinal correlacionado',
      detail: `Categorias ativas: ${hitCorrTags.join(', ')}`,
      delta: extra,
    });
    tags.add('MULTI_SINAL');
    extraReasons.MULTI_SINAL = [
      `Motivo da correlacao: ${hitCorrTags.length} tipos de risco diferentes apareceram juntos (${hitCorrTags.join(', ')}).`,
      `Penalidade extra aplicada: ${extra}.`,
      ...exemplos,
    ];
  }

  if (has('CANVAS_RUIDO') && (has('WORKER_DIVERGENTE') || has('API_FALSIFICADA'))) {
    const extra = -15;
    correlationDelta += extra;
    const partes = [];
    if (has('CANVAS_RUIDO')) {
      partes.push(...reasonsFromFindings(findingsWithTag(allFindings, 'CANVAS_RUIDO'), 3));
    }
    if (has('WORKER_DIVERGENTE')) {
      partes.push(...reasonsFromFindings(findingsWithTag(allFindings, 'WORKER_DIVERGENTE'), 3));
    }
    if (has('API_FALSIFICADA')) {
      partes.push(...reasonsFromFindings(findingsWithTag(allFindings, 'API_FALSIFICADA'), 3));
    }
    clusters.push({
      id: 'ANTIDETECT_CONFIRMADO',
      label: 'Antidetect confirmado',
      detail: 'Canvas com ruido + API falsificada e/ou worker divergente',
      delta: extra,
    });
    tags.add('ANTIDETECT_CONFIRMADO');
    tags.add('ANTIDETECT_PROVAVEL');
    extraReasons.ANTIDETECT_CONFIRMADO = [
      'Regra: canvas com ruido E (worker divergente OU API falsificada) = antidetect confirmado.',
      ...partes,
    ];
    extraReasons.ANTIDETECT_PROVAVEL = [
      'Derivado de ANTIDETECT_CONFIRMADO (mesma evidencia).',
      ...partes,
    ];
  } else if (has('API_FALSIFICADA') || has('WORKER_DIVERGENTE') || has('CANVAS_RUIDO')) {
    if (allFindings.some((f) => f.severity === 'critical' || f.severity === 'high')) {
      tags.add('ANTIDETECT_PROVAVEL');
      const parts = [];
      for (const t of ['CANVAS_RUIDO', 'WORKER_DIVERGENTE', 'API_FALSIFICADA']) {
        if (has(t)) parts.push(...reasonsFromFindings(findingsWithTag(allFindings, t), 3));
      }
      extraReasons.ANTIDETECT_PROVAVEL = [
        'Regra: sinais classicos de antidetect (API falsificada / worker divergente / canvas com ruido) com severidade alta.',
        ...parts,
      ];
    }
  }

  if (
    (has('SPOOF_TELA') || hasId('screen-inner-gt') || hasId('mm-screen-mismatch')) &&
    (has('FP_RUIM') || hasId('screen-dpr-mm') || hasId('mm-dpr-mismatch'))
  ) {
    const extra = -10;
    correlationDelta += extra;
    const screenMotivos = [];
    for (const id of ['screen-inner-gt', 'mm-screen-mismatch', 'screen-dpr-mm', 'mm-dpr-mismatch', 'screen-outer-gt']) {
      const f = getById(id);
      if (f) screenMotivos.push(findingReason(f));
    }
    screenMotivos.push(...reasonsFromFindings(findingsWithTag(allFindings, 'SPOOF_TELA'), 4));
    clusters.push({
      id: 'SPOOF_TELA_CLUSTER',
      label: 'Spoof de tela',
      detail: 'Tela, viewport e CSS media queries inconsistentes entre si',
      delta: extra,
    });
    tags.add('SPOOF_TELA');
    extraReasons.SPOOF_TELA = [
      'Regra de cluster: inconsistencia de tela confirmada por mais de um check (screen + matchMedia/DPR).',
      ...screenMotivos,
    ];
  }

  if (has('AUTOMACAO') && (has('SEM_INTERFACE') || has('API_FALSIFICADA'))) {
    const extra = -12;
    correlationDelta += extra;
    clusters.push({
      id: 'AUTOMACAO_CLUSTER',
      label: 'Automacao reforçada',
      detail: 'WebDriver/CDP + headless ou APIs falsificadas',
      delta: extra,
    });
    extraReasons.AUTOMACAO = [
      ...(extraReasons.AUTOMACAO || []),
      'Cluster: automacao + (headless ou API falsificada) reforcam o sinal.',
      ...reasonsFromFindings(findingsWithTag(allFindings, 'AUTOMACAO'), 4),
      ...reasonsFromFindings(findingsWithTag(allFindings, 'SEM_INTERFACE'), 2),
    ];
  }

  const highCritical = allFindings.filter((f) => f.severity === 'high' || f.severity === 'critical');
  if (highCritical.length >= 3) {
    tags.add('FP_RUIM');
    extraReasons.FP_RUIM = [
      `Regra automatica: ${highCritical.length} findings altos/criticos (limite 3) geram a tag FP_RUIM.`,
      ...reasonsFromFindings(highCritical, 6),
      ...(extraReasons.FP_RUIM || []),
    ];
  }

  totalDelta += correlationDelta * modeFactor;
  const score = clamp(Math.round(100 + totalDelta), 0, 100);
  const grade = gradeForScore(score);
  const avgConfidence = confCount ? Math.round((confSum / confCount) * 100) / 100 : 1;

  allFindings.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.weightedDelta - b.weightedDelta;
  });

  const tagList = [...tags];
  const tagDetails = buildTagDetails(tagList, allFindings, clusters, extraReasons);

  return {
    score,
    grade,
    tags: tagList,
    tagDetails,
    clusters,
    mode,
    modeFactor,
    avgConfidence,
    totalDelta: Math.round(totalDelta * 100) / 100,
    correlationDelta: Math.round(correlationDelta * modeFactor * 100) / 100,
    findings: allFindings,
    categoryScores,
    moduleResults,
    timestamp: new Date().toISOString(),
  };
}
