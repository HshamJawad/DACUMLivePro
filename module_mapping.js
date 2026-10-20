// ============================================================
// /module_mapping.js  (3.76.0 — split out of modules.js, code unchanged)
// Module Mapping: training modules, automatic generation options,
// levels and coverage, module identity, export helpers, traceability
// data and the Module Builder handoff.
//
// Other files import these through modules.js, which re-exports
// every curriculum file; nothing outside needs to know the split.
// ============================================================

import { appState } from './state.js';
import { loLabel } from './lo_labels.js';
import { readProjects } from './project_store.js';
import { showStatus } from './renderer.js';
import { getTaskCodeShort, getDutyCode, isClusterAddedTaskId, getAddedTaskLabel } from './codes.js';
import { getTaskAnalysisRecord } from './task_analysis.js';
import { isTaskSelected, getTaskSelectionHandoff } from './task_selection.js';
import { getSupplementaryVerificationData } from './supplementary_verification.js';
import { getCurriculumModel, getCurriculumHandoff, getProgrammeHandoff } from './module_curriculum.js';
import { _reconcileLearningOutcomes, _refreshModuleOutcomes, renumberLearningOutcomes } from './clusters.js';
import { _esc, _getClusterEffectiveCriteria, _persistClusters, _t, _taskLabel, _tf, _tx, _txf, _undoRecord, _undoSnap } from './modules_shared.js';
import { renderCurriculumMatrix, getCurriculumMatrix } from './curriculum_matrix.js';
import { renderModules } from './learning_outcomes.js';
import { captureProjectState } from './dacum_projects.js';
import { viewOriginal, handoffTranslations, guessLanguage, versionStats, LANG_NAMES } from './content_lang.js';

/* 3.79.2: the project's other content languages, for Module Builder
   (3.16+), which shows and exports the handed-over texts in them. */
/* 3.105.0: the language the handed-over texts are in — the version
   shown, else the one the project is written in (guessed when content
   languages were never set). Module Builder writes each text on the side
   of its own language and never under another language's label. */
function _handoffTextLanguage() {
  try {
    const s = captureProjectState();
    const cl = s.contentLanguages;
    if (cl) return cl.active || cl.original || 'en';
    const ui = (window.i18n && window.i18n.uiLang) ? window.i18n.uiLang() : 'en';
    return guessLanguage(s, ui);
  } catch (_) { return 'en'; }
}

/* 3.105.0: translations still missing, per language, when the project
   has content languages: [{ lang, missing }] (empty when complete). */
function _handoffMissingTranslations() {
  try {
    const s = captureProjectState();
    const cl = s.contentLanguages;
    if (!cl || !cl.versions) return [];
    const base = cl.view ? viewOriginal(s).state : s;
    return Object.keys(cl.versions)
      .map(lang => ({ lang, missing: versionStats(base, lang).missing }))
      .filter(x => x.missing > 0);
  } catch (_) { return []; }
}

function _handoffLanguages() {
  try {
    const s = captureProjectState();
    const cl = s.contentLanguages;
    if (!cl) return null;
    const base = cl.view ? viewOriginal(s).state : s;
    return handoffTranslations(base, cl.active);
  } catch (e) {
    console.warn('[DACUM→ModuleBuilder] languages skipped:', e);
    return null;
  }
}

// ── Module Mapping ────────────────────────────────────────────

export function renderModuleLoList() {
  const container = document.getElementById('moduleLoList');
  _ensureModuleGenOptions();
  _reconcileLearningOutcomes();   // also re-links module copies to live outcomes
  const lo = appState.learningOutcomesData;
  const mm = appState.moduleMappingData;

  if (!lo.outcomes || lo.outcomes.length === 0) {
    container.innerHTML = `<div class="no-tasks-message">${_t('msgNoLOsAvailable')}</div>`;
    document.getElementById('btnCreateModule').disabled = true;
    return;
  }

  const assignedLoIds = new Set();
  mm.modules.forEach(module => module.learningOutcomes.forEach(o => assignedLoIds.add(o.id)));
  const availableLos = lo.outcomes.filter(o => !assignedLoIds.has(o.id));

  if (availableLos.length === 0) {
    container.innerHTML = `<div class="no-tasks-message">${_t('msgAllLOsAssigned')}</div>`;
    document.getElementById('btnCreateModule').disabled = true;
    return;
  }

  let html = '';
  availableLos.forEach(outcome => {
    const criteriaText = outcome.linkedCriteria.map(pc => pc.id).join(', ');
    let moduleOptions = `<option value="">${_t('optSelectModule')}</option>`;
    mm.modules.forEach((m, mi) => { const l = _moduleLevel(m); const tr = m.track && !_refShowsTrack(m) ? ' ' + m.track : ''; moduleOptions += `<option value="${m.id}">${moduleRef(m) || `M${mi + 1}`}${l && getModuleLabelMode() === 'number' ? ` (${_txf('lblLevelShort', { n: l })}${tr})` : ''} — ${m.title}</option>`; });

    html += `
      <div class="module-lo-item">
        <input type="checkbox" id="mlo_${outcome.id}" data-lo-id="${outcome.id}" data-action="update-module-button">
        <div class="module-lo-content">
          <div class="module-lo-number"><bdi>${_esc(loLabel(outcome))}</bdi></div>
          <div class="module-lo-statement">${outcome.statement || `<em>${_t('msgNoStatementProvided')}</em>`}</div>
          <div class="module-lo-criteria">${_t('lblMappedPCInline')} ${criteriaText}</div>
        </div>
        ${mm.modules.length > 0 ? `
        <div class="task-dropdown-container">
          <span class="task-dropdown-label">${_t('lblAddTo')}</span>
          <select class="task-reassign-dropdown" data-action="add-lo-to-module-dropdown" data-lo-id="${outcome.id}">
            ${moduleOptions}
          </select>
        </div>` : ''}
      </div>`;
  });

  container.innerHTML = html;
  updateCreateModuleButton();
}

export function updateCreateModuleButton() {
  const checkboxes = document.querySelectorAll('#moduleLoList input[type="checkbox"]');
  const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
  document.getElementById('btnCreateModule').disabled = !anyChecked;
}

export function createModule() {
  const mm = appState.moduleMappingData;
  const lo = appState.learningOutcomesData;
  const checkboxes = document.querySelectorAll('#moduleLoList input[type="checkbox"]');
  const selectedLoIds = [];
  checkboxes.forEach(cb => { if (cb.checked) selectedLoIds.push(cb.getAttribute('data-lo-id')); });
  if (selectedLoIds.length === 0) return;

  mm.moduleCounter++;
  const newModule = { id: `module_${mm.moduleCounter}`, title: _tf('lblModuleN', { n: mm.moduleCounter }), learningOutcomes: [] };
  selectedLoIds.forEach(loId => {
    const outcome = lo.outcomes.find(o => o.id === loId);
    if (outcome) newModule.learningOutcomes.push(outcome);
  });
  mm.modules.push(newModule);

  renderModuleLoList();
  renderModules();
}

/* ── Modules typed in by hand (3.133.0) ─────────────────────────────
   A module from an existing curriculum (an old paper file, say), typed
   in on its card: title, learning outcomes and their performance
   criteria. Its outcomes belong to the module only — they are not
   Learning Outcomes of the chart, so they never appear in the Learning
   Outcomes tab, automatic generation never replaces the module, and the
   coverage matrix (which lists the chart's criteria) leaves it out.
   Linking a criterion to a chart task is optional; a linked task brings
   its Task Analysis to Module Builder like any other module's.
   Shape: module.manual = true; each outcome and criterion carries
   manual: true and is numbered by position (LO1, criterion 1.1 …). */
export function isManualModule(m) { return !!(m && m.manual); }

function _manualModule(moduleId) {
  return _idModules().find(m => m && m.id === moduleId && m.manual) || null;
}
function _manualLo(m, loId) {
  return (m && (m.learningOutcomes || []).find(o => o && o.id === loId)) || null;
}

/** LO1, LO2 … and criteria 1.1, 1.2 … by position, inside the module. */
export function renumberManualModule(m) {
  if (!isManualModule(m)) return;
  (m.learningOutcomes || []).forEach((o, i) => {
    o.number = `LO${i + 1}`;
    if (!Array.isArray(o.linkedCriteria)) o.linkedCriteria = [];
    o.linkedCriteria.forEach((pc, j) => { pc.id = `${i + 1}.${j + 1}`; });
  });
}

function _newManualPc() { return { id: '', text: '', taskId: null, manual: true }; }
function _newManualLo(m) {
  m.manualCounter = (m.manualCounter || 0) + 1;
  return { id: `${m.id}_mlo${m.manualCounter}`, number: '', statement: '', manual: true,
           linkedCriteria: [_newManualPc()] };
}

/* An id no module, and no Module Curriculum record, has used — so a new
   module never inherits the curriculum written for a deleted one. */
function _freshModuleId() {
  const mm = appState.moduleMappingData;
  const taken = new Set(_idModules().map(m => m.id));
  Object.keys(appState.moduleCurriculumData?.byModule || {}).forEach(id => taken.add(id));
  let id;
  do { mm.moduleCounter = (mm.moduleCounter || 0) + 1; id = `module_${mm.moduleCounter}`; }
  while (taken.has(id));
  return id;
}

function _manualChanged(m, opts = {}) {
  renumberManualModule(m);
  _persistClusters();
  if (opts.render !== false) renderModules();
  if (opts.focus) {
    const el = document.querySelector(opts.focus);
    if (el) try { el.focus(); } catch (_) { /* ignore */ }
  }
}

/** Adds a module typed in by hand; asks for its title first. */
export function addManualModule(title) {
  if (title == null) title = prompt(_tx('promptManualModuleTitle'), '');
  if (title == null) return null;
  const mm = appState.moduleMappingData;
  const m = { id: _freshModuleId(), title: String(title).trim(), manual: true, learningOutcomes: [] };
  if (!m.title) m.title = _tf('lblModuleN', { n: mm.modules.length + 1 });
  m.learningOutcomes.push(_newManualLo(m));
  mm.modules.push(m);
  renderModuleLoList();
  _manualChanged(m, { focus: `#modulesContainer .mm-lo-statement[data-module-id="${m.id}"]` });
  return m.id;
}

