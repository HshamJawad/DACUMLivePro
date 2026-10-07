// ============================================================
// /module_curriculum.js
// "Module Curriculum CUR/CBC" tab (after Module Mapping) and the
// "Standard" toolbar export menu.
//
// Data lives in appState.moduleCurriculumData (see state.js for the
// default and the normaliser):
//
//   settings: { programmeName, hoursPerCredit, groupSize, split{…} }
//   byModule: { [moduleId]: { code, shortName, purpose, credits,
//               prerequisites[], splitOverride|null, tools[], equipment[],
//               ppe[], materials[], resources[], facilities[{item,qty}],
//               byLO: { [loId]: { context, methodology, discussion,
//                       demonstration, practice, selfDirected,
//                       assessStatements[], assessMethods[], hours } } } }
//
// Rules this file keeps:
//   • Keyed by ids, never positions. Records of a deleted module or LO
//     are not removed — they are simply not shown — so Module Mapping's
//     Undo brings the curriculum back with the module.
//   • Records are created lazily on the first edit, never on render.
//   • Hours are ALWAYS computed (credits × hours per credit, split by
//     the percentages, largest-remainder rounding so the parts add up
//     exactly to the total). There is no field to type an hour into.
//   • Modules, LOs and criteria are read, never written.
// ============================================================

import { appState, normalizeModuleCurriculumData, defaultModuleCurriculumData, CUR_DEFAULT_SPLIT } from './state.js';
import { showStatus } from './renderer.js';
import { getTaskCodeShort, isClusterAddedTaskId, getAddedTaskLabel } from './codes.js';
import { getTaskAnalysisRecord } from './task_analysis.js';
import { exportOccupationalStandardWord } from './exports_os_docx.js';
import { exportCurriculumDocx } from './exports_cur_docx.js';
import { getModuleCode, isModuleCodeManual, getModuleShortName, suggestModuleShortName, assignModuleCode, assignModuleShortName, moduleRef, criterionTaskIds } from './modules.js';
import { _DIST_GUIDE, _GUIDE, _L, _S } from './module_curriculum_text.js';


function _lang() {
  const I = window.i18n;
  const l = (I && I.getLang) ? I.getLang() : 'en';
  return _S[l] ? l : 'en';
}
function _tx(key) {
  const I = window.i18n;
  if (I && I.has && I.has(key)) return I.t(key);
  const l = _lang();
  return (_S[l] && _S[l][key]) || (_L[l] && _L[l][key]) || _S.en[key] || _L.en[key] || key;
}
function _txf(key, vars) {
  let s = _tx(key);
  if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(String(vars[k])); });
  return s;
}
/** Fixed CUR label in the current UI language (also used by the exporter). */
export function curLabel(key, vars) {
  const l = _lang();
  let s = (_L[l] && _L[l][key]) || _L.en[key] || key;
  if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(String(vars[k])); });
  return s;
}
const _isRTL = () => !!(window.i18n && window.i18n.isRTL && window.i18n.isRTL());
function _esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ── Constants ────────────────────────────────────────────────
const SPLIT_KEYS = ['theory', 'practical', 'formative', 'practice', 'summative'];
const SPLIT_LABEL = { theory: 'curTheory', practical: 'curPractical', formative: 'curFormative',
                      practice: 'curPractice', summative: 'curSummative' };
// The eight per-LO fields, in the fixed export order.
const LO_TEXT_FIELDS = [
  { key: 'context',       label: 'curContext',       ph: 'curContextPh' },
  { key: 'methodology',   label: 'curMethodology',   ph: 'curMethodPh' },
  { key: 'discussion',    label: 'curDiscussion',    ph: 'curDiscPh' },
  { key: 'demonstration', label: 'curDemonstration', ph: 'curDemoPh' },
  { key: 'practice',      label: 'curPracticeL',     ph: 'curPracPh' },
  { key: 'selfDirected',  label: 'curSelfDirected',  ph: 'curSelfPh' },
];
const RESOURCE_LISTS = [
  { key: 'tools',     label: 'curTools' },
  { key: 'equipment', label: 'curEquipment' },
  { key: 'ppe',       label: 'curPPE' },
  { key: 'materials', label: 'curMaterials' },
];
const TAB_ID = 'module-curriculum-tab';

// ── Data access ──────────────────────────────────────────────
function _data() {
  const d = appState.moduleCurriculumData;
  if (!d || typeof d !== 'object' || !d.settings || !d.byModule) {
    appState.moduleCurriculumData = normalizeModuleCurriculumData(d);
  }
  return appState.moduleCurriculumData;
}
function _settings() { return _data().settings; }
function _modules() { return (appState.moduleMappingData && appState.moduleMappingData.modules) || []; }
function _modRec(id, create) {
  const bm = _data().byModule;
  if (!bm[id] && create) bm[id] = {};
  return bm[id] || null;
}
function _loRec(modId, loId, create) {
  const m = _modRec(modId, create);
  if (!m) return null;
  if (!m.byLO || typeof m.byLO !== 'object') { if (!create) return null; m.byLO = {}; }
  if (!m.byLO[loId] && create) m.byLO[loId] = {};
  return m.byLO[loId] || null;
}
const _arr = v => Array.isArray(v) ? v : [];
const _clean = v => _arr(v).map(x => String(x == null ? '' : x).trim()).filter(Boolean);
const _str = v => String(v == null ? '' : v);

function _moduleLevel(m) {
  const n = parseInt(m && m.level, 10);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
}
function _liveLOs(module) {
  const live = new Map(((appState.learningOutcomesData || {}).outcomes || []).map(o => [o.id, o]));
  return _arr(module && module.learningOutcomes).map(o => (o && live.get(o.id)) || o).filter(Boolean);
}
function _moduleLabel(m, i) {
  const l = _moduleLevel(m);
  const ref = moduleRef(m) || `M${i + 1}`;
  const showTrack = m.track && ref.indexOf(m.track) === -1;
  const tags = [l ? _txf('lvlShort', { n: l }) : '', showTrack ? m.track : ''].filter(Boolean).join(' · ');
  return `${ref} — ${m.title || ''}${tags ? ` (${tags})` : ''}`;
}
function _effSplit(rec) {
  const o = rec && rec.splitOverride;
  return (o && typeof o === 'object') ? o : _settings().split;
}

/** Largest-remainder split: whole hours that always add up to the total.
 *  Ties go to the smaller share first (so 7.5 / 67.5 → 8 / 67), which
 *  reproduces the expert template’s own rounding. */
export function computeHours(credits, hoursPerCredit, split) {
  const c = Number(credits), h = Number(hoursPerCredit);
  if (!(c > 0) || !(h > 0)) return null;
  const sp = split || CUR_DEFAULT_SPLIT;
  const pct = SPLIT_KEYS.map(k => Math.max(0, Number(sp[k]) || 0));
  const sum = pct.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return null;
  const total = Math.round(c * h);
  const raw = pct.map(p => total * p / sum);
  const out = raw.map(r => Math.floor(r + 1e-9));
  let rem = total - out.reduce((a, b) => a + b, 0);
  const order = SPLIT_KEYS.map((_, i) => i).sort((a, b) => {
    const ra = Math.round((raw[a] - out[a]) * 1e6), rb = Math.round((raw[b] - out[b]) * 1e6);
    return (rb - ra) || (pct[a] - pct[b]) || (a - b);
  });
  for (let i = 0; rem > 0; i++, rem--) out[order[i % order.length]]++;
  const parts = {};
  SPLIT_KEYS.forEach((k, i) => { parts[k] = out[i]; });
  return {
    total, parts, pctSum: sum,
    pct: Object.fromEntries(SPLIT_KEYS.map((k, i) => [k, pct[i]])),
    institutional: parts.theory + parts.practical + parts.formative,
    industry: parts.practice + parts.summative,
  };
}
function _moduleHours(module) {
  const rec = _modRec(module.id) || {};
  return computeHours(rec.credits, _settings().hoursPerCredit, _effSplit(rec));
}

