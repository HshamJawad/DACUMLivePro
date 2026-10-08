// ============================================================
// /task_analysis.js
// Task Analysis tab — sits between Task Verification and
// Competency Clusters in the DACUM workflow.
//
// Data lives in appState.taskAnalysisData, a flat dictionary keyed by
// the task's existing inputId (same key already used by
// verificationRatings / taskMetadata in tasks.js). This is deliberate:
// dutiesData[].tasks[] is rebuilt on every add/remove/reorder, so a
// flat key is what survives that — nesting the record inside the task
// object itself would silently detach it the next time the list is
// rebuilt from state.
//
// Records are created lazily on first edit, not on render. Rendering
// a task that has never been touched must NOT write an empty record
// into appState — otherwise every task in the chart would pick up a
// blank Task Analysis entry just by being displayed once, bloating
// every saved project and JSON export with noise.
// ============================================================

import { appState }        from './state.js';
import { showStatus, escapeHtml } from './renderer.js';
import { getDutyLetter }   from './codes.js';
// Circular with modules.js (which imports from here); used only inside
// render functions, after both modules have finished loading.
import { getModulesUsingTask } from './modules.js';
import { writeAIDraft, clearAIDraft, restoreAIDraft, isAIDraft, canRestoreAI,
         aiMarkHTML, removeAIMark } from './ai_draft.js';
import { syncAllFromDOM }  from './duties.js';
import { isTaskSelected, setTaskSelected, getTaskExclusionReason,
         taskSelectionSignature } from './task_selection.js';

/* i18n access — resolved lazily; see duties.js for why. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

/* Duty letters and task codes are Latin and must never be reordered by
   the bidi algorithm inside Arabic text — same convention as
   duties.js's _bdi(). */
const _bdi = (code) => `<bdi>${code}</bdi>`;

// ── Field definitions ─────────────────────────────────────────
// Single source of truth for which fields exist, their i18n keys, and
// whether they render as a reorderable list or a plain textarea.
// Adding a field to a future revision means adding one line here.
const LIST_FIELDS = [
  { key: 'performanceSteps',            labelKey: 'taLblSteps',      phKey: 'taPhSteps' },
  { key: 'requiredKnowledge',           labelKey: 'taLblKnowledge',  phKey: 'taPhKnowledge' },
  { key: 'requiredSkills',              labelKey: 'taLblSkills',     phKey: 'taPhSkills' },
  /* 3.92.0 — Norton/SCID: task analysis records the worker behaviours
     relevant to THIS task (picked from the occupation-wide list in
     Additional Info). Older records have no such key: read as empty. */
  { key: 'workerBehaviours',            labelKey: 'taLblBehaviours', phKey: 'taPhBehaviours' },
  { key: 'toolsEquipmentMaterials',     labelKey: 'taLblTools',      phKey: 'taPhTools' },
  { key: 'safetyOSH',                   labelKey: 'taLblSafety',     phKey: 'taPhSafety' },
  { key: 'decisionsCriticalPoints',     labelKey: 'taLblDecisions',  phKey: 'taPhDecisions' },
  { key: 'performanceCriteria',         labelKey: 'taLblCriteria',   phKey: 'taPhCriteria' },
  { key: 'commonErrorsTroubleshooting', labelKey: 'taLblErrors',     phKey: 'taPhErrors' },
];

const TEXT_FIELDS = [
  { key: 'conditionsWorkEnvironment', labelKey: 'taLblConditions', phKey: 'taPhConditions' },
  { key: 'performanceStandard',       labelKey: 'taLblStandard',   phKey: 'taPhStandard' },
];

/* All ten sections in on-screen order — shared with task_analysis_ai.js
   so the AI dialog lists exactly what the form shows, and with the Word
   and PDF exports (3.46.0). Ordered by importance (3.46.0): what the
   worker does, knows and can do, how it is judged, then the supporting
   detail. */
export const TA_FIELD_SPECS = [
  'performanceSteps', 'requiredKnowledge', 'requiredSkills', 'workerBehaviours',
  'performanceCriteria', 'performanceStandard',
  'toolsEquipmentMaterials', 'safetyOSH', 'decisionsCriticalPoints',
  'conditionsWorkEnvironment', 'commonErrorsTroubleshooting',
].map(key => [...LIST_FIELDS, ...TEXT_FIELDS].find(f => f.key === key));

const _isTextField = (key) => TEXT_FIELDS.some(f => f.key === key);

// ── Sections the user adds (3.46.0) ──────────────────────────────
// appState.taskAnalysisCustomSections = [{ id, title }] — one list for
// the whole project, so every task offers the same extra sections (e.g.
// "Quality Requirements") and the exports line up. Each task keeps its
// own lines under record.custom[id]. Titles are the user's text, never
// translated. Field key on screen: "custom:<id>".
const CUSTOM_PREFIX = 'custom:';
const _isCustomKey = (key) => String(key || '').indexOf(CUSTOM_PREFIX) === 0;
const _customId = (key) => String(key).slice(CUSTOM_PREFIX.length);

export function getTaskAnalysisCustomSections() {
  const c = appState.taskAnalysisCustomSections;
  return Array.isArray(c) ? c.filter(x => x && x.id) : [];
}

function _getField(r, key) {
  if (!r) return _isTextField(key) ? '' : [];
  if (_isCustomKey(key)) return ((r.custom || {})[_customId(key)]) || [];
  return r[key];
}
function _setField(r, key, value) {
  if (_isCustomKey(key)) {
    if (!r.custom || typeof r.custom !== 'object' || Array.isArray(r.custom)) r.custom = {};
    r.custom[_customId(key)] = value;
  } else {
    r[key] = value;
  }
}

/* Non-blank custom lines of one record, in section order, as
   [{ title, items }] — what the exports and the Module Builder handoff
   read. */
function _customSectionsOf(r) {
  return getTaskAnalysisCustomSections()
    .map(sec => ({ title: sec.title, items: _nonBlank((r && r.custom || {})[sec.id]).map(x => x.trim()) }))
    .filter(sec => sec.items.length);
}