export function addManualLo(moduleId) {
  const m = _manualModule(moduleId);
  if (!m) return;
  const o = _newManualLo(m);
  m.learningOutcomes.push(o);
  _manualChanged(m, { focus: `#modulesContainer .mm-lo-statement[data-lo-id="${o.id}"]` });
}

export function deleteManualLo(moduleId, loId) {
  const m = _manualModule(moduleId);
  const idx = m ? m.learningOutcomes.findIndex(o => o && o.id === loId) : -1;
  if (idx === -1) return;
  const before = _undoSnap();
  const label = _txf('undoRemoveLO', { lo: loLabel(m.learningOutcomes[idx]), m: moduleRef(m) });
  m.learningOutcomes.splice(idx, 1);
  _undoRecord(label, before);
  _manualChanged(m);
}

export function moveManualLo(moduleId, loId, dir) {
  const m = _manualModule(moduleId);
  const los = m ? m.learningOutcomes : [];
  const i = los.findIndex(o => o && o.id === loId);
  const j = i + (dir < 0 ? -1 : 1);
  if (i === -1 || j < 0 || j >= los.length) return;
  [los[i], los[j]] = [los[j], los[i]];
  _manualChanged(m);
}

export function addManualPc(moduleId, loId) {
  const m = _manualModule(moduleId);
  const o = _manualLo(m, loId);
  if (!o) return;
  o.linkedCriteria.push(_newManualPc());
  const n = o.linkedCriteria.length - 1;
  _manualChanged(m, { focus: `#modulesContainer .mm-pc-text[data-lo-id="${loId}"][data-pc-index="${n}"]` });
}

export function deleteManualPc(moduleId, loId, index) {
  const m = _manualModule(moduleId);
  const o = _manualLo(m, loId);
  const i = Number(index);
  if (!o || !o.linkedCriteria[i]) return;
  const before = _undoSnap();
  const label = _txf('undoRemoveManualPc', { pc: o.linkedCriteria[i].id, m: moduleRef(m) });
  o.linkedCriteria.splice(i, 1);
  _undoRecord(label, before);
  _manualChanged(m);
}

/* Typing: kept at once, saved on change, without redrawing the card
   (a redraw would take the cursor out of the field). */
export function setManualLoStatement(moduleId, loId, value, save) {
  const o = _manualLo(_manualModule(moduleId), loId);
  if (!o) return;
  o.statement = String(value || '');
  if (save) _persistClusters();
}

export function setManualPcText(moduleId, loId, index, value, save) {
  const o = _manualLo(_manualModule(moduleId), loId);
  const pc = o && o.linkedCriteria[Number(index)];
  if (!pc) return;
  pc.text = String(value || '');
  if (save) _persistClusters();
}

export function setManualPcTask(moduleId, loId, index, taskId) {
  const m = _manualModule(moduleId);
  const o = _manualLo(m, loId);
  const pc = o && o.linkedCriteria[Number(index)];
  if (!pc) return;
  pc.taskId = taskId || null;
  _manualChanged(m);
}

/** The chart's tasks, for the optional "linked task" of a criterion. */
export function manualTaskOptions() {
  const out = [];
  (appState.dutiesData || []).forEach(duty => (duty.tasks || []).forEach(task => {
    const text = String(task.text || '').trim();
    if (!text || !task.inputId) return;
    out.push({ id: task.inputId, label: `${_taskLabel(task.inputId)} — ${text}` });
  }));
  return out;
}

/* ── Automatic Module Generation: options ───────────────────────────
   Two choices shown inside the existing AI card, read by
   module_mapping_ai.js through getModuleGenOptions():
     • keep existing modules — only outcomes not yet in a module are
       grouped, so hand-built modules are never wiped (default ON as
       soon as any module exists);
     • suggest a level (and specialisation) for each module. */
const _mmGenOpts = { keepExisting: null, assignLevels: true };

export function getModuleGenOptions() {
  const mm = appState.moduleMappingData || {};
  const hasModules = (mm.modules || []).length > 0;
  return {
    keepExisting: _mmGenOpts.keepExisting === null ? hasModules : !!_mmGenOpts.keepExisting,
    // A single-level programme has nothing to distribute.
    assignLevels: !!_mmGenOpts.assignLevels && getModuleLevelCount() > 1,
    levelCount:   getModuleLevelCount(),
  };
}

export function persistModuleMapping() { _persistClusters(); }
/* Persist after the clustering AI changed clusters / criteria. */
export function persistClustering() { _persistClusters(); }

export function _ensureModuleGenOptions() {
  const aiBtn = document.getElementById('mmGenAIBtn');
  if (!aiBtn || !aiBtn.parentElement) return;
  const row = aiBtn.parentElement;
  if (!document.getElementById('mmGenOptStyles')) {
    const st = document.createElement('style');
    st.id = 'mmGenOptStyles';
    st.textContent = `
      #mmGenOptions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px;
        margin: 14px auto 0; max-width: 760px; color: #fff; font-size: .9em; }
      #mmGenOptions label { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; text-align: start; }
      #mmGenOptions label, #mmGenOptions label span { color: #fff !important; font-weight: 600; }
      #mmGenOptions input[type=checkbox] { width: 18px; height: 18px; flex-shrink: 0; accent-color: #fff; cursor: pointer; }
      #mmGenOptions .mm-opt-levels { flex-wrap: nowrap; }
      #mmGenOptions .mm-opt-levels-txt { flex: 0 1 auto; min-width: 0; }
      #mmGenOptions input[type=number] { flex: 0 0 auto; }
      #mmGenOptions .mm-opt-note:empty { display: none; }
      #mmGenOptions .mm-opt-levels.mm-disabled { flex-wrap: wrap; }
      #mmGenOptions .mm-opt-levels.mm-disabled .mm-opt-note { flex-basis: 100%; }
      #mmGenOptions input[type=number] { width: 58px; min-height: 0; padding: 4px 6px; border-radius: 6px;
        border: 1px solid rgba(255,255,255,.7); background: rgba(255,255,255,.95); color: #4338ca;
        font-weight: 700; font-size: 1em; text-align: center; }
      #mmGenOptions .mm-opt-note { font-size: .88em; opacity: .85; font-style: italic; }
      #mmGenOptions label.mm-disabled > span:first-of-type { opacity: .6; }
      .mod-rationale { font-size: .86em; color: #6b21a8; font-style: italic; margin: -4px 0 10px; unicode-bidi: plaintext; text-align: start;
        background: rgba(255,255,255,.55); border-radius: 6px; padding: 6px 10px; }
      @media (max-width: 600px) { #mmGenOptions { justify-content: flex-start; } }
    `;
    document.head.appendChild(st);
  }
  let box = document.getElementById('mmGenOptions');
  if (!box) {
    box = document.createElement('div');
    box.id = 'mmGenOptions';
    row.parentNode.insertBefore(box, row.nextSibling);
    box.addEventListener('change', e => {
      if (e.target.id === 'mmOptKeep')   _mmGenOpts.keepExisting = e.target.checked;
      if (e.target.id === 'mmOptLevels') _mmGenOpts.assignLevels = e.target.checked;
      // Same setting as "Number of levels in the programme" above the
      // coverage matrix — one value, two places to change it.
      if (e.target.id === 'mmOptLevelCount') setModuleLevelCount(e.target.value);
    });
    box.innerHTML = `
      <label><input type="checkbox" id="mmOptKeep"> <span class="mm-opt-keep-txt"></span></label>
      <label class="mm-opt-levels"><input type="checkbox" id="mmOptLevels">
        <span class="mm-opt-levels-txt"></span>
        <input type="number" id="mmOptLevelCount" min="1" max="${MAX_LEVELS}" step="1" inputmode="numeric">
        <span class="mm-opt-note"></span></label>`;
  }
  // Updated in place (not rebuilt) so the number field keeps focus
  // while the user steps it up or down.
  const o = getModuleGenOptions();
  const mm = appState.moduleMappingData || {};
  const minLevels = Math.max(1, ...(mm.modules || []).map(m => _moduleLevel(m) || 0));
  const single = o.levelCount <= 1;
  const keep = box.querySelector('#mmOptKeep');
  const lv   = box.querySelector('#mmOptLevels');
  const cnt  = box.querySelector('#mmOptLevelCount');
  keep.checked = o.keepExisting;
  lv.checked = o.assignLevels;
  lv.disabled = single;
  box.querySelector('.mm-opt-levels').classList.toggle('mm-disabled', single);
  if (document.activeElement !== cnt) cnt.value = o.levelCount;
  cnt.min = minLevels;
  box.querySelector('.mm-opt-keep-txt').textContent = _tx('mmOptKeep');
  box.querySelector('.mm-opt-levels-txt').textContent = _tx('mmOptLevels');
  box.querySelector('.mm-opt-note').textContent = single ? _tx('mmOptSingle') : '';
  cnt.title = _tx('covLevelsLabel') !== 'covLevelsLabel' ? _tx('covLevelsLabel') : '';
  // The card's own hint said "Both replace existing modules", which is
  // no longer always true. Taken over here so it follows the options.
  const hint = row.parentNode.querySelector('[data-i18n="aiMMHint"], [data-mm-hint]');
  if (hint) {
    hint.removeAttribute('data-i18n');
    hint.setAttribute('data-mm-hint', '1');
    hint.textContent = _tx('mmHintNew');
  }
}

// ══════════════════════════════════════════════════════════════
// LEVELS AND COVERAGE
// ──────────────────────────────────────────────────────────────
// A multi-level programme (e.g. TVQF levels 1–3) is built from ONE
// occupational standard: each performance criterion is taught in the
// level where it belongs, and a level may split into specialisations
// (tracks) — the CMCN pattern, where level 3 divides into Computer
// Maintenance and Computer Networks while other modules stay common.
//
//   module.level   1..N, or absent for "not assigned yet"
//   module.track   free text; empty = common to all tracks
//   moduleMappingData.levelCount   how many levels the programme has
//
// The coverage matrix answers the question the source documents could
// not: which criteria of the standard are taught at which level, which
// are taught nowhere, and which are taught more than once.
// ══════════════════════════════════════════════════════════════

export const MAX_LEVELS = 8;

