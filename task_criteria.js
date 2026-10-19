// ============================================================
// /task_criteria.js — 3.109.0
// "📏" on a task card: the performance criteria written for that task,
// read-only, wherever the user wrote them —
//   • the task's own criteria (Task Analysis),
//   • the criteria of its competency (Competency Clusters): the one(s)
//     closest to the task first, by the words they share with it and
//     its analysis; the rest folded,
//   • the learning outcomes those criteria reach.
// 3.110.0: the button is on every task card ("📏 0" when no criterion is
// written yet) and the window leads to where criteria are written. It
// is on the cards of Duties & Tasks (shown by default) and of the
// verified DACUM chart (hidden by default); "📏 Criteria" on each
// toolbar shows or hides it. Never printed.
// ============================================================

import { appState } from './state.js';
import { loLabel } from './lo_labels.js';
import { getTaskCode } from './codes.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
const _esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _clean = (s) => String(s == null ? '' : s)
  .replace(/^[\s]*[•\-\*○●]\s*/, '').replace(/^[\s]*\d+[\.\)]\s+/, '').trim();

/* ── Where the badges are shown (per view, this device) ─────────── */
const KEYS = { cards: 'dacum_crit_badges_cards', chart: 'dacum_crit_badges_chart' };
const DEFAULTS = { cards: true, chart: false };
export function badgesOn(view) {
  try { const v = localStorage.getItem(KEYS[view]); if (v === '1') return true; if (v === '0') return false; } catch (_) {}
  return DEFAULTS[view];
}
export function setBadgesOn(view, on) {
  try { localStorage.setItem(KEYS[view], on ? '1' : '0'); } catch (_) {}
}

/* ── Data ──────────────────────────────────────────────────────── */
function _ownCriteria(taskId) {
  const r = (appState.taskAnalysisData || {})[taskId];
  return r && Array.isArray(r.performanceCriteria) ? r.performanceCriteria.map(_clean).filter(Boolean) : [];
}
function _clusters() { return (appState.clusteringData && appState.clusteringData.clusters) || []; }

/** True once criteria have been written in Task Analysis or Competency Clusters. */
export function criteriaWritten() {
  if (_clusters().some(c => (c.performanceCriteria || []).some(x => _clean(x)))) return true;
  return Object.keys(appState.taskAnalysisData || {}).some(id => _ownCriteria(id).length);
}

const _STOP = new Set(['the', 'and', 'for', 'are', 'with', 'from', 'that', 'this', 'into', 'all', 'its', 'per', 'any',
  'according', 'procedures', 'procedure', 'requirements', 'standards', 'specifications', 'best', 'practices', 'industry',
  'les', 'des', 'aux', 'pour', 'dans', 'une', 'selon', 'avec', 'sur', 'par',
  'على', 'في', 'من', 'إلى', 'الى', 'مع', 'وفق', 'حسب', 'التي', 'الذي', 'أفضل', 'الممارسات', 'الإجراءات', 'المواصفات']);
function _stems(s) {
  const out = new Set();
  String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).forEach(w => {
    if (w.length < 3 || _STOP.has(w)) return;
    w = w.replace(/^(ال|وال|بال|لل)/, '');          // Arabic article
    if (w.length >= 3) out.add(w.length > 5 ? w.slice(0, 5) : w);
  });
  return out;
}
function _taskText(taskId) {
  for (const d of appState.dutiesData || []) for (const t of d.tasks || []) if (t.inputId === taskId) return t.text || '';
  for (const c of _clusters()) for (const t of c.tasks || []) if (t.id === taskId) return t.text || '';
  return '';
}

/** { own, closest, others, outcomes } for one task. */
export function getTaskCriteria(taskId) {
  const own = _ownCriteria(taskId);
  const title = _stems(_taskText(taskId));
  const more = _stems(own.join(' ') + ' ' + Object.values((appState.taskAnalysisData || {})[taskId] || {})
    .filter(v => Array.isArray(v)).flat().filter(v => typeof v === 'string').join(' '));
  const comp = [];
  _clusters().forEach(c => {
    if (!(c.tasks || []).some(t => t.id === taskId)) return;
    const list = (c.performanceCriteria || []).map(_clean).filter(Boolean).map(text => ({ text, w: _stems(text) }));
    /* A word in every criterion of the competency tells nothing apart. */
    const df = {};
    list.forEach(x => x.w.forEach(w => { df[w] = (df[w] || 0) + 1; }));
    list.forEach(x => {
      let score = 0;
      x.w.forEach(w => { const idf = 1 / df[w]; if (title.has(w)) score += idf; else if (more.has(w)) score += idf * 0.25; });
      comp.push({ text: x.text, cluster: c.name || '', cid: c.id, score });
    });
  });
  const best = comp.reduce((m, x) => Math.max(m, x.score), 0);
  const closest = best > 0 ? comp.filter(x => x.score >= best * 0.6).sort((a, b) => b.score - a.score) : [];
  const others = comp.filter(x => !closest.includes(x));

  /* Outcomes reached: by the task, or by one of these criteria. */
  const texts = new Set([...own, ...closest.map(x => x.text)]);
  const outcomes = ((appState.learningOutcomesData && appState.learningOutcomesData.outcomes) || []).filter(o =>
    (o.linkedCriteria || []).some(lc => lc && (lc.taskId === taskId || texts.has(_clean(lc.text)))));
  const home = _clusters().find(c => (c.tasks || []).some(t => t.id === taskId));
  return { own, closest, others, outcomes, clusterId: home ? home.id : '', clusterName: home ? (home.name || '') : '' };
}