// Additional Info holds general, occupation-wide information; Task
// Analysis holds what THIS task specifically needs. These three fields
// are the ones with a direct counterpart in Additional Info, so they
// get a "pick from Additional Info" button that copies selected lines
// in as ordinary, independently-editable text — see
// _openAdditionalInfoPicker(). Nothing here is a live reference: once
// copied, the line belongs to the task and editing/deleting it never
// touches the Additional Info source, exactly as duplicating a line by
// hand would behave.
const ADDITIONAL_INFO_SOURCES = {
  requiredKnowledge:       { inputId: 'knowledgeInput', headingId: 'knowledgeHeading', titleKey: 'taLblKnowledge' },
  requiredSkills:          { inputId: 'skillsInput',    headingId: 'skillsHeading',    titleKey: 'taLblSkills' },
  toolsEquipmentMaterials: { inputId: 'toolsInput',     headingId: 'toolsHeading',     titleKey: 'taLblTools' },
  workerBehaviours:        { inputId: 'behaviorsInput', headingId: 'behaviorsHeading', titleKey: 'taLblBehaviours' },   // 3.92.0
};

// Fields that must ALL have at least one entry/value for a task to be
// considered "Completed" rather than "In Progress" — a heuristic for
// the status dot only. Nothing in the app is blocked by this; per the
// spec, no field is ever required to proceed.
const _CORE_COMPLETE_KEYS = [
  'performanceSteps', 'requiredKnowledge', 'requiredSkills',
  'toolsEquipmentMaterials', 'safetyOSH', 'performanceCriteria'
];

function _blankRecord() {
  return {
    performanceSteps: [], requiredKnowledge: [], requiredSkills: [], workerBehaviours: [],
    toolsEquipmentMaterials: [], safetyOSH: [], conditionsWorkEnvironment: '',
    decisionsCriticalPoints: [], performanceCriteria: [], performanceStandard: '',
    commonErrorsTroubleshooting: []
  };
}

// Read-only accessor — returns the stored record or null. Never writes.
function _record(taskKey) {
  return (appState.taskAnalysisData || {})[taskKey] || null;
}

// Read accessor for rendering — never writes a blank record into
// appState just because the UI displayed it.
function _view(taskKey) {
  return _record(taskKey) || _blankRecord();
}

// Get-or-create — the ONLY place a record is written into appState.
function _ensureRecord(taskKey) {
  if (!appState.taskAnalysisData) appState.taskAnalysisData = {};
  if (!appState.taskAnalysisData[taskKey]) appState.taskAnalysisData[taskKey] = _blankRecord();
  const r = appState.taskAnalysisData[taskKey];
  /* 3.92.0: a record saved before a section existed (workerBehaviours)
     lacks its key — give it an empty one before anything writes to it. */
  LIST_FIELDS.forEach(f => { if (!Array.isArray(r[f.key])) r[f.key] = []; });
  return r;
}

// A raw list-field array may contain blank-string entries — either
// from a mid-edit blank line (see the 'ta-edit-list' input handler) or
// from an old record. Every place that decides whether a field
// "counts" — emptiness, status, export — reads through this instead
// of the raw array length.
function _nonBlank(arr) {
  return (arr || []).filter(s => (s || '').trim());
}

function _isRecordEmpty(r) {
  if (!r) return true;
  return LIST_FIELDS.every(f => !_nonBlank(r[f.key]).length) &&
         !(r.conditionsWorkEnvironment || '').trim() &&
         !(r.performanceStandard || '').trim() &&
         !_customSectionsOf(r).length;
}

function _status(taskKey) {
  const r = _record(taskKey);
  if (_isRecordEmpty(r)) return 'not-started';
  const coreFilled = _CORE_COMPLETE_KEYS.every(k => _nonBlank(r[k]).length > 0) &&
                      (r.performanceStandard || '').trim();
  return coreFilled ? 'completed' : 'in-progress';
}

/** 'not-started' | 'in-progress' | 'completed' — read by the verified
 *  DACUM chart (verified_chart.js, 3.86.0). */
export function getTaskAnalysisStatus(taskKey) { return _status(taskKey); }

/* 3.45.0: which training modules this task's analysis will reach
   (they also receive it in Module Builder). Nothing while no module
   exists yet. */
function _usedInLine(taskKey) {
  const mm = appState.moduleMappingData || {};
  if (!(mm.modules || []).length) return '';
  let mods = [];
  try { mods = getModulesUsingTask(taskKey); } catch (_) { mods = []; }
  if (!mods.length) {
    return `<div class="ta-used-in ta-used-in-none">📦 ${escapeHtml(_t('taUsedInNone'))}</div>`;
  }
  const chips = mods.map(m =>
    `<span class="ta-used-chip" title="${escapeHtml(m.title)}"><bdi>${escapeHtml(m.ref || m.title)}</bdi></span>`).join('');
  return `<div class="ta-used-in">📦 <span class="ta-used-label">${escapeHtml(_t('taUsedIn'))}</span> ${chips}</div>`;
}

function _statusLabel(status) {
  if (status === 'completed')   return _t('taStatusCompleted');
  if (status === 'in-progress') return _t('taStatusInProgress');
  return _t('taStatusNotStarted');
}

function _statusDot(status) {
  if (status === 'completed')   return '✓';
  if (status === 'in-progress') return '◐';
  return '○';
}

// The ★ "flag for detailed analysis" toggle that used to sit here was
// replaced in 3.80.0 by the selection in task_selection.js (☑ in the
// navigator). appState.taskAnalysisPriority is still saved and loaded,
// and the Task Verification section offers to turn the stars into a
// selection, so nobody's marks are lost.

/** Clean (marker-stripped, trimmed, non-blank) Performance Criteria for
 *  one task — the read API other tabs use to pull in Task-Analysis-
 *  sourced criteria without duplicating storage. Used by Competency
 *  Clusters to auto-populate a cluster's criteria from its assigned
 *  tasks; never writes anything back into Task Analysis. */
export function getTaskPerformanceCriteria(taskKey) {
  const r = _record(taskKey);
  if (!r) return [];
  return _nonBlank(r.performanceCriteria).map(s =>
    s.replace(/^[\s]*[•\-\*○●]\s*/, '').replace(/^[\s]*\d+[\.\)]\s*/, '').trim()
  );
}

