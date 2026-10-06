// ============================================================
// /drag_drop.js
// Drag & Drop for TASK CARDS + DUTY CARDS — Card View.
// (3.65.0: Wall View, which shared this wiring, was removed.)
//
// Uses SortableJS (loaded globally via CDN in index.html).
//
// Contract (strictly non-invasive):
//   • Does NOT modify duties.js, tasks.js, history.js or state shape
//   • Does NOT touch table view — only wires `.dcv-tasks-scroll`
//     and (new) `#dutiesContainer` Sortable
//   • Operates through a MutationObserver on `#dutiesContainer`
//     so every re-render of the duties DOM gets its Sortable
//     instances re-initialised automatically
//   • On drop, rebuilds the relevant part of appState.dutiesData
//     from DOM order (tasks, or entire duties list)
//   • Preserves identity — duty.id and task.inputId never change,
//     so verification ratings, taskMetadata, clustering references,
//     learning outcomes and module mappings remain intact after a
//     move.  Display codes (A, B, A1, A2 …) recompute automatically
//     from the new position inside renderDutiesFromState().
//
// Duty-level drag uses a dedicated handle (`.dcv-duty-drag-handle`)
// so clicking anywhere else on the duty card (textarea, ✕ button)
// works normally without triggering a drag.
// ============================================================

import { appState }             from './state.js';
import { getViewMode,
         renderDutiesFromState,
         syncAllFromDOM }        from './duties.js';
import { pushHistoryState }      from './history.js';
import { saveCurrentProject }    from './dacum_projects.js';

const INIT_FLAG       = '_dacumDragInit';
const DUTY_INIT_FLAG  = '_dacumDutyDragInit';
const GROUP_NAME      = 'dacum-tasks';

// ── Which modes get drag & drop? ────────────────────────────────
// Card View only — Table View keeps its original non-draggable rows.
function _dragEnabled() {
  return getViewMode() === 'card';
}

let _observer  = null;
let _initTimer = null;

// ── Public API ────────────────────────────────────────────────

/**
 * Wire SortableJS onto every existing `.dcv-tasks-scroll`, plus the
 * duties container itself, and attach a MutationObserver so future
 * renders are covered too.  Safe to call multiple times.
 */
export function initDragDrop() {
  if (typeof window.Sortable === 'undefined') {
    console.warn('[drag_drop] SortableJS not loaded — drag & drop disabled.');
    return;
  }

  // First pass (covers any duties already rendered on boot)
  _initDutiesContainer();
  _initAllScrolls();

  const container = document.getElementById('dutiesContainer');
  if (!container) return;

  if (_observer) return;   // already observing

  _observer = new MutationObserver(_scheduleInit);
  _observer.observe(container, { childList: true, subtree: true });
}

// ── Internals ────────────────────────────────────────────────

function _scheduleInit() {
  clearTimeout(_initTimer);
  _initTimer = setTimeout(() => {
    _initDutiesContainer();
    _initAllScrolls();
  }, 40);
}

// ── Duty-level sortable ──────────────────────────────────────

function _initDutiesContainer() {
  // Card View only — Table View keeps its original (non-draggable)
  // behaviour.
  if (!_dragEnabled()) return;

  // Sortable only sorts a container's immediate children:
  //   #dutiesContainer > .duty-row
  const container = document.getElementById('dutiesContainer');
  if (!container) return;

  // MutationObserver fires for every innerHTML re-render, which
  // replaces the container's children.  The old Sortable instance
  // was attached to the old container (still the same node), so
  // we use a flag to avoid re-creating it redundantly.  But if a
  // prior Sortable was destroyed by a foreign library, we rebuild.
  if (container[DUTY_INIT_FLAG]) {
    // Still wired — nothing to do
    return;
  }
  container[DUTY_INIT_FLAG] = true;

  window.Sortable.create(container, {
    animation:       150,
    draggable:       '.duty-row',
    handle:          '.dcv-duty-drag-handle',
    // Prevent drag from starting when user clicks on inputs, buttons,
    // or the task-scroll area (which has its own Sortable)
    filter:          '.dcv-duty-input, .dcv-close-btn, .dcv-add-btn, .dcv-task-card, '
                   + '.dcv-task-input, .dcv-add-task-btn, .dcv-tasks-scroll',
    preventOnFilter: false,
    ghostClass:      'duty-drag-ghost',
    chosenClass:     'duty-drag-chosen',
    dragClass:       'duty-drag-dragging',
    forceFallback:   false,
    fallbackOnBody:  true,
    onEnd:           _onDutyDragEnd,
  });
}