// ══════════════════════════════════════════════════════════════
// MODULE IDENTITY — code, short name, display label (3.34.0)
// ──────────────────────────────────────────────────────────────
//   module.code       optional manual code ("CMCN 1-1"); absent = auto
//   module.shortName  optional short name for file names ("Hardware")
//   moduleMappingData.labelMode  'code' | 'number' | 'both'
//
// Auto code = prefix + level + position of the module within its level
// ("CMCN 1-1"). The prefix is the module's track (now labelled "Track /
// code prefix"); with no track, the initials of the Job Title (falling
// back to the Occupation Title). A code the user typed is kept as is.
// The label mode decides how a module is referred to everywhere — cards,
// lists, coverage matrix, the curriculum tab and the Word/PDF exports.
// Codes and short names entered in the Module Curriculum tab in 3.33.x
// were stored there; they are adopted onto the module on first read.
// ══════════════════════════════════════════════════════════════
const _ID_STOP = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'to', 'a', 'an', '&', 'et', 'de', 'des', 'du',
  'la', 'le', 'les', 'en', 'pour', 'و', 'في', 'من', 'على', 'إلى', 'الى']);
function _idInitials(text) {
  const words = String(text || '').replace(/[^\p{L}\p{N}\s&-]/gu, ' ').split(/[\s-]+/).filter(Boolean);
  const keep = words.filter(w => !_ID_STOP.has(w.toLowerCase()));
  return (keep.length ? keep : words).map(w => w.charAt(0).toUpperCase()).join('').slice(0, 6);
}
function _idDom(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function _idModules() { return ((appState.moduleMappingData || {}).modules) || []; }

function _adoptLegacyIdentity() {
  const bm = appState.moduleCurriculumData && appState.moduleCurriculumData.byModule;
  if (!bm) return;
  _idModules().forEach(m => {
    const r = m && bm[m.id];
    if (!r) return;
    ['code', 'shortName'].forEach(k => {
      if (typeof r[k] !== 'string') return;
      const v = r[k].trim();
      if (v && (m[k] === undefined || m[k] === '')) m[k] = v;
      delete r[k];
    });
  });
}

/** Prefix of the auto code: the track, else Job Title initials. */
export function getModuleCodePrefix(module) {
  const t = String((module && module.track) || '').trim();
  if (t) return t;
  return _idInitials(_idDom('jobTitle')) || _idInitials(_idDom('occupationTitle')) || 'MOD';
}
export function suggestModuleCode(module) {
  const mods = _idModules();
  const lvl = _moduleLevel(module);
  const prefix = getModuleCodePrefix(module);
  if (lvl) return `${prefix} ${lvl}-${mods.filter(m => _moduleLevel(m) === lvl).indexOf(module) + 1}`;
  return `${prefix} ${mods.indexOf(module) + 1}`;
}
export function isModuleCodeManual(module) {
  _adoptLegacyIdentity();
  return !!(module && typeof module.code === 'string' && module.code.trim());
}
export function getModuleCode(module) {
  if (!module) return '';
  return isModuleCodeManual(module) ? module.code.trim() : suggestModuleCode(module);
}
export function suggestModuleShortName(module) {
  const words = String((module && module.title) || '').split(/\s+/).filter(Boolean);
  const pick = words.find((w, i) => !_ID_STOP.has(w.toLowerCase()) && !(i === 0 && /ing$/i.test(w) && words.length > 1));
  const w = (pick || words[0] || 'Module').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 24) || 'Module';
  return w.charAt(0).toUpperCase() + w.slice(1);
}
export function getModuleShortName(module) {
  _adoptLegacyIdentity();
  const s = module && typeof module.shortName === 'string' ? module.shortName.trim() : '';
  return s || suggestModuleShortName(module);
}
/** Writes the code / short name WITHOUT re-rendering (for other tabs).
 *  An empty value, or one equal to the suggestion, means "automatic". */
export function assignModuleCode(module, value) {
  if (!module) return;
  const v = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!v || v === suggestModuleCode(module)) delete module.code; else module.code = v;
}
export function assignModuleShortName(module, value) {
  if (!module) return;
  const v = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!v) delete module.shortName; else module.shortName = v;
}
export function setModuleCode(moduleId, value) {
  const m = _idModules().find(x => x.id === moduleId);
  if (!m) return;
  assignModuleCode(m, value);
  renderModules(); renderModuleLoList(); _persistClusters();
}
export function setModuleShortName(moduleId, value) {
  const m = _idModules().find(x => x.id === moduleId);
  if (!m) return;
  assignModuleShortName(m, value);
  _persistClusters();
}
/* 3.131.0: the module's full title — the long, official one — beside
   its working title (module.title, often short). Optional: absent = the
   working title. Printed in the curriculum documents and sent to Module
   Builder. */
export function getModuleFullTitle(module) {
  const f = module && typeof module.fullTitle === 'string' ? module.fullTitle.trim() : '';
  return f || String((module && module.title) || '').trim();
}
export function setModuleFullTitle(moduleId, value) {
  const m = _idModules().find(x => x.id === moduleId);
  if (!m) return;
  const v = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!v || v === String(m.title || '').trim()) delete m.fullTitle; else m.fullTitle = v;
  _persistClusters();
}
export function isModuleCodeDuplicate(module) {
  const c = getModuleCode(module).toLowerCase();
  return !!c && _idModules().some(m => m !== module && getModuleCode(m).toLowerCase() === c);
}
export function getModuleLabelMode() {
  const v = (appState.moduleMappingData || {}).labelMode;
  return v === 'number' || v === 'both' ? v : 'code';
}
export function setModuleLabelMode(v) {
  appState.moduleMappingData.labelMode = (v === 'number' || v === 'both') ? v : 'code';
  renderModules(); renderModuleLoList(); _persistClusters();
  try { document.dispatchEvent(new CustomEvent('dacum:module-labels-changed')); } catch (_) {}
}
/** Short reference to a module, following the label mode:
 *  "CMCN 1-1" | "M1" | "M1 · CMCN 1-1". */
export function moduleRef(module) {
  const i = _idModules().indexOf(module);
  const num = i >= 0 ? `M${i + 1}` : '';
  const mode = getModuleLabelMode();
  if (mode === 'number' || !module) return num;
  const code = getModuleCode(module);
  return mode === 'both' && num ? `${num} · ${code}` : code;
}
/** True when the reference already carries the track (so a separate
 *  track chip/tag would only repeat it). */
export function _refShowsTrack(module) {
  return getModuleLabelMode() !== 'number' && !!(module && module.track) &&
         getModuleCode(module).indexOf(module.track) !== -1;
}

export function _moduleLevel(m) {
  const n = parseInt(m && m.level, 10);
  return Number.isInteger(n) && n >= 1 && n <= MAX_LEVELS ? n : null;
}

export function getModuleLevelCount() {
  const mm = appState.moduleMappingData || {};
  const stored = parseInt(mm.levelCount, 10);
  const used = Math.max(0, ...(mm.modules || []).map(m => _moduleLevel(m) || 0));
  return Math.min(MAX_LEVELS, Math.max(Number.isInteger(stored) && stored > 0 ? stored : 3, used));
}

export function setModuleLevelCount(n) {
  const mm = appState.moduleMappingData;
  const used = Math.max(0, ...(mm.modules || []).map(m => _moduleLevel(m) || 0));
  const v = Math.max(1, used, Math.min(MAX_LEVELS, parseInt(n, 10) || 3));
  mm.levelCount = v;
  renderModules(); renderModuleLoList();
  _persistClusters();
  return v;
}

export function setModuleLevel(moduleId, level) {
  const m = appState.moduleMappingData.modules.find(x => x.id === moduleId);
  if (!m) return;
  const n = parseInt(level, 10);
  if (Number.isInteger(n) && n >= 1 && n <= MAX_LEVELS) m.level = n; else delete m.level;
  renderModules(); renderModuleLoList();
  _persistClusters();
}