// ── Code / names ─────────────────────────────────────────────
// Since 3.34.0 the code and short name belong to the module itself
// (Module Mapping card); see the identity block in modules.js.
const _moduleCode = m => getModuleCode(m);
const _moduleShortName = m => getModuleShortName(m);
function _domVal(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function _programmeName() {
  const s = (_settings().programmeName || '').trim();
  return s || _domVal('occupationTitle') || _domVal('jobTitle');
}

// ── Occupational Standard link ───────────────────────────────
function _clusterById(id) {
  const cs = (appState.clusteringData && appState.clusteringData.clusters) || [];
  const i = cs.findIndex(c => c && c.id === id);
  return i < 0 ? null : { cluster: cs[i], number: i + 1 };
}
function _taskCode(id) {
  if (isClusterAddedTaskId(id)) return getAddedTaskLabel();
  return getTaskCodeShort(id) || '';
}
/** Per competency: PC ids and the task codes behind them, from the
 *  module's learning outcomes (in module order). */
function _osLink(module) {
  const groups = new Map();
  _liveLOs(module).forEach(o => _arr(o.linkedCriteria).forEach(pc => {
    if (!pc || pc.stale) return;
    const cl = _clusterById(pc.clusterId);
    const num = cl ? cl.number : (pc.clusterNumber || '?');
    const key = cl ? cl.cluster.id : `n${num}`;
    if (!groups.has(key)) groups.set(key, { number: num, name: cl ? cl.cluster.name : '', pcs: [], taskIds: [] });
    const g = groups.get(key);
    if (pc.id && !g.pcs.includes(pc.id)) g.pcs.push(pc.id);
    // Same tracing as the rest of the tool: a Task Analysis criterion to
    // its task, a competency criterion to every task of its competency.
    const tids = criterionTaskIds(pc);
    tids.forEach(t => { if (!g.taskIds.includes(t)) g.taskIds.push(t); });
  }));
  return [...groups.values()].sort((a, b) => a.number - b.number).map(g => ({
    ...g, tasks: g.taskIds.map(_taskCode).filter(Boolean)
  }));
}
function _osLinkLines(module) {
  return _osLink(module).map(g =>
    `${_txf('curCompetency', { n: g.number })}${g.name ? ` — ${g.name}` : ''}: ${curLabel('curPC')} ${g.pcs.join('; ')}` +
    (g.tasks.length ? ` · ${_tx('curTasksL')}: ${g.tasks.join(', ')}` : ''));
}
function _moduleTaskIds(module) {
  const ids = [];
  _osLink(module).forEach(g => g.taskIds.forEach(t => { if (!ids.includes(t)) ids.push(t); }));
  return ids;
}

// ── Completeness ─────────────────────────────────────────────
function _loFilledCount(modId, loId) {
  const r = _loRec(modId, loId) || {};
  let n = 0;
  LO_TEXT_FIELDS.forEach(f => {
    if (f.key === 'context' && r.context === undefined) { n++; return; }   // default text counts
    if (_str(r[f.key]).trim()) n++;
  });
  if (_clean(r.assessStatements).length) n++;
  if (_clean(r.assessMethods).length) n++;
  return n;
}
export function moduleCompleteness(module) {
  const rec = _modRec(module.id) || {};
  const los = _liveLOs(module);
  let filled = 0, total = 2 + 8 * los.length + RESOURCE_LISTS.length;
  if (_str(rec.purpose).trim()) filled++;
  if (Number(rec.credits) > 0) filled++;
  los.forEach(o => { filled += _loFilledCount(module.id, o.id); });
  RESOURCE_LISTS.forEach(l => { if (_clean(rec[l.key]).length) filled++; });
  return total ? Math.round(filled / total * 100) : 0;
}

// ── Persistence ──────────────────────────────────────────────
let _saveTimer = null;
function _persistNow() {
  clearTimeout(_saveTimer); _saveTimer = null;
  import('./dacum_projects.js')
    .then(m => { try { m.saveCurrentProject(); } catch (e) { console.warn('[curriculum] save failed:', e); } })
    .catch(() => {});
}
function _schedulePersist() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_persistNow, 700);
}

// ── Selection / UI state (not persisted) ─────────────────────
let _selId = null;
const _openLOs = new Set();
let _openSettings = false;
let _loSeeded = null;

function _selectedModule() {
  const mods = _modules();
  if (!mods.length) return null;
  let m = mods.find(x => x.id === _selId);
  if (!m) { m = mods[0]; _selId = m.id; }
  return m;
}

// ── Rendering ────────────────────────────────────────────────
function _root() { return document.getElementById('curRoot'); }

export function renderModuleCurriculum() {
  const root = _root();
  if (!root) return;
  _wire();
  _ensureHelpButton();
  const mods = _modules();
  if (!mods.length) {
    root.innerHTML = `
      <div class="cur-empty">
        <div class="cur-empty-icon" aria-hidden="true">📘</div>
        <h3>${_esc(_tx('curEmptyTitle'))}</h3>
        <p>${_esc(_tx('curEmptyBody'))}</p>
        <button type="button" class="btn-next-step" data-cur-action="goto-mm">📦 ${_esc(_tx('curGoMM'))}</button>
      </div>`;
    return;
  }
  const module = _selectedModule();
  const idx = mods.indexOf(module);
  if (_loSeeded !== module.id) {          // first LO open on first view of a module
    _loSeeded = module.id;
    const first = _liveLOs(module)[0];
    if (first) _openLOs.add(module.id + '|' + first.id);
  }
  const keepScroll = window.scrollY;
  root.innerHTML = `
    ${_renderTopBar(mods, module, idx)}
    ${_renderSettings()}
    ${_renderHeader(module, idx)}
    ${_renderLOs(module)}
    ${_renderResources(module)}`;
  root.querySelectorAll('textarea.cur-auto').forEach(_autoGrow);
  window.scrollTo(0, keepScroll);
}

function _renderTopBar(mods, module, idx) {
  const opts = mods.map((m, i) => {
    const p = moduleCompleteness(m);
    return `<option value="${_esc(m.id)}" ${m.id === module.id ? 'selected' : ''}>${_esc(_moduleLabel(m, i))}  ${p >= 100 ? '✓' : p + '%'}</option>`;
  }).join('');
  const p = moduleCompleteness(module);
  return `
    <div class="cur-topbar">
      <label class="cur-sel-wrap">
        <span class="cur-sel-label">${_esc(_tx('curSelModule'))}</span>
        <select class="cur-module-select" dir="auto" data-cur-action="select-module" aria-label="${_esc(_tx('curSelModule'))}">${opts}</select>
      </label>
      <div class="cur-topbar-actions">
        <button type="button" class="cur-icon-btn" data-cur-action="prev-module" ${idx <= 0 ? 'disabled' : ''}
          title="${_esc(_tx('curPrev'))}" aria-label="${_esc(_tx('curPrev'))}"><span class="rtl-flip">‹</span></button>
        <button type="button" class="cur-icon-btn" data-cur-action="next-module" ${idx >= mods.length - 1 ? 'disabled' : ''}
          title="${_esc(_tx('curNext'))}" aria-label="${_esc(_tx('curNext'))}"><span class="rtl-flip">›</span></button>
        <span class="cur-progress ${p >= 100 ? 'is-done' : ''}" id="curProgress">${p >= 100 ? '✓ ' : ''}${_esc(_txf('curComplete', { p }))}</span>
        <button type="button" class="cur-export-btn" data-cur-action="export-this">⬇ ${_esc(_tx('curExportThis'))}</button>
      </div>
    </div>`;
}

function _num(v) { const n = Number(v); return Number.isFinite(n) ? n : ''; }

function _splitSumNote(split) {
  const sum = SPLIT_KEYS.reduce((a, k) => a + (Number(split[k]) || 0), 0);
  return sum === 100
    ? `<span class="cur-sum-ok">${_esc(_txf('curSplitSum', { n: sum }))}</span>`
    : `<span class="cur-warn">⚠ ${_esc(_txf('curSplitBad', { n: sum }))}</span>`;
}

function _renderSettings() {
  const s = _settings();
  return `
    <details class="cur-card cur-settings" data-cur-details="settings" ${_openSettings ? 'open' : ''}>
      <summary class="cur-card-sum">⚙️ ${_esc(_tx('curSettings'))}
        <span class="cur-sum-meta">${_esc(_programmeName() || '')}${_programmeName() ? ' · ' : ''}${_esc(_tx('curGroup'))}: ${_esc(s.groupSize)}</span></summary>
      <div class="cur-card-body">
        <p class="cur-hint">${_esc(_tx('curSettingsHint'))}</p>
        <div class="cur-grid-3">
          <label class="cur-field cur-span-3"><span>${_esc(_tx('curProgName'))}</span>
            <input type="text" data-cs="set" data-ck="programmeName" value="${_esc(s.programmeName || '')}"
              placeholder="${_esc(_domVal('occupationTitle') || _domVal('jobTitle'))}"></label>
          <label class="cur-field"><span>${_esc(_tx('curGroup'))}</span>
            <input type="number" min="1" step="1" inputmode="numeric" class="cur-num" data-cs="set" data-ck="groupSize" value="${_esc(s.groupSize)}"></label>
        </div>
      </div>
    </details>`;
}

/* Time table (3.36.0): the ONE place for hours and percentages.
   Built once per render — inputs stay put while typing — and the
   computed numbers are refreshed in place by _updateTimeCard(). */