/** Full cleaned record for one task, or null if it has no analysis
 *  content — used by the Module Mapping → Module Builder handoff to
 *  attach the relevant Task Analysis detail to a transferred module
 *  without duplicating it into every downstream record. */
export function getTaskAnalysisRecord(taskKey) {
  const r = _record(taskKey);
  if (!r || _isRecordEmpty(r)) return null;
  const clean = { ...r };
  LIST_FIELDS.forEach(f => { clean[f.key] = _nonBlank(r[f.key]).map(s => s.trim()); });
  // 3.46.0: user-added sections travel as [{ title, items }], not as the
  // internal id-keyed map.
  delete clean.custom;
  delete clean._aiPrev;
  const custom = _customSectionsOf(r);
  if (custom.length) clean.customSections = custom;
  return clean;
}

/** True when at least one task in the whole chart has any analysis
 *  content — used by clearCurrentTab/_isTabEmpty (projects.js) and by
 *  the PDF/DOCX export functions to decide whether to include the
 *  Task Analysis appendix at all. */
export function hasAnyTaskAnalysis() {
  return Object.values(appState.taskAnalysisData || {}).some(r => !_isRecordEmpty(r));
}

/** Count of tasks that have any actual analysis content — used for the
 *  "you're about to lose N records" warning in clearCurrentTab. */
export function countTaskAnalysisRecords() {
  return Object.values(appState.taskAnalysisData || {}).filter(r => !_isRecordEmpty(r)).length;
}

/** Full export dataset: every task that has ANY analysis content, in
 *  duty/task order, with duty letter + task code already resolved.
 *  List fields are pre-cleaned of blank lines; consumed as-is by
 *  exports_pdf.js and exports_docx.js. */
export function getTaskAnalysisExportData() {
  syncAllFromDOM();
  // 3.81.0: only tasks selected for training (Task Verification →
  // Select Tasks). With no selection made, every task is selected.
  return _allTasksFlat()
    .filter(entry => isTaskSelected(entry.taskKey) && !_isRecordEmpty(_record(entry.taskKey)))
    .map(entry => {
      const raw = _record(entry.taskKey);
      const record = { ...raw };
      // Trimmed, non-blank lines — exactly as stored, markers and all.
      // The exporter (not this function) decides whether to add its own
      // numbering, based on whether a line already carries one — see
      // _writeList()/_pushList() in exports_pdf.js / exports_docx.js.
      LIST_FIELDS.forEach(f => { record[f.key] = _nonBlank(raw[f.key]).map(s => s.trim()); });
      // 3.46.0: user-added sections, in section order, non-blank only.
      delete record.custom;
      delete record._aiPrev;
      record.customSections = _customSectionsOf(raw);
      return {
        dutyLetter: getDutyLetter(entry.dutyIndex),
        dutyTitle:  entry.dutyTitle,
        taskCode:   `${getDutyLetter(entry.dutyIndex)}${entry.taskNum}`,
        taskText:   entry.task.text,
        record
      };
    });
}

// ── AI assistance hooks (used by task_analysis_ai.js) ───────────

function _fieldFilled(r, key) {
  const v = r ? _getField(r, key) : null;
  return Array.isArray(v) ? _nonBlank(v).length > 0 : !!(v || '').trim();
}

/** Everything the AI prompt needs about one task, read-only. */
export function getTaskAnalysisContext(taskKey) {
  syncAllFromDOM();
  const flat  = _allTasksFlat();
  const entry = flat.find(f => f.taskKey === taskKey);
  if (!entry) return null;
  const letter = getDutyLetter(entry.dutyIndex);
  const record = _view(taskKey);
  const filled = {};
  TA_FIELD_SPECS.forEach(f => { filled[f.key] = _fieldFilled(record, f.key); });
  // 3.70.0: the user's own sections are offered to the AI as well.
  // Field key "custom:<id>", same as on screen; the title is the rule.
  const customSections = getTaskAnalysisCustomSections().map(sec => ({
    key: CUSTOM_PREFIX + sec.id, title: sec.title,
  }));
  customSections.forEach(c => { filled[c.key] = _fieldFilled(record, c.key); });

  const clusterCriteria = [];
  (appState.clusteringData?.clusters || []).forEach(c => {
    if ((c.tasks || []).some(t => t.id === taskKey)) {
      (c.performanceCriteria || []).forEach(pc => { if ((pc || '').trim()) clusterCriteria.push(pc.trim()); });
    }
  });

  return {
    taskKey,
    dutyLetter: letter,
    dutyTitle:  entry.dutyTitle,
    taskCode:   `${letter}${entry.taskNum}`,
    taskText:   entry.task.text,
    siblings:   flat.filter(f => f.dutyId === entry.dutyId && f.taskKey !== taskKey)
                    .map(f => f.task.text).slice(0, 25),
    record, filled, clusterCriteria, customSections,
  };
}

/** Writes AI-generated sections into one task and marks each as an
 *  AI draft until the user edits it. Only the keys passed are touched.
 *  3.70.0: keys may be "custom:<id>" (the user's own sections), and a
 *  section that already had content keeps its previous value in
 *  r._aiPrev[key] so "↶ Restore previous" can bring it back — Undo in
 *  the toolbar covers Duties & Tasks only. The kept value goes as soon
 *  as the user edits, clears or restores that section. */
export function writeTaskAnalysisAI(taskKey, values) {
  const r = _ensureRecord(taskKey);
  // 3.75.0: shared draft logic (ai_draft.js) — same _aiDraft/_aiPrev format.
  const io = {
    get:    (k) => _getField(r, k),
    set:    (k, v) => _setField(r, k, Array.isArray(v) ? v : String(v)),
    filled: (k) => _fieldFilled(r, k),
  };
  Object.keys(values).forEach(k => writeAIDraft(r, k, values[k], io));
  if (taskKey === _selectedTaskKey) _renderFormPanel();
  _touchStatus(taskKey);
  try {
    import('./dacum_projects.js').then(m => m.saveCurrentProject()).catch(() => {});
  } catch (_) {}
}

function _aiBadge(key) {
  const r = _record(_selectedTaskKey);
  if (!isAIDraft(r, key)) return '';
  return aiMarkHTML({ markId: 'ta|' + key, restore: canRestoreAI(r, key),
                      action: 'ta-ai-restore', data: { field: key } });
}

