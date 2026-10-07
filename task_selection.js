// ============================================================
// /task_selection.js
// Select Tasks for Training / Analysis (3.80.0) — the SCID step
// between Task Verification and Task Analysis.
//
// Lives at the bottom of the Task Verification tab as its own section
// rather than as a column in the verification table: that table has
// three layouts (standard / workshop / extended) built in tasks.js and
// a column there would have to be threaded through all three.
//
// The step is OPTIONAL. Every task is selected until the user says
// otherwise, so a project that never opens this section behaves
// exactly as before and Task Analysis lists every task. That is why the
// state stores EXCLUSIONS, not inclusions: a task added later is
// selected by default, and an empty map means "analyse everything".
//
//   appState.taskSelection = {
//     excluded: { [taskInputId]: reasonCode },   // '' = no reason given
//     rule:     'impdiff' | 'topn',              // suggestion rule
//     impMin:   2, diffMin: 2,                   // impdiff thresholds
//     topN:     10                               // topn count
//   }
//
// Keyed by task inputId — the same key verificationRatings and
// taskAnalysisData use (see task_analysis.js header), so it survives
// add / remove / reorder of tasks.
//
// Phase 1 scope: only the Task Analysis tab follows the selection.
// Clusters, outcomes, modules and the exports still see every task.
// ============================================================

import { appState }               from './state.js';
import { showStatus, escapeHtml } from './renderer.js';
import { getDutyLetter }          from './codes.js';
import { normalizeDraftRatingKeys } from './tasks.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
const _bdi = (code) => `<bdi>${code}</bdi>`;

const CONTAINER_ID = 'taskSelectionSection';

/* Reasons a task is left out. Codes are stored; labels are translated
   at render time. An explicit map so a missing key is visible to the
   translation validator (same rule as PRIORITY_KEY in tasks.js). */
const REASONS = [
  { code: 'lowprio', key: 'tselReasonLowPrio' },
  { code: 'lowimp',  key: 'tselReasonLowImp' },
  { code: 'onjob',   key: 'tselReasonOnJob' },
  { code: 'rare',    key: 'tselReasonRare' },
  { code: 'prior',   key: 'tselReasonPrior' },
  { code: 'other',   key: 'tselReasonOther' },
];

export function defaultTaskSelection() {
  return { excluded: {}, rule: 'impdiff', impMin: 2, diffMin: 2, topN: 10 };
}

function _state() {
  const s = appState.taskSelection;
  if (!s || typeof s !== 'object') {
    appState.taskSelection = defaultTaskSelection();
    return appState.taskSelection;
  }
  if (!s.excluded || typeof s.excluded !== 'object') s.excluded = {};
  const d = defaultTaskSelection();
  if (s.rule !== 'impdiff' && s.rule !== 'topn') s.rule = d.rule;
  if (!Number.isFinite(+s.impMin))  s.impMin  = d.impMin;
  if (!Number.isFinite(+s.diffMin)) s.diffMin = d.diffMin;
  if (!Number.isFinite(+s.topN) || +s.topN < 1) s.topN = d.topN;
  return s;
}

function _changed() {
  try { document.dispatchEvent(new CustomEvent('dacum:task-selection-changed')); } catch (e) {}
}

// ── Public read API (used by task_analysis.js) ───────────────────

export function isTaskSelected(taskKey) {
  return !Object.prototype.hasOwnProperty.call(_state().excluded, taskKey);
}

export function getTaskExclusionReason(taskKey) {
  const code = _state().excluded[taskKey];
  if (code === undefined) return null;
  const r = REASONS.find(x => x.code === code);
  return r ? _t(r.key) : '';
}

export function setTaskSelected(taskKey, on, reason) {
  const s = _state();
  if (on) delete s.excluded[taskKey];
  else    s.excluded[taskKey] = reason || s.excluded[taskKey] || '';
  _changed();
}

/** Excluded keys that belong to tasks that still exist, sorted — the
 *  part of the selection that changes what Task Analysis shows. */
export function taskSelectionSignature() {
  const live = new Set(_allTasks().map(t => t.key));
  return Object.keys(_state().excluded).filter(k => live.has(k)).sort().join(',');
}

/** True when the user has left at least one existing task out. */
export function hasTaskSelection() {
  return taskSelectionSignature() !== '';
}

// ── Data ─────────────────────────────────────────────────────────

function _allTasks() {
  const out = [];
  (appState.dutiesData || []).forEach((duty, dutyIndex) => {
    let n = 0;
    (duty.tasks || []).forEach(task => {
      const text = (task.text || '').trim();
      if (!text) return;
      n++;
      out.push({
        key: task.inputId, text, code: getDutyLetter(dutyIndex) + n,
        dutyId: duty.id, dutyIndex, dutyTitle: (duty.title || '').trim() || _t('lblUntitledDuty')
      });
    });
  });
  return out;
}