function _timeCard(module) {
  const rec = _modRec(module.id) || {};
  const own = !!(rec.splitOverride && typeof rec.splitOverride === 'object');
  const split = _effSplit(rec);
  const scope = own ? 'mod' : 'set';
  const hrs = _moduleHours(module);
  const v = k => (hrs ? hrs.parts[k] : '—');
  const cell = k => `<div class="cur-h-cell"><span class="cur-h-lbl">${_esc(curLabel(SPLIT_LABEL[k]))}</span>
      <span class="cur-pct-in"><input type="number" min="0" max="100" step="1" inputmode="numeric" class="cur-num cur-pct"
        data-cs="${scope}" data-ck="split.${k}" value="${_esc(_num(split[k]))}" aria-label="${_esc(curLabel(SPLIT_LABEL[k]))} %"><span>%</span></span>
      <strong data-cur-h="${k}">${v(k)}</strong></div>`;
  return `
    <div class="cur-hours-formula cur-fx">
      <label class="cur-fx-cred"><span>${_esc(_tx('curFxCredits'))}</span>
        <input type="number" min="0" step="0.5" inputmode="decimal" class="cur-num cur-fx-num" data-cs="mod" data-ck="credits"
          value="${_esc(_num(rec.credits))}" aria-label="${_esc(_tx('curCreditsL'))}" title="${_esc(_tx('curCreditsL'))}"></label>
      <span class="cur-fx-op" aria-hidden="true">×</span>
      <input type="number" min="1" step="1" inputmode="numeric" class="cur-num cur-fx-hpc" data-cs="set" data-ck="hoursPerCredit"
        value="${_esc(_settings().hoursPerCredit)}" aria-label="${_esc(_tx('curHpc'))}" title="${_esc(_tx('curHpcAll'))}">
      <span>${_esc(_tx('curFxHpc'))}</span> <strong><bdi data-cur-fxt>${hrs ? hrs.total : '—'} ${_esc(_tx('hUnit'))}</bdi></strong>
    </div>
    <small class="cur-hint cur-fx-note">${_esc(_tx('curHpcAll'))}</small>
    <div class="cur-hours-empty" data-cur-needcredits ${hrs ? 'hidden' : ''}>${_esc(_tx('curTimeNeedCredits'))}</div>
    <div class="cur-pct-scope" role="radiogroup" aria-label="${_esc(_tx('curPctScope'))}">
      <span class="cur-pct-scope-l">${_esc(_tx('curPctScope'))}</span>
      <label class="cur-check"><input type="radio" name="curPctScope" value="all" data-cur-action="pct-scope" ${own ? '' : 'checked'}><span>${_esc(_tx('curPctAll'))}</span></label>
      <label class="cur-check"><input type="radio" name="curPctScope" value="mod" data-cur-action="pct-scope" ${own ? 'checked' : ''}><span>${_esc(_tx('curPctMod'))}</span></label>
    </div>
    <div class="cur-hours">
      <div class="cur-h-group cur-h-inst">
        <div class="cur-h-head">${_esc(_tx('curInst'))} <strong><bdi data-cur-hg="institutional">${hrs ? hrs.institutional : '—'} ${_esc(_tx('hUnit'))}</bdi></strong></div>
        <div class="cur-h-row">${cell('theory')}${cell('practical')}${cell('formative')}</div>
      </div>
      <div class="cur-h-group cur-h-ind">
        <div class="cur-h-head">${_esc(_tx('curInd'))} <strong><bdi data-cur-hg="industry">${hrs ? hrs.industry : '—'} ${_esc(_tx('hUnit'))}</bdi></strong></div>
        <div class="cur-h-row">${cell('practice')}${cell('summative')}</div>
      </div>
      <div class="cur-h-total"><span>${_esc(_tx('curTotalL'))}</span><strong><bdi data-cur-hg="total">${hrs ? hrs.total : '—'} ${_esc(_tx('hUnit'))}</bdi></strong></div>
    </div>
    <div class="cur-split-note" data-cur-sumnote="time">${_splitSumNote(split)}</div>
    <small class="cur-hint">${_esc(_tx(own ? 'curPctModHint' : 'curPctAllHint'))}</small>`;
}

function _updateTimeCard(module) {
  const root = _root();
  const box = root && root.querySelector('#curHoursBox');
  if (!box) return;
  const hrs = _moduleHours(module);
  const u = ' ' + _tx('hUnit');
  const fxt = box.querySelector('[data-cur-fxt]');
  if (fxt) fxt.textContent = (hrs ? hrs.total : '—') + u;
  box.querySelectorAll('[data-cur-h]').forEach(el => { el.textContent = hrs ? hrs.parts[el.getAttribute('data-cur-h')] : '—'; });
  box.querySelectorAll('[data-cur-hg]').forEach(el => { el.textContent = (hrs ? hrs[el.getAttribute('data-cur-hg')] : '—') + u; });
  const nc = box.querySelector('[data-cur-needcredits]');
  if (nc) nc.hidden = !!hrs;
  const hpc = box.querySelector('input[data-ck="hoursPerCredit"]');
  if (hpc && document.activeElement !== hpc) hpc.value = _settings().hoursPerCredit;
}

function _renderHeader(module, idx) {
  const rec = _modRec(module.id) || {};
  const lvl = _moduleLevel(module);
  const storedCode = isModuleCodeManual(module);
  const mods = _modules();
  const prereq = _arr(rec.prerequisites);
  const others = mods.map((m, i) => ({ m, i })).filter(x => x.m.id !== module.id);
  const los = _liveLOs(module);
  const links = _osLink(module);
  return `
    <section class="cur-card">
      <h3 class="cur-sec-title">${_esc(_tx('sec1'))}</h3>
      <div class="cur-fromMM">
        <div class="cur-fromMM-head"><span>🔒 ${_esc(_tx('curFromMM'))}</span>
          <button type="button" class="cur-link-btn" data-cur-action="goto-mm">✏️ ${_esc(_tx('curEditInMM'))}</button></div>
        <dl class="cur-ro">
          <div><dt>${_esc(_tx('curTitle'))}</dt><dd>${_esc(moduleRef(module) || `M${idx + 1}`)} — ${_esc(module.title || '')}</dd></div>
          <div><dt>${_esc(_tx('curLevel'))}</dt><dd>${lvl ? _esc(curLabel('curLevelN', { n: lvl })) : `<em>${_esc(_tx('curNotSet'))}</em>`}</dd></div>
          <div><dt>${_esc(_tx('curTrack'))}</dt><dd>${module.track ? `<bdi>${_esc(module.track)}</bdi>` : `<em>${_esc(_tx('curNotSet'))}</em>`}</dd></div>
        </dl>
      </div>
      <div class="cur-grid-2">
        <label class="cur-field"><span>${_esc(_tx('curCode'))} <em class="cur-chip" ${storedCode ? 'hidden' : ''}>${_esc(_tx('curCodeAuto'))}</em></span>
          <div class="cur-inline">
            <input type="text" dir="ltr" data-cs="mod" data-ck="code" value="${_esc(getModuleCode(module))}" maxlength="40">
            <button type="button" class="cur-mini-btn" data-cur-action="suggest-code">↺ ${_esc(_tx('curCodeSuggest'))}</button>
          </div>
          <small class="cur-hint">${_esc(_tx('curCodeHint'))}</small></label>
        <label class="cur-field"><span>${_esc(_tx('curShortName'))}</span>
          <input type="text" data-cs="mod" data-ck="shortName" value="${_esc(module.shortName || '')}" placeholder="${_esc(suggestModuleShortName(module))}" maxlength="30"></label>
      </div>
      <div class="cur-filename">
        <div class="cur-grid-2">
          <label class="cur-field"><span>${_esc(_tx('curFilePrefix'))}</span>
            <input type="text" dir="ltr" data-cs="set" data-ck="filePrefix" value="${_esc(_settings().filePrefix || '')}" placeholder="CUR" maxlength="16"></label>
          <label class="cur-field"><span>${_esc(_tx('curFileLevel'))}</span>
            <select data-cs="set" data-ck="levelStyle">
              <option value="short" ${_settings().levelStyle !== 'long' ? 'selected' : ''}>L1</option>
              <option value="long" ${_settings().levelStyle === 'long' ? 'selected' : ''}>${_esc(curLabel('curLevelN', { n: 1 }))}</option>
            </select></label>
        </div>
        <div class="cur-file-preview"><span>${_esc(_tx('curFilePreview'))}</span> <bdi id="curFilePreview" dir="ltr">${_esc(curFileName(module))}</bdi></div>
        <small class="cur-hint">${_esc(_tx('curFileHint'))}</small>
      </div>
      <label class="cur-field"><span>${_esc(_tx('curPurposeL'))}</span>
        <textarea class="cur-auto" rows="2" data-cs="mod" data-ck="purpose" placeholder="${_esc(_tx('curPurposePh'))}">${_esc(rec.purpose || '')}</textarea></label>
      <div class="cur-field"><span>${_esc(_tx('curPrereqL'))}</span>
          ${others.length ? `<div class="cur-checklist" role="group" aria-label="${_esc(_tx('curPrereqL'))}">${others.map(({ m, i }) => `
            <label class="cur-check"><input type="checkbox" data-cur-prereq="${_esc(m.id)}" ${prereq.includes(m.id) ? 'checked' : ''}>
              <span><bdi>${_esc(_moduleCode(m))}</bdi> — ${_esc(m.title || '')}</span></label>`).join('')}</div>`
            : `<div class="cur-hint">${_esc(_tx('curPrereqNone'))}</div>`}
      </div>
      <div class="cur-subhead">${_esc(_tx('curTimeL'))}</div>
      <div id="curHoursBox" class="cur-timecard">${_timeCard(module)}</div>
      <div class="cur-subhead">${_esc(_tx('curOSLinkL'))}</div>
      ${links.length ? `<ul class="cur-oslink">${links.map(g => `
        <li><strong>${_esc(_txf('curCompetency', { n: g.number }))}</strong>${g.name ? ` — ${_esc(g.name)}` : ''}
          <div class="cur-oslink-ids">${_esc(curLabel('curPC'))}: ${g.pcs.map(p => `<bdi class="cur-pc">${_esc(p)}</bdi>`).join(' ')}
          ${g.tasks.length ? ` · ${_esc(_tx('curTasksL'))}: ${g.tasks.map(t => `<bdi class="cur-task">${_esc(t)}</bdi>`).join(' ')}` : ''}</div></li>`).join('')}</ul>`
        : `<div class="cur-hint">${_esc(_tx('curOSNone'))}</div>`}
      <div class="cur-subhead">${_esc(_tx('curLOListL'))}</div>
      ${los.length ? `<ol class="cur-lolist">${los.map(o => `<li><bdi class="cur-lonum">${_esc(o.number || '')}</bdi> ${_esc(o.statement || '')}</li>`).join('')}</ol>`
        : `<div class="cur-hint">${_esc(_tx('curNoLOs'))}</div>`}
    </section>`;
}

