// ============================================================
// /lo_labels.js — 3.123.0
// Settings → Misc → "Learning outcome labels (Arabic interface)": each
// learning outcome is shown as "LO1", "LO2"… (the default), or — in the
// Arabic interface — by the user's own pattern, as for competencies
// (cluster_labels.js):
//   {n}    the number          «محصلة التعلم {n}»     → محصلة التعلم 1
//   {ord}  feminine ordinal    «محصلة التعلم {ord}»   → محصلة التعلم الأولى
//   {ordm} masculine ordinal   «الناتج {ordm}»        → الناتج الأول
// A pattern with no placeholder gets the number after it.
//
// DISPLAY ONLY. The stored outcome number stays "LO1": it keys the
// outcome hours and the Module Builder handoff, so the saved project
// file is never rewritten. The label is applied wherever an outcome is
// drawn (Learning Outcomes, Module Mapping, curriculum, trace map,
// dialogs) and in the PDF / Word exports made in the Arabic interface.
// Kept in this browser, like the competency labels.
// ============================================================

import { arabicOrdinal } from './cluster_labels.js';

const KEY = 'dacum_lo_label';

/** { mode: 'code' | 'custom', pattern } */
export function getLoLabelPref() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && v.mode === 'custom') return { mode: 'custom', pattern: String(v.pattern || '') };
  } catch (_) {}
  return { mode: 'code', pattern: '' };
}

export function setLoLabelPref(p) {
  const v = p && p.mode === 'custom'
    ? { mode: 'custom', pattern: String(p.pattern || '').slice(0, 60) }
    : { mode: 'code' };
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {}
  window.dispatchEvent(new CustomEvent('dacum:lolabels'));
}

/** The pattern applied to n (used by the label and the settings preview). */
export function formatLoLabel(pattern, n) {
  const p = String(pattern || '').trim();
  if (!p) return 'LO' + n;
  if (!/\{(n|ord|ordm)\}/.test(p)) return p + ' ' + n;
  return p.replace(/\{ordm\}/g, arabicOrdinal(n, true))
          .replace(/\{ord\}/g, arabicOrdinal(n, false))
          .replace(/\{n\}/g, String(n));
}

function _uiLang() {
  try { return window.i18n && window.i18n.getLang ? window.i18n.getLang() : 'en'; } catch (_) { return 'en'; }
}

/** What an outcome is called: takes the outcome (or its stored number,
    "LO3"). Anything that is not an "LO<n>" code is returned unchanged. */
export function loLabel(o) {
  const code = String((o && typeof o === 'object' ? o.number : o) || '');
  const m = /^LO(\d+)$/.exec(code.trim());
  if (!m) return code;
  const p = getLoLabelPref();
  if (p.mode !== 'custom' || _uiLang() !== 'ar' || !p.pattern.trim()) return code;
  return formatLoLabel(p.pattern, Number(m[1]));
}
