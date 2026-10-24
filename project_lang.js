// ============================================================
// /project_lang.js — 3.107.0
// The language a project is written in, for three uses:
//   • the language chip on its card in the Projects sidebar,
//   • switching the interface to it when the project is opened
//     (Settings → Misc, on by default, with Undo),
//   • the language code in the names of saved and exported files
//     (Name_AR_2026-10-13_21-40.json, …_AR_DACUM_Chart.docx).
// Content languages decide when the project has them (the version
// shown); otherwise the texts are read (guessLanguage).
// ============================================================

import { guessLanguage, collectUnits } from './content_lang.js';
import { captureProjectState } from './dacum_projects.js';

export const UI_LANGS = ['en', 'ar', 'fr'];
const _cache = new Map();   // project id → { stamp, lang }

/** Language of a project state object ('en' | 'ar' | 'fr' | other code),
 *  or '' while it cannot be told — 3.129.2: a new project has no text
 *  yet, and reading it as English put "EN" on its card in an Arabic or
 *  French interface and switched the interface to English on opening. */
export function stateLanguage(s) {
  if (!s) return '';
  const cl = s.contentLanguages;
  if (cl && (cl.active || cl.original)) return cl.active || cl.original;
  try {
    if (!collectUnits(s).units.some(u => /\p{L}/u.test(u.text || ''))) return '';
    return guessLanguage(s, 'en');
  } catch (_) { return ''; }
}

/** Whether the open project has any Arabic-script letters in its texts —
 *  what decides whether a PDF in another language needs a warning. */
export function hasArabicText() {
  try {
    const s = captureProjectState();
    return collectUnits(s).units.some(u => /[\u0600-\u06FF]/.test(u.text || ''));
  } catch (_) { return false; }
}

/** What a card shows: the project's language, or — while it has no text
 *  to tell — the interface language it is being written in. */
export function badgeLanguage(p) {
  return projectLanguage(p) || (window.i18n && window.i18n.getLang ? window.i18n.getLang() : '');
}

/** Language of a saved project record (cached until it is saved again). */
export function projectLanguage(p) {
  if (!p || !p.state) return '';
  const stamp = String(p.lastSaved || p.created || '') + '|' + ((p.state.contentLanguages && p.state.contentLanguages.active) || '');
  const hit = _cache.get(p.id);
  if (hit && hit.stamp === stamp) return hit.lang;
  const lang = stateLanguage(p.state);
  _cache.set(p.id, { stamp, lang });
  return lang;
}

/** "_AR" for file names, '' when unknown. */
export function langFileTag(lang) {
  return lang ? '_' + String(lang).toUpperCase() : '';
}

/** "_AR" for the open project — what file names of saves and exports carry. */
export function liveLangTag() {
  try { return langFileTag(stateLanguage(captureProjectState())); } catch (_) { return ''; }
}