function _clearAiDraft(key) {
  if (clearAIDraft(_record(_selectedTaskKey), key)) removeAIMark('ta|' + key);
}

/* 3.70.0: put back what a section held before the AI replaced it. */
function _restoreAiPrevious(key) {
  const r = _record(_selectedTaskKey);
  if (!restoreAIDraft(r, key, (k, v) => _setField(r, k, v))) return;
  _renderFormPanel();
  _touchStatus(_selectedTaskKey);
  _saveSoon();
  showStatus(_t('taAiRestored') + ' ✓', 'success');
}

// ── Selection state (module-local, not persisted) ──────────────
let _selectedTaskKey = null;
let _lastSignature    = null;

function _signature() {
  return (appState.dutiesData || []).map(d =>
    'D:' + d.id + '|' + (d.title || '').trim() + '|' +
    (d.tasks || []).map(t => t.inputId + '|' + (t.text || '').trim()).join(',')
  ).join('\n') + '\nSEL:' + taskSelectionSignature();
}

// 3.80.0: Task Analysis lists the tasks selected in Task Verification
// (task_selection.js). Unselected tasks stay one click away, greyed, so
// an analysis written before a task was left out is never out of reach.
let _showUnselected = false;

function _allTasksFlat() {
  const out = [];
  (appState.dutiesData || []).forEach((duty, dutyIndex) => {
    const dutyTitle = (duty.title || '').trim();
    let taskNum = 0;
    (duty.tasks || []).forEach(task => {
      const text = (task.text || '').trim();
      if (!text) return;
      taskNum++;
      out.push({
        dutyId: duty.id, dutyIndex, dutyTitle: dutyTitle || _t('lblUntitledDuty'),
        task, taskKey: task.inputId, taskNum
      });
    });
  });
  return out;
}

// ── Entry point: called on EVERY entry to this tab, from both
//    tabs.js's click listener and switchTab() in projects.js — the
//    two must stay in step, same rule as syncVerificationTab(). ──
export function syncTaskAnalysisTab() {
  const nav = document.getElementById('taskAnalysisNav');
  if (!nav) return;
  const sig = _signature();
  if (sig === _lastSignature) return;   // nothing changed — leave as-is
  _lastSignature = sig;
  renderTaskAnalysisTab();
}

export function renderTaskAnalysisTab() {
  syncAllFromDOM();
  _renderNav();
  _renderFormPanel();
}

// ── Task Navigator (left/top panel, grouped by duty) ────────────
function _renderNav() {
  const nav = document.getElementById('taskAnalysisNav');
  if (!nav) return;
  const flat = _allTasksFlat();

  if (!flat.length) {
    nav.innerHTML = `
      <div class="no-duties-message">
        <h3>⚠️ ${_t('msgNoDutiesFoundTitleTA')}</h3>
        <p>${_t('msgNoDutiesForAnalysis')}</p>
      </div>`;
    _selectedTaskKey = null;
    return;
  }

  const nSel     = flat.filter(f => isTaskSelected(f.taskKey)).length;
  const nUnsel   = flat.length - nSel;
  const visible  = (nUnsel && !_showUnselected) ? flat.filter(f => isTaskSelected(f.taskKey)) : flat;

  if (!_selectedTaskKey || !visible.some(f => f.taskKey === _selectedTaskKey)) {
    _selectedTaskKey = visible.length ? visible[0].taskKey : null;
  }

  // Only shown once the user has left a task out — a project that never
  // used the selection looks exactly as before.
  const selBar = nUnsel ? `
    <div class="ta-sel-bar">
      <div class="ta-sel-summary">${escapeHtml(_tf('taSelSummary', { n: nSel, total: flat.length }))}</div>
      <label class="ta-sel-show">
        <input type="checkbox" data-action="ta-show-unselected" ${_showUnselected ? 'checked' : ''}>
        ${escapeHtml(_tf('taShowUnselected', { n: nUnsel }))}
      </label>
    </div>` : '';

  if (!visible.length) {
    nav.innerHTML = selBar + `<div class="no-tasks-message ta-sel-empty">${escapeHtml(_t('taNoneSelected'))}</div>`;
    return;
  }

  const byDuty = [];
  let current = null;
  visible.forEach(f => {
    if (!current || current.dutyId !== f.dutyId) {
      current = { dutyId: f.dutyId, dutyIndex: f.dutyIndex, dutyTitle: f.dutyTitle, items: [] };
      byDuty.push(current);
    }
    current.items.push(f);
  });

  nav.innerHTML = selBar + byDuty.map(d => {
    const letter = getDutyLetter(d.dutyIndex);
    const rows = d.items.map(f => {
      const status = _status(f.taskKey);
      const active = f.taskKey === _selectedTaskKey ? ' ta-nav-task-active' : '';
      const on = isTaskSelected(f.taskKey);
      const selTip = escapeHtml(_t(on ? 'ttTaskSelectedOn' : 'ttTaskSelectedOff'));
      return `
        <div class="ta-nav-row${on ? '' : ' ta-nav-unselected'}">
          <button type="button" class="ta-nav-task${active} ta-status-${status}"
                  data-action="ta-select-task" data-task-key="${f.taskKey}"
                  title="${escapeHtml(f.task.text)}">
            <span class="ta-nav-dot">${_statusDot(status)}</span>
            <span class="ta-nav-code">${_bdi(letter + f.taskNum)}</span>
            <span class="ta-nav-text">${escapeHtml(f.task.text)}</span>
          </button>
          <button type="button" class="ta-nav-sel${on ? ' ta-nav-sel-on' : ''}"
                  data-action="ta-toggle-select" data-task-key="${f.taskKey}" role="checkbox"
                  aria-checked="${on ? 'true' : 'false'}"
                  title="${selTip}" aria-label="${selTip}">${on ? '☑' : '☐'}</button>
        </div>`;
    }).join('');
    return `
      <div class="ta-nav-duty">
        <div class="ta-nav-duty-title">${_bdi(letter)}: ${escapeHtml(d.dutyTitle)}</div>
        <div class="ta-nav-duty-tasks">${rows}</div>
      </div>`;
  }).join('');
}