function _listEditor(scope, key, items, opts = {}) {
  const rows = _arr(items);
  const show = rows.length ? rows : [''];
  return `
    <div class="cur-list" data-cs="${scope}" data-ck="${key}" ${opts.lo ? `data-lo="${_esc(opts.lo)}"` : ''} ${opts.prefix ? `data-prefix="${_esc(opts.prefix)}"` : ''}>
      ${show.map((v, i) => `
        <div class="cur-li">
          <span class="cur-li-num">${opts.prefix ? `${_esc(opts.prefix)}-${i + 1}` : '•'}</span>
          <textarea class="cur-li-input cur-auto" rows="1" data-idx="${i}" placeholder="${_esc(opts.ph || _tx('curItemPh'))}" aria-label="${_esc(opts.label || '')} ${i + 1}">${_esc(v)}</textarea>
          <button type="button" class="cur-li-del" data-cur-action="li-del" data-idx="${i}" title="${_esc(_tx('curRemove'))}" aria-label="${_esc(_tx('curRemove'))}">✕</button>
        </div>`).join('')}
      <button type="button" class="cur-li-add" data-cur-action="li-add">＋ ${_esc(_tx('curAdd'))}</button>
    </div>`;
}

/* LO hours (3.35.1): an outcome either has hours the user typed
   (manual), or shows an AUTOMATIC value — the institutional time left
   after the manual ones, shared over the automatic outcomes in
   proportion to their performance criteria. So the field is filled by
   default as soon as the credits are known, and a typed value simply
   takes over for that outcome. Clearing a field returns it to auto. */
function _isManualHours(r) {
  return !!r && r.hours !== '' && r.hours != null && Number.isFinite(Number(r.hours));
}
function _effectiveLOHours(module) {
  const hrs = _moduleHours(module);
  const los = _liveLOs(module);
  const out = new Map();
  let manualSum = 0;
  const autos = [];
  los.forEach(o => {
    const r = _loRec(module.id, o.id);
    if (_isManualHours(r)) { out.set(o.id, { h: Number(r.hours), auto: false }); manualSum += Number(r.hours); }
    else autos.push(o);
  });
  if (autos.length) {
    if (!hrs) autos.forEach(o => out.set(o.id, { h: null, auto: true }));
    else {
      const parts = distributeHours(Math.max(0, hrs.institutional - manualSum), autos.map(_loWeight));
      autos.forEach((o, i) => out.set(o.id, { h: parts[i], auto: true }));
    }
  }
  return out;
}

function _loHoursWarn(module) {
  const hrs = _moduleHours(module);
  if (!hrs) return '';
  let sum = 0;
  _effectiveLOHours(module).forEach(v => { sum += v.h || 0; });
  if (Math.abs(sum - hrs.institutional) < 1e-9) return '';
  return `<div class="cur-warn cur-block">⚠ ${_esc(_txf('curLOHoursWarn', { a: Math.round(sum * 100) / 100, b: hrs.institutional }))}</div>`;
}

function _renderLOs(module) {
  const los = _liveLOs(module);
  return `
    <section class="cur-card">
      <h3 class="cur-sec-title">${_esc(_tx('sec2'))}</h3>
      <div id="curLOHoursWarn">${_loHoursWarn(module)}</div>
      ${los.length ? los.map((o, i) => _renderLOCard(module, o, i + 1)).join('') : `<div class="cur-hint">${_esc(_tx('curNoLOs'))}</div>`}
    </section>`;
}

function _hoursField(module, lo) {
  const eff = _effectiveLOHours(module).get(lo) || { h: null, auto: true };
  const auto = eff.auto;
  return `
        <div class="cur-field cur-hours-field">
          <span class="cur-field-label">${_esc(_tx('curLOHours'))}
            <em class="cur-chip" data-cur-hchip="${_esc(lo)}" ${auto && eff.h != null ? '' : 'hidden'}>${_esc(_tx('curHoursAuto'))}</em></span>
          <div class="cur-hours-row">
            <input type="number" min="0" step="0.5" inputmode="decimal" class="cur-num ${auto ? 'is-auto' : ''}" data-cs="lo" data-lo="${_esc(lo)}" data-ck="hours"
              value="${_esc(eff.h == null ? '' : eff.h)}" aria-label="${_esc(_tx('curLOHours'))}">
            <span class="cur-hours-tools">
              <button type="button" class="cur-mini-btn" data-cur-action="distribute-hours"
                title="${_esc(_tx('curDistTip'))}">⚖️ ${_esc(_tx('curDistBtn'))}</button>
              <button type="button" class="tab-help-btn" data-cur-action="dist-help" aria-haspopup="dialog"
                title="${_esc(_tx('curDistHelpTip'))}" aria-label="${_esc(_tx('curDistHelpTip'))}">?</button>
            </span>
          </div>
          <small class="cur-hint" data-cur-hnote="${_esc(lo)}">${_esc(eff.h == null ? _tx('curDistNeedCredits') : (auto ? _tx('curHoursAutoHint') : _tx('curHoursManualHint')))}</small>
        </div>`;
}

function _renderLOCard(module, o, n) {
  const r = _loRec(module.id, o.id) || {};
  const open = _openLOs.has(module.id + '|' + o.id);
  const filled = _loFilledCount(module.id, o.id);
  const lo = o.id;
  const textField = f => {
    const val = f.key === 'context' && r.context === undefined ? curLabel('curDefaultContext') : _str(r[f.key]);
    return `<label class="cur-field"><span>${_esc(curLabel(f.label))}</span>
      <textarea class="cur-auto" rows="${f.key === 'context' ? 1 : 2}" data-cs="lo" data-lo="${_esc(lo)}" data-ck="${f.key}"
        placeholder="${_esc(_tx(f.ph))}">${_esc(val)}</textarea></label>`;
  };
  return `
    <details class="cur-lo" data-cur-details="lo" data-lo="${_esc(lo)}" ${open ? 'open' : ''}>
      <summary class="cur-lo-sum">
        <span class="cur-lo-title"><bdi class="cur-lonum">${_esc(curLabel('curLOn', { n }))}</bdi> <span class="cur-lo-st">${_esc(o.statement || '')}</span></span>
        <span class="cur-lo-badge ${filled >= 8 ? 'is-done' : ''}" data-cur-badge="${_esc(lo)}">${_esc(_txf('curFilled', { x: filled }))}</span>
      </summary>
      <div class="cur-lo-body">
        ${LO_TEXT_FIELDS.map(textField).join('')}
        <div class="cur-field">
          <div class="cur-field-head"><span>${_esc(curLabel('curAssessStatements'))}</span>
            <button type="button" class="cur-mini-btn" data-cur-action="suggest-criteria" data-lo="${_esc(lo)}">✨ ${_esc(_tx('curSuggestCriteria'))}</button></div>
          ${_listEditor('lo', 'assessStatements', r.assessStatements, { lo, prefix: String(n), label: curLabel('curAssessStatements') })}
        </div>
        <div class="cur-field">
          <div class="cur-field-head"><span>${_esc(curLabel('curAssessMethods'))}</span></div>
          <div class="cur-chips"><span>${_esc(_tx('curMethodChips'))}</span>
            ${['mDirectObs', 'mOral', 'mPracTest', 'mProduct'].map(k =>
              `<button type="button" class="cur-chip-btn" data-cur-action="add-method" data-lo="${_esc(lo)}" data-val="${_esc(_tx(k))}">＋ ${_esc(_tx(k))}</button>`).join('')}</div>
          ${_listEditor('lo', 'assessMethods', r.assessMethods, { lo, label: curLabel('curAssessMethods') })}
        </div>
        ${_hoursField(module, lo)}
      </div>
    </details>`;
}

