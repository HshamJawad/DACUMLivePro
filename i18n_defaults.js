// ============================================================
// /i18n_defaults.js
// Default (not user-edited) content follows the interface language.
//
// Two kinds of content are seeded ONCE from the dictionary and then
// kept as project data, so they froze in whatever language was active
// when they were first created:
//   • Skills Level Matrix categories / competencies
//   • Additional Info section headings (data-i18n-once)
// On every language switch, project load and at start-up, each item is
// compared with the default wording in ALL languages; only an exact
// match is re-translated. Renamed headings and edited rows never match,
// so user text is never overwritten.
// ============================================================

import { retranslateSkillsLevelData } from './state.js';
import { renderSkillsLevel }          from './renderer.js';

function _retranslateHeadings() {
  const I = window.i18n;
  if (!I || !I.tIn) return false;
  const langs = I.languages ? I.languages() : ['en', 'fr', 'ar'];
  let changed = false;
  document.querySelectorAll('[data-i18n-once][data-i18n]').forEach(el => {
    if (el.getAttribute('contenteditable') === 'true') return;   // being renamed
    const key = el.getAttribute('data-i18n');
    const cur = (el.textContent || '').trim();
    if (!cur) return;
    const isDefault = langs.some(l => (I.tIn(key, l) || '').trim() === cur);
    if (!isDefault) return;
    const now = I.tc ? I.tc(key) : I.t(key);   // 3.79.0: content language
    if (now && now !== key && now !== cur) { el.textContent = now; changed = true; }
  });
  return changed;
}

export function syncDefaultsToLanguage() {
  try {
    if (retranslateSkillsLevelData()) renderSkillsLevel();
  } catch (e) { console.warn('[i18n-defaults] skills matrix:', e); }
  try { _retranslateHeadings(); } catch (e) { console.warn('[i18n-defaults] headings:', e); }
}

let _inited = false;
export function initI18nDefaults() {
  if (_inited) return;
  _inited = true;
  syncDefaultsToLanguage();
  window.addEventListener('dacum:langchange', () => setTimeout(syncDefaultsToLanguage, 0));
  document.addEventListener('dacum:project-loaded', () => setTimeout(syncDefaultsToLanguage, 60));
}