// Lightweight status refresh — touches only the affected DOM nodes so
// typing in a field never triggers a full nav/form rebuild (which
// would steal focus mid-keystroke).
function _touchStatus(taskKey) {
  const status = _status(taskKey);
  const navBtn = document.querySelector(`.ta-nav-task[data-task-key="${taskKey}"]`);
  if (navBtn) {
    navBtn.classList.remove('ta-status-not-started', 'ta-status-in-progress', 'ta-status-completed');
    navBtn.classList.add('ta-status-' + status);
    const dot = navBtn.querySelector('.ta-nav-dot');
    if (dot) dot.textContent = _statusDot(status);
  }
  if (taskKey === _selectedTaskKey) {
    const pill = document.getElementById('taskAnalysisStatusPill');
    if (pill) {
      pill.className = `completion-indicator ${status === 'completed' ? 'complete' : 'incomplete'} ta-status-pill ta-status-pill-${status}`;
      pill.textContent = _statusLabel(status);
    }
  }
}

// ── Form panel (right/main panel — selected task's analysis) ───
// Field cards match the Additional Info tab exactly: one expandable
// textarea (one entry per line) with Number/Bullet/Clear controls —
// no per-item add/remove/reorder rows. formatList()/clearSection() in
// renderer.js can't be reused directly (they target fixed, static
// element IDs; these fields swap content every time the selected task
// changes), so the same behaviour is reimplemented here against
// whichever task is currently selected.
const ICON_NUMBER = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><text x="0.4" y="5.35" font-size="4.7" font-weight="700" font-family="sans-serif">1</text><text x="0.4" y="9.5" font-size="4.7" font-weight="700" font-family="sans-serif">2</text><text x="0.4" y="13.65" font-size="4.7" font-weight="700" font-family="sans-serif">3</text><rect x="5.8" y="3.1" width="9.2" height="1.5" rx=".75"/><rect x="5.8" y="7.25" width="9.2" height="1.5" rx=".75"/><rect x="5.8" y="11.4" width="9.2" height="1.5" rx=".75"/></svg>';
const ICON_BULLET = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><rect x="1" y="2.6" width="2.8" height="2.8" rx=".6"/><rect x="1" y="6.75" width="2.8" height="2.8" rx=".6"/><rect x="1" y="10.9" width="2.8" height="2.8" rx=".6"/><rect x="5.8" y="3.1" width="9.2" height="1.5" rx=".75"/><rect x="5.8" y="7.25" width="9.2" height="1.5" rx=".75"/><rect x="5.8" y="11.4" width="9.2" height="1.5" rx=".75"/></svg>';
const ICON_IMPORT  = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M4.8 6h6.4M4.8 8.5h6.4M4.8 11h4"/></svg>';

function _renderListField(field, items) {
  const text = (items || []).join('\n');
  const source = ADDITIONAL_INFO_SOURCES[field.key];
  const pickBtn = source ? `
          <button type="button" class="btn-format btn-icon" data-action="ta-pick-from-info"
                  data-field="${field.key}"
                  title="${escapeHtml(_tf('ttPickFromAdditionalInfo', { section: _t(source.titleKey) }))}"
                  aria-label="${escapeHtml(_tf('ttPickFromAdditionalInfo', { section: _t(source.titleKey) }))}">${ICON_IMPORT}</button>` : '';
  return `
    <div class="section-container" data-field-block="${field.key}">
      <div class="section-header-editable">
        <h3>${_t(field.labelKey)}${_aiBadge(field.key)}</h3>
        <div style="display:flex;gap:10px;">${pickBtn}
          <button type="button" class="btn-format btn-icon" data-action="ta-format-list"
                  data-field="${field.key}" data-format-type="number"
                  title="${escapeHtml(_t('ttAddNumbering'))}" aria-label="${escapeHtml(_t('ttAddNumbering'))}">${ICON_NUMBER}</button>
          <button type="button" class="btn-format btn-icon" data-action="ta-format-list"
                  data-field="${field.key}" data-format-type="bullet"
                  title="${escapeHtml(_t('ttAddBullets'))}" aria-label="${escapeHtml(_t('ttAddBullets'))}">${ICON_BULLET}</button>
          <button type="button" class="btn-clear-section" data-action="ta-clear-field" data-field="${field.key}">
            🗑️ ${_t('btnClear')}
          </button>
        </div>
      </div>
      <textarea data-action="ta-edit-list" data-field="${field.key}"
                placeholder="${escapeHtml(_t(field.phKey))}">${escapeHtml(text)}</textarea>
    </div>`;
}

function _renderTextField(field, value) {
  return `
    <div class="section-container" data-field-block="${field.key}">
      <div class="section-header-editable">
        <h3>${_t(field.labelKey)}${_aiBadge(field.key)}</h3>
        <button type="button" class="btn-clear-section" data-action="ta-clear-field" data-field="${field.key}">
          🗑️ ${_t('btnClear')}
        </button>
      </div>
      <textarea data-action="ta-edit-text" data-field="${field.key}"
                placeholder="${escapeHtml(_t(field.phKey))}">${escapeHtml(value || '')}</textarea>
    </div>`;
}