/* Importance / Frequency / Difficulty and the Priority Index for one
   task, from whichever source the collection mode uses — the same
   sources the dashboard and the results chart read. Live-workshop
   results are stored under "<dutyId>_task_<inputId>" (workshop.js),
   manual workshop counts under the plain inputId. */
function _metrics(t) {
  const formula = appState.priorityFormula === 'ifd' ? 'ifd' : 'if';
  const pi = (i, f, d) => formula === 'ifd' ? i * f * d : i * f;

  if (appState.collectionMode === 'workshop') {
    const wr = appState.workshopResults || {};
    const r  = (wr[t.key] && wr[t.key].valid) ? wr[t.key]
             : (wr[t.dutyId + '_task_' + t.key] && wr[t.dutyId + '_task_' + t.key].valid) ? wr[t.dutyId + '_task_' + t.key]
             : null;
    if (!r || r.meanImportance == null || r.meanFrequency == null || r.meanDifficulty == null) return null;
    return {
      i: r.meanImportance, f: r.meanFrequency, d: r.meanDifficulty,
      pi: Number.isFinite(r.priorityIndex) ? r.priorityIndex : pi(r.meanImportance, r.meanFrequency, r.meanDifficulty)
    };
  }

  const r = (appState.verificationRatings || {})[t.key];
  if (!r || r.importance == null || r.frequency == null || r.difficulty == null) return null;
  return { i: r.importance, f: r.frequency, d: r.difficulty, pi: pi(r.importance, r.frequency, r.difficulty) };
}

const _fmt = (v) => (Math.round(v * 100) / 100).toString();

// ── Suggestion ───────────────────────────────────────────────────

/* Replaces the selection for every RATED task; unrated tasks keep their
   current state — with no data there is nothing to judge them on. */
function _suggest() {
  const s     = _state();
  const tasks = _allTasks().map(t => ({ ...t, m: _metrics(t) }));
  const rated = tasks.filter(t => t.m);
  if (!rated.length) { showStatus(_t('tselNoRatings'), 'error'); return; }

  if (taskSelectionSignature() && !confirm(_t('tselConfirmReplace'))) return;

  const keep = new Set();
  const why  = {};
  if (s.rule === 'topn') {
    const n = Math.max(1, Math.floor(+s.topN));
    const sorted = rated.slice().sort((a, b) => b.m.pi - a.m.pi);
    // Ties at the cut-off are kept together: dropping one of two tasks
    // with the same score would be an arbitrary decision.
    const cut = sorted[Math.min(n, sorted.length) - 1].m.pi;
    sorted.forEach(t => { if (t.m.pi >= cut - 1e-9) keep.add(t.key); else why[t.key] = 'lowprio'; });
  } else {
    const iMin = +s.impMin, dMin = +s.diffMin;
    rated.forEach(t => {
      if (t.m.i >= iMin - 1e-9 && t.m.d >= dMin - 1e-9) keep.add(t.key);
      else why[t.key] = t.m.i < iMin - 1e-9 ? 'lowimp' : 'onjob';
    });
  }

  rated.forEach(t => {
    if (keep.has(t.key)) delete s.excluded[t.key];
    else s.excluded[t.key] = why[t.key];
  });
  _changed();
  renderTaskSelection();
  showStatus('✓ ' + _tf('tselSuggested', { n: keep.size, total: tasks.length }), 'success');
}

// ── Render ───────────────────────────────────────────────────────