export function setModuleTrack(moduleId, track) {
  const m = appState.moduleMappingData.modules.find(x => x.id === moduleId);
  if (!m) return;
  const t = String(track || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (t) m.track = t; else delete m.track;
  renderModules(); renderModuleLoList();
  _persistClusters();
}

// ── Module category (3.101.0) ─────────────────────────────────
// Basic / Common / Core / Elective by default — the grouping national
// competency-based curricula use for their course structure. The list is
// the project's own (moduleMappingData.moduleCategories) so each country's
// scheme can be used: rename, add or remove categories. A default entry
// has an empty label and shows its translated name; once edited, the
// label is the user's text. module.category holds the category id.
export const DEFAULT_MODULE_CATEGORIES = [
  { id: 'basic',    key: 'catBasic' },
  { id: 'common',   key: 'catCommon' },
  { id: 'core',     key: 'catCore' },
  { id: 'elective', key: 'catElective' },
];
export function getModuleCategories() {
  const c = (appState.moduleMappingData || {}).moduleCategories;
  if (Array.isArray(c) && c.length) return c.filter(x => x && x.id).map(x => ({ id: String(x.id), label: String(x.label || '') }));
  return DEFAULT_MODULE_CATEGORIES.map(d => ({ id: d.id, label: '' }));
}
export function categoryLabel(cat) {
  if (!cat) return '';
  if (cat.label && cat.label.trim()) return cat.label.trim();
  const d = DEFAULT_MODULE_CATEGORIES.find(x => x.id === cat.id);
  return d ? _t(d.key) : cat.id;
}
export function getModuleCategory(module) {
  const id = module && module.category;
  return id ? (getModuleCategories().find(c => c.id === id) || null) : null;
}
export function setModuleCategory(moduleId, id) {
  const m = appState.moduleMappingData.modules.find(x => x.id === moduleId);
  if (!m) return;
  if (id && getModuleCategories().some(c => c.id === id)) m.category = id; else delete m.category;
  renderModules();
  _persistClusters();
}
/* One category per line. Lines keep the id of the category at the same
   position, so renaming keeps every module's choice; a module whose
   category is removed becomes unclassified. A line equal to a default
   name in the interface language stays "default" (follows language). */
function _saveCategoryLines(lines) {
  const cur = getModuleCategories();
  const clean = lines.map(l => String(l || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean);
  const used = new Set();
  const next = clean.map((label, i) => {
    let id = cur[i] ? cur[i].id : '';
    if (!id || used.has(id)) { let n = i + 1; do { id = 'cat_' + n++; } while (used.has(id) || cur.some(c => c.id === id && c !== cur[i])); }
    used.add(id);
    const def = DEFAULT_MODULE_CATEGORIES.find(d => d.id === id);
    return { id, label: def && _t(def.key) === label ? '' : label };
  });
  const mm = appState.moduleMappingData;
  mm.moduleCategories = next;
  (mm.modules || []).forEach(m => { if (m.category && !next.some(c => c.id === m.category)) delete m.category; });
  renderModules();
  _persistClusters();
}
export function openModuleCategoriesEditor() {
  const old = document.getElementById('mmCatModal');
  if (old) old.remove();
  const rtl = !!(window.i18n && window.i18n.isRTL && window.i18n.isRTL());
  const ov = document.createElement('div');
  ov.id = 'mmCatModal';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  ov.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.5);';
  const lines = getModuleCategories().map(categoryLabel).join('\n');
  ov.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:440px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden;font-family:inherit;">
      <div style="padding:16px 20px;background:linear-gradient(135deg,#f5f3ff,#ede9fe);border-bottom:1px solid #ddd6fe;font-weight:800;color:#5b21b6;">🏷️ ${_esc(_tx('catEditTitle'))}</div>
      <div style="padding:16px 20px;">
        <p style="margin:0 0 10px;font-size:.86em;color:#475569;line-height:1.6;">${_esc(_tx('catEditHint'))}</p>
        <textarea id="mmCatLines" dir="auto" rows="6" style="width:100%;box-sizing:border-box;min-height:130px;font:inherit;font-size:.92em;padding:10px;border:1.5px solid #ddd6fe;border-radius:8px;">${_esc(lines)}</textarea>
        <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;margin-top:12px;">
          <button type="button" data-cat="reset" style="padding:8px 12px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font:inherit;font-size:.85em;">↺ ${_esc(_tx('catEditReset'))}</button>
          <span style="display:flex;gap:8px;">
            <button type="button" data-cat="cancel" style="padding:8px 14px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font:inherit;">${_esc(_tx('btnCancel'))}</button>
            <button type="button" data-cat="save" style="padding:8px 16px;border:none;background:#7c3aed;color:#fff;border-radius:8px;cursor:pointer;font:inherit;font-weight:700;">${_esc(_tx('btnSave'))}</button>
          </span>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const ta = ov.querySelector('#mmCatLines');
  ta.focus();
  const close = () => ov.remove();
  ov.addEventListener('click', e => {
    if (e.target === ov) { close(); return; }
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    const k = b.getAttribute('data-cat');
    if (k === 'cancel') close();
    else if (k === 'reset') ta.value = DEFAULT_MODULE_CATEGORIES.map(d => _t(d.key)).join('\n');
    else if (k === 'save') { _saveCategoryLines(ta.value.split('\n')); close(); }
  });
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

// ── TVQF / NQF (3.85.0) ────────────────────────────────────────
// OPTIONAL and separate from module.level. module.level is the level
// INSIDE the programme (1..N): it builds the module code (CMCN 1-1) and
// groups the modules. A national / technical qualifications framework
// level is another scale — a three-level programme may sit wholly at
// TVQF/NQF level 3, or run from 2 to 4 — so it has its own fields:
//
//   moduleMappingData.nqf = { enabled, framework }   off by default
//   module.nqfLevel        free text ("Level 3", "المستوى الثالث")
//   module.nqfDescriptor   free text — the level's descriptors
//
// Free text on purpose: no country, no fixed number of levels (same
// approach as Module Builder's TVQF card). A real link to a given
// country's framework can be built on these fields later. Switching the
// option off hides the fields and keeps what was typed.
export function getNqfSettings() {
  const n = (appState.moduleMappingData || {}).nqf || {};
  return { enabled: !!n.enabled, framework: String(n.framework || '') };
}
export function isNqfEnabled() { return getNqfSettings().enabled; }
export function setNqfEnabled(on) {
  const mm = appState.moduleMappingData;
  mm.nqf = { ...(mm.nqf || {}), enabled: !!on };
  renderModules(); _persistClusters();
}
export function setNqfFramework(v) {
  const mm = appState.moduleMappingData;
  mm.nqf = { ...(mm.nqf || {}), framework: String(v || '').replace(/\s+/g, ' ').trim().slice(0, 120) };
  _persistClusters();
}
export function setModuleNqfLevel(moduleId, v) {
  const m = (appState.moduleMappingData.modules || []).find(x => x.id === moduleId);
  if (!m) return;
  const t = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (t) m.nqfLevel = t; else delete m.nqfLevel;
  renderModules(); _persistClusters();
}
export function setModuleNqfDescriptor(moduleId, v) {
  const m = (appState.moduleMappingData.modules || []).find(x => x.id === moduleId);
  if (!m) return;
  const t = String(v || '').trim();
  if (t) m.nqfDescriptor = t; else delete m.nqfDescriptor;
  _persistClusters();
}
/** The module's TVQF/NQF level when the option is on, else ''. */
export function getModuleNqfLevel(m) {
  return isNqfEnabled() && m && m.nqfLevel ? String(m.nqfLevel) : '';
}
export function getModuleNqfDescriptor(m) {
  return isNqfEnabled() && m && m.nqfDescriptor ? String(m.nqfDescriptor) : '';
}

/** Per-criterion coverage: which modules (with level/track) teach it. */
export function computeCoverage() {
  _reconcileLearningOutcomes();
  const cd = appState.clusteringData || { clusters: [] };
  const mm = appState.moduleMappingData || { modules: [] };
  const lo = appState.learningOutcomesData || { outcomes: [] };

  const rows = [];
  const byKey = new Map();
  (cd.clusters || []).forEach((c, ci) => {
    _getClusterEffectiveCriteria(c, ci + 1).forEach(cr => {
      if (!cr.text || !cr.text.trim()) return;
      const row = { key: cr.key, id: cr.id, text: cr.text, taskId: cr.taskId,
                    clusterNumber: ci + 1, clusterName: c.name, modules: [], los: [] };
      rows.push(row);
      if (!byKey.has(cr.key)) byKey.set(cr.key, row);
    });
  });

  const inModule = new Set();
  mm.modules.forEach((m, mi) => {
    (m.learningOutcomes || []).forEach(o => {
      inModule.add(o.id);
      (o.linkedCriteria || []).forEach(pc => {
        const row = !pc.stale && pc.key && byKey.get(pc.key);
        if (row && !row.modules.some(x => x.id === m.id)) {
          row.modules.push({ id: m.id, number: moduleRef(m), showTrack: !_refShowsTrack(m), title: m.title,
                             level: _moduleLevel(m), track: m.track || '' });
        }
      });
    });
  });
  lo.outcomes.forEach(o => (o.linkedCriteria || []).forEach(pc => {
    const row = !pc.stale && pc.key && byKey.get(pc.key);
    if (row && !row.los.includes(loLabel(o))) row.los.push(loLabel(o));
  }));

  rows.forEach(r => {
    r.status = r.modules.length > 1 ? 'multi'
             : r.modules.length === 1 ? 'covered'
             : r.los.length ? 'lo-only' : 'gap';
  });
  const count = st => rows.filter(r => r.status === st).length;
  return { rows, levelCount: getModuleLevelCount(),
           summary: { total: rows.length, covered: count('covered') + count('multi'),
                      multi: count('multi'), loOnly: count('lo-only'), gap: count('gap') } };
}

// ── Export helpers (used by exports_docx.js / exports_pdf.js) ──────────
// Kept here, next to the data they describe, so the two exporters only
// need a one-line call each and no new file has to be registered with
// the service worker.

/** "M3 — Title (Level 3 · CN)" — module heading for exported documents. */
export function moduleTitleWithLevel(module) {
  const mm = appState.moduleMappingData || { modules: [] };
  const i = (mm.modules || []).indexOf(module);
  const n = i >= 0 ? `${moduleRef(module)} — ` : '';
  const l = _moduleLevel(module);
  const tags = [l ? _txf('lblLevelN', { n: l }) : '', module && module.track && !_refShowsTrack(module) ? module.track : '']
    .filter(Boolean).join(' · ');
  return `${n}${module ? module.title : ''}${tags ? ` (${tags})` : ''}`;
}

function _statusWord(r) {
  if (r.status === 'gap')     return _tx('covGap');
  if (r.status === 'lo-only') return _txf('covLoOnly', { lo: r.los.join(', ') });
  if (r.status === 'multi')   return _txf('covMulti', { n: r.modules.length });
  return _tx('covTaught');
}

function _levelsExportData() {
  renumberLearningOutcomes();
  const mm = appState.moduleMappingData || { modules: [] };
  if (!(mm.modules || []).length) return null;
  const cov = computeCoverage();
  if (!cov.rows.length) return null;
  const levelCount = cov.levelCount;
  const anyLevel = mm.modules.some(m => _moduleLevel(m));
  const usesNoLevel = cov.rows.some(r => r.modules.some(m => !m.level));
  const cols = Array.from({ length: levelCount }, (_, i) => i + 1);
  if (usesNoLevel) cols.push(null);

  // Programme structure: one row per module, ordered by level.
  const structure = mm.modules
    .map((m, i) => ({ m, i, l: _moduleLevel(m) }))
    .sort((a, b) => (a.l || 99) - (b.l || 99) || a.i - b.i)
    .map(({ m, i, l }) => {
      const crit = [];
      (m.learningOutcomes || []).forEach(o => (o.linkedCriteria || []).forEach(pc => {
        if (!pc.stale && !crit.includes(pc.id)) crit.push(pc.id);
      }));
      // 3.85.0: the TVQF/NQF level, when the option is on and filled,
      // follows the programme level in the same cell.
      const nq = getModuleNqfLevel(m);
      return { level: (l ? _txf('lblLevelN', { n: l }) : _tx('lblNoLevelGroup')) + (nq ? ` · ${_tx('lblNqfChip')}: ${nq}` : ''),
               module: `${moduleRef(m)} — ${m.title}`, track: m.track || _tx('covCommon'),
               los: String((m.learningOutcomes || []).length), criteria: crit.join(', ') };
    });

  const cellText = (r, level) => r.modules
    .filter(m => (m.level || null) === level)
    .map(m => m.number + (m.track && m.showTrack !== false ? ` ${m.track}` : '')).join(', ');

  const s = cov.summary;
  const pct = s.total ? Math.round(s.covered / s.total * 100) : 0;
  const summary = [
    _txf('covTotal', { n: s.total }),
    _txf('covCoveredN', { n: s.covered, p: pct }),
    _txf('covGapN', { n: s.gap }),
    s.loOnly ? _txf('covLoOnlyN', { n: s.loOnly }) : '',
    s.multi ? _txf('covMultiN', { n: s.multi }) : '',
  ].filter(Boolean).join('  ·  ');

  const head = [_tx('covColCriterion'),
    ...cols.map(l => l ? _txf('lblLevelShort', { n: l }) : _tx('covColNoLevel')),
    _tx('covColStatus')];
  const body = [];
  let last = null;
  cov.rows.forEach(r => {
    if (r.clusterNumber !== last) {
      last = r.clusterNumber;
      body.push({ group: `C${r.clusterNumber} — ${r.clusterName}` });
    }
    body.push({ status: r.status,
      cells: [`${r.id}  ${r.text}`, ...cols.map(l => cellText(r, l)), _statusWord(r)] });
  });
  return { anyLevel, structure, summary, head, body, levelColumns: cols.length };
}

/**
 * Word: returns the paragraphs/tables for "Programme Structure by Level"
 * and the coverage matrix, or [] when there are no modules. `lib` is the
 * exporter's own (wrapped) docx classes plus { fill, rtl }.
 */
export function buildLevelsDocxBlock(lib) {
  const d = _levelsExportData();
  if (!d) return [];
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
          AlignmentType, ShadingType, PageBreak } = lib;
  const rtl = !!lib.rtl, fill = lib.fill || 'DCDCDC';
  const out = [];
  const TOTAL = 9071;

  const para = (text, o = {}) => new Paragraph({
    children: [new TextRun({ text, size: o.size || 20, bold: !!o.bold, italics: !!o.italics,
                             color: o.color, __shaded: !!o.shaded })],
    ...(o.center ? { alignment: AlignmentType.CENTER } : {}),
    spacing: o.spacing || { after: 0 },
    bidirectional: rtl,
  });
  const cell = (text, w, o = {}) => new TableCell({
    children: [para(text, o)],
    width: { size: w, type: WidthType.DXA },
    ...(o.fillCell ? { shading: { fill: o.fillCell, type: ShadingType.CLEAR, color: 'auto' } } : {}),
    ...(o.span ? { columnSpan: o.span } : {}),
  });
  const table = (rows, widths) => new Table({
    visuallyRightToLeft: rtl, width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: widths, layout: 'fixed', rows,
  });

  out.push(new Paragraph({ children: [new PageBreak()], bidirectional: rtl }));

  // 1. Programme structure — only meaningful once levels are in use.
  if (d.anyLevel) {
    out.push(para(_tx('expLevelsTitle'), { size: 32, bold: true, center: true, spacing: { before: 200, after: 300 } }));
    const w = [1100, 3571, 1400, 1200, 1800];
    const rows = [new TableRow({ tableHeader: true, children:
      [_tx('lblModuleLevel'), _tx('expColModule'), _tx('lblModuleTrack'), _tx('expColLOs'), _tx('expColCriteria')]
        .map((h, i) => cell(h, w[i], { bold: true, shaded: true, fillCell: fill, center: i !== 1 })) })];
    d.structure.forEach(r => rows.push(new TableRow({ children: [
      cell(r.level, w[0], { center: true }), cell(r.module, w[1]), cell(r.track, w[2], { center: true }),
      cell(r.los, w[3], { center: true }), cell(r.criteria, w[4], { size: 18 }),
    ] })));
    out.push(table(rows, w));
    out.push(para('', { spacing: { after: 300 } }));
  }

  // 2. Coverage matrix.
  out.push(para(_tx('covTitle'), { size: 28, bold: true, spacing: { before: 200, after: 120 } }));
  out.push(para(_tx('expCovHint'), { size: 18, italics: true, spacing: { after: 80 } }));
  out.push(para(d.summary, { size: 20, bold: true, spacing: { after: 160 } }));

  const statusW = 1700;
  const lvlW = Math.max(560, Math.min(900, Math.floor((TOTAL - statusW - 3200) / d.levelColumns)));
  const critW = TOTAL - statusW - lvlW * d.levelColumns;
  const w = [critW, ...Array(d.levelColumns).fill(lvlW), statusW];
  const STATUS_COLOR = { gap: 'B91C1C', 'lo-only': '92400E', multi: '075985', covered: '166534' };
  const rows = [new TableRow({ tableHeader: true,
    children: d.head.map((h, i) => cell(h, w[i], { bold: true, shaded: true, fillCell: fill, size: 18, center: i !== 0 })) })];
  d.body.forEach(r => {
    if (r.group) {
      rows.push(new TableRow({ children: [cell(r.group, TOTAL, { bold: true, size: 18, span: w.length, fillCell: 'EFF6FF' })] }));
      return;
    }
    rows.push(new TableRow({ children: r.cells.map((t, i) => {
      const last = i === r.cells.length - 1;
      return cell(t, w[i], { size: 18, center: i !== 0,
        bold: last, color: last ? STATUS_COLOR[r.status] : (i === 0 && r.status === 'gap' ? 'B91C1C' : undefined) });
    }) }));
  });
  out.push(table(rows, w));
  return out;
}

/**
 * PDF: draws the same two sections on new pages and returns the y
 * position after them (unchanged when there is nothing to draw).
 * Uses plain text, lines and rectangles only — all of which
 * pdf_arabic.js mirrors for Arabic — and words instead of ✓/✗, which
 * the embedded fonts do not carry.
 */
export function writeLevelsPdf(pdf, ctx) {
  const d = _levelsExportData();
  if (!d) return ctx.yPos;
  const { margin, pageWidth, pageHeight } = ctx;
  const W = pageWidth - 2 * margin;
  let y;
  const newPage = () => { pdf.addPage(); y = margin + 5; };
  const ensure = (h, redraw) => { if (y + h > pageHeight - margin) { newPage(); if (redraw) redraw(); } };
  const setFill = hex => pdf.setFillColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
  const setColor = hex => pdf.setTextColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));

  // Generic row-based table: column x offsets + widths, wrapped cells.
  const drawTable = (widths, header, rows, fs) => {
    const xs = []; widths.reduce((x, w) => (xs.push(x), x + w), margin);
    const line = fs * 0.42;
    const head = () => {
      pdf.setFontSize(fs); pdf.setFont(undefined, 'bold');
      const lines = header.map((h, i) => pdf.splitTextToSize(h, widths[i] - 3));
      const h = Math.max(...lines.map(l => l.length)) * line + 3;
      setFill('DCDCDC'); pdf.rect(margin, y, W, h, 'F'); setColor('000000');
      lines.forEach((l, i) => pdf.text(l, xs[i] + 1.5, y + line + 0.5));
      y += h; pdf.setFont(undefined, 'normal');
    };
    head();
    rows.forEach(r => {
      pdf.setFontSize(fs);
      if (r.group) {
        const h = line + 3;
        ensure(h + line * 2, head);
        setFill('EFF6FF'); pdf.rect(margin, y, W, h, 'F');
        pdf.setFont(undefined, 'bold'); setColor('075985');
        pdf.text(pdf.splitTextToSize(r.group, W - 3)[0], margin + 1.5, y + line + 0.5);
        pdf.setFont(undefined, 'normal'); setColor('000000');
        y += h; return;
      }
      const lines = r.cells.map((c, i) => pdf.splitTextToSize(String(c || ''), widths[i] - 3));
      const h = Math.max(...lines.map(l => l.length), 1) * line + 3;
      ensure(h, head);
      lines.forEach((l, i) => {
        if (r.colors && r.colors[i]) setColor(r.colors[i]);
        if (r.boldCol === i) pdf.setFont(undefined, 'bold');
        pdf.text(l, xs[i] + 1.5, y + line + 0.5);
        if (r.boldCol === i) pdf.setFont(undefined, 'normal');
        setColor('000000');
      });
      y += h;
      pdf.setDrawColor(226, 232, 240); pdf.line(margin, y, margin + W, y);
    });
  };

  newPage();
  if (d.anyLevel) {
    pdf.setFontSize(16); pdf.setFont(undefined, 'bold');
    pdf.text(_tx('expLevelsTitle'), pageWidth / 2, y, { align: 'center' });
    y += 9;
    const f = [0.14, 0.40, 0.14, 0.10, 0.22].map(x => x * W);
    drawTable(f, [_tx('lblModuleLevel'), _tx('expColModule'), _tx('lblModuleTrack'), _tx('expColLOs'), _tx('expColCriteria')],
      d.structure.map(r => ({ cells: [r.level, r.module, r.track, r.los, r.criteria] })), 9);
    y += 10;
    ensure(30);
  }

  pdf.setFontSize(14); pdf.setFont(undefined, 'bold');
  pdf.text(_tx('covTitle'), margin, y); y += 6;
  pdf.setFontSize(9); pdf.setFont(undefined, 'normal');
  pdf.splitTextToSize(_tx('expCovHint'), W).forEach(l => { pdf.text(l, margin, y); y += 4; });
  pdf.setFont(undefined, 'bold');
  pdf.splitTextToSize(d.summary, W).forEach(l => { pdf.text(l, margin, y); y += 4.5; });
  pdf.setFont(undefined, 'normal');
  y += 3;

  const statusW = Math.min(45, W * 0.2);
  const lvlW = Math.max(12, Math.min(22, (W - statusW - 90) / d.levelColumns));
  const widths = [W - statusW - lvlW * d.levelColumns, ...Array(d.levelColumns).fill(lvlW), statusW];
  const COLORS = { gap: 'B91C1C', 'lo-only': '92400E', multi: '075985', covered: '166534' };
  drawTable(widths, d.head, d.body.map(r => r.group ? r : ({
    cells: r.cells, boldCol: r.cells.length - 1,
    colors: { 0: r.status === 'gap' ? 'B91C1C' : null, [r.cells.length - 1]: COLORS[r.status] },
  })), 8);
  return y + 5;
}