function _renderResources(module) {
  const rec = _modRec(module.id) || {};
  const fac = _arr(rec.facilities);
  const facRows = fac.length ? fac : [{ item: '', qty: '' }];
  return `
    <section class="cur-card">
      <div class="cur-sec-head"><h3 class="cur-sec-title">${_esc(_tx('sec3'))}</h3>
        <button type="button" class="cur-mini-btn" data-cur-action="suggest-ta">🔬 ${_esc(_tx('curSuggestTA'))}</button></div>
      <div class="cur-res-grid">
        ${RESOURCE_LISTS.map(l => `
          <div class="cur-field"><span class="cur-field-label">${_esc(curLabel(l.label))}</span>
            ${_listEditor('mod', l.key, rec[l.key], { label: curLabel(l.label) })}</div>`).join('')}
      </div>
      <div class="cur-field"><span class="cur-field-label">${_esc(curLabel('curResources'))} — ${_esc(curLabel('curLearnerGuide'))}</span>
        ${_listEditor('mod', 'resources', rec.resources, { ph: _tx('curResPh'), label: curLabel('curResources') })}</div>
      <div class="cur-field"><span class="cur-field-label" data-cur-fachead>${_esc(curLabel('curFacilities', { n: _settings().groupSize }))}</span>
        <div class="cur-fac" role="table">
          <div class="cur-fac-row cur-fac-head" role="row"><span role="columnheader">${_esc(_tx('curFacItem'))}</span><span role="columnheader">${_esc(_tx('curFacQty'))}</span><span></span></div>
          ${facRows.map((f, i) => `
            <div class="cur-fac-row" role="row">
              <textarea class="cur-auto cur-fac-item" rows="1" data-fac-idx="${i}" data-fac-key="item" aria-label="${_esc(_tx('curFacItem'))} ${i + 1}">${_esc(f.item || '')}</textarea>
              <input type="text" class="cur-fac-qty" data-fac-idx="${i}" data-fac-key="qty" value="${_esc(f.qty == null ? '' : f.qty)}" aria-label="${_esc(_tx('curFacQty'))} ${i + 1}">
              <button type="button" class="cur-li-del" data-cur-action="fac-del" data-idx="${i}" title="${_esc(_tx('curRemove'))}" aria-label="${_esc(_tx('curRemove'))}">✕</button>
            </div>`).join('')}
          <button type="button" class="cur-li-add" data-cur-action="fac-add">＋ ${_esc(_tx('curFacAdd'))}</button>
        </div>
      </div>
    </section>`;
}

function _autoGrow(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.max(ta.scrollHeight + 2, 36) + 'px';
}

/* Updates everything derived from the data (hours, badges, progress,
   option labels, warnings) WITHOUT rebuilding the inputs, so typing
   never loses focus. */
function _refreshDerived() {
  const root = _root();
  const module = _selectedModule();
  if (!root || !module) return;
  _updateTimeCard(module);
  const w = root.querySelector('#curLOHoursWarn');
  if (w) w.innerHTML = _loHoursWarn(module);
  _liveLOs(module).forEach(o => {
    const b = root.querySelector(`[data-cur-badge="${CSS.escape(o.id)}"]`);
    if (!b) return;
    const n = _loFilledCount(module.id, o.id);
    b.textContent = _txf('curFilled', { x: n });
    b.classList.toggle('is-done', n >= 8);
  });
  const p = moduleCompleteness(module);
  const pr = root.querySelector('#curProgress');
  if (pr) { pr.textContent = (p >= 100 ? '✓ ' : '') + _txf('curComplete', { p }); pr.classList.toggle('is-done', p >= 100); }
  const sel = root.querySelector('.cur-module-select');
  if (sel) {
    const mods = _modules();
    Array.from(sel.options).forEach(opt => {
      const i = mods.findIndex(m => m.id === opt.value);
      if (i < 0) return;
      const q = moduleCompleteness(mods[i]);
      opt.textContent = `${_moduleLabel(mods[i], i)}  ${q >= 100 ? '✓' : q + '%'}`;
    });
  }
  const sn = root.querySelector('[data-cur-sumnote="time"]');
  if (sn) sn.innerHTML = _splitSumNote(_effSplit(_modRec(module.id) || {}));
  // LO hours: refresh automatic values (never the field being typed in).
  const eff = _effectiveLOHours(module);
  eff.forEach((v, loId) => {
    const sel = CSS.escape(loId);
    const inp = root.querySelector(`input[data-ck="hours"][data-lo="${sel}"]`);
    if (inp && document.activeElement !== inp) inp.value = v.h == null ? '' : v.h;
    if (inp) inp.classList.toggle('is-auto', v.auto);
    const chip = root.querySelector(`[data-cur-hchip="${sel}"]`);
    if (chip) chip.hidden = !(v.auto && v.h != null);
    const note = root.querySelector(`[data-cur-hnote="${sel}"]`);
    if (note) note.textContent = v.h == null ? _tx('curDistNeedCredits') : (v.auto ? _tx('curHoursAutoHint') : _tx('curHoursManualHint'));
  });
  const fp = root.querySelector('#curFilePreview');
  if (fp) fp.textContent = curFileName(module);
  const fh = root.querySelector('[data-cur-fachead]');
  if (fh) fh.textContent = curLabel('curFacilities', { n: _settings().groupSize });
}

// ── Editing ──────────────────────────────────────────────────
function _setField(scope, key, raw, loId) {
  const module = _selectedModule();
  if (scope === 'set') {
    const s = _settings();
    if (key.startsWith('split.')) {
      const k = key.slice(6);
      s.split[k] = raw === '' ? 0 : Math.max(0, Number(raw) || 0);
    } else if (key === 'hoursPerCredit' || key === 'groupSize') {
      const n = Number(raw);
      if (n > 0) s[key] = n;
    } else {
      s[key] = raw;
    }
    return;
  }
  if (!module) return;
  if (scope === 'mod') {
    // Identity lives on the module (3.34.0): code is applied on change,
    // the short name as it is typed.
    if (key === 'code') return;
    if (key === 'shortName') { assignModuleShortName(module, raw); return; }
    const rec = _modRec(module.id, true);
    if (key.startsWith('split.')) {
      if (!rec.splitOverride) rec.splitOverride = { ..._settings().split };
      rec.splitOverride[key.slice(6)] = raw === '' ? 0 : Math.max(0, Number(raw) || 0);
    } else if (key === 'credits') {
      rec.credits = raw === '' ? '' : Math.max(0, Number(raw) || 0);
    } else {
      rec[key] = raw;
    }
    return;
  }
  if (scope === 'lo' && loId) {
    const r = _loRec(module.id, loId, true);
    if (key === 'hours') { if (raw === '') delete r.hours; else r.hours = Math.max(0, Number(raw) || 0); }
    else r[key] = raw;
  }
}

function _listTarget(listEl, create) {
  const module = _selectedModule();
  if (!module || !listEl) return null;
  const scope = listEl.getAttribute('data-cs');
  const key = listEl.getAttribute('data-ck');
  const holder = scope === 'lo' ? _loRec(module.id, listEl.getAttribute('data-lo'), create) : _modRec(module.id, create);
  if (!holder) return null;
  if (!Array.isArray(holder[key])) { if (!create) return null; holder[key] = []; }
  return { arr: holder[key], holder, key };
}

function _rerenderKeepFocus(selector) {
  renderModuleCurriculum();
  if (selector) {
    const el = document.querySelector(selector);
    if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} }
  }
}

function _listSelector(listEl, idx) {
  const scope = listEl.getAttribute('data-cs'), key = listEl.getAttribute('data-ck'), lo = listEl.getAttribute('data-lo');
  return `#curRoot .cur-list[data-cs="${scope}"][data-ck="${key}"]${lo ? `[data-lo="${CSS.escape(lo)}"]` : ''} .cur-li-input[data-idx="${idx}"]`;
}

function _addToList(holder, key, values) {
  if (!Array.isArray(holder[key])) holder[key] = [];
  const have = new Set(_clean(holder[key]).map(v => v.toLowerCase()));
  holder[key] = holder[key].filter(v => _str(v).trim());     // drop blank placeholder rows
  let added = 0;
  values.forEach(v => {
    const t = _str(v).trim();
    if (!t || have.has(t.toLowerCase())) return;
    have.add(t.toLowerCase()); holder[key].push(t); added++;
  });
  return added;
}

function _suggestFromCriteria(loId) {
  const module = _selectedModule();
  const o = module && _liveLOs(module).find(x => x.id === loId);
  if (!o) return;
  const pcs = _arr(o.linkedCriteria).filter(pc => pc && !pc.stale).map(pc => pc.text);
  if (!pcs.length) { showStatus(_tx('curSuggestCriteriaNone'), 'error'); return; }
  const r = _loRec(module.id, loId, true);
  const n = _addToList(r, 'assessStatements', pcs);
  _openLOs.add(module.id + '|' + loId);
  renderModuleCurriculum();
  _schedulePersist();
  showStatus(n ? _txf('curSuggestCriteriaDone', { n }) : _tx('curNothingNew'), n ? 'success' : 'info');
}