export function renderTaskSelection() {
  const host = document.getElementById(CONTAINER_ID);
  if (!host) return;
  normalizeDraftRatingKeys();
  const s     = _state();
  const tasks = _allTasks();

  if (!tasks.length) { host.innerHTML = ''; return; }

  const rows     = tasks.map(t => ({ ...t, m: _metrics(t), on: isTaskSelected(t.key) }));
  const nOn      = rows.filter(r => r.on).length;
  const nRated   = rows.filter(r => r.m).length;
  const nUnrated = rows.length - nRated;
  const piLabel  = appState.priorityFormula === 'ifd' ? 'I×F×D' : 'I×F';

  const stars = Object.keys(appState.taskAnalysisPriority || {})
    .filter(k => appState.taskAnalysisPriority[k] && rows.some(r => r.key === k)).length;

  const byDuty = [];
  rows.forEach(r => {
    let g = byDuty[byDuty.length - 1];
    if (!g || g.dutyId !== r.dutyId) { g = { dutyId: r.dutyId, dutyIndex: r.dutyIndex, title: r.dutyTitle, rows: [] }; byDuty.push(g); }
    g.rows.push(r);
  });

  const reasonSelect = (r) => {
    const cur = s.excluded[r.key] || '';
    return `
      <select class="tsel-reason" data-tsel-reason="${escapeHtml(r.key)}" aria-label="${escapeHtml(_t('tselReasonLabel'))}"
              ${r.on ? 'hidden' : ''}>
        <option value="">${escapeHtml(_t('tselReasonNone'))}</option>
        ${REASONS.map(x => `<option value="${x.code}"${x.code === cur ? ' selected' : ''}>${escapeHtml(_t(x.key))}</option>`).join('')}
      </select>`;
  };

  const metrics = (m) => m
    ? `<span class="tsel-metrics" dir="ltr">I ${_fmt(m.i)} · F ${_fmt(m.f)} · D ${_fmt(m.d)} · <b>PI ${_fmt(m.pi)}</b></span>`
    : `<span class="tsel-metrics tsel-unrated">${escapeHtml(_t('tselUnrated'))}</span>`;

  const num = (field, val, min, max, step) =>
    `<input type="number" class="tsel-num" data-tsel-field="${field}" value="${escapeHtml(String(val))}"
            min="${min}" max="${max}" step="${step}" dir="ltr">`;

  host.innerHTML = `
    <div class="tsel">
      <div class="tsel-head">
        <h3>✅ ${escapeHtml(_t('tselTitle'))}</h3>
        <span class="tsel-count" id="tselCount">${escapeHtml(_tf('tselCount', { n: nOn, total: rows.length }))}</span>
      </div>
      <p class="tsel-intro">${escapeHtml(_t('tselIntro'))}</p>

      <div class="tsel-rule" role="radiogroup" aria-label="${escapeHtml(_t('tselRuleLabel'))}">
        <div class="tsel-rule-title">💡 ${escapeHtml(_t('tselRuleLabel'))}</div>
        <label class="tsel-rule-opt">
          <input type="radio" name="tselRule" value="impdiff" ${s.rule === 'impdiff' ? 'checked' : ''}>
          <span>${_tf('tselRuleImpDiff', { imp: num('impMin', s.impMin, 0, 3, 0.1), diff: num('diffMin', s.diffMin, 0, 3, 0.1) })}</span>
        </label>
        <label class="tsel-rule-opt">
          <input type="radio" name="tselRule" value="topn" ${s.rule === 'topn' ? 'checked' : ''}>
          <span>${_tf('tselRuleTopN', { n: num('topN', s.topN, 1, 999, 1), pi: `<bdi>${piLabel}</bdi>` })}</span>
        </label>
        <div class="tsel-btns">
          <button type="button" class="tsel-btn tsel-btn-primary" data-tsel-action="suggest" ${nRated ? '' : 'disabled'}>💡 ${escapeHtml(_t('tselBtnSuggest'))}</button>
          <button type="button" class="tsel-btn" data-tsel-action="all">${escapeHtml(_t('tselBtnAll'))}</button>
          <button type="button" class="tsel-btn" data-tsel-action="none">${escapeHtml(_t('tselBtnNone'))}</button>
          ${stars ? `<button type="button" class="tsel-btn" data-tsel-action="stars">★ ${escapeHtml(_tf('tselBtnStars', { n: stars }))}</button>` : ''}
        </div>
        ${!nRated ? `<p class="tsel-note">${escapeHtml(_t('tselNoRatings'))}</p>`
          : nUnrated ? `<p class="tsel-note">${escapeHtml(_tf('tselUnratedNote', { n: nUnrated }))}</p>` : ''}
      </div>

      <div class="tsel-list">
        ${byDuty.map(g => {
          const letter = getDutyLetter(g.dutyIndex);
          const gOn = g.rows.filter(r => r.on).length;
          return `
          <div class="tsel-duty">
            <div class="tsel-duty-title"><span>${_bdi(letter)}: ${escapeHtml(g.title)}</span>
              <span class="tsel-duty-count" data-tsel-duty-count="${escapeHtml(g.dutyId)}">${gOn}/${g.rows.length}</span></div>
            ${g.rows.map(r => `
              <div class="tsel-row${r.on ? '' : ' tsel-off'}" data-tsel-row="${escapeHtml(r.key)}" data-tsel-duty="${escapeHtml(r.dutyId)}">
                <label class="tsel-check">
                  <input type="checkbox" data-tsel-key="${escapeHtml(r.key)}" ${r.on ? 'checked' : ''}>
                  <span class="tsel-code">${_bdi(r.code)}</span>
                  <span class="tsel-text">${escapeHtml(r.text)}</span>
                </label>
                ${metrics(r.m)}
                ${reasonSelect(r)}
              </div>`).join('')}
          </div>`;
        }).join('')}
      </div>
      <p class="tsel-foot">${escapeHtml(_t('tselFoot'))}</p>
    </div>`;
}

/* In-place update after a single tick, so the list does not jump and
   keyboard focus stays on the checkbox. */