/** The small "📏 n" button for a task card ('' when not shown). */
export function criteriaBadge(taskId, view) {
  /* 3.110.0: on every task card, criteria written or not — experts often
     write them after the chart; "📏 0" leads to where they are written. */
  if (!taskId || !badgesOn(view)) return '';
  _style();
  const r = getTaskCriteria(taskId);
  const n = r.own.length + r.closest.length;
  const tip = _tf('tcBtnTip', { n });
  return `<button type="button" class="tc-badge${n ? '' : ' tc-zero'}" data-tc-open="${_esc(taskId)}"
            title="${_esc(tip)}" aria-label="${_esc(tip)}">📏 ${n}</button>`;
}

/** The "📏 Criteria" toolbar toggle ('' when no criteria are written yet). */
export function criteriaToggle(view, attr) {
  const on = badgesOn(view);
  return `<button type="button" class="${attr.cls}${on ? ' is-on' : ''}" ${attr.data}="criteria"
            aria-pressed="${on}" title="${_esc(_t('tcToggleTip'))}">📏 ${_esc(_t('tcToggle'))}</button>`;
}

/* ── The modal ──────────────────────────────────────────────────── */
let _ov = null;
export function openTaskCriteria(taskId) {
  closeTaskCriteria();
  _style();
  const r = getTaskCriteria(taskId);
  const li = (arr, f) => arr.map(x => `<li dir="auto">${f(x)}</li>`).join('');
  const sec = (title, body) => `<section class="tc-sec"><h4>${_esc(title)}</h4>${body}</section>`;
  const empty = !r.own.length && !r.closest.length && !r.others.length;
  let body = '';
  if (empty) body = `<p class="tc-none">${_esc(_t('tcNone'))}</p>`;
  else {
    if (r.own.length) body += sec(_t('tcOwn'), `<ol>${li(r.own, _esc)}</ol>`);
    if (r.closest.length || r.others.length) {
      const cl = r.closest.length
        ? `<ul>${li(r.closest, x => `${_esc(x.text)} <span class="tc-tag">${_esc(_t('tcClosest'))}</span>`)}</ul>` : '';
      const ot = r.others.length
        ? `<details${r.closest.length ? '' : ' open'}><summary>${_esc(_tf('tcOthers', { n: r.others.length }))}</summary><ul>${li(r.others, x => _esc(x.text))}</ul></details>` : '';
      const name = (r.closest[0] || r.others[0]).cluster;
      body += sec(_t('tcComp') + (name ? ' — ' + name : ''), cl + ot);
    }
    body += sec(_t('tcOutcomes'), r.outcomes.length
      ? `<ul>${li(r.outcomes, o => `<b>${_esc(loLabel(o))}</b> ${_esc(o.statement || '')}`)}</ul>`
      : `<p class="tc-none">${_esc(_t('tcNoOutcome'))}</p>`);
  }
  _ov = document.createElement('div');
  _ov.className = 'tc-overlay';
  _ov.setAttribute('dir', window.i18n && window.i18n.isRTL && window.i18n.isRTL() ? 'rtl' : 'ltr');
  _ov.innerHTML = `
    <div class="tc-box" role="dialog" aria-modal="true" aria-labelledby="tcHead">
      <div class="tc-head"><div id="tcHead"><b>📏 ${_esc(_t('tcTitle'))}</b>
        <div class="tc-task" dir="auto">${_esc(getTaskCode(taskId))} — ${_esc(_taskText(taskId))}</div></div>
        <button type="button" class="tc-x" data-tc-close aria-label="${_esc(_t('tcClose'))}">✕</button></div>
      <div class="tc-body">${body}</div>
      <div class="tc-go">
        <button type="button" data-tc-go="ta">✏️ ${_esc(_t('tcGoTA'))}</button>
        ${r.clusterId ? `<button type="button" data-tc-go="cluster">✏️ ${_esc(_t('tcGoCluster'))}</button>` : ''}
      </div>
      <div class="tc-foot">${_esc(_t('tcReadOnly'))}</div>
    </div>`;
  _ov.addEventListener('click', (e) => {
    if (e.target === _ov || e.target.closest('[data-tc-close]')) { closeTaskCriteria(); return; }
    const go = e.target.closest('[data-tc-go]');
    if (go) { closeTaskCriteria(); goWriteCriteria(taskId, go.getAttribute('data-tc-go'), r.clusterId); }
  });
  document.addEventListener('keydown', _onKey, true);
  document.body.appendChild(_ov);
  _ov.querySelector('[data-tc-close]').focus();
}
/** 3.110.0: to where the task's criteria are written — its Performance
 *  Criteria in Task Analysis, or its competency's criteria in Competency
 *  Clusters — with the cursor in the field. */