// ── Suggest from Task Analysis (picker) ──────────────────────
function _openTAPicker() {
  const module = _selectedModule();
  if (!module) return;
  const rec = _modRec(module.id) || {};
  const present = new Set();
  RESOURCE_LISTS.forEach(l => _clean(rec[l.key]).forEach(v => present.add(v.toLowerCase())));
  const seen = new Set();
  const items = [];
  const strip = s => _str(s).replace(/^[\s]*[•\-\*○●]\s*/, '').replace(/^[\s]*\d+[\.\)]\s*/, '').trim();
  _moduleTaskIds(module).forEach(tid => {
    const r = getTaskAnalysisRecord(tid);
    if (!r) return;
    [['toolsEquipmentMaterials', 'tools'], ['safetyOSH', 'ppe']].forEach(([src, target]) => {
      _arr(r[src]).map(strip).filter(Boolean).forEach(text => {
        const k = text.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        items.push({ text, target, already: present.has(k) });
      });
    });
  });
  if (!items.length) { showStatus(_tx('curTANone'), 'error'); return; }

  const listOpts = t => RESOURCE_LISTS.map(l => `<option value="${l.key}" ${l.key === t ? 'selected' : ''}>${_esc(curLabel(l.label))}</option>`).join('');
  const ov = _modal('curTAModal', _tx('curTATitle'), '🔬', `
      <p class="cur-modal-intro">${_esc(_tx('curTAIntro'))}</p>
      <div class="cur-ta-list">${items.map((it, i) => `
        <div class="cur-ta-row ${it.already ? 'is-done' : ''}">
          <label class="cur-check"><input type="checkbox" data-ta-i="${i}" ${it.already ? 'checked disabled' : 'checked'}>
            <span>${_esc(it.text)}${it.already ? ` <em>(${_esc(_tx('curTAAlready'))})</em>` : ''}</span></label>
          <select data-ta-target="${i}" ${it.already ? 'disabled' : ''} aria-label="${_esc(it.text)}">${listOpts(it.target)}</select>
        </div>`).join('')}</div>`,
    [{ label: _tx('curCancel'), cls: 'cur-btn-ghost', close: true },
     { label: _tx('curTAAddSel'), cls: 'cur-btn-primary', onClick: () => {
       const r = _modRec(module.id, true);
       let n = 0;
       ov.querySelectorAll('input[data-ta-i]:checked:not(:disabled)').forEach(cb => {
         const i = parseInt(cb.getAttribute('data-ta-i'), 10);
         const target = ov.querySelector(`select[data-ta-target="${i}"]`).value;
         n += _addToList(r, target, [items[i].text]);
       });
       _closeModal(ov);
       renderModuleCurriculum();
       _schedulePersist();
       showStatus(n ? _txf('curTAAdded', { n }) : _tx('curNothingNew'), n ? 'success' : 'info');
     } }]);
}

// ── Generic modal ────────────────────────────────────────────
let _lastFocus = null;
function _modal(id, title, icon, bodyHtml, buttons, opts = {}) {
  document.getElementById(id)?.remove();
  _lastFocus = document.activeElement;
  const ov = document.createElement('div');
  ov.id = id;
  ov.className = 'cur-modal-ov';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', title);
  ov.setAttribute('dir', _isRTL() ? 'rtl' : 'ltr');
  ov.innerHTML = `
    <div class="cur-modal ${opts.wide ? 'is-wide' : ''}">
      <div class="cur-modal-head"><span class="cur-modal-icon" aria-hidden="true">${icon}</span><p>${_esc(title)}</p>
        <button type="button" class="cur-modal-x" data-cur-close aria-label="${_esc(_tx('curClose'))}">✕</button></div>
      <div class="cur-modal-body">${bodyHtml}</div>
      ${buttons && buttons.length ? `<div class="cur-modal-foot">${buttons.map((b, i) =>
        `<button type="button" class="${b.cls || ''}" data-cur-btn="${i}">${_esc(b.label)}</button>`).join('')}</div>` : ''}
    </div>`;
  document.body.appendChild(ov);
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); _closeModal(ov); } };
  ov.__onKey = onKey;
  document.addEventListener('keydown', onKey, true);
  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.closest('[data-cur-close]')) { _closeModal(ov); return; }
    const b = e.target.closest('[data-cur-btn]');
    if (!b) return;
    const spec = buttons[parseInt(b.getAttribute('data-cur-btn'), 10)];
    if (spec.close) _closeModal(ov); else if (spec.onClick) spec.onClick();
  });
  const first = ov.querySelector('.cur-modal-foot button:last-child') || ov.querySelector('[data-cur-close]');
  if (first) first.focus({ preventScroll: true });
  return ov;
}
function _closeModal(ov) {
  if (!ov) return;
  if (ov.__onKey) document.removeEventListener('keydown', ov.__onKey, true);
  ov.remove();
  if (_lastFocus && document.contains(_lastFocus)) { try { _lastFocus.focus({ preventScroll: true }); } catch (_) {} }
}

