// ============================================================
// /verified_chart.js — Verified DACUM chart (3.86.0)
//
// The DACUM chart as it stands after Task Verification and Task
// Analysis: the same duties and tasks as Duties & Tasks, each task
// carrying its verification evidence and the training decision —
//
//   • priority: a colour band (high / medium / low) and the rank by
//     Priority Index among the rated tasks;
//   • selected for training ✓, or left out (greyed) with the reason;
//   • its Task Analysis status.
//
// READ-ONLY AND DERIVED, ON PURPOSE. It is rebuilt from the project
// every time it opens, so it can never disagree with Duties & Tasks,
// the ratings or the selection. An editable copy would be a second
// source of truth: a task changed there would not reach Task Analysis,
// the competencies or the modules, which are all keyed by the tasks of
// Duties & Tasks. The two "Edit" buttons lead to where each thing is
// changed.
//
// Opened from Task Analysis (always) and from Duties & Tasks (see
// verified_chart_button below: highlighted once verification and Task
// Analysis are complete, never locked). Printable, landscape.
// ============================================================

import { appState }  from './state.js';
import { escapeHtml } from './renderer.js';
import { getDutyLetter } from './codes.js';
import { isTaskSelected, getTaskExclusionReason, getTaskRatingMetrics, hasTaskSelection } from './task_selection.js';
import { getTaskAnalysisStatus } from './task_analysis.js';
import { syncAllFromDOM } from './duties.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
const _bdi = (s) => `<bdi>${s}</bdi>`;

// ── Data ─────────────────────────────────────────────────────────

/** Everything the chart, the buttons and the exports need. */
export function getVerifiedChartData() {
  try { syncAllFromDOM(); } catch (_) { /* Duties tab not rendered yet */ }
  const duties = [];
  const all = [];
  (appState.dutiesData || []).forEach((d, di) => {
    const letter = getDutyLetter(di);
    const tasks = [];
    let n = 0;
    (d.tasks || []).forEach(t => {
      const text = String(t.text || '').trim();
      if (!text) return;
      n++;
      const m = getTaskRatingMetrics(t.inputId);
      const row = {
        id: t.inputId, code: letter + n, text,
        selected: isTaskSelected(t.inputId),
        reason: isTaskSelected(t.inputId) ? '' : (getTaskExclusionReason(t.inputId) || ''),
        metrics: m, pi: m ? m.pi : null, rank: null, band: null,
        ta: getTaskAnalysisStatus(t.inputId),
      };
      tasks.push(row); all.push(row);
    });
    const title = String(d.title || '').trim();
    if (title || tasks.length) duties.push({ id: d.id, letter, title: title || _t('lblUntitledDuty'), tasks });
  });

  // Rank by Priority Index among the rated tasks (1 = highest; equal
  // scores share a rank). Bands follow the verification dashboard: the
  // top 30% are high priority, the next 40% medium, the rest low.
  const rated = all.filter(r => r.pi !== null).sort((a, b) => b.pi - a.pi);
  const hiCut = Math.ceil(rated.length * 0.3), midCut = Math.ceil(rated.length * 0.7);
  rated.forEach((r, i) => {
    const first = (i > 0 && Math.abs(rated[i - 1].pi - r.pi) < 1e-9) ? rated[i - 1] : null;
    r.rank = first ? first.rank : i + 1;
    r.band = first ? first.band : (i < hiCut ? 'high' : i < midCut ? 'medium' : 'low');
  });

  const selected = all.filter(r => r.selected);
  const status = {
    total: all.length,
    rated: rated.length,
    selected: selected.length,
    analysed: selected.filter(r => r.ta === 'completed').length,
  };
  status.verificationDone = status.total > 0 && status.rated === status.total;
  status.analysisDone = status.selected > 0 && status.analysed === status.selected;
  status.complete = status.verificationDone && status.analysisDone;
  status.hasSelection = hasTaskSelection();
  return { duties, status };
}

// ── Overlay ─────────────────────────────────────────────────────

let _ov = null, _launcher = null, _filter = 'all';

function _occupation() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  return v('occupationTitle') || v('jobTitle');
}

function _today() {
  try { return new Date().toLocaleDateString(window.i18n?.getLang?.() === 'ar' ? 'ar' : undefined); }
  catch (_) { return new Date().toISOString().slice(0, 10); }
}