let _covGapsOnly = false; export function setCoverageGapsOnly(v) { _covGapsOnly = !!v; }   // 3.76.0: set from clusters.js

export function renderCoverageMatrix() {
  const modCont = document.getElementById('modulesContainer');
  if (!modCont) return;
  const anchor = modCont.closest('.clustering-section') || modCont;
  let sec = document.getElementById('coverageMatrixSection');
  // No modules → nothing has been mapped yet, so there is no coverage
  // to report. The section is removed (this is also what makes "Clear
  // This Tab" and deleting the last module empty it).
  if (!((appState.moduleMappingData || {}).modules || []).length) {
    if (sec) sec.remove();
    return;
  }
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'coverageMatrixSection';
    sec.className = 'clustering-section';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
  }

  const cov = computeCoverage();
  const { rows, levelCount, summary } = cov;
  const usesNoLevel = rows.some(r => r.modules.some(m => !m.level));
  const levels = Array.from({ length: levelCount }, (_, i) => i + 1);

  const cell = (r, level) => r.modules
    .filter(m => (m.level || null) === level)
    .map(m => `<span class="cov-chip" title="${_esc(m.title)}"><bdi>${_esc(m.number)}</bdi>${m.track && m.showTrack !== false ? ` <small>${_esc(m.track)}</small>` : ''}</span>`)
    .join('');

  const statusCell = r => {
    if (r.status === 'gap')     return `<span class="cov-st cov-gap">✗ ${_esc(_tx('covGap'))}</span>`;
    if (r.status === 'lo-only') return `<span class="cov-st cov-lo">◐ ${_esc(_txf('covLoOnly', { lo: r.los.join(', ') }))}</span>`;
    if (r.status === 'multi')   return `<span class="cov-st cov-multi">⚠ ${_esc(_txf('covMulti', { n: r.modules.length }))}</span>`;
    return `<span class="cov-st cov-ok">✓</span>`;
  };

  let body = '';
  let lastCluster = null;
  const shown = rows.filter(r => !_covGapsOnly || r.status === 'gap' || r.status === 'lo-only');
  shown.forEach(r => {
    if (r.clusterNumber !== lastCluster) {
      lastCluster = r.clusterNumber;
      body += `<tr class="cov-group"><td colspan="${levels.length + (usesNoLevel ? 3 : 2)}">C${r.clusterNumber} — ${_esc(r.clusterName)}</td></tr>`;
    }
    body += `<tr class="cov-row cov-${r.status}">
      <td class="cov-crit"><strong>${_esc(r.id)}</strong> ${_esc(r.text)}${r.taskId ? ` <span class="cov-task">[${_esc(_taskLabel(r.taskId))}]</span>` : ''}</td>
      ${levels.map(l => `<td class="cov-lvl">${cell(r, l)}</td>`).join('')}
      ${usesNoLevel ? `<td class="cov-lvl">${cell(r, null)}</td>` : ''}
      <td class="cov-status">${statusCell(r)}</td>
    </tr>`;
  });

  const pct = summary.total ? Math.round(summary.covered / summary.total * 100) : 0;
  // 3.133.0: modules typed in by hand are not traced to the chart.
  const manualN = ((appState.moduleMappingData || {}).modules || []).filter(isManualModule).length;
  _injectCovFoldStyles();
  // Collapsible: the matrix lists every criterion and makes the tab very
  // long. Closed, the bar still shows the two numbers that matter.
  sec.innerHTML = `
   <details class="cov-fold" ${_covOpen ? 'open' : ''}>
    <summary class="cov-fold-head">
      <span class="cov-fold-title">📊 ${_esc(_tx('covTitle'))}</span>
      ${matrixHelpButton('coverage', 'ttCovHelp')}
      ${summary.total ? `<span class="cov-fold-mini">
        <span class="cov-pill cov-ok">✓ ${_esc(_txf('covCoveredN', { n: summary.covered, p: pct }))}</span>
        <span class="cov-pill cov-gap">✗ ${_esc(_txf('covGapN', { n: summary.gap }))}</span>
      </span>` : ''}
      <span class="cov-fold-toggle">${_esc(_tx(_covOpen ? 'covHide' : 'covShow'))}</span>
    </summary>
    <div class="cov-fold-body">
    <p class="cov-hint">${_esc(_tx('covHint'))}</p>
    <div class="cov-controls">
      <label class="mod-meta-field"><span>${_esc(_tx('lblLevelCount'))}</span>
        <input type="number" class="cov-level-count" min="1" max="${MAX_LEVELS}" value="${levelCount}">
      </label>
      <label class="cov-gaps-toggle"><input type="checkbox" class="cov-gaps-only" ${_covGapsOnly ? 'checked' : ''}>
        ${_esc(_tx('covGapsOnly'))}</label>
    </div>
    ${manualN ? `<div class="cov-manual-note" style="font-size:.85em;color:#6b7280;margin:6px 0;">📄 ${_esc(_txf('covManualNote', { n: manualN }))}</div>` : ''}
    ${summary.total ? `
    <div class="cov-summary">
      <span class="cov-pill">${_esc(_txf('covTotal', { n: summary.total }))}</span>
      <span class="cov-pill cov-ok">✓ ${_esc(_txf('covCoveredN', { n: summary.covered, p: pct }))}</span>
      <span class="cov-pill cov-gap">✗ ${_esc(_txf('covGapN', { n: summary.gap }))}</span>
      ${summary.loOnly ? `<span class="cov-pill cov-lo">◐ ${_esc(_txf('covLoOnlyN', { n: summary.loOnly }))}</span>` : ''}
      ${summary.multi ? `<span class="cov-pill cov-multi">⚠ ${_esc(_txf('covMultiN', { n: summary.multi }))}</span>` : ''}
    </div>
    <div class="cov-table-wrap">
      <table class="cov-table">
        <thead><tr>
          <th>${_esc(_tx('covColCriterion'))}</th>
          ${levels.map(l => `<th>${_esc(_txf('lblLevelShort', { n: l }))}</th>`).join('')}
          ${usesNoLevel ? `<th>${_esc(_tx('covColNoLevel'))}</th>` : ''}
          <th>${_esc(_tx('covColStatus'))}</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="${levels.length + 3}" class="cov-empty">${_esc(_tx('covNoGaps'))}</td></tr>`}</tbody>
      </table>
    </div>` : `<div class="no-clusters-message">${_esc(_tx('covEmpty'))}</div>`}
    </div>
   </details>`;
  bindMatrixHelp(sec);
  const det = sec.querySelector('details.cov-fold');
  det.addEventListener('toggle', () => {
    _covOpen = det.open;
    try { localStorage.setItem('dacum_cov_open', _covOpen ? '1' : '0'); } catch (_) {}
    const t = det.querySelector('.cov-fold-toggle');
    if (t) t.textContent = _tx(_covOpen ? 'covHide' : 'covShow');
  });
  /* 3.119.0: the curriculum matrix (depth of treatment) under it. */
  try { renderCurriculumMatrix(); } catch (e) { console.warn('[curriculum matrix]', e); }
}

/* 3.122.0: the "?" in the title bar of the coverage and curriculum
   matrices. It sits inside <summary>, so a click must not reach the
   <details> (it would fold or unfold the card). The guides live in
   events.js, loaded on demand to keep the import graph acyclic. */
export function matrixHelpButton(guide, tipKey) {
  const tip = _esc(_tx(tipKey));
  return `<button type="button" class="tab-help-btn cov-help-btn" data-matrix-help="${guide}"
          aria-haspopup="dialog" title="${tip}" aria-label="${tip}">?</button>`;
}
export function bindMatrixHelp(sec) {
  sec.querySelectorAll('[data-matrix-help]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const guide = b.getAttribute('data-matrix-help');
    import('./events.js').then(m => m.openHelpGuide(guide)).catch(err => console.warn('[matrix help]', err));
  }));
}

let _covOpen = (() => { try { return localStorage.getItem('dacum_cov_open') === '1'; } catch (_) { return false; } })();

function _injectCovFoldStyles() {
  if (document.getElementById('covFoldStyles')) return;
  const st = document.createElement('style');
  st.id = 'covFoldStyles';
  st.textContent = `
    .cov-fold > summary { list-style: none; }
    .cov-fold > summary::-webkit-details-marker { display: none; }
    .cov-fold-head {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; cursor: pointer;
      padding: 12px 14px; border-radius: 10px; background: #eef2ff; border: 1px solid #c7d2fe;
      user-select: none;
    }
    .cov-fold-head:hover { background: #e0e7ff; }
    .cov-fold-title { font-weight: 700; font-size: 1.12em; color: #4338ca; }
    .cov-fold-mini { display: inline-flex; flex-wrap: wrap; gap: 6px; }
    .cov-fold-mini .cov-pill { font-size: .85em; }
    .cov-fold-toggle {
      margin-inline-start: auto; font-size: .88em; font-weight: 700; color: #4338ca;
      white-space: nowrap;
    }
    .cov-fold-toggle::after { content: ' ▾'; }
    .cov-fold[open] .cov-fold-toggle::after { content: ' ▴'; }
    .cov-fold[open] > .cov-fold-head { border-radius: 10px 10px 0 0; }
    .cov-fold-body { padding-top: 12px; }
    .cov-fold-head .cov-help-btn { margin-inline-start: -6px; }   /* 3.122.0: hug the title */
  `;
  document.head.appendChild(st);
}

export function renameModule(moduleId) {
  const module = appState.moduleMappingData.modules.find(m => m.id === moduleId);
  if (!module) return;
  const newTitle = prompt(_t('promptRenameModule'), module.title);
  if (newTitle && newTitle.trim()) {
    module.title = newTitle.trim();
    renderModules();
  }
}

export function deleteModule(moduleId) {
  const mm = appState.moduleMappingData;
  const idx = mm.modules.findIndex(m => m.id === moduleId);
  if (idx === -1) return;
  if (!confirm(_t('confirmDeleteModule'))) return;
  const before = _undoSnap();
  const label = _txf('undoDeleteModule', { m: moduleRef(mm.modules[idx]), name: mm.modules[idx].title || '' });
  mm.modules.splice(idx, 1);
  _undoRecord(label, before);
  _persistClusters();
  renderModuleLoList();
  renderModules();
}

export function removeLoFromModule(moduleId, loId) {
  const module = appState.moduleMappingData.modules.find(m => m.id === moduleId);
  if (!module) return;
  const idx = module.learningOutcomes.findIndex(o => o.id === loId);
  if (idx !== -1) {
    const before = _undoSnap();
    const mi = appState.moduleMappingData.modules.indexOf(module);
    const label = _txf('undoRemoveLO', { lo: loLabel(module.learningOutcomes[idx]), m: moduleRef(module) || `M${mi + 1}` });
    module.learningOutcomes.splice(idx, 1);
    _undoRecord(label, before);
    _persistClusters();
  }
  renderModuleLoList();
  renderModules();
}

export function addLoToModuleFromDropdown(loId, moduleId) {
  if (!moduleId) return;
  const mm = appState.moduleMappingData;
  const lo = appState.learningOutcomesData;
  const module = mm.modules.find(m => m.id === moduleId);
  if (!module) return;
  const outcome = lo.outcomes.find(o => o.id === loId);
  if (!outcome) return;
  module.learningOutcomes.push(outcome);
  renderModuleLoList();
  renderModules();
}

// Collects the distinct source task IDs referenced by a module's
// Learning Outcomes, then the Task Analysis record for each — this is
// what makes the "relevant Task Analysis information" available to
// Module Builder without duplicating the entire project into the
// handoff. Tasks with no analysis content are simply absent from the
// returned dictionary (getTaskAnalysisRecord already returns null for
// those), so an old project with no Task Analysis data at all still
// produces a valid, empty-but-harmless taskAnalysis: {}.
export function _collectModuleTaskAnalysis(module) {
  /* 3.44.0: a criterion written in Competency Clusters carries no taskId
     (only Task Analysis criteria do), so this used to find no source task
     at all for most modules — Module Builder received empty
     sourceTaskIds / taskAnalysis and its Training Structure Mapping had
     nothing to offer. A cluster criterion now traces to the tasks of its
     competency; a Task Analysis criterion still traces to its own task. */
  const taskIds = new Set();
  module.learningOutcomes.forEach(o =>
    o.linkedCriteria.forEach(pc => _criterionTaskIds(pc).forEach(id => taskIds.add(id)))
  );
  const taskAnalysis = {};
  taskIds.forEach(taskId => {
    const record = getTaskAnalysisRecord(taskId);
    if (record) taskAnalysis[taskId] = { taskCode: _taskLabel(taskId), ...record };
  });
  /* Code and statement of every source task, analysed or not — so Module
     Builder can label a task that has no Task Analysis yet instead of
     showing its raw id. */
  const sourceTasks = [...taskIds].map(id => {
    const t = _clusterTask(id);
    const st = { id, code: _taskLabel(id), text: (t && t.text) || '', dutyTitle: (t && t.dutyTitle) || '' };
    // 3.84.0: a task left out of training (Task Verification → Select
    // Tasks) that still sits in a competency of this module is marked,
    // so Module Builder can say so. Absent = selected.
    if (!isClusterAddedTaskId(id) && !isTaskSelected(id)) st.selected = false;
    return st;
  });
  return { sourceTaskIds: [...taskIds], taskAnalysis, sourceTasks };
}

/* The tasks a linked criterion traces back to: its own task for a Task
   Analysis criterion, the tasks of its competency for a cluster one. */
export function _criterionTaskIds(pc) {
  if (pc.taskId) return [pc.taskId];
  const cluster = (appState.clusteringData.clusters || []).find(c => c.id === pc.clusterId);
  return cluster ? (cluster.tasks || []).map(t => t.id).filter(Boolean) : [];
}

/** Same tracing, for other modules (Module Curriculum). */
export function criterionTaskIds(pc) {
  return pc ? _criterionTaskIds(pc) : [];
}

// ── Traceability Map data (3.48.0) ─────────────────────────────
// One read-only snapshot of the whole chain, for trace_map.js:
// duty → task → competency → criterion → learning outcome → module.
// Built from the same sources and the same tracing rules as the rest
// of the tab (effective criteria, criterionTaskIds, live outcomes), so
// the map can never disagree with the coverage matrix or the handoff.
export function getTraceGraph() {
  _reconcileLearningOutcomes();
  const cd = appState.clusteringData || { clusters: [] };
  const lo = appState.learningOutcomesData || { outcomes: [] };
  const mm = appState.moduleMappingData || { modules: [] };

  const known = new Set();
  const duties = (appState.dutiesData || []).map(d => ({
    id: d.id,
    code: getDutyCode(d.id),
    title: String(d.title || '').trim(),
    tasks: (d.tasks || []).filter(t => t && t.inputId && String(t.text || '').trim()).map(t => {
      known.add(t.inputId);
      return { id: t.inputId, code: getTaskCodeShort(t.inputId), text: String(t.text).trim(),
               unselected: !isTaskSelected(t.inputId) };
    })
  })).filter(d => d.tasks.length || d.title);

  /* Tasks a competency holds that are not in the profile: added during
     clustering, or deleted from the chart and still flagged ⚠. */
  const extra = [];
  const comps = (cd.clusters || []).map((c, ci) => {
    const taskIds = [];
    (c.tasks || []).forEach(t => {
      if (!t || !t.id) return;
      taskIds.push(t.id);
      if (!known.has(t.id)) {
        known.add(t.id);
        extra.push({ id: t.id, code: isClusterAddedTaskId(t.id) ? getAddedTaskLabel() : '⚠',
                     text: String(t.text || '').trim(), added: isClusterAddedTaskId(t.id) });
      }
    });
    return { id: c.id, num: ci + 1, name: String(c.name || '').trim(), taskIds };
  });

  const crits = [];
  const critByKey = new Map();
  (cd.clusters || []).forEach((c, ci) => {
    _getClusterEffectiveCriteria(c, ci + 1).forEach(cr => {
      const text = String(cr.text || '').trim();
      if (!text || critByKey.has(cr.key)) return;
      const pc = { text, taskId: cr.taskId, clusterId: c.id };
      // A Task Analysis criterion traces to its own task only (dashed line).
      const linked = cr.source === 'ta';
      const item = { key: cr.key, id: cr.id, text, compId: c.id, source: cr.source,
                     taskIds: _criterionTaskIds(pc), linked };
      crits.push(item);
      critByKey.set(cr.key, item);
    });
  });

  const los = (lo.outcomes || []).map(o => ({
    id: o.id,
    number: o.number || '',
    statement: String(o.statement || '').trim(),
    critKeys: [...new Set((o.linkedCriteria || [])
      .filter(pc => pc && !pc.stale && pc.key && critByKey.has(pc.key)).map(pc => pc.key))]
  }));

  const mods = (mm.modules || []).map(m => ({
    id: m.id,
    ref: moduleRef(m),
    title: String(m.title || '').trim(),
    loIds: (m.learningOutcomes || []).map(o => o && o.id).filter(Boolean)
  }));

  return { duties, extra, comps, crits, los, mods };
}

function _clusterTask(taskId) {
  for (const c of (appState.clusteringData.clusters || [])) {
    const t = (c.tasks || []).find(x => x.id === taskId);
    if (t) return t;
  }
  return null;
}

/* Module Curriculum summary for the handoff (3.44.0) — only what Module
   Builder can use: credits, hours, purpose, prerequisites and outcome
   hours. null when nothing was entered for the module. */
function _curriculumSummary(module) {
  let model = null;
  try { model = getCurriculumModel(module.id); } catch (_) { model = null; }
  if (!model) return null;
  const h = model.hours;
  const loHours = {};
  (model.los || []).forEach((lo, i) => {
    const o = module.learningOutcomes[i];
    if (o && lo.hours !== '' && lo.hours != null) loHours[o.number] = Number(lo.hours);
  });
  const out = {
    credits: model.credits === '' ? null : Number(model.credits),
    totalHours: h ? h.total : null,
    hours: h ? { theory: h.parts.theory, practical: h.parts.practical, formative: h.parts.formative,
                 industryPractice: h.parts.practice, summative: h.parts.summative,
                 institutional: h.institutional, industry: h.industry } : null,
    purpose: model.purpose || '',
    prerequisites: model.prerequisites || [],
    loHours,
    programme: model.programme || '',
  };
  // 3.104.0: entry skills and the module's resource lists.
  let extra = null;
  try { extra = getCurriculumHandoff(module.id); } catch (_) { extra = null; }
  if (extra) Object.assign(out, extra);
  const empty = out.credits == null && !out.purpose && !out.prerequisites.length && !Object.keys(loHours).length && !extra;
  return empty ? null : out;
}

function _buildModuleExport(module, moduleNumber) {
  _refreshModuleOutcomes();
  renumberManualModule(module);
  const { sourceTaskIds, taskAnalysis, sourceTasks } = _collectModuleTaskAnalysis(module);
  return {
    moduleId: module.id,
    moduleNumber: `M${moduleNumber}`,
    // 3.34.0: module identity, also carried to Module Builder.
    moduleCode: getModuleCode(module),
    shortName: getModuleShortName(module),
    moduleTitle: module.title,
    // 3.133.0: typed in by hand from an existing curriculum — its outcomes
    // and criteria are not traced to the chart (absent for other modules).
    ...(module.manual ? { source: 'manual' } : {}),
    // 3.131.0: the full (official) title; '' when the module has none.
    fullTitle: (typeof module.fullTitle === 'string' ? module.fullTitle.trim() : ''),
    // Programme level (1..N) and specialisation; null / '' when unset.
    level: _moduleLevel(module),
    track: module.track || '',
    // 3.104.0: the module's category (Basic, Common, Core, Elective or
    // the programme's own), with its label as shown here.
    ...(() => { const c = getModuleCategory(module); return c ? { category: { id: c.id, label: categoryLabel(c) } } : {}; })(),
    // 3.85.0: TVQF/NQF level and its descriptors — only when the option
    // is on and the field is filled (see getNqfSettings()).
    ...(getModuleNqfLevel(module) ? { nqfLevel: getModuleNqfLevel(module) } : {}),
    ...(getModuleNqfDescriptor(module) ? { nqfDescriptor: getModuleNqfDescriptor(module) } : {}),
    learningOutcomes: module.learningOutcomes.map(o => ({
      // 3.44.0: DACUM's own outcome id, so Module Builder can update an
      // outcome it already holds instead of matching by position.
      loId: o.id,
      number: o.number,
      statement: o.statement,
      performanceCriteria: o.linkedCriteria.map(pc => ({
        id: pc.id, text: pc.text, taskId: pc.taskId || null,
        // 3.44.0: the tasks the criterion traces to (see _criterionTaskIds).
        sourceTaskIds: _criterionTaskIds(pc)
      }))
    })),
    // Raw task IDs (for Module Builder's own lookups) — the matching
    // display-ready "TASK B4" label is already on each entry in
    // taskAnalysis[id].taskCode below.
    sourceTaskIds,
    // Present even when empty, so Module Builder can tell "no Task
    // Analysis available for this module" apart from "field missing" —
    // relevant for projects created before Task Analysis existed.
    taskAnalysis,
    // 3.44.0: code + statement of each source task (analysed or not).
    sourceTasks,
    // 3.44.0: Module Curriculum summary, or null.
    curriculum: _curriculumSummary(module)
  };
}

/**
 * 3.49.0 — identity of the programme being handed off: the active DACUM
 * project's id (stable for the life of the project, also after a rename)
 * and its sidebar name. Falls back to the occupation title for the name;
 * the id is null only when no project is active, and Module Builder then
 * matches by occupation and asks.
 */
function _handoffProgramme(occupation) {
  let id = null, name = '';
  try { id = localStorage.getItem('dacum_active_project') || null; } catch (_) { id = null; }
  if (id) {
    try {
      const p = (readProjects() || []).find(x => x && x.id === id);
      if (p && p.name) name = String(p.name);
    } catch (_) { /* name is cosmetic; the id is what matters */ }
  }
  return { id, name: name || occupation || '' };
}

/**
 * Hands off to Module Builder. With no argument, transfers every
 * module ("Proceed to Module Builder" and the sidebar's Module Builder
 * button). Pass a moduleId to transfer just that one module — the
 * per-module "Build in Module Builder" buttons in renderModules(); the
 * handoff then carries that module only (3.133.0).
 * Either way the payload now also carries each module's traceable
 * source tasks and their Task Analysis content (see _buildModuleExport),
 * not just Learning Outcomes and Performance Criteria text.
 */
/* 3.97.0: open `url` in the tab called `name`, reusing it when it is
   open. A tab of another site is navigated; a blank one is filled. */
export function openNamedWindow(url, name) {
  let w = null;
  try { w = window.open('', name); } catch (_) { w = null; }
  if (!w) { window.open(url, '_blank'); return; }
  let blank = true;
  try { const h = String(w.location.href || ''); blank = !h || h === 'about:blank'; } catch (_) { blank = false; }
  if (blank) w.location.href = url;
  try { w.focus(); } catch (_) { /* ignore */ }
}

export function openModuleBuilderFromMapping(moduleId = null) {
  const occupationTitle = document.getElementById('occupationTitle')?.value || '';
  const jobTitle = document.getElementById('jobTitle')?.value || '';
  const occupation = occupationTitle || jobTitle || 'Unknown Occupation';
  _reconcileLearningOutcomes();
  const mm = appState.moduleMappingData;

  const modulesToSend = moduleId
    ? mm.modules.filter(m => m.id === moduleId)
    : mm.modules;

  if (moduleId && modulesToSend.length === 0) return;

  const programme = _handoffProgramme(occupation);

  /* 3.105.0: texts not translated yet would reach Module Builder in the
     original language only. Say so before sending; Cancel opens
     Settings → Languages to translate them first. */
  const textLang = _handoffTextLanguage();
  const missing = _handoffMissingTranslations();
  if (missing.length) {
    const list = missing.map(x => `${LANG_NAMES[x.lang] || x.lang}: ${x.missing}`).join(' · ');
    const go = window.confirm(_tf('msgMBMissingTranslations', { list, lang: LANG_NAMES[textLang] || textLang }));
    if (!go) {
      import('./export_settings.js').then(m => m.openExportSettings({ tab: 'languages' })).catch(() => {});
      return;
    }
  }

  const exportObject = {
    // 3.105.0: the language of every text below.
    contentLanguage: textLang,
    source: 'DACUM Live Pro v1.0',
    exportDate: new Date().toISOString(),
    // 3.49.0: which DACUM project these modules belong to. Module Builder
    // keeps one project per programme and uses this id to tell "more
    // modules of the same programme" from "a different programme", so two
    // programmes are never mixed in one library. Optional on the receiving
    // side: an older payload without it still imports.
    handoffVersion: 2,
    programId: programme.id,
    // 3.97.0: where this DACUM runs — Module Builder's "open in DACUM".
    dacumUrl: location.href.split('#')[0],
    programName: programme.name,
    dacumVersion: (window.DACUM_BUILD && window.DACUM_BUILD.version) || '',
    occupation,
    // 3.44.0: the remaining Chart Info fields Module Builder's cover has
    // a row for, and how modules are labelled here (code / number / both).
    occupationTitle,
    jobTitle,
    sector: document.getElementById('sector')?.value || '',
    // 3.118.0: country / context and scope of work from Chart Info, for
    // Module Builder's AI drafting of information sheets (absent when empty).
    ...(() => { const c = (document.getElementById('context')?.value || '').trim(); return c ? { context: c } : {}; })(),
    ...(() => { const s = (document.getElementById('scopeOfWork')?.value || '').trim(); return s ? { scopeOfWork: s } : {}; })(),
    labelMode: getModuleLabelMode(),
    modules: modulesToSend.map(m => _buildModuleExport(m, mm.modules.indexOf(m) + 1)),
    // Occupation-level Verified Occupational Reference Data. Always
    // present; { available:false } when the optional feature is off or
    // empty. Reference evidence only — Module Builder must not turn it
    // into learning outcomes automatically.
    occupationalReference: getSupplementaryVerificationData(),
    // 3.79.2: translations of these texts (absent without translations).
    ...(() => { const cl = _handoffLanguages(); return cl ? { contentLanguages: cl } : {}; })(),
    // 3.84.0: tasks left out of training in Task Verification, with their
    // reasons — documentation for Module Builder. Absent when every task
    // is selected (or the selection was never used).
    ...(() => { const ts = getTaskSelectionHandoff(); return ts ? { taskSelection: ts } : {}; })(),
    // 3.85.0: the qualifications framework's name, when the TVQF/NQF
    // option is on and a name was given.
    ...(() => { const n = getNqfSettings(); return n.enabled && n.framework ? { qualificationsFramework: n.framework } : {}; })(),
    // 3.104.0: programme requirements and course information (Module
    // Curriculum → Programme settings), when any was entered.
    ...(() => { let p = null; try { p = getProgrammeHandoff(); } catch (_) { p = null; } return p ? { programmeRequirements: p } : {}; })()
  };

  try {
    /* 3.133.0: what is written is exactly what was asked for — one
       module from its card's 🚀, every module from "Proceed to Module
       Builder" or the sidebar. A single module used to be merged into
       whatever the last handoff had left here, so after one "send all"
       every card's 🚀 sent every module again. Module Builder keeps one
       library per programme (programId) and adds or updates the modules
       it receives, so the others it already holds are not touched. */
    const STORAGE_KEY = 'dacum_modules_export';
    const payload = { ...exportObject, scope: moduleId ? 'module' : 'all' };
    // Diagnostic only — confirms exactly what left this tab, so a report
    // of "N modules went in, fewer came out the other side" can be
    // checked against this line instead of guessed at. Safe to remove
    // once transfer reliability is fully confirmed.
    console.log('[DACUM→ModuleBuilder] writing', payload.modules.length, 'module(s):',
      payload.modules.map(m => m.moduleId));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    // Module Builder is a separate tool/repository, not a file shipped
    // alongside this one — the relative filename this used to open only
    // ever worked if it happened to sit next to index.html on the same
    // host. Pointing at the live tool directly is what actually works
    // regardless of where DACUM Live Pro itself is hosted.
    // 3.97.0: reuse the Module Builder tab when one is open (it names
    // itself "module-builder" and imports the handoff at once, without a
    // reload); otherwise open it.
    openNamedWindow('https://hshamjawad.github.io/Module-Builder/', 'module-builder');
    showStatus(moduleId
      ? _txf('msgMBSentOne', { m: moduleRef(modulesToSend[0]) || modulesToSend[0].title || '' })
      : _txf('msgMBSentAll', { n: payload.modules.length }), 'success');
  } catch (error) {
    console.error('Error exporting to Module Builder:', error);
    showStatus(_tf('msgMBExportError', { msg: error.message }), 'error');
  }
}

export function exportModuleMappingJSON() {
  _reconcileLearningOutcomes();
  const mm = appState.moduleMappingData;
  if (!mm.modules || mm.modules.length === 0) {
    showStatus(_t('msgNoModulesToExport'), 'error');
    return;
  }

  const occupationTitle = document.getElementById('occupationTitle')?.value || '';
  const jobTitle = document.getElementById('jobTitle')?.value || '';
  const occupation = occupationTitle || jobTitle || 'Unknown Occupation';

  const exportData = {
    metadata: {
      toolName: 'DACUM Live Pro', toolVersion: '1.0',
      exportDate: new Date().toISOString(), exportType: 'Module Mapping', occupation
    },
    // Same shape _buildModuleExport() uses for the Module Builder handoff
    // (see openModuleBuilderFromMapping below) — this download used to use
    // a different, older schema (pc.description instead of pc.text, a
    // flat duplicated sourceTaskIds with no taskAnalysis at all), which
    // made this file look inconsistent with what Module Builder actually
    // received even when nothing was actually lost in the transfer.
    modules: mm.modules.map((module, i) => _buildModuleExport(module, i + 1)),
    occupationalReference: getSupplementaryVerificationData(),
    levelCount: getModuleLevelCount(),
    coverage: (() => { const c = computeCoverage(); return {
      summary: c.summary,
      criteria: c.rows.map(r => ({ id: r.id, text: r.text, taskId: r.taskId || null,
        competency: r.clusterNumber, status: r.status,
        modules: r.modules.map(m => ({ module: m.number, level: m.level, track: m.track })) })) }; })(),
    summary: {
      totalModules: mm.modules.length,
      totalLearningOutcomes: mm.modules.reduce((s, m) => s + m.learningOutcomes.length, 0),
      totalPerformanceCriteria: mm.modules.reduce((s, m) =>
        s + m.learningOutcomes.reduce((ls, o) => ls + o.linkedCriteria.length, 0), 0)
    }
  };
  const _cl = _handoffLanguages();
  if (_cl) exportData.contentLanguages = _cl;
  const _ts = getTaskSelectionHandoff();
  if (_ts) exportData.taskSelection = _ts;
  let _pr = null; try { _pr = getProgrammeHandoff(); } catch (_) { _pr = null; }
  if (_pr) exportData.programmeRequirements = _pr;   // 3.104.0
  try { exportData.curriculumMatrix = getCurriculumMatrix(); } catch (_) { /* 3.119.0 */ }

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `module-mapping-export_${dateStr}.json`;

  try {
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showStatus(_tf('msgMMExported', { file: filename }), 'success');
  } catch (error) {
    console.error('Error exporting module mapping:', error);
    showStatus(_tf('msgMMExportError', { msg: error.message }), 'error');
  }
}