function _renderFormPanel() {
  const panel = document.getElementById('taskAnalysisFormPanel');
  if (!panel) return;

  const flat  = _allTasksFlat();
  const entry = _selectedTaskKey ? flat.find(f => f.taskKey === _selectedTaskKey) : null;

  if (!entry) {
    panel.innerHTML = `<div class="no-tasks-message">${_t('msgSelectTaskForAnalysis')}</div>`;
    return;
  }

  const r      = _view(entry.taskKey);
  const letter = getDutyLetter(entry.dutyIndex);
  const status = _status(entry.taskKey);
  const byField = Object.fromEntries(LIST_FIELDS.map(f => [f.key, f]));

  const reason = isTaskSelected(entry.taskKey) ? null : getTaskExclusionReason(entry.taskKey);
  const excludedBanner = reason === null ? '' : `
    <div class="ta-excluded-banner" role="note">
      <span>⚠️ ${escapeHtml(_t('taExcludedBanner'))}${reason ? ' ' + escapeHtml(_tf('taExcludedReason', { r: reason })) : ''}</span>
      <button type="button" class="ta-excluded-select" data-action="ta-toggle-select" data-task-key="${entry.taskKey}">☑ ${escapeHtml(_t('taBtnSelectTask'))}</button>
    </div>`;

  panel.innerHTML = excludedBanner + `
    <div class="ta-form-header">
      <div class="ta-form-header-row">
        <div>
          <div class="ta-form-duty">${_bdi(letter)}: ${escapeHtml(entry.dutyTitle)}</div>
          <div class="ta-form-task">${_bdi(letter + entry.taskNum)}. ${escapeHtml(entry.task.text)}</div>
          ${_usedInLine(entry.taskKey)}
        </div>
        <span id="taskAnalysisStatusPill"
              class="completion-indicator ${status === 'completed' ? 'complete' : 'incomplete'} ta-status-pill ta-status-pill-${status}">
          ${_statusLabel(status)}
        </span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button type="button" class="ta-ai-btn" data-action="ta-ai-open" data-task-key="${entry.taskKey}"
                title="${escapeHtml(_t('taAiTitle'))}">
          ${_t('taAiBtn')}
        </button>
        <button type="button" class="ta-clear-btn" data-action="ta-clear-analysis" data-task-key="${entry.taskKey}">
          🗑️ ${_t('btnClearAnalysis')}
        </button>
      </div>
    </div>

    ${TA_FIELD_SPECS.map(f => _isTextField(f.key)
        ? _renderTextField(f, r[f.key])
        : _renderListField(byField[f.key], r[f.key])).join('')}
    ${getTaskAnalysisCustomSections().map(sec => _renderCustomField(sec, (r.custom || {})[sec.id])).join('')}
    <div class="ta-custom-add-row">
      <button type="button" class="btn-add ta-custom-add" data-action="ta-custom-add">➕ ${escapeHtml(_t('taCustomAdd'))}</button>
      <span class="ta-custom-hint">${escapeHtml(_t('taCustomHint'))}</span>
    </div>
  `;
}

/* A user-added section: same card as the list sections, plus rename and
   delete (both act on the section for the whole project). */
function _renderCustomField(sec, items) {
  const key = CUSTOM_PREFIX + sec.id;
  const text = (items || []).join('\n');
  return `
    <div class="section-container ta-custom-section" data-field-block="${escapeHtml(key)}">
      <div class="section-header-editable">
        <h3><span dir="auto">${escapeHtml(sec.title)}</span>${_aiBadge(key)}</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button type="button" class="btn-format btn-icon" data-action="ta-custom-rename" data-section-id="${escapeHtml(sec.id)}"
                  title="${escapeHtml(_t('taCustomRename'))}" aria-label="${escapeHtml(_t('taCustomRename'))}">✏️</button>
          <button type="button" class="btn-format btn-icon" data-action="ta-format-list"
                  data-field="${escapeHtml(key)}" data-format-type="number"
                  title="${escapeHtml(_t('ttAddNumbering'))}" aria-label="${escapeHtml(_t('ttAddNumbering'))}">${ICON_NUMBER}</button>
          <button type="button" class="btn-format btn-icon" data-action="ta-format-list"
                  data-field="${escapeHtml(key)}" data-format-type="bullet"
                  title="${escapeHtml(_t('ttAddBullets'))}" aria-label="${escapeHtml(_t('ttAddBullets'))}">${ICON_BULLET}</button>
          <button type="button" class="btn-clear-section" data-action="ta-clear-field" data-field="${escapeHtml(key)}">
            🗑️ ${_t('btnClear')}
          </button>
          <button type="button" class="btn-clear-section ta-custom-delete" data-action="ta-custom-delete" data-section-id="${escapeHtml(sec.id)}"
                  title="${escapeHtml(_t('taCustomDelete'))}">✕ ${escapeHtml(_t('taCustomDelete'))}</button>
        </div>
      </div>
      <textarea data-action="ta-edit-list" data-field="${escapeHtml(key)}" dir="auto"
                placeholder="${escapeHtml(_t('taCustomPh'))}">${escapeHtml(text)}</textarea>
    </div>`;
}

function _customAdd() {
  const title = (prompt(_t('taCustomPrompt'), _t('taCustomDefault')) || '').trim().slice(0, 80);
  if (!title) return;
  const list = getTaskAnalysisCustomSections();
  if (list.some(x => x.title.toLowerCase() === title.toLowerCase())) {
    showStatus(_t('taCustomExists'), 'error');
    return;
  }
  let n = list.length + 1, id;
  do { id = 'tacs_' + n++; } while (list.some(x => x.id === id));
  appState.taskAnalysisCustomSections = [...list, { id, title }];
  _renderFormPanel();
  _saveSoon();
  showStatus(_tf('taCustomAdded', { name: title }), 'success');
}

function _customRename(id) {
  const list = getTaskAnalysisCustomSections();
  const sec = list.find(x => x.id === id);
  if (!sec) return;
  const title = (prompt(_t('taCustomRenamePrompt'), sec.title) || '').trim().slice(0, 80);
  if (!title || title === sec.title) return;
  if (list.some(x => x.id !== id && x.title.toLowerCase() === title.toLowerCase())) {
    showStatus(_t('taCustomExists'), 'error');
    return;
  }
  sec.title = title;
  _renderFormPanel();
  _saveSoon();
}

function _customDelete(id) {
  const list = getTaskAnalysisCustomSections();
  const sec = list.find(x => x.id === id);
  if (!sec) return;
  const used = Object.values(appState.taskAnalysisData || {})
    .filter(r => r && r.custom && _nonBlank(r.custom[id]).length).length;
  const msg = used ? _tf('taCustomDeleteConfirmUsed', { name: sec.title, n: used })
                   : _tf('taCustomDeleteConfirm', { name: sec.title });
  if (!confirm(msg)) return;
  appState.taskAnalysisCustomSections = list.filter(x => x.id !== id);
  Object.values(appState.taskAnalysisData || {}).forEach(r => {
    if (r && r.custom && typeof r.custom === 'object') delete r.custom[id];
    if (r) clearAIDraft(r, CUSTOM_PREFIX + id);
  });
  _renderNav();
  _renderFormPanel();
  _saveSoon();
  showStatus(_tf('taCustomDeleted', { name: sec.title }), 'success');
}