function _taLabel(s) {
  return s === 'completed' ? _t('taStatusCompleted') : s === 'in-progress' ? _t('taStatusInProgress') : _t('taStatusNotStarted');
}
function _taDot(s) { return s === 'completed' ? '✓' : s === 'in-progress' ? '◐' : '○'; }

function _card(r) {
  const band = r.band ? ` vc-pri-${r.band}` : ' vc-pri-none';
  const off = r.selected ? '' : ' vc-off';
  const pri = r.rank
    ? `<span class="vc-rank" title="${escapeHtml(_tf('vcRankTip', { pi: Math.round(r.pi * 100) / 100 }))}">#${r.rank}</span>`
    : `<span class="vc-rank vc-unrated">${escapeHtml(_t('vcUnrated'))}</span>`;
  const sel = r.selected
    ? `<span class="vc-sel">✓ ${escapeHtml(_t('vcSelected'))}</span>`
    : `<span class="vc-sel vc-sel-off">✗ ${escapeHtml(r.reason || _t('vcLeftOut'))}</span>`;
  return `
    <div class="vc-task${band}${off}" title="${escapeHtml(r.text)}">
      <div class="vc-task-top"><span class="vc-code">${_bdi(escapeHtml(r.code))}</span>${pri}</div>
      <div class="vc-text" dir="auto">${escapeHtml(r.text)}</div>
      <div class="vc-task-foot">${sel}
        ${r.selected ? `<span class="vc-ta vc-ta-${r.ta}" title="${escapeHtml(_t('vcTaTip') + ': ' + _taLabel(r.ta))}">${_taDot(r.ta)}</span>` : ''}</div>
    </div>`;
}

function _render() {
  if (!_ov) return;
  const { duties, status: s } = getVerifiedChartData();
  const occ = _occupation();
  _ov.querySelector('.vc-sub').innerHTML = `
    ${occ ? `<span class="vc-occ" dir="auto">${escapeHtml(occ)}</span> · ` : ''}<span>${escapeHtml(_today())}</span>`;
  _ov.querySelector('.vc-status').innerHTML = `
    <span class="${s.verificationDone ? 'vc-ok' : 'vc-todo'}">${s.verificationDone ? '✓' : '⏳'} ${escapeHtml(_tf('vcStatusVer', { n: s.rated, total: s.total }))}</span>
    <span class="${s.analysisDone ? 'vc-ok' : 'vc-todo'}">${s.analysisDone ? '✓' : '⏳'} ${escapeHtml(_tf('vcStatusTA', { n: s.analysed, total: s.selected }))}</span>
    <span>✅ ${escapeHtml(_tf('vcStatusSel', { n: s.selected, total: s.total }))}</span>`;
  _ov.querySelectorAll('[data-vc-filter]').forEach(b =>
    b.setAttribute('aria-pressed', b.getAttribute('data-vc-filter') === _filter ? 'true' : 'false'));

  const body = duties.map(d => {
    const tasks = d.tasks.filter(r => _filter === 'all' || r.selected);
    if (!tasks.length && _filter !== 'all') return '';
    return `
      <div class="vc-row">
        <div class="vc-duty"><div class="vc-duty-code">${_tf('lblDuty', { code: _bdi(escapeHtml(d.letter)) })}</div>
          <div class="vc-duty-title" dir="auto">${escapeHtml(d.title)}</div></div>
        <div class="vc-tasks">${tasks.map(_card).join('')}</div>
      </div>`;
  }).join('');
  _ov.querySelector('.vc-chart').innerHTML = body || `<p class="vc-empty">${escapeHtml(_t('vcEmpty'))}</p>`;
}