let _returnTo = null;   // the task card the user came from (📏)
export async function goWriteCriteria(taskId, where, clusterId) {
  _returnTo = taskId;
  const focus = (el) => {
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    try { el.focus({ preventScroll: true }); el.setSelectionRange(el.value.length, el.value.length); } catch (_) {}
  };
  if (where === 'cluster') {
    if (window.switchTab) window.switchTab('clustering-tab');
    setTimeout(() => focus(document.getElementById('criteria_' + clusterId)), 150);
    return;
  }
  if (window.switchTab) window.switchTab('task-analysis-tab');
  const ta = await import('./task_analysis.js');
  ta.openTaskAnalysisFor(taskId);
  setTimeout(() => focus(document.querySelector('#task-analysis-tab [data-field-block="performanceCriteria"] textarea')), 150);
}

export function closeTaskCriteria() {
  if (_ov) { _ov.remove(); _ov = null; }
  document.removeEventListener('keydown', _onKey, true);
}
function _onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeTaskCriteria(); } }

/** 3.111.0: "↩ Duties & Tasks" in Task Analysis — back to the chart, on
 *  the task card the user came from (📏), shown for a moment. */
export function backToDuties() {
  if (window.switchTab) window.switchTab('duties-tab');
  const id = _returnTo;
  _returnTo = null;
  if (!id) return;
  setTimeout(() => {
    const card = document.querySelector(`.dcv-task-card [data-task-id="${CSS.escape(id)}"]`)?.closest('.dcv-task-card')
      || document.querySelector(`[data-task-id="${CSS.escape(id)}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'center', inline: 'center' });
    card.classList.add('tc-flash');
    setTimeout(() => card.classList.remove('tc-flash'), 1800);
  }, 150);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-tc-back]');
  if (!b) return;
  e.preventDefault();
  backToDuties();
}, true);

/* One listener for every "📏" button, wherever it is drawn. */
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-tc-open]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  openTaskCriteria(b.getAttribute('data-tc-open'));
}, true);

function _style() {
  if (document.getElementById('tcStyle')) return;
  const s = document.createElement('style');
  s.id = 'tcStyle';
  s.textContent = `
.tc-badge { min-height: 0 !important; padding: 1px 8px !important; border-radius: 999px !important; font-size: .74em !important;
  line-height: 1.6 !important; cursor: pointer; background: #eef2ff !important; color: #3730a3 !important;
  border: 1px solid #c7d2fe !important; box-shadow: none !important; font-weight: 700; }
.tc-badge.tc-zero { opacity: .55; }
.dcv-task-card.tc-flash { outline: 3px solid #6366f1; outline-offset: 2px; transition: outline-color .3s; }
.tc-badge-row { display: flex; justify-content: flex-end; margin-top: 4px; }
.vc-task .tc-badge { font-size: .7em !important; }
body.card-view-printing .tc-badge, html.vc-printing .tc-badge, body.card-view-fullscreen .tc-badge { display: none !important; }
.tc-overlay { position: fixed; inset: 0; z-index: 10060; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
.tc-box { background: #fff; border-radius: 14px; width: min(640px, 100%); max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(0,0,0,.28); }
.tc-head { display: flex; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #e5e7eb; }
.tc-task { color: #475569; font-size: .9em; margin-top: 3px; }
.tc-x { min-height: 0 !important; background: none !important; border: none !important; font-size: 1.1em; cursor: pointer; color: #64748b !important; }
.tc-body { padding: 12px 18px; overflow-y: auto; }
.tc-sec h4 { margin: 10px 0 6px; font-size: .95em; color: #1e3a8a; }
.tc-sec ol, .tc-sec ul { margin: 0; padding-inline-start: 22px; line-height: 1.6; }
.tc-sec details summary { cursor: pointer; color: #475569; margin-top: 6px; }
.tc-tag { font-size: .75em; background: #dcfce7; color: #166534; border-radius: 999px; padding: 0 7px; margin-inline-start: 4px; white-space: nowrap; }
.tc-none { color: #64748b; font-style: italic; margin: 8px 0; }
.tc-go { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 18px 0; }
.tc-go button { width: auto !important; margin: 0 !important; min-height: 0 !important; padding: 7px 14px !important; border-radius: 9px !important;
  cursor: pointer; font: inherit; font-weight: 600; font-size: .88em; background: #eef2ff !important; color: #3730a3 !important; border: 1px solid #c7d2fe !important; }
.tc-go button:hover { background: #e0e7ff !important; }
.tc-foot { padding: 8px 18px 12px; color: #94a3b8; font-size: .8em; border-top: 1px solid #f1f5f9; }`;
  document.head.appendChild(s);
}
