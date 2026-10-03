// ============================================================
// /skill_levels.js
// The columns of the Skills Level Matrix ("Employability Competencies
// by Occupational Level"), 3.40.0.
//
// They used to be four fixed keys — craftsman, skilled, semiSkilled,
// foundation — hard-wired in the matrix, the chart Word/PDF exports and
// the Occupational Standard. Projects name their levels differently
// (e.g. Chief Programmer / Technician / Assistant), so the columns are
// now project data:
//
//   appState.skillsLevelColumns = null              → the four defaults
//                               = [{ id, label }, …] → this project's own
//
//   • id     — the key under which each competency stores its tick
//              (competency.levels[id] = true). The four defaults keep
//              their historic ids, so every existing project and JSON
//              file keeps its ticks with no migration.
//   • label  — null = the default wording, translated live with the
//              interface; a string = typed by the user, kept as typed.
//
// Rules: 1 to 6 levels (Word and PDF tables stay readable); renaming
// keeps the ticks; removing a level removes its ticks. Every reader —
// matrix, exports, Occupational Standard — goes through
// getSkillLevelColumns(), so they cannot disagree.
// ============================================================

import { appState } from './state.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

export const MIN_LEVELS = 1;
export const MAX_LEVELS = 6;

/* The historic four. `ui` is the label on the matrix checkboxes and its
   legend; `exp` is the column heading in the exported documents (the two
   wordings differ slightly in some languages, and the exports must not
   change for projects that keep the defaults). */
export const DEFAULT_LEVELS = [
  { id: 'craftsman',   ui: 'lvlCraftsman',   exp: 'expCraftsman' },
  { id: 'skilled',     ui: 'lvlSkilled',     exp: 'expSkilled' },
  { id: 'semiSkilled', ui: 'lvlSemiSkilled', exp: 'expSemiSkilled' },
  { id: 'foundation',  ui: 'lvlFoundation',  exp: 'expFoundation' },
];

const _defaultOf = (id) => DEFAULT_LEVELS.find(d => d.id === id) || null;

function _stored() {
  const c = appState.skillsLevelColumns;
  return Array.isArray(c) && c.length ? c : null;
}

/** True when the project uses the four default levels, unrenamed. */
export function usesDefaultSkillLevels() {
  const c = _stored();
  if (!c) return true;
  return c.length === DEFAULT_LEVELS.length &&
         c.every((col, i) => col.id === DEFAULT_LEVELS[i].id && !(col.label && String(col.label).trim()));
}

/**
 * The columns, resolved for display and export.
 * @returns {{id, custom, isDefault, uiLabel, exportLabel}[]}
 */
export function getSkillLevelColumns() {
  const cols = _stored() || DEFAULT_LEVELS.map(d => ({ id: d.id, label: null }));
  return cols.map(col => {
    const d = _defaultOf(col.id);
    const typed = col.label != null && String(col.label).trim() ? String(col.label).trim() : '';
    return {
      id: col.id,
      custom: !!typed,
      isDefault: !!d,
      uiLabel:     typed || (d ? _t(d.ui)  : col.id),
      exportLabel: typed || (d ? _t(d.exp) : col.id),
    };
  });
}

/** A fresh `levels` object for a new competency row. */
export function emptyLevels() {
  const o = {};
  getSkillLevelColumns().forEach(c => { o[c.id] = false; });
  return o;
}

/* Copy the columns into the project before the first change, so the
   defaults (null) become explicit and editable. */
function _own() {
  if (!_stored()) appState.skillsLevelColumns = DEFAULT_LEVELS.map(d => ({ id: d.id, label: null }));
  return appState.skillsLevelColumns;
}

/* Back to null when what is left is exactly the defaults — keeps saved
   projects identical to pre-3.40 ones when nothing was really changed. */
function _normalise() {
  if (usesDefaultSkillLevels()) appState.skillsLevelColumns = null;
}

/** Number of ticks stored under one level, across the whole matrix. */
export function countSkillLevelTicks(id) {
  let n = 0;
  (appState.skillsLevelData || []).forEach(cat =>
    (cat.competencies || []).forEach(c => { if (c.levels && c.levels[id]) n++; }));
  return n;
}

/**
 * Rename a level. An empty name returns a default level to its default
 * (translated) wording; a level the user added cannot be left unnamed,
 * so an empty name is refused for it.
 * @returns {boolean} whether the name changed
 */
export function renameSkillLevel(id, name) {
  const cols = _own();
  const col = cols.find(c => c.id === id);
  if (!col) return false;
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) {
    if (!_defaultOf(id)) { _normalise(); return false; }
    col.label = null;
  } else {
    const d = _defaultOf(id);
    // Typing the default wording back in is the same as not renaming.
    col.label = (d && clean === _t(d.ui)) ? null : clean;
  }
  _normalise();
  return true;
}

/** Add a level at the end. @returns {string|null} its id, or null at the limit */
export function addSkillLevel() {
  const cols = _own();
  if (cols.length >= MAX_LEVELS) { _normalise(); return null; }
  let id;
  do { id = 'lvl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  while (cols.some(c => c.id === id));
  cols.push({ id, label: _tf('slNewLevelName', { n: cols.length + 1 }) });
  return id;
}

/** Remove a level and its ticks. @returns {boolean} false at the minimum */
export function removeSkillLevel(id) {
  const cols = _own();
  if (cols.length <= MIN_LEVELS) { _normalise(); return false; }
  const i = cols.findIndex(c => c.id === id);
  if (i < 0) { _normalise(); return false; }
  cols.splice(i, 1);
  (appState.skillsLevelData || []).forEach(cat =>
    (cat.competencies || []).forEach(c => { if (c.levels) delete c.levels[id]; }));
  _normalise();
  return true;
}

/** Ticks that "restore defaults" would remove (those under added levels). */
export function ticksLostOnRestore() {
  const keep = new Set(DEFAULT_LEVELS.map(d => d.id));
  return getSkillLevelColumns().filter(c => !keep.has(c.id))
    .reduce((n, c) => n + countSkillLevelTicks(c.id), 0);
}

/** Back to the four default levels (names follow the interface again). */
export function restoreDefaultSkillLevels() {
  const keep = new Set(DEFAULT_LEVELS.map(d => d.id));
  (appState.skillsLevelData || []).forEach(cat =>
    (cat.competencies || []).forEach(c => {
      if (!c.levels) return;
      Object.keys(c.levels).forEach(k => { if (!keep.has(k)) delete c.levels[k]; });
    }));
  appState.skillsLevelColumns = null;
}