function _shell() {
  _ov.querySelector('.vc-title').textContent = '📋 ' + _t('vcTitle');
  _ov.querySelector('.vc-badge').textContent = _t('vcBadge');
  _ov.querySelector('.vc-close').title = _t('vcClose');
  _ov.querySelector('.vc-close').setAttribute('aria-label', _t('vcClose'));
  _ov.setAttribute('aria-label', _t('vcTitle'));
  _ov.querySelector('.vc-bar').innerHTML = `
    <div class="vc-filter" role="group" aria-label="${escapeHtml(_t('vcFilter'))}">
      <button type="button" data-vc-filter="all">${escapeHtml(_t('vcShowAll'))}</button>
      <button type="button" data-vc-filter="selected">${escapeHtml(_t('vcShowSelected'))}</button>
    </div>
    <div class="vc-actions">
      <button type="button" data-vc-act="edit-tasks">✏️ ${escapeHtml(_t('vcEditTasks'))}</button>
      <button type="button" data-vc-act="edit-selection">✏️ ${escapeHtml(_t('vcEditSelection'))}</button>
      <button type="button" data-vc-act="print" class="vc-primary">🖨 ${escapeHtml(_t('vcPrint'))}</button>
    </div>`;
  _ov.querySelector('.vc-legend').innerHTML = `
    <span><i class="vc-sw vc-pri-high"></i>${escapeHtml(_t('vcHigh'))}</span>
    <span><i class="vc-sw vc-pri-medium"></i>${escapeHtml(_t('vcMedium'))}</span>
    <span><i class="vc-sw vc-pri-low"></i>${escapeHtml(_t('vcLow'))}</span>
    <span><i class="vc-sw vc-pri-none"></i>${escapeHtml(_t('vcUnrated'))}</span>
    <span>#n ${escapeHtml(_t('vcLegendRank'))}</span>
    <span>✓ ${escapeHtml(_t('vcSelected'))} · ✗ ${escapeHtml(_t('vcLeftOut'))}</span>
    <span>✓ ◐ ○ ${escapeHtml(_t('vcTaTip'))}</span>`;
  _ov.querySelector('.vc-note').textContent = _t('vcNote');
}

