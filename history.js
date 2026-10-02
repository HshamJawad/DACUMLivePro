// ============================================================
// /history.js
// State-based Undo / Redo — professional editor behaviour.
//
// Pattern: push BEFORE change.
//   Caller saves current state into historyStack immediately
//   before mutating appState, so undo simply pops and restores.
//
// Stacks:
//   historyStack  — past states (oldest → newest), undo pops from top
//   redoStack     — undone states,                 redo pops from top
//   baselineSnapshot — hard floor; undo never crosses it
// ============================================================

import { appState }              from './state.js';
import { renderDutiesFromState } from './duties.js';

// ── Internal state ────────────────────────────────────────────

let historyStack     = [];
let redoStack        = [];
let baselineSnapshot = null;
let _restoring       = false;   // re-entrancy guard

// ── Context scope (added 3.31.1) ──────────────────────────────
// Another part of the app can lend the toolbar Undo / Redo buttons its
// own history while it is on screen — the Learning Outcomes and Module
// Mapping tabs do (modules.js). When the registered scope reports
// itself active, undo()/redo() and the button states go to it; on
// every other tab they work on the Duties & Tasks history exactly as
// before. One scope at a time; registering again replaces it.
let _scope = null;

export function registerHistoryScope(scope) {
  _scope = scope || null;
  _updateButtons();
}

/** Re-read button states (scope changed its stacks, or the tab changed). */
export function refreshHistoryButtons() { _updateButtons(); }

function _activeScope() {
  try { return _scope && _scope.isActive() ? _scope : null; } catch (_) { return null; }
}

const MAX_HISTORY = 100;

// ── Snapshot helpers ──────────────────────────────────────────

function _capture() {
  return JSON.parse(JSON.stringify({
    dutiesData:  appState.dutiesData  || [],
    dutyCount:   appState.dutyCount,
    taskCounts:  appState.taskCounts  || {},
  }));
}

function _apply(snap) {
  appState.dutiesData  = JSON.parse(JSON.stringify(snap.dutiesData));
  appState.dutyCount   = snap.dutyCount;
  appState.taskCounts  = JSON.parse(JSON.stringify(snap.taskCounts));
}

// ── Public API ────────────────────────────────────────────────

/**
 * Push the current state onto the undo stack BEFORE any mutation.
 * Clears the redo stack (a new edit invalidates redo history — like Word).
 * No-op while a restore is in progress.
 */
export function pushHistoryState() {
  if (_restoring) return;
  historyStack.push(_capture());
  // Keep within MAX_HISTORY; preserve index-0 (oldest reachable state)
  if (historyStack.length > MAX_HISTORY) historyStack.splice(1, 1);
  redoStack = [];
  _updateButtons();
}

/**
 * Record the baseline snapshot (call once from app.js after the first
 * Duty + Task are created).  Undo will never revert past this point.
 */
export function setBaseline() {
  baselineSnapshot = _capture();
  historyStack     = [];
  redoStack        = [];
  _updateButtons();
}

/**
 * Wipe both stacks and re-anchor the baseline to the current state.
 * Call after bulk operations (load-from-JSON, clear-all, AI generate).
 */
export function resetHistoryToCurrentState() {
  baselineSnapshot = _capture();
  historyStack     = [];
  redoStack        = [];
  _updateButtons();
}

/**
 * Undo one logical step.
 *   1. Save current state → redoStack  (for redo)
 *   2. Pop previous state ← historyStack
 *   3. Apply + re-render
 */
export function undo() {
  const sc = _activeScope();
  if (sc) { try { sc.undo(); } finally { _updateButtons(); } return; }
  if (historyStack.length === 0) return;   // at baseline — nothing to undo
  _restoring = true;
  try {
    redoStack.push(_capture());
    _apply(historyStack.pop());
    ensureMinimumStructure();
    renderDutiesFromState();
  } finally {
    _restoring = false;
  }
  _updateButtons();
}

/**
 * Redo one logical step.
 *   1. Save current state → historyStack  (keeps undo chain intact)
 *   2. Pop next state ← redoStack
 *   3. Apply + re-render
 */
export function redo() {
  const sc = _activeScope();
  if (sc) { try { sc.redo(); } finally { _updateButtons(); } return; }
  if (redoStack.length === 0) return;
  _restoring = true;
  try {
    historyStack.push(_capture());
    _apply(redoStack.pop());
    ensureMinimumStructure();
    renderDutiesFromState();
  } finally {
    _restoring = false;
  }
  _updateButtons();
}

/** True while an undo/redo restore is executing. */
export function isRestoring() { return _restoring; }

/**
 * Structural safeguard: guarantee ≥1 duty with ≥1 task after any restore.
 * Falls back to baselineSnapshot if state is completely empty.
 */
export function ensureMinimumStructure() {
  if (!Array.isArray(appState.dutiesData) || appState.dutiesData.length === 0) {
    if (baselineSnapshot) {
      _apply(baselineSnapshot);
    } else {
      appState.dutyCount  = 1;
      appState.taskCounts = { duty_1: 1 };
      appState.dutiesData = [{
        id: 'duty_1', num: 1, title: '',
        tasks: [{ divId: 'task_duty_1_1', inputId: 'duty_1_1', num: 1, text: '' }],
      }];
    }
    return;
  }
  // First duty must always have at least one task
  const first = appState.dutiesData[0];
  if (first.tasks.length === 0) {
    const id = first.id;
    appState.taskCounts[id] = (appState.taskCounts[id] || 0) + 1;
    const n = appState.taskCounts[id];
    first.tasks.push({
      divId:   `task_${id}_${n}`,
      inputId: `${id}_${n}`,
      num:     n,
      text:    '',
    });
  }
}

// ── Private ───────────────────────────────────────────────────

function _updateButtons() {
  const btnU = document.getElementById('btnUndo');
  const btnR = document.getElementById('btnRedo');
  const sc = _activeScope();
  if (sc) {
    let canU = false, canR = false, lu = '', lr = '';
    try { canU = !!sc.canUndo(); canR = !!sc.canRedo(); lu = sc.undoLabel() || ''; lr = sc.redoLabel() || ''; } catch (_) {}
    if (btnU) {
      btnU.disabled = !canU;
      btnU.title = canU ? `Undo: ${lu}  (Ctrl+Z)` : 'Nothing to undo  (Ctrl+Z)';
    }
    if (btnR) {
      btnR.disabled = !canR;
      btnR.title = canR ? `Redo: ${lr}  (Ctrl+Y)` : 'Nothing to redo  (Ctrl+Y)';
    }
    return;
  }
  if (btnU) {
    btnU.disabled = historyStack.length === 0;
    btnU.title    = btnU.disabled ? 'Nothing to undo  (Ctrl+Z)' : 'Undo  (Ctrl+Z)';
  }
  if (btnR) {
    btnR.disabled = redoStack.length === 0;
    btnR.title    = btnR.disabled ? 'Nothing to redo  (Ctrl+Y)' : 'Redo  (Ctrl+Y)';
  }
}

// The buttons must follow the visible tab: re-read them whenever a tab
// panel is shown or hidden, whichever code path switched it.
function _watchTabs() {
  if (typeof MutationObserver !== 'function') return;
  const panels = document.querySelectorAll('.tab-content');
  if (!panels.length) return;
  const mo = new MutationObserver(() => _updateButtons());
  panels.forEach(p => mo.observe(p, { attributes: true, attributeFilter: ['class'] }));
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _watchTabs);
  else _watchTabs();
}
