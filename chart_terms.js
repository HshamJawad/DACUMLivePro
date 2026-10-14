// ============================================================
// /chart_terms.js — 3.111.0
// Settings → Misc → "Chart terms": DACUM (Duties and Tasks — default)
// or the user's own two terms (e.g. the terms of their country or
// agency). They name the Duties & Tasks tab — its heading and its entry
// in the side navigation — with the DACUM name kept underneath, small,
// in brackets. The cards keep "Duty A" / "Task A1".
// ============================================================

const KEY = 'dacum_chart_terms';
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

/** { mode: 'dacum' | 'custom', duty, task } */
export function getChartTerms() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && v.mode === 'custom') return { mode: 'custom', duty: String(v.duty || ''), task: String(v.task || '') };
  } catch (_) {}
  return { mode: 'dacum', duty: '', task: '' };
}

export function setChartTerms(t) {
  const v = t && t.mode === 'custom'
    ? { mode: 'custom', duty: String(t.duty || '').trim().slice(0, 60), task: String(t.task || '').trim().slice(0, 60) }
    : { mode: 'dacum' };
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {}
  applyChartTerms();
}

/** The tab's name now: the user's terms when both are written. */
export function chartTitle() {
  const t = getChartTerms();
  return t.mode === 'custom' && t.duty && t.task ? _tf('ctTitle', { a: t.duty, b: t.task }) : '';
}

export function applyChartTerms() {
  const custom = chartTitle();
  const h2 = document.getElementById('dutiesViewHeadingLegacy');
  const nav = document.querySelector('.tab[data-tab="duties-tab"]');
  if (nav) nav.textContent = custom || _t('tabDuties');
  const side = document.querySelector('#dpsSidebarNav .dps-nav-item[data-target-tab="duties-tab"]');
  if (side) {
    const txt = side.querySelector('.dps-nav-text');
    if (txt) txt.textContent = custom || _t('tabDuties');
    side.setAttribute('data-tooltip', custom || _t('tabDuties'));
  }
  if (h2) {
    h2.textContent = custom || _t('h2Duties');
    if (custom) {
      const sub = document.createElement('span');
      sub.id = 'dutiesTermsSub';
      sub.className = 'ct-sub';
      sub.textContent = '(' + _t('h2Duties') + ')';
      h2.appendChild(sub);
    }
  }
}

window.addEventListener('dacum:langchange', () => setTimeout(applyChartTerms, 0));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyChartTerms);
else setTimeout(applyChartTerms, 0);
