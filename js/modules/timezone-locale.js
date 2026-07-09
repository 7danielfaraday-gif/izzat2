/** Timezone, locale e coerencia com language */

import { finding, finalizeResult } from '../utils.js?v2';

/** Rough language primary tag -> plausible timezone regions (soft check) */
const LANG_TZ_HINTS = {
  'pt-BR': ['America/Sao_Paulo', 'America/Fortaleza', 'America/Manaus', 'America/Recife', 'America/Bahia', 'America/Belem', 'America/Cuiaba', 'America/Porto_Velho', 'America/Noronha'],
  'pt-PT': ['Europe/Lisbon', 'Atlantic/Azores', 'Atlantic/Madeira'],
  'ja': ['Asia/Tokyo'],
  'zh-CN': ['Asia/Shanghai', 'Asia/Urumqi'],
  'zh-TW': ['Asia/Taipei'],
  'ko': ['Asia/Seoul'],
  'en-GB': ['Europe/London', 'Europe/Dublin'],
  'de': ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich'],
  'fr': ['Europe/Paris', 'Europe/Brussels', 'Indian/Reunion'],
  'ru': ['Europe/Moscow', 'Asia/Yekaterinburg', 'Asia/Novosibirsk'],
  'ar-SA': ['Asia/Riyadh'],
  'he': ['Asia/Jerusalem'],
  'hi': ['Asia/Kolkata'],
  'th': ['Asia/Bangkok'],
  'vi': ['Asia/Ho_Chi_Minh'],
  'id': ['Asia/Jakarta', 'Asia/Makassar'],
  'tr': ['Europe/Istanbul'],
};

export async function run() {
  const findings = [];
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  const offsetMin = new Date().getTimezoneOffset();
  const lang = navigator.language || '';
  const langs = navigator.languages ? [...navigator.languages] : [];

  const raw = {
    timeZone: resolved.timeZone,
    locale: resolved.locale,
    calendar: resolved.calendar,
    numberingSystem: resolved.numberingSystem,
    offsetMin,
    offsetHours: -offsetMin / 60,
    language: lang,
    languages: langs,
    dateSample: new Date().toString(),
    intlDate: new Intl.DateTimeFormat(lang, {
      timeZoneName: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date()),
  };

  if (!raw.timeZone) {
    findings.push(
      finding('tz-missing', 'medium', 'Timezone ausente', '', -6, ['BAD_FP'])
    );
  }

  // UTC spoof often uses Etc/UTC or UTC with en-US only
  if ((raw.timeZone === 'UTC' || raw.timeZone === 'Etc/UTC') && !/bot|headless/i.test(navigator.userAgent)) {
    findings.push(
      finding(
        'tz-utc',
        'low',
        'Timezone UTC',
        'Comum em servidores/headless; legitimo para alguns usuarios.',
        -2,
        ['HEADLESS']
      )
    );
  }

  // Soft language vs timezone
  const primary = lang;
  const short = lang.split('-')[0];
  let hints = LANG_TZ_HINTS[primary] || LANG_TZ_HINTS[short];
  // en is too global - skip
  if (short === 'en') hints = null;

  if (hints && raw.timeZone && !hints.includes(raw.timeZone)) {
    // Only soft penalty for strong mismatches (e.g. ja + America/New_York is possible but flagged low)
    const strong =
      (short === 'ja' && !raw.timeZone.startsWith('Asia/')) ||
      (short === 'zh' && !raw.timeZone.startsWith('Asia/')) ||
      (primary === 'pt-BR' && raw.timeZone.startsWith('Asia/')) ||
      (short === 'ko' && !raw.timeZone.startsWith('Asia/'));
    findings.push(
      finding(
        'tz-lang-soft',
        strong ? 'medium' : 'low',
        'Idioma vs timezone incomum',
        `language=${lang}, timeZone=${raw.timeZone}`,
        strong ? -6 : -2,
        ['BAD_FP']
      )
    );
  }

  // locale vs navigator.language major mismatch
  if (resolved.locale && lang) {
    const rl = resolved.locale.split('-')[0].toLowerCase();
    const nl = lang.split('-')[0].toLowerCase();
    if (rl !== nl && !langs.some((l) => l.split('-')[0].toLowerCase() === rl)) {
      findings.push(
        finding(
          'tz-locale-lang',
          'low',
          'Intl locale â‰  navigator.language',
          `locale=${resolved.locale}, language=${lang}`,
          -3,
          ['BAD_FP']
        )
      );
    }
  }

  return finalizeResult('timezone-locale', 'Timezone & Locale', findings, raw);
}