function _refreshCounts() {
  const host = document.getElementById(CONTAINER_ID);
  if (!host) return;
  const rows = _allTasks();
  const nOn  = rows.filter(r => isTaskSelected(r.key)).length;
  const c = host.querySelector('#tselCount');
  if (c) c.textContent = _tf('tselCount', { n: nOn, total: rows.length });
  host.querySelectorAll('[data-tsel-duty-count]').forEach(el => {
    const id = el.getAttribute('data-tsel-duty-count');
    const g  = rows.filter(r => r.dutyId === id);
    el.textContent = `${g.filter(r => isTaskSelected(r.key)).length}/${g.length}`;
  });
}

// ── Events ───────────────────────────────────────────────────────

function _onChange(e) {
  const t = e.target;
  const s = _state();

  const key = t.getAttribute && t.getAttribute('data-tsel-key');
  if (key) {
    setTaskSelected(key, t.checked);
    const row = t.closest('.tsel-row');
    if (row) {
      row.classList.toggle('tsel-off', !t.checked);
      const sel = row.querySelector('.tsel-reason');
      if (sel) { sel.hidden = t.checked; if (t.checked) sel.value = ''; }
    }
    _refreshCounts();
    return;
  }

  const rk = t.getAttribute && t.getAttribute('data-tsel-reason');
  if (rk) {
    if (!isTaskSelected(rk)) { s.excluded[rk] = t.value; _changed(); }
    return;
  }

  if (t.name === 'tselRule') { s.rule = t.value === 'topn' ? 'topn' : 'impdiff'; return; }

  const field = t.getAttribute && t.getAttribute('data-tsel-field');
  if (field) {
    let v = parseFloat(t.value);
    if (field === 'topN') v = Math.max(1, Math.floor(Number.isFinite(v) ? v : 10));
    else v = Math.min(3, Math.max(0, Number.isFinite(v) ? v : 2));
    s[field] = v;
    t.value = String(v);
    // Editing a threshold says which rule the user means.
    const radio = t.closest('.tsel-rule-opt')?.querySelector('input[type="radio"]');
    if (radio && !radio.checked) { radio.checked = true; s.rule = radio.value; }
  }
}

function _onClick(e) {
  const btn = e.target.closest('[data-tsel-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-tsel-action');
  const s = _state();
  const tasks = _allTasks();

  if (action === 'suggest') { _suggest(); return; }

  if (action === 'all') {
    tasks.forEach(t => delete s.excluded[t.key]);
  } else if (action === 'none') {
    tasks.forEach(t => { if (!(t.key in s.excluded)) s.excluded[t.key] = ''; });
  } else if (action === 'stars') {
    const star = appState.taskAnalysisPriority || {};
    tasks.forEach(t => {
      if (star[t.key]) delete s.excluded[t.key];
      else if (!(t.key in s.excluded)) s.excluded[t.key] = '';
    });
  } else {
    return;
  }
  _changed();
  renderTaskSelection();
}

let _inited = false;
let _ratingTimer = null;

export function initTaskSelection() {
  if (_inited) return;
  _inited = true;
  _state();

  const host = document.getElementById(CONTAINER_ID);
  if (!host) return;
  host.addEventListener('change', _onChange);
  host.addEventListener('click',  _onClick);

  // Ratings, counts, the formula and the collection mode are all edited
  // elsewhere in the same tab; follow them with a short debounce. Never
  // re-render while focus is inside this section (it would steal it).
  const tab = document.getElementById('verification-tab');
  if (tab) {
    const later = (e) => {
      if (e.target && host.contains(e.target)) return;
      clearTimeout(_ratingTimer);
      _ratingTimer = setTimeout(() => {
        if (host.contains(document.activeElement)) return;
        renderTaskSelection();
      }, 500);
    };
    tab.addEventListener('change', later);
    tab.addEventListener('input',  later);
    tab.addEventListener('click',  (e) => { if (e.target.closest && e.target.closest('#btnLoadDutiesForVerification, #btnLWFetchResults')) later(e); });

    if ('MutationObserver' in window) {
      let wasActive = tab.classList.contains('active');
      new MutationObserver(() => {
        const isActive = tab.classList.contains('active');
        if (isActive && !wasActive) setTimeout(renderTaskSelection, 0);
        wasActive = isActive;
      }).observe(tab, { attributes: true, attributeFilter: ['class'] });
    }
  }

  window.addEventListener('dacum:langchange', renderTaskSelection);
  document.addEventListener('dacum:project-loaded', () => setTimeout(renderTaskSelection, 0));
  // A tick in the Task Analysis list changes the same state.
  document.addEventListener('dacum:task-selection-changed', () => {
    if (!host.contains(document.activeElement)) renderTaskSelection();
  });

  renderTaskSelection();
}