function _saveSoon() {
  try { import('./dacum_projects.js').then(m => m.saveCurrentProject()).catch(() => {}); } catch (_) {}
}

// ── Clear (per-task and whole-tab) ──────────────────────────────

function _clearOneTaskAnalysis(taskKey) {
  const r = _record(taskKey);
  if (_isRecordEmpty(r)) {
    showStatus(_t('msgTaAlreadyEmpty'), 'success');
    return;
  }
  if (!confirm(_t('confirmClearTaskAnalysis'))) return;
  delete appState.taskAnalysisData[taskKey];
  _renderNav();
  _renderFormPanel();
  showStatus(_t('msgTaskAnalysisCleared') + ' ✓', 'success');
}

/** Called by clearCurrentTab('task-analysis-tab') in projects.js. */
export function clearAllTaskAnalysis() {
  appState.taskAnalysisData = {};
  // 3.46.0: the tab returns to its starting state — the sections the
  // user added go too.
  appState.taskAnalysisCustomSections = [];
  _selectedTaskKey = null;
  renderTaskAnalysisTab();
}

// ── "Add from Additional Info" picker ───────────────────────────
// Self-contained modal, styled to match the app's existing dialogs
// (see _showHelpModal in events.js) without depending on that module.
// Copies selected lines into the task's own array as plain text —
// after this, an item is indistinguishable from one typed by hand,
// and edits/deletes only ever touch the copy, never the Additional
// Info source (per the spec: reference-at-selection-time, not a live link).
function _openAdditionalInfoPicker(fieldKey) {
  const source = ADDITIONAL_INFO_SOURCES[fieldKey];
  if (!source || !_selectedTaskKey) return;

  const sourceEl = document.getElementById(source.inputId);
  const rawLines = (sourceEl?.value || '').split('\n')
    .map(l => l.replace(/^[\s]*[•\-\*○●]\s*/, '').replace(/^[\s]*\d+[\.\)]\s*/, '').trim())
    .filter(Boolean);
  // De-duplicate the source list itself (identical lines typed twice
  // in Additional Info would otherwise show as two identical checkboxes).
  const uniqueLines = [...new Set(rawLines)];

  if (!uniqueLines.length) {
    showStatus(_t('taPickNothingToChoose'), 'error');
    return;
  }

  const currentItems = new Set(
    _nonBlank(_view(_selectedTaskKey)[fieldKey])
      .map(s => s.replace(/^[\s]*[•\-\*○●]\s*/, '').replace(/^[\s]*\d+[\.\)]\s*/, '').trim())
  );

  const headingEl = document.getElementById(source.headingId);
  const sectionTitle = (headingEl?.textContent || '').trim() || _t(source.titleKey);

  const existing = document.getElementById('taPickerModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'taPickerModal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('dir', (window.i18n && window.i18n.isRTL()) ? 'rtl' : 'ltr');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;' +
    'justify-content:center;padding:20px;background:rgba(0,0,0,0.55);';

  const rows = uniqueLines.map((line, i) => {
    const already = currentItems.has(line);
    return `
      <label style="display:flex;align-items:flex-start;gap:10px;padding:9px 4px;
             border-bottom:1px solid #f1f5f9;cursor:${already ? 'default' : 'pointer'};
             opacity:${already ? '0.55' : '1'};">
        <input type="checkbox" data-ta-pick-item value="${i}" ${already ? 'checked disabled' : ''}
               style="margin-top:3px;flex-shrink:0;">
        <span style="font-size:0.88em;line-height:1.55;color:#334155;">
          ${escapeHtml(line)}${already ? ` <em style="color:#94a3b8;">(${_t('taPickAlreadyAdded')})</em>` : ''}
        </span>
      </label>`;
  }).join('');

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;max-width:480px;width:100%;
         box-shadow:0 24px 60px rgba(0,0,0,0.35);overflow:hidden;
         font-family:'Segoe UI',system-ui,sans-serif;max-height:82vh;display:flex;flex-direction:column;">
      <div style="padding:18px 22px 14px;display:flex;align-items:center;gap:12px;
           background:linear-gradient(135deg,#eef2ff,#e0e7ff);border-bottom:1px solid #c7d2fe;flex-shrink:0;">
        <span style="font-size:1.4em;line-height:1;">📋</span>
        <p style="margin:0;font-size:0.98em;font-weight:800;color:#3730a3;">
          ${escapeHtml(_tf('ttPickFromAdditionalInfo', { section: sectionTitle }))}
        </p>
      </div>
      <div style="padding:14px 22px;overflow-y:auto;flex:1;">
        <p style="margin:0 0 10px;font-size:0.85em;color:#475569;line-height:1.6;">${_t('taPickModalIntro')}</p>
        <div>${rows}</div>
      </div>
      <div style="padding:14px 22px;border-top:1px solid #eef0f4;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
        <button data-ta-pick-cancel style="padding:9px 18px;background:#f1f5f9;color:#334155;
                border:none;border-radius:8px;font-size:0.88em;font-weight:600;cursor:pointer;font-family:inherit;">
          ${_t('btnCancel')}
        </button>
        <button data-ta-pick-confirm style="padding:9px 20px;background:#667eea;color:#fff;
                border:none;border-radius:8px;font-size:0.88em;font-weight:700;cursor:pointer;font-family:inherit;">
          ${_t('btnAddSelected')}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-ta-pick-cancel]').addEventListener('click', close);
  overlay.querySelector('[data-ta-pick-confirm]').addEventListener('click', () => {
    const checked = [...overlay.querySelectorAll('input[data-ta-pick-item]:checked:not(:disabled)')];
    if (!checked.length) { showStatus(_t('taPickNoneSelected'), 'error'); return; }
    const r = _ensureRecord(_selectedTaskKey);
    checked.forEach(cb => r[fieldKey].push(uniqueLines[parseInt(cb.value, 10)]));
    close();
    _renderFormPanel();
    _touchStatus(_selectedTaskKey);
    showStatus(_tf('msgItemsAddedFromInfo', { n: checked.length }), 'success');
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

// ── Event wiring ─────────────────────────────────────────────
// Scoped to the tab's own container, same delegation pattern events.js
// uses for every other tab (see e.g. the dutiesCont listener there).
export function setupTaskAnalysisEvents() {
  const root = document.getElementById('task-analysis-tab');
  if (!root || root.__taWired) return;
  root.__taWired = true;

  root.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'ta-select-task') {
      _selectedTaskKey = btn.getAttribute('data-task-key');
      _renderNav();
      _renderFormPanel();
      return;
    }

    if (action === 'ta-toggle-select') {
      const taskKey = btn.getAttribute('data-task-key');
      setTaskSelected(taskKey, !isTaskSelected(taskKey));
      // Leaving a task out while unselected tasks are hidden would make
      // it vanish under the cursor; reveal them instead so the change
      // stays visible and can be undone with a second click.
      if (!isTaskSelected(taskKey)) _showUnselected = true;
      _lastSignature = _signature();
      _renderNav();
      _renderFormPanel();
      return;
    }

    if (action === 'ta-show-unselected') {
      _showUnselected = !!btn.checked;
      _renderNav();
      _renderFormPanel();
      return;
    }

    if (action === 'ta-ai-open') {
      const key = btn.getAttribute('data-task-key');
      // Loaded on demand: keeps the AI module off this tab's start-up
      // path and avoids an import cycle (it imports from this file).
      import('./task_analysis_ai.js')
        .then(m => m.openTaskAnalysisAI(key))
        .catch(err => { console.error('[task-analysis-ai] load failed', err); showStatus(_tf('taAiFailed', { msg: err.message }), 'error'); });
      return;
    }

    if (action === 'ta-clear-analysis') {
      _clearOneTaskAnalysis(btn.getAttribute('data-task-key'));
      return;
    }

    if (action === 'ta-ai-restore') {
      _restoreAiPrevious(btn.getAttribute('data-field'));
      return;
    }

    if (action === 'ta-custom-add')    { _customAdd(); return; }
    if (action === 'ta-custom-rename') { _customRename(btn.getAttribute('data-section-id')); return; }
    if (action === 'ta-custom-delete') { _customDelete(btn.getAttribute('data-section-id')); return; }

    if (action === 'ta-pick-from-info') {
      _openAdditionalInfoPicker(btn.getAttribute('data-field'));
      return;
    }

    if (action === 'ta-format-list') {
      const field = btn.getAttribute('data-field');
      const formatType = btn.getAttribute('data-format-type');
      const textarea = btn.closest('.section-container')?.querySelector('textarea');
      if (!textarea) return;
      const text = textarea.value.trim();
      if (!text) { showStatus(_t('msgNothingToFormat'), 'error'); return; }

      let lines = text.split('\n').filter(l => l.trim());
      lines = lines.map(line => {
        line = line.replace(/^[\s]*[•\-\*○●]\s*/, '');
        line = line.replace(/^[\s]*\d+[\.\)]\s*/, '');
        return line.trim();
      });
      const formatted = formatType === 'number'
        ? lines.map((line, i) => `${i + 1}. ${line}`)
        : lines.map(line => `• ${line}`);

      textarea.value = formatted.join('\n');
      const r = _ensureRecord(_selectedTaskKey);
      _setField(r, field, formatted);
      showStatus(_t(formatType === 'number' ? 'msgFormattedNumbering' : 'msgFormattedBullets'), 'success');
      return;
    }

    if (action === 'ta-clear-field') {
      const field = btn.getAttribute('data-field');
      const isList = !_isTextField(field);
      const r = _record(_selectedTaskKey);
      const current = r ? _getField(r, field) : (isList ? [] : '');
      const isEmpty = isList ? !(current && current.length) : !(current || '').trim();
      if (isEmpty) { showStatus(_t('msgSectionAlreadyEmpty'), 'success'); return; }
      if (!confirm(_t('confirmClearSection'))) return;
      const rec = _ensureRecord(_selectedTaskKey);
      _setField(rec, field, isList ? [] : '');
      _clearAiDraft(field);
      const textarea = btn.closest('.section-container')?.querySelector('textarea');
      if (textarea) textarea.value = '';
      _touchStatus(_selectedTaskKey);
      showStatus(_t('msgSectionCleared') + ' ✓', 'success');
      return;
    }
  });

  // Typing: write into appState immediately but do NOT re-render —
  // re-rendering on every keystroke would rebuild the textarea and
  // steal the caret mid-word, exactly the bug renderer.js's own
  // formatList()-driven sections avoid elsewhere in this app.
  root.addEventListener('input', function (e) {
    const el     = e.target;
    const action = el.getAttribute && el.getAttribute('data-action');
    if (!_selectedTaskKey) return;

    if (action === 'ta-edit-list') {
      const field = el.getAttribute('data-field');
      const r = _ensureRecord(_selectedTaskKey);
      // One array entry per line. Blank lines are kept while typing (so
      // the caret and an in-progress new line behave normally) and are
      // filtered out only where they matter — status, export, and the
      // "is this empty" checks (see _isRecordEmpty / getTaskAnalysisExportData).
      _setField(r, field, el.value.split('\n'));
      _clearAiDraft(field);
      return;
    }
    if (action === 'ta-edit-text') {
      const field = el.getAttribute('data-field');
      const r = _ensureRecord(_selectedTaskKey);
      r[field] = el.value;
      _clearAiDraft(field);
      return;
    }
  });

  // Status dot / pill catch up once the field loses focus. Capture
  // phase is required — blur/focusout on inputs doesn't bubble.
  root.addEventListener('blur', function (e) {
    const el = e.target;
    if (el.matches && el.matches('textarea') && _selectedTaskKey) {
      _touchStatus(_selectedTaskKey);
    }
  }, true);
}

/* ── Re-render on language change ────────────────────────────────
   Same pattern as modules.js: this tab's HTML is entirely
   innerHTML-generated from appState, so a language switch never
   reaches it through applyTranslations()'s [data-i18n] pass alone.
   Rendering is pure from appState, so a rebuild is lossless. Guarded
   on the container existing so a language switch never constructs a
   tab the user has not opened yet. */
window.addEventListener('dacum:langchange', () => {
  if (document.getElementById('taskAnalysisNav')) renderTaskAnalysisTab();
});