// ── Distribute institutional hours over the learning outcomes (3.35.0)
// Weight = number of live performance criteria linked to each outcome
// (at least 1). Whole hours, largest remainder; a tie goes to the
// earlier outcome, so 90 h over 1 / 1 / 2 criteria → 23 / 22 / 45. A
// starting point only: the expert adjusts any value afterwards.
export function distributeHours(total, weights) {
  const T = Math.round(Number(total) || 0);
  const w = weights.map(x => Math.max(1, Number(x) || 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (!(T > 0) || !sum) return w.map(() => 0);
  const raw = w.map(x => T * x / sum);
  const out = raw.map(r => Math.floor(r + 1e-9));
  let rem = T - out.reduce((a, b) => a + b, 0);
  const order = w.map((_, i) => i).sort((a, b) =>
    (Math.round((raw[b] - out[b]) * 1e6) - Math.round((raw[a] - out[a]) * 1e6)) || (a - b));
  for (let i = 0; rem > 0; i++, rem--) out[order[i % order.length]]++;
  return out;
}
function _loWeight(o) {
  return Math.max(1, _arr(o && o.linkedCriteria).filter(pc => pc && !pc.stale).length);
}
function _distributeLOHours() {
  const module = _selectedModule();
  if (!module) return;
  const los = _liveLOs(module);
  if (!los.length) { showStatus(_tx('curNoLOs'), 'error'); return; }
  const hrs = _moduleHours(module);
  if (!hrs) { showStatus(_tx('curDistNeedCredits'), 'error'); return; }
  const hasAny = los.some(o => _isManualHours(_loRec(module.id, o.id)));
  if (hasAny && !confirm(_tx('curDistConfirm'))) return;
  los.forEach(o => { const r = _loRec(module.id, o.id); if (r) delete r.hours; });
  const parts = distributeHours(hrs.institutional, los.map(_loWeight));
  renderModuleCurriculum();
  _schedulePersist();
  showStatus('✓ ' + _txf('curDistDone', { t: hrs.institutional, list: parts.join(' + ') }), 'success');
}
function _showDistGuide() {
  const G = _DIST_GUIDE[_lang()] || _DIST_GUIDE.en;
  const body = `
    <p class="cur-modal-intro">${_esc(G.intro)}</p>
    ${G.sections.map(s => `<div class="cur-guide-sec"><p class="cur-guide-h">${s.h}</p>
      <ul>${s.items.map(it => `<li>${it}</li>`).join('')}</ul></div>`).join('')}`;
  _modal('curDistGuideModal', G.title, '⏱️', body, [{ label: _tx('curClose'), cls: 'cur-btn-primary', close: true }], { wide: true });
}

function _showGuide() {
  const G = _GUIDE[_lang()] || _GUIDE.en;
  const body = `
    <p class="cur-modal-intro">${_esc(G.intro)}</p>
    ${G.sections.map(s => `<div class="cur-guide-sec"><p class="cur-guide-h">${s.h}</p>
      <ul>${s.items.map(it => `<li>${it}</li>`).join('')}</ul></div>`).join('')}`;
  _modal('curGuideModal', G.title, '📘', body, [{ label: _tx('curClose'), cls: 'cur-btn-primary', close: true }], { wide: true });
}

function _ensureHelpButton() {
  const btn = document.getElementById('curHelpBtn');
  if (!btn) return;
  const tip = _tx('curHelpTip');
  btn.title = tip;
  btn.setAttribute('aria-label', tip);
}

// ── Clear ────────────────────────────────────────────────────
export function isModuleCurriculumEmpty() {
  const d = appState.moduleCurriculumData;
  if (!d) return true;
  const s = d.settings || {};
  const def = defaultModuleCurriculumData().settings;
  const settingsDefault = !(s.programmeName || '').trim() && !(s.filePrefix || '').trim() && s.levelStyle !== 'long' && Number(s.hoursPerCredit) === def.hoursPerCredit &&
    Number(s.groupSize) === def.groupSize && SPLIT_KEYS.every(k => Number((s.split || {})[k]) === def.split[k]);
  return settingsDefault && !Object.keys(d.byModule || {}).length;
}
/** Clear This Tab: curriculum data only — modules and LOs are untouched. */
export function clearModuleCurriculum() {
  appState.moduleCurriculumData = defaultModuleCurriculumData();
  _openLOs.clear(); _loSeeded = null;
  renderModuleCurriculum();
  _persistNow();
}

// ── Exported file name ───────────────────────────────────────
// "<prefix>_<code> <short name> <L1 | Level 1> <En|Fr|Ar>.docx", e.g.
// "CUR_CMCN 1-1 Hardware L1 En.docx". The prefix is one project-level
// setting typed by the user; code and short name come from the module
// card (Module Mapping). Only characters a file system rejects are
// removed; spaces are kept.
const _fsSafe = v => String(v || '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim();
function _filePrefix() { return _fsSafe(_settings().filePrefix) || 'CUR'; }
function _fileStem(module) {
  const lvl = _moduleLevel(module);
  const lvlPart = !lvl ? '' : (_settings().levelStyle === 'long' ? curLabel('curLevelN', { n: lvl }) : `L${lvl}`);
  return [_fsSafe(_moduleCode(module)), _fsSafe(_moduleShortName(module)), _fsSafe(lvlPart)].filter(Boolean).join(' ');
}
export function curFileName(module) {
  const lang = { en: 'En', fr: 'Fr', ar: 'Ar' }[_lang()] || 'En';
  return `${_filePrefix()}_${_fileStem(module)} ${lang}.docx`;
}

// ── Export: model for the Word builder ───────────────────────
export function getCurriculumModel(moduleId, opts = {}) {
  const mods = _modules();
  const module = mods.find(m => m.id === moduleId);
  if (!module) return null;
  const blank = !!opts.blank;
  const rec = _modRec(module.id) || {};
  const s = _settings();
  const lvl = _moduleLevel(module);
  const hrs = _moduleHours(module);
  const split = _effSplit(rec);
  const prog = _programmeName();
  const effH = _effectiveLOHours(module);
  const los = _liveLOs(module).map((o, i) => {
    const r = _loRec(module.id, o.id) || {};
    const n = i + 1;
    const txt = k => blank ? '' : _str(r[k]).trim();
    return {
      n, statement: _str(o.statement).trim(),
      context: blank ? '' : (r.context === undefined ? curLabel('curDefaultContext') : _str(r.context).trim()),
      methodology: txt('methodology'), discussion: txt('discussion'), demonstration: txt('demonstration'),
      practice: txt('practice'), selfDirected: txt('selfDirected'),
      assessStatements: blank ? [] : _clean(r.assessStatements).map((t, k) => `${n}-${k + 1} ${t}`),
      assessMethods: blank ? [] : _clean(r.assessMethods),
      hours: blank ? '' : ((effH.get(o.id) || {}).h ?? ''),
    };
  });
  const code = _moduleCode(module);
  const lang = { en: 'En', fr: 'Fr', ar: 'Ar' }[_lang()] || 'En';
  const prefix = _filePrefix();
  const fileName = curFileName(module);
  return {
    blank, rtl: _isRTL(), lang,
    code, title: _str(module.title).trim(), shortName: _moduleShortName(module),
    level: lvl, levelLabel: lvl ? String(lvl) : '',
    credits: blank ? '' : (Number(rec.credits) > 0 ? rec.credits : ''),
    purpose: blank ? '' : _str(rec.purpose).trim(),
    prerequisites: blank ? [] : _arr(rec.prerequisites)
      .map(id => mods.find(m => m.id === id)).filter(Boolean)
      .map(m => `${_moduleCode(m)} ${m.title || ''}`.trim()),
    hours: blank ? null : hrs,
    pct: Object.fromEntries(SPLIT_KEYS.map(k => [k, Number(split[k]) || 0])),
    programme: prog ? `${prog}${lvl ? ` — ${curLabel('curLevelN', { n: lvl })}` : ''}` : '',
    osLink: _osLinkLines(module),
    los,
    tools: blank ? [] : _clean(rec.tools), equipment: blank ? [] : _clean(rec.equipment),
    ppe: blank ? [] : _clean(rec.ppe), materials: blank ? [] : _clean(rec.materials),
    resources: blank ? [] : _clean(rec.resources),
    facilities: blank ? [] : _arr(rec.facilities)
      .map(f => ({ item: _str(f && f.item).trim(), qty: _str(f && f.qty).trim() })).filter(f => f.item || f.qty),
    groupSize: s.groupSize,
    fileName, filePrefix: prefix, docLabel: _fileStem(module),
    L: curLabel,
  };
}

export async function exportModuleCurriculumWord(moduleId, opts = {}) {
  // 3.79.0: the model carries some labels already resolved — build it in
  // the project's content language, the same as the document itself.
  const I = window.i18n;
  const build = () => getCurriculumModel(moduleId || (_selectedModule() || {}).id, opts);
  const model = (I && I.withContentLang) ? I.withContentLang(build) : build();
  if (!model) { showStatus(_tx('dlgNoModules'), 'error'); return false; }
  const ok = await exportCurriculumDocx(model);
  if (ok) showStatus('✓ ' + _txf('msgCurExported', { file: model.fileName }), 'success');
  return ok;
}

// ── Export dialog (one module per click — no batch) ─────────
let _blankPref = false;
export function openCurExportDialog() {
  const mods = _modules();
  const cur = _selectedModule();
  if (!mods.length) {
    _modal('curExportModal', _tx('dlgTitle'), '📘', `<p class="cur-modal-intro">${_esc(_tx('dlgNoModules'))}</p>`,
      [{ label: _tx('curClose'), cls: 'cur-btn-primary', close: true }]);
    return;
  }
  const ordered = cur ? [cur, ...mods.filter(m => m !== cur)] : mods;
  const ov = _modal('curExportModal', _tx('dlgTitle'), '📘', `
    <p class="cur-modal-intro">${_esc(_tx('dlgIntro'))}</p>
    <label class="cur-check cur-blank-opt"><input type="checkbox" id="curBlankOpt" ${_blankPref ? 'checked' : ''}>
      <span><strong>${_esc(_tx('dlgBlank'))}</strong><br><small>${_esc(_tx('dlgBlankHint'))}</small></span></label>
    <div class="cur-exp-list">${ordered.map(m => {
      const i = mods.indexOf(m), p = moduleCompleteness(m);
      return `<div class="cur-exp-row ${m === cur ? 'is-current' : ''}">
        <div class="cur-exp-name"><span>${_esc(_moduleLabel(m, i))}</span>
          <small><bdi>${_esc(_moduleCode(m))}</bdi> · ${p >= 100 ? '✓' : p + '%'}${m === cur ? ` · ${_esc(_tx('dlgCurrent'))}` : ''}</small></div>
        <button type="button" class="cur-btn-primary cur-exp-dl" data-cur-dl="${_esc(m.id)}">⬇ ${_esc(_tx('dlgDownload'))}</button>
      </div>`; }).join('')}</div>`,
    [{ label: _tx('curClose'), cls: 'cur-btn-ghost', close: true }], { wide: true });
  ov.querySelector('#curBlankOpt').addEventListener('change', e => { _blankPref = e.target.checked; });
  ov.addEventListener('click', async e => {
    const b = e.target.closest('[data-cur-dl]');
    if (!b || b.disabled) return;
    b.disabled = true;
    const ok = await exportModuleCurriculumWord(b.getAttribute('data-cur-dl'), { blank: _blankPref });
    b.disabled = false;
    if (ok) { b.classList.add('is-done'); b.textContent = '✓ ' + _tx('dlgDone'); }
  });
}

// ── "Standard" toolbar menu ──────────────────────────────────
function _closeMenu(returnFocus) {
  const m = document.getElementById('curStdMenu');
  const btn = document.getElementById('btnExportOS');
  if (m) m.remove();
  if (btn) btn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', _menuOutside, true);
  window.removeEventListener('resize', _menuResize);
  if (returnFocus && btn) btn.focus();
}
function _menuOutside(e) {
  if (e.target.closest('#curStdMenu') || e.target.closest('#btnExportOS')) return;
  _closeMenu(false);
}
function _menuResize() { _closeMenu(false); }

export function toggleStandardMenu(anchor, viaKeyboard) {
  if (document.getElementById('curStdMenu')) { _closeMenu(true); return; }
  const btn = anchor || document.getElementById('btnExportOS');
  if (!btn) return;
  const menu = document.createElement('div');
  menu.id = 'curStdMenu';
  menu.className = 'cur-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', btn.getAttribute('title') || '');
  menu.setAttribute('dir', _isRTL() ? 'rtl' : 'ltr');
  menu.innerHTML = `
    <button type="button" role="menuitem" class="cur-menu-item" data-mnu="os"><span class="cur-menu-ic cur-ic-os">OS</span>${_esc(_tx('mnuOS'))}</button>
    <button type="button" role="menuitem" class="cur-menu-item" data-mnu="cur"><span class="cur-menu-ic cur-ic-cur">CUR</span>${_esc(_tx('mnuCUR'))}</button>
    <button type="button" role="menuitem" class="cur-menu-item" aria-disabled="true" disabled data-mnu="cbc"><span class="cur-menu-ic cur-ic-cbc">CBC</span>${_esc(_tx('mnuCBC'))}<span class="cur-soon">${_esc(_tx('mnuSoon'))}</span></button>`;
  document.body.appendChild(menu);
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'true');

  // Position under the button; mirror for RTL; clamp to the viewport so
  // it never runs off a phone screen.
  const r = btn.getBoundingClientRect();
  const mw = Math.min(menu.offsetWidth || 280, window.innerWidth - 16);
  menu.style.width = mw + 'px';
  let left = _isRTL() ? r.right - mw : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  menu.style.left = left + 'px';
  menu.style.top = Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8) + 'px';

  const items = () => Array.from(menu.querySelectorAll('.cur-menu-item:not([disabled])'));
  menu.addEventListener('keydown', e => {
    const list = items(), i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); _closeMenu(true); }
    else if (e.key === 'Tab') { _closeMenu(false); }
  });
  menu.addEventListener('click', e => {
    const it = e.target.closest('.cur-menu-item');
    if (!it || it.disabled) return;
    const what = it.getAttribute('data-mnu');
    _closeMenu(false);
    if (what === 'os') exportOccupationalStandardWord();
    else if (what === 'cur') openCurExportDialog();
  });
  setTimeout(() => document.addEventListener('pointerdown', _menuOutside, true), 0);
  window.addEventListener('resize', _menuResize);
  if (viaKeyboard) items()[0].focus(); else menu.querySelector('.cur-menu-item').focus({ preventScroll: true });
}