function _onClick(e) {
  if (e.target === _ov || e.target.closest('.vc-close')) { closeVerifiedChart(); return; }
  const f = e.target.closest('[data-vc-filter]');
  if (f) { _filter = f.getAttribute('data-vc-filter'); _render(); return; }
  const a = e.target.closest('[data-vc-act]');
  if (!a) return;
  const act = a.getAttribute('data-vc-act');
  if (act === 'print') { _print(); return; }
  closeVerifiedChart();
  if (act === 'edit-tasks' && window.switchTab) window.switchTab('duties-tab');
  if (act === 'edit-selection' && window.switchTab) {
    window.switchTab('verification-tab');
    setTimeout(() => document.getElementById('taskSelectionSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }
}
function _onKey(e) { if (e.key === 'Escape') { e.preventDefault(); closeVerifiedChart(); } }

function _print() {
  document.documentElement.classList.add('vc-printing');
  const done = () => { document.documentElement.classList.remove('vc-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  // Chromium blocks in print(); elsewhere afterprint fires later.
  setTimeout(() => { if (!window.matchMedia || !window.matchMedia('print').matches) done(); }, 1000);
}

export function openVerifiedChart(fromButton) {
  if (_ov) return;
  _injectStyles();
  _launcher = fromButton || document.activeElement;
  _filter = 'all';
  _ov = document.createElement('div');
  _ov.className = 'vc-overlay';
  _ov.setAttribute('role', 'dialog');
  _ov.setAttribute('aria-modal', 'true');
  _ov.setAttribute('dir', window.i18n?.isRTL?.() ? 'rtl' : 'ltr');
  _ov.innerHTML = `
    <div class="vc-panel">
      <div class="vc-head"><h2 class="vc-title"></h2><span class="vc-badge"></span>
        <button type="button" class="vc-close">✕</button></div>
      <p class="vc-sub"></p>
      <div class="vc-status"></div>
      <div class="vc-bar"></div>
      <div class="vc-scroll"><div class="vc-chart"></div></div>
      <div class="vc-legend"></div>
      <p class="vc-note"></p>
    </div>`;
  document.body.appendChild(_ov);
  document.documentElement.classList.add('vc-lock');
  _shell();
  _render();
  _ov.addEventListener('click', _onClick);
  document.addEventListener('keydown', _onKey, true);
  window.addEventListener('dacum:langchange', _onLang);
  _ov.querySelector('.vc-close').focus();
}

function _onLang() { if (_ov) { _ov.setAttribute('dir', window.i18n?.isRTL?.() ? 'rtl' : 'ltr'); _shell(); _render(); } }

export function closeVerifiedChart() {
  if (!_ov) return;
  document.removeEventListener('keydown', _onKey, true);
  window.removeEventListener('dacum:langchange', _onLang);
  _ov.remove(); _ov = null;
  document.documentElement.classList.remove('vc-lock', 'vc-printing');
  if (_launcher && document.contains(_launcher)) { try { _launcher.focus({ preventScroll: true }); } catch (_) {} }
}

// ── Launch buttons (Task Analysis and Duties & Tasks) ────────────
// Task Analysis: always active. Duties & Tasks: highlighted once
// verification and Task Analysis are complete; before that it stays
// clickable (the chart is never mandatory nor locked) and first says
// what is missing, offering to show the chart anyway or to go there.

function _buttonHtml(where) {
  return `<button type="button" class="vc-launch" data-vc-open="${where}">📋 <span>${escapeHtml(_t('vcBtn'))}</span></button>`;
}

export function renderVerifiedChartButtons() {
  _injectStyles();
  const ta = document.getElementById('task-analysis-tab');
  if (ta && !ta.querySelector('.vc-launch-row')) {
    const anchor = ta.querySelector('.ta-layout');
    if (anchor) anchor.insertAdjacentHTML('beforebegin', `<div class="vc-launch-row">${_buttonHtml('ta')}</div>`);
  }
  const du = document.getElementById('duties-tab');
  if (du && !du.querySelector('.vc-launch-row')) {
    const anchor = document.getElementById('dutiesContainer');
    if (anchor) anchor.insertAdjacentHTML('beforebegin', `<div class="vc-launch-row vc-launch-duties">${_buttonHtml('duties')}<span class="vc-launch-hint"></span></div>`);
  }
  const { status: s } = getVerifiedChartData();
  document.querySelectorAll('.vc-launch-row').forEach(row => {
    const b = row.querySelector('.vc-launch');
    b.querySelector('span').textContent = _t('vcBtn');
    const isDuties = b.getAttribute('data-vc-open') === 'duties';
    // In Task Analysis the button is always the full one.
    const ready = !isDuties || s.complete;
    b.classList.toggle('vc-pending', !ready);
    b.title = ready ? _t('vcBtnTip') : _t('vcBtnPendingTip');
    const hint = row.querySelector('.vc-launch-hint');
    if (hint) hint.textContent = s.complete ? '' : '⏳ ' + _tf('vcPendingShort', { a: s.rated, b: s.total, c: s.analysed, d: s.selected });
  });
}

function _pendingDialog(btn) {
  const { status: s } = getVerifiedChartData();
  document.getElementById('vcPending')?.remove();
  const d = document.createElement('div');
  d.id = 'vcPending';
  d.className = 'vc-pending-ov';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  d.setAttribute('dir', window.i18n?.isRTL?.() ? 'rtl' : 'ltr');
  const line = (ok, text) => `<li class="${ok ? 'vc-ok' : 'vc-todo'}">${ok ? '✓' : '⏳'} ${escapeHtml(text)}</li>`;
  d.innerHTML = `
    <div class="vc-pending-box">
      <p class="vc-pending-title">📋 ${escapeHtml(_t('vcPendingTitle'))}</p>
      <ul>${line(s.verificationDone, _tf('vcStatusVer', { n: s.rated, total: s.total }))}
          ${line(s.analysisDone, _tf('vcStatusTA', { n: s.analysed, total: s.selected }))}</ul>
      <p class="vc-pending-text">${escapeHtml(_t('vcPendingText'))}</p>
      <div class="vc-pending-btns">
        ${!s.verificationDone ? `<button type="button" data-vc-go="verification-tab">${escapeHtml(_t('vcGoVer'))}</button>` : ''}
        ${s.verificationDone && !s.analysisDone ? `<button type="button" data-vc-go="task-analysis-tab">${escapeHtml(_t('vcGoTA'))}</button>` : ''}
        <button type="button" class="vc-primary" data-vc-anyway>${escapeHtml(_t('vcShowAnyway'))}</button>
      </div>
    </div>`;
  document.body.appendChild(d);
  const close = () => { d.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  d.addEventListener('click', e => {
    if (e.target === d) { close(); return; }
    const go = e.target.closest('[data-vc-go]');
    if (go) { close(); if (window.switchTab) window.switchTab(go.getAttribute('data-vc-go')); return; }
    if (e.target.closest('[data-vc-anyway]')) { close(); openVerifiedChart(btn); }
  });
  d.querySelector('[data-vc-anyway]').focus();
}

let _inited = false;
export function initVerifiedChart() {
  if (_inited) return;
  _inited = true;
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-vc-open]');
    if (!b) return;
    if (b.getAttribute('data-vc-open') === 'duties' && !getVerifiedChartData().status.complete) _pendingDialog(b);
    else openVerifiedChart(b);
  });
  const refresh = () => setTimeout(() => { try { renderVerifiedChartButtons(); } catch (_) {} }, 0);
  ['dacum:project-loaded', 'dacum:task-selection-changed'].forEach(ev => document.addEventListener(ev, refresh));
  window.addEventListener('dacum:langchange', refresh);
  // Re-read the state whenever one of the two tabs comes on screen.
  ['duties-tab', 'task-analysis-tab'].forEach(id => {
    const tab = document.getElementById(id);
    if (tab && 'MutationObserver' in window) {
      new MutationObserver(() => { if (tab.classList.contains('active')) refresh(); })
        .observe(tab, { attributes: true, attributeFilter: ['class'] });
    }
  });
  refresh();
}

// ── Styles ───────────────────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('vcStyles')) return;
  const st = document.createElement('style');
  st.id = 'vcStyles';
  st.textContent = `
.vc-launch-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 0 0 14px; }
.vc-launch { width: auto; margin: 0; display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 10px; cursor: pointer;
  font: inherit; font-weight: 700; font-size: .92em; color: #fff; border: 1px solid #0284c7; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); }
.vc-launch:hover { background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); }
.vc-launch:focus-visible { outline: 2px solid #0369a1; outline-offset: 2px; }
.vc-launch.vc-pending { background: #f1f5f9; color: #64748b; border: 1px dashed #94a3b8; }
.vc-launch.vc-pending::after { content: ' ⏳'; }
.vc-launch-hint { font-size: .82em; color: #64748b; }
html.vc-lock, html.vc-lock body { overflow: hidden; }
.vc-overlay { position: fixed; inset: 0; z-index: 10050; background: rgba(15,23,42,.55); display: flex; align-items: stretch; justify-content: center; padding: 16px; box-sizing: border-box; }
.vc-panel { background: #fff; border-radius: 14px; width: 100%; max-width: 1500px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.3); }
.vc-head { display: flex; align-items: center; gap: 10px; padding: 14px 18px 0; }
.vc-title { margin: 0; font-size: 1.25em; color: #0c4a6e; }
.vc-badge { font-size: .74em; font-weight: 700; color: #0369a1; background: #e0f2fe; border-radius: 999px; padding: 2px 10px; }
.vc-close { margin-inline-start: auto; width: auto; border: none; background: #f1f5f9; border-radius: 8px; padding: 6px 11px; cursor: pointer; font-size: 1em; }
.vc-sub { margin: 4px 18px 0; color: #475569; font-size: .9em; }
.vc-occ { font-weight: 700; color: #334155; }
.vc-status { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 8px 18px 0; font-size: .86em; font-weight: 600; }
.vc-ok { color: #166534; } .vc-todo { color: #b45309; }
.vc-bar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin: 10px 18px; }
.vc-filter, .vc-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.vc-bar button { width: auto; margin: 0; padding: 6px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #334155; font: inherit; font-size: .86em; font-weight: 600; cursor: pointer; }
.vc-bar button[aria-pressed="true"] { background: #0284c7; border-color: #0284c7; color: #fff; }
.vc-bar .vc-primary, .vc-pending-btns .vc-primary { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #fff; border-color: #0284c7; }
.vc-scroll { flex: 1; overflow: auto; padding: 0 18px 10px; }
.vc-row { display: flex; gap: 10px; align-items: stretch; margin-bottom: 10px; }
.vc-duty { flex: 0 0 170px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #fff; border-radius: 10px; padding: 10px 12px; }
.vc-duty-code { font-size: .78em; font-weight: 700; opacity: .9; text-transform: uppercase; }
.vc-duty-title { font-weight: 700; font-size: .92em; margin-top: 4px; overflow-wrap: anywhere; }
.vc-tasks { flex: 1; display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start; }
/* 3.86.2: cards stand out — darker frame, light shadow, and a faint
   tint of their priority colour (they read as blank white before). */
.vc-task { width: 168px; min-height: 96px; background: #fff; border: 1.5px solid #94a3b8; border-top: 6px solid #cbd5e1; border-radius: 9px; padding: 7px 9px;
  display: flex; flex-direction: column; gap: 4px; box-sizing: border-box; box-shadow: 0 1px 3px rgba(15,23,42,.10), 0 1px 2px rgba(15,23,42,.06); }
.vc-task.vc-pri-high { border-color: #fdba74; border-top-color: #ea580c; background: #fff7ed; }
.vc-task.vc-pri-medium { border-color: #fcd34d; border-top-color: #f59e0b; background: #fffbeb; }
.vc-task.vc-pri-low { border-color: #94a3b8; border-top-color: #64748b; background: #f8fafc; }
.vc-task.vc-pri-none { border-color: #94a3b8; border-top-style: dashed; border-top-color: #94a3b8; background: #fff; }
.vc-task.vc-off { background: #f1f5f9; border-style: dashed; border-color: #94a3b8; box-shadow: none; opacity: .7; }
.vc-task.vc-off .vc-text { text-decoration: line-through; color: #64748b; }
.vc-task-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.vc-code { font-weight: 800; color: #0369a1; font-size: .86em; }
.vc-rank { font-size: .76em; font-weight: 800; color: #334155; background: #f1f5f9; border-radius: 999px; padding: 1px 7px; }
.vc-rank.vc-unrated { font-weight: 600; color: #94a3b8; }
.vc-text { font-size: .84em; color: #1e293b; line-height: 1.35; flex: 1; overflow-wrap: anywhere; }
.vc-task-foot { display: flex; justify-content: space-between; align-items: center; gap: 4px; font-size: .74em; }
.vc-sel { color: #166534; font-weight: 700; }
.vc-sel-off { color: #92400e; font-weight: 600; }
.vc-ta { font-weight: 800; }
.vc-ta-completed { color: #16a34a; } .vc-ta-in-progress { color: #d97706; } .vc-ta-not-started { color: #94a3b8; }
.vc-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 8px 18px; border-top: 1px solid #e2e8f0; font-size: .8em; color: #475569; }
.vc-sw { display: inline-block; width: 18px; height: 6px; border-radius: 3px; margin-inline-end: 6px; vertical-align: middle; background: #cbd5e1; }
.vc-sw.vc-pri-high { background: #ea580c; } .vc-sw.vc-pri-medium { background: #f59e0b; } .vc-sw.vc-pri-low { background: #64748b; }
.vc-sw.vc-pri-none { background: transparent; border: 1px dashed #94a3b8; height: 4px; }
.vc-note { margin: 0 18px 12px; font-size: .78em; color: #64748b; font-style: italic; }
.vc-empty { color: #64748b; text-align: center; padding: 40px 0; }
.vc-pending-ov { position: fixed; inset: 0; z-index: 10060; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
.vc-pending-box { background: #fff; border-radius: 14px; max-width: 460px; width: 100%; padding: 18px 20px; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
.vc-pending-title { margin: 0 0 8px; font-weight: 800; color: #0c4a6e; font-size: 1.05em; }
.vc-pending-box ul { margin: 0 0 10px; padding: 0; list-style: none; font-weight: 600; font-size: .92em; }
.vc-pending-box li { margin: 4px 0; }
.vc-pending-text { margin: 0 0 14px; color: #475569; font-size: .88em; }
.vc-pending-btns { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.vc-pending-btns button { width: auto; margin: 0; padding: 8px 14px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #334155; font: inherit; font-weight: 700; font-size: .88em; cursor: pointer; }
@media (max-width: 700px) { .vc-row { flex-direction: column; } .vc-duty { flex-basis: auto; } .vc-task { width: calc(50% - 4px); } }
@media print {
  @page { size: landscape; margin: 10mm; }
  html.vc-printing body > *:not(.vc-overlay) { display: none !important; }
  html.vc-printing, html.vc-printing body { overflow: visible !important; background: #fff !important; padding: 0 !important; }
  html.vc-printing .vc-overlay { position: static; background: none; padding: 0; display: block; }
  html.vc-printing .vc-panel { box-shadow: none; max-width: none; border-radius: 0; overflow: visible; display: block; }
  html.vc-printing .vc-close, html.vc-printing .vc-bar { display: none !important; }
  html.vc-printing .vc-scroll { overflow: visible; padding: 0; }
  html.vc-printing .vc-row { break-inside: avoid; }
  html.vc-printing .vc-task, html.vc-printing .vc-duty, html.vc-printing .vc-sw { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;
  document.head.appendChild(st);
}
