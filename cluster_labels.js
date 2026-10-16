// ============================================================
// /cluster_labels.js — 3.120.0
// Settings → Misc → "Competency labels (Arabic interface)": the
// Competency Clustering tab names each competency "C1", "C2"… (the
// default), or — in the Arabic interface — by the user's own pattern:
//   {n}    the number          «الكفاءة {n}»     → الكفاءة 1
//   {ord}  feminine ordinal    «الكفاءة {ord}»   → الكفاءة الأولى
//   {ordm} masculine ordinal   «التجمع {ordm}»   → التجمع الأول
// A pattern with no placeholder gets the number after it.
// Other interface languages, the exports and the codes inside the
// criteria ("1-1") keep C1. Kept in this browser, like Chart terms.
// ============================================================

const KEY = 'dacum_cluster_label';

/** { mode: 'code' | 'custom', pattern } */
export function getClusterLabelPref() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && v.mode === 'custom') return { mode: 'custom', pattern: String(v.pattern || '') };
  } catch (_) {}
  return { mode: 'code', pattern: '' };
}

export function setClusterLabelPref(p) {
  const v = p && p.mode === 'custom'
    ? { mode: 'custom', pattern: String(p.pattern || '').slice(0, 60) }
    : { mode: 'code' };
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {}
  window.dispatchEvent(new CustomEvent('dacum:clusterlabels'));
}

const F_UNITS = ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة'];
const M_UNITS = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع'];
const TENS = ['', '', 'العشرون', 'الثلاثون', 'الأربعون', 'الخمسون', 'الستون', 'السبعون', 'الثمانون', 'التسعون'];

/** Arabic ordinal of n (1–99), feminine or masculine; the number beyond. */
export function arabicOrdinal(n, masculine) {
  const U = masculine ? M_UNITS : F_UNITS;
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n);
  if (n < 10) return U[n];
  if (n === 10) return masculine ? 'العاشر' : 'العاشرة';
  if (n < 20) {
    const u = n === 11 ? (masculine ? 'الحادي' : 'الحادية') : U[n - 10];
    return u + (masculine ? ' عشر' : ' عشرة');
  }
  const t = Math.floor(n / 10), u = n % 10;
  if (!u) return TENS[t];
  return (u === 1 ? (masculine ? 'الحادي' : 'الحادية') : U[u]) + ' و' + TENS[t];
}

/** The pattern applied to n (used by the label and the settings preview). */
export function formatClusterLabel(pattern, n) {
  const p = String(pattern || '').trim();
  if (!p) return 'C' + n;
  if (!/\{(n|ord|ordm)\}/.test(p)) return p + ' ' + n;
  return p.replace(/\{ordm\}/g, arabicOrdinal(n, true))
          .replace(/\{ord\}/g, arabicOrdinal(n, false))
          .replace(/\{n\}/g, String(n));
}

function _uiLang() {
  try { return window.i18n && window.i18n.getLang ? window.i18n.getLang() : 'en'; } catch (_) { return 'en'; }
}

/** What the Clustering tab calls competency n (1-based). */
export function clusterLabel(n) {
  const p = getClusterLabelPref();
  if (p.mode !== 'custom' || _uiLang() !== 'ar' || !p.pattern.trim()) return 'C' + n;
  return formatClusterLabel(p.pattern, n);
}