function _onDutyDragEnd(evt) {
  if (evt.oldIndex === evt.newIndex) return;

  // Capture moved duty's DOM id BEFORE re-render replaces the node
  const movedDutyId = evt.item?.id || null;

  // 1 · Flush textarea edits
  syncAllFromDOM();

  // 2 · History anchor
  pushHistoryState();

  // 3 · Re-order appState.dutiesData from new DOM order.
  //     Read from evt.to — the container the row was dropped into.
  const container = evt.to || document.getElementById('dutiesContainer');
  if (!container) return;

  const byId = {};
  (appState.dutiesData || []).forEach(d => { if (d && d.id) byId[d.id] = d; });

  const newOrder = [];
  container.querySelectorAll(':scope > .duty-row').forEach(row => {
    const dutyId = row.id;
    if (byId[dutyId]) newOrder.push(byId[dutyId]);
  });

  // Sanity: if the new order is missing duties (shouldn't happen),
  // fall back to the existing order to avoid data loss.
  if (newOrder.length === (appState.dutiesData || []).length) {
    appState.dutiesData = newOrder;
  }

  // 4 · Persist + re-render (this recomputes letters A, B, C… and
  //     also recomputes every task code A1, A2, B1, B2 …)
  try { saveCurrentProject(); } catch (_) { /* autosave will catch up */ }
  renderDutiesFromState();

  // 5 · Highlight the moved duty card briefly
  if (movedDutyId) {
    const freshRow = document.getElementById(movedDutyId);
    if (freshRow) {
      // Prefer the blue card for a cleaner visual; fall back to the row
      const target = freshRow.querySelector('.dcv-duty-card') || freshRow;
      target.classList.add('duty-moved-highlight');
      setTimeout(() => {
        const still = document.getElementById(movedDutyId);
        const stillTarget = still ? (still.querySelector('.dcv-duty-card') || still) : null;
        if (stillTarget) stillTarget.classList.remove('duty-moved-highlight');
      }, 1500);
    }
  }
}

// ── Task-level sortable (existing, unchanged) ────────────────

function _initAllScrolls() {
  // Card View only — Table View keeps its original (non-draggable)
  // behaviour.
  if (!_dragEnabled()) return;

  document.querySelectorAll('.dcv-tasks-scroll').forEach(scrollEl => {
    if (scrollEl[INIT_FLAG]) return;      // already wired
    scrollEl[INIT_FLAG] = true;

    // Extract dutyId from `tasks_${duty.id}` and expose it as a
    // data attribute so `onEnd` can read it reliably.
    const dutyId = (scrollEl.id || '').replace(/^tasks_/, '');
    if (!dutyId) return;
    scrollEl.dataset.dutyId = dutyId;

    window.Sortable.create(scrollEl, {
      group:            GROUP_NAME,          // allow cross-duty moves
      animation:        150,
      draggable:        '.dcv-task-card',    // only task cards
      filter:           '.dcv-task-input, .dcv-close-btn, .dcv-add-btn, .dcv-add-task-btn',
      preventOnFilter:  false,                // keep textarea focus + button clicks
      ghostClass:       'drag-ghost',
      chosenClass:      'drag-chosen',
      dragClass:        'drag-dragging',
      forceFallback:    false,
      fallbackOnBody:   true,
      onEnd:            _onDragEnd,
    });
  });
}

function _onDragEnd(evt) {
  const fromDutyId = evt.from?.dataset?.dutyId;
  const toDutyId   = evt.to?.dataset?.dutyId;
  if (!fromDutyId || !toDutyId) return;

  // No-op guard: same container, same index
  if (fromDutyId === toDutyId && evt.oldIndex === evt.newIndex) return;

  // Capture the moved task's divId BEFORE rerender detaches evt.item,
  // so we can re-find the NEW DOM node after renderDutiesFromState()
  // and apply the temporary highlight class.
  const movedDivId = evt.item?.id || null;

  // 1 · Capture any in-flight textarea edits into state BEFORE mutation
  syncAllFromDOM();

  // 2 · Anchor the pre-drag state for Undo
  pushHistoryState();

  // 3 · Build an inputId → task lookup from current state
  const byInputId = {};
  (appState.dutiesData || []).forEach(d => {
    (d.tasks || []).forEach(t => { byInputId[t.inputId] = t; });
  });

  // 4 · Rebuild the tasks array of every affected duty from DOM order
  const affected = fromDutyId === toDutyId
    ? [fromDutyId]
    : [fromDutyId, toDutyId];

  affected.forEach(dutyId => {
    const scrollEl = document.getElementById(`tasks_${dutyId}`);
    const duty     = (appState.dutiesData || []).find(d => d.id === dutyId);
    if (!scrollEl || !duty) return;

    const newTasks = [];
    scrollEl.querySelectorAll('.dcv-task-card [data-task-id]').forEach(input => {
      const inputId = input.getAttribute('data-task-id');
      const task    = byInputId[inputId];
      if (task) newTasks.push(task);
    });
    duty.tasks = newTasks;
  });

  // 5 · Persist + normalise DOM via the canonical render pipeline
  try { saveCurrentProject(); } catch (_) { /* autosave will catch up */ }
  renderDutiesFromState();

  // 6 · Flash a temporary highlight on the moved card (no animation)
  if (movedDivId) {
    const freshEl = document.getElementById(movedDivId);
    if (freshEl) {
      freshEl.classList.add('task-moved-highlight');
      setTimeout(() => {
        const stillThere = document.getElementById(movedDivId);
        if (stillThere) stillThere.classList.remove('task-moved-highlight');
      }, 1500);
    }
  }
}