/** Wires the toolbar button (called once from events.js). */
export function setupStandardExportMenu() {
  const btn = document.getElementById('btnExportOS');
  if (!btn || btn.__curMenu) return;
  btn.__curMenu = true;
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', e => { toggleStandardMenu(btn, e.detail === 0); });
  btn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!document.getElementById('curStdMenu')) toggleStandardMenu(btn, true); }
    if (e.key === 'Escape') _closeMenu(true);
  });
}

// ── Event wiring (delegated, once) ───────────────────────────
let _wired = false;
function _wire() {
  if (_wired) return;
  const tab = document.getElementById(TAB_ID);
  if (!tab) return;
  _wired = true;

  tab.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('textarea.cur-auto')) _autoGrow(t);
    // plain fields
    if (t.hasAttribute('data-cs') && t.hasAttribute('data-ck')) {
      _setField(t.getAttribute('data-cs'), t.getAttribute('data-ck'), t.value, t.getAttribute('data-lo'));
      _refreshDerived(); _schedulePersist(); return;
    }
    // list items
    if (t.matches('.cur-li-input')) {
      const tgt = _listTarget(t.closest('.cur-list'), true);
      if (!tgt) return;
      const i = parseInt(t.getAttribute('data-idx'), 10);
      while (tgt.arr.length <= i) tgt.arr.push('');
      tgt.arr[i] = t.value;
      _refreshDerived(); _schedulePersist(); return;
    }
    // facilities
    if (t.hasAttribute('data-fac-idx')) {
      const module = _selectedModule();
      const rec = _modRec(module.id, true);
      if (!Array.isArray(rec.facilities)) rec.facilities = [];
      const i = parseInt(t.getAttribute('data-fac-idx'), 10);
      while (rec.facilities.length <= i) rec.facilities.push({ item: '', qty: '' });
      rec.facilities[i][t.getAttribute('data-fac-key')] = t.value;
      _schedulePersist();
    }
  });

  tab.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('.cur-module-select')) {
      _selId = t.value; renderModuleCurriculum(); return;
    }
    if (t.hasAttribute('data-cur-prereq')) {
      const module = _selectedModule();
      const rec = _modRec(module.id, true);
      const set = new Set(_arr(rec.prerequisites));
      const id = t.getAttribute('data-cur-prereq');
      if (t.checked) set.add(id); else set.delete(id);
      // keep Module Mapping order
      rec.prerequisites = _modules().map(m => m.id).filter(x => set.has(x));
      _schedulePersist(); return;
    }
    if (t.matches('[data-cur-action="pct-scope"]')) {
      // "This module only" starts from the shared percentages; going back
      // to "Same for all modules" drops this module's own values.
      const module = _selectedModule();
      const rec = _modRec(module.id, true);
      rec.splitOverride = t.value === 'mod' ? { ..._settings().split } : null;
      renderModuleCurriculum(); _schedulePersist(); return;
    }
    if (t.hasAttribute('data-cs') && (t.getAttribute('data-ck') === 'hoursPerCredit' || t.getAttribute('data-ck') === 'groupSize')) {
      // an invalid value was ignored on input — show the stored one again
      t.value = _settings()[t.getAttribute('data-ck')];
    }
    if (t.hasAttribute('data-cs') && t.getAttribute('data-ck') === 'code') {
      const module = _selectedModule();
      assignModuleCode(module, t.value);
      t.value = getModuleCode(module);
      const chip = t.closest('.cur-field') && t.closest('.cur-field').querySelector('.cur-chip');
      if (chip) chip.hidden = isModuleCodeManual(module);
      _refreshDerived();
      _schedulePersist();
    }
  });

  tab.addEventListener('focusout', e => {
    if (e.target.closest && e.target.closest('#curRoot')) { if (_saveTimer) _persistNow(); }
  });

  tab.addEventListener('toggle', e => {
    const d = e.target;
    if (!d.matches || !d.matches('details[data-cur-details]')) return;
    const module = _selectedModule();
    if (d.getAttribute('data-cur-details') === 'settings') _openSettings = d.open;
    else if (module) {
      const k = module.id + '|' + d.getAttribute('data-lo');
      if (d.open) _openLOs.add(k); else _openLOs.delete(k);
    }
  }, true);

  tab.addEventListener('keydown', e => {
    const t = e.target;
    if (t.matches && t.matches('.cur-li-input') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const listEl = t.closest('.cur-list');
      const tgt = _listTarget(listEl, true);
      const i = parseInt(t.getAttribute('data-idx'), 10);
      while (tgt.arr.length <= i) tgt.arr.push('');
      tgt.arr.splice(i + 1, 0, '');
      _rerenderKeepFocus(_listSelector(listEl, i + 1));
      _schedulePersist();
    }
  });

  tab.addEventListener('click', e => {
    if (e.target.closest('#curHelpBtn')) { _showGuide(); return; }
    const b = e.target.closest('[data-cur-action]');
    if (!b || b.tagName === 'SELECT' || b.type === 'checkbox') return;
    const a = b.getAttribute('data-cur-action');
    const module = _selectedModule();
    const mods = _modules();
    if (a === 'goto-mm') { if (window.switchTab) window.switchTab('module-mapping-tab'); return; }
    if (!module) return;
    if (a === 'prev-module' || a === 'next-module') {
      const i = mods.indexOf(module) + (a === 'next-module' ? 1 : -1);
      if (mods[i]) { _selId = mods[i].id; renderModuleCurriculum(); document.querySelector('#curRoot .cur-module-select')?.focus(); }
    } else if (a === 'export-this') {
      exportModuleCurriculumWord(module.id, { blank: false });
    } else if (a === 'suggest-code') {
      assignModuleCode(module, '');
      renderModuleCurriculum(); _schedulePersist();
    } else if (a === 'suggest-criteria') {
      _suggestFromCriteria(b.getAttribute('data-lo'));
    } else if (a === 'add-method') {
      const lo = b.getAttribute('data-lo');
      const r = _loRec(module.id, lo, true);
      const n = _addToList(r, 'assessMethods', [b.getAttribute('data-val')]);
      if (n) { renderModuleCurriculum(); _schedulePersist(); } else showStatus(_tx('curNothingNew'), 'info');
    } else if (a === 'distribute-hours') {
      _distributeLOHours();
    } else if (a === 'dist-help') {
      _showDistGuide();
    } else if (a === 'suggest-ta') {
      _openTAPicker();
    } else if (a === 'li-add' || a === 'li-del') {
      const listEl = b.closest('.cur-list');
      const tgt = _listTarget(listEl, true);
      if (!tgt) return;
      if (a === 'li-add') {
        const n = Math.max(tgt.arr.length, 1);
        if (!tgt.arr.length) tgt.arr.push('');
        tgt.arr.push('');
        _rerenderKeepFocus(_listSelector(listEl, n));
      } else {
        tgt.arr.splice(parseInt(b.getAttribute('data-idx'), 10), 1);
        renderModuleCurriculum();
      }
      _schedulePersist();
    } else if (a === 'fac-add' || a === 'fac-del') {
      const rec = _modRec(module.id, true);
      if (!Array.isArray(rec.facilities)) rec.facilities = [];
      if (a === 'fac-add') {
        if (!rec.facilities.length) rec.facilities.push({ item: '', qty: '' });
        rec.facilities.push({ item: '', qty: '' });
        _rerenderKeepFocus(`#curRoot .cur-fac-item[data-fac-idx="${rec.facilities.length - 1}"]`);
      } else {
        rec.facilities.splice(parseInt(b.getAttribute('data-idx'), 10), 1);
        renderModuleCurriculum();
      }
      _schedulePersist();
    }
  });
}

// ── Global listeners ─────────────────────────────────────────
window.addEventListener('dacum:langchange', () => {
  if (_root()) renderModuleCurriculum();
  _closeMenu(false);
  const sb = document.querySelector('.dps-nav-item[data-target-tab="' + TAB_ID + '"]');
  if (sb) {
    const label = _tx('tabModuleCurriculum');
    const txt = sb.querySelector('.dps-nav-text');
    if (txt) txt.textContent = label;
    sb.setAttribute('data-tooltip', label);
  }
});
document.addEventListener('dacum:module-labels-changed', () => { if (_root()) renderModuleCurriculum(); });
document.addEventListener('dacum:project-loaded', () => {
  _selId = null; _openLOs.clear(); _loSeeded = null;
  if (_root()) renderModuleCurriculum();
});
