// ============================================================
// /duties.js
// Duty / Task creation, removal, and DOM management.
//
// Architecture: ALL mutations go to appState.dutiesData FIRST,
// then renderDutiesFromState() rebuilds the DOM from state.
// History pushes are NOT done here — that is the caller's job
// (events.js), keeping concerns cleanly separated.
//
// Card View: A second rendering mode that mirrors the same
// data-action attributes so events.js delegation works unchanged.
// View mode is persisted in localStorage under 'dacum_view_mode'.
// ============================================================

import { appState }   from './state.js';
import { showStatus } from './renderer.js';
import { getDutyLetter, getTaskCode as _codesTaskCode } from './codes.js';

/* ── i18n access ──────────────────────────────────────────────────
   Resolved lazily on every call: window.i18n is installed by a plain
   <script>, and an ES module must not assume it already exists at
   evaluation time. Falls back to the key so a missing engine degrades
   to visible-but-harmless text instead of a TypeError. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)      : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v)  : k);

/* Duty letters and task codes (A, A1, B12) are Latin and must never be
   reordered by the bidi algorithm when embedded in an Arabic sentence.
   <bdi> is the native isolate for exactly this case — no CSS required. */
const _bdi = (code) => `<bdi>${code}</bdi>`;


// ── View mode (persisted) ─────────────────────────────────────
//
// Three modes:
//   'card'  → default editable card view (with drag & drop)
//   'table' → compact table view (editable, no drag)
//   'wall'  → full-width, auto-zoom DACUM wall display — interactive
//             sticky-note-style duty/task cards (add / remove / edit /
//             drag & drop), same as Card View, just scaled to fit
//             the whole chart on screen for live workshop sessions.
//
// Wall View is NOT persisted across sessions — it's a presentation
// mode, not a work mode.  If the persisted mode is 'wall' on load,
// we silently fall back to 'card' so the user doesn't get stuck.

const LS_VIEW = 'dacum_view_mode';

export function getViewMode() {
  const m = localStorage.getItem(LS_VIEW) || 'card';
  // Never boot into wall view — it's a one-off presentation mode
  return m === 'wall' ? 'card' : m;
}

export function setViewMode(mode) {
  if (mode === 'wall') {
    // Keep the non-wall preference persisted so Exit returns to it.
    // Also tag body + container so CSS can break out of max-width, etc.
    document.body.classList.add('wall-view-active');
  } else {
    localStorage.setItem(LS_VIEW, mode);
    document.body.classList.remove('wall-view-active');
  }
}

/** Toggle Card ↔ Table (legacy single-button behaviour). */
export function toggleViewMode() {
  const cur  = getViewMode();
  const next = cur === 'card' ? 'table' : 'card';
  setViewMode(next);
  renderDutiesFromState();
  _updateToggleButton();
}

/** Switch to a specific view mode — used by the 3-button segmented control. */
export function switchToViewMode(mode) {
  if (!['card','table','wall'].includes(mode)) return;
  setViewMode(mode);
  renderDutiesFromState();
  _updateToggleButton();
}

/** Current mode including wall (getViewMode() hides wall for boot safety). */
function _activeMode() {
  return document.body.classList.contains('wall-view-active') ? 'wall' : getViewMode();
}

function _updateToggleButton() {
  const btn     = document.getElementById('btnToggleDutiesView');
  const heading = document.getElementById('dutiesViewHeading');
  const mode    = _activeMode();
  if (btn) {
    const isCard = mode === 'card';
    btn.textContent = isCard ? '📋 ' + _t('viewTable') : '🃏 ' + _t('viewCard');
    btn.className   = 'dcv-toggle-btn' + (isCard ? ' is-card' : '');
  }
  // Update segmented toggle's active button (if present)
  document.querySelectorAll('[data-view-switch]').forEach(el => {
    const target = el.getAttribute('data-view-switch');
    el.classList.toggle('is-active', target === mode);
  });
  if (heading) {
    heading.textContent = mode === 'card'  ? _t('headingCardView')
                        : mode === 'table' ? _t('headingTableView')
                        : _t('headingWallView');
  }
}

// ── DOM Renderer ──────────────────────────────────────────────

/**
 * Rebuild the entire dutiesContainer from appState.dutiesData.
 * Renders either TABLE view (original) or CARD view depending on
 * the current view mode.  Called after every state mutation and
 * after every undo/redo.
 */
export function renderDutiesFromState() {
  const container = document.getElementById('dutiesContainer');
  if (!container) return;

  _updateToggleButton();

  const mode = _activeMode();
  _setCardToolbar(mode, container);
  if (mode === 'wall')       _renderWallView(container);
  else if (mode === 'card')  _renderCardView(container);
  else                       _renderTableView(container);
}

// ── TABLE VIEW (original, unchanged) ─────────────────────────

function _renderTableView(container) {
  container.className = '';   // remove card-view-mode class
  container.innerHTML = '';

  // Show original Add Duty button, hide card Add Duty button
  _setAddDutyVisibility('table');

  (appState.dutiesData || []).forEach((duty, dutyIndex) => {
    const dutyLetter = getDutyLetter(dutyIndex);
    const dutyDiv = document.createElement('div');
    dutyDiv.className = 'duty-row';
    dutyDiv.id = duty.id;
    dutyDiv.innerHTML = `
      <div class="duty-header">
        <h4>${_tf('lblDuty', { code: _bdi(dutyLetter) })}</h4>
        <div style="display:flex;gap:10px;">
          <button class="btn-clear-section" data-action="clear-duty"   data-duty-id="${duty.id}">🗑️ ${_t('btnClear')}</button>
          <button class="btn-remove"         data-action="remove-duty"  data-duty-id="${duty.id}">🗑️ ${_t('btnRemoveDuty')}</button>
        </div>
      </div>
      <input type="text" placeholder="${_t('phEnterDutyDesc')}"
             data-duty-id="${duty.id}" value="${_esc(duty.title)}">
      <div class="task-list" id="tasks_${duty.id}"></div>
      <button class="btn-add" data-action="add-task" data-duty-id="${duty.id}">➕ ${_t('btnAddTask')}</button>
    `;
    container.appendChild(dutyDiv);

    const taskList = document.getElementById(`tasks_${duty.id}`);
    duty.tasks.forEach((task, taskIndex) => {
      const taskDiv = document.createElement('div');
      taskDiv.className = 'task-item';
      taskDiv.id = task.divId;
      taskDiv.innerHTML = `
        <span class="task-label">${_tf('lblTaskColon', { code: _bdi(dutyLetter + (taskIndex + 1)) })}</span>
        <input type="text" style="flex:1;" placeholder="${_t('phEnterTaskDesc')}"
               data-task-id="${task.inputId}" value="${_esc(task.text)}">
        <button class="btn-remove" data-action="remove-task" data-task-div-id="${task.divId}"
                title="${_t('ttRemoveTask')}" aria-label="${_t('ttRemoveTask')}">🗑️</button>
      `;
      taskList.appendChild(taskDiv);
    });
  });
}

// ── CARD VIEW ─────────────────────────────────────────────────

function _renderCardView(container) {
  container.className = 'card-view-mode';
  container.innerHTML = '';

  _setAddDutyVisibility('card');

  (appState.dutiesData || []).forEach((duty, dutyIndex) => {
    const dutyLetter = getDutyLetter(dutyIndex);
    // Outer wrapper keeps the same ID so events targeting duty.id still work
    const dutyDiv = document.createElement('div');
    dutyDiv.className = 'duty-row';
    dutyDiv.id = duty.id;

    // ── dcv-row: blue duty card + scrollable task strip ──
    const row = document.createElement('div');
    row.className = 'dcv-row';

    // ─── Blue Duty Card ───────────────────────────────────
    // Header row (drag handle + label + ✕) mirrors DACUM Lite's
    // .cv-duty-card-top: keeping the delete button INSIDE the card
    // instead of floating it off the corner means it can never be
    // clipped by an overflow:hidden ancestor, and it removes the
    // need for the old top-padding / padding-left spacing hacks.
    const dutyCard = document.createElement('div');
    dutyCard.className = 'dcv-duty-card';
    dutyCard.setAttribute('data-duty-card-id', duty.id);
    dutyCard.innerHTML = `
      <div class="dcv-card-top">
        <div class="dcv-card-top-left">
          <span class="dcv-duty-drag-handle" title="${_t('ttDragDuty')}" aria-label="${_t('ttDragDuty')}">${_DRAG_DOTS_SVG}</span>
          <span class="dcv-duty-label">${_tf('lblDuty', { code: _bdi(dutyLetter) })}</span>
        </div>
        <div class="dcv-card-top-right">
          <button class="dcv-add-btn" data-action="add-duty"
                  title="${_t('ttAddDuty')}" aria-label="${_t('ttAddDuty')}">＋</button>
          <button class="dcv-close-btn" data-action="remove-duty" data-duty-id="${duty.id}"
                  title="${_t('ttRemoveDuty')}" aria-label="${_t('ttRemoveDuty')}">✕</button>
        </div>
      </div>
      <textarea class="dcv-duty-input"
                data-duty-id="${duty.id}"
                placeholder="${_t('phEnterDuty')}"
                rows="2">${_esc(duty.title)}</textarea>
    `;
    row.appendChild(dutyCard);

    // ─── Tasks area: scroll strip + add button ────────────
    const tasksArea = document.createElement('div');
    tasksArea.className = 'dcv-tasks-area';

    const tasksScroll = document.createElement('div');
    tasksScroll.className = 'dcv-tasks-scroll';
    tasksScroll.id = `tasks_${duty.id}`;

    duty.tasks.forEach((task, taskIndex) => {
      tasksScroll.appendChild(_makeTaskCard(task, `${dutyLetter}${taskIndex + 1}`, duty.id));
    });

    // ── Add Task button lives INSIDE the scroll strip ──
    const addTaskBtn = document.createElement('button');
    addTaskBtn.className = 'dcv-add-task-btn';
    addTaskBtn.setAttribute('data-action', 'add-task');
    addTaskBtn.setAttribute('data-duty-id', duty.id);
    addTaskBtn.innerHTML = '＋ ' + _t('btnAddTaskShort');
    tasksScroll.appendChild(addTaskBtn);   // ← inside scroll, moves with cards

    tasksArea.appendChild(tasksScroll);
    row.appendChild(tasksArea);

    dutyDiv.appendChild(row);
    container.appendChild(dutyDiv);
  });

  _applyCardZoom(container);
}

function _makeTaskCard(task, displayCode, dutyId) {
  const card = document.createElement('div');
  card.className = 'dcv-task-card';
  card.id = task.divId;
  card.innerHTML = `
    <div class="dcv-card-top">
      <div class="dcv-card-top-left">
        <span class="dcv-task-drag-handle" title="${_t('ttDragTask')}" aria-label="${_t('ttDragTask')}">${_DRAG_DOTS_SVG}</span>
        <span class="dcv-task-label">${_tf('lblTask', { code: _bdi(displayCode) })}</span>
      </div>
      <div class="dcv-card-top-right">
        <button class="dcv-add-btn" data-action="add-task" data-duty-id="${dutyId}"
                title="${_t('ttAddTask')}" aria-label="${_t('ttAddTask')}">＋</button>
        <button class="dcv-close-btn" data-action="remove-task" data-task-div-id="${task.divId}"
                title="${_t('ttRemoveTask')}" aria-label="${_t('ttRemoveTask')}">✕</button>
      </div>
    </div>
    <textarea class="dcv-task-input"
              data-task-id="${task.inputId}"
              placeholder="${_t('phEnterTask')}"
              rows="2">${_esc(task.text)}</textarea>
  `;
  return card;
}

// ── CARD VIEW TOOLBAR (3.62.0) ────────────────────────────────
// The Wall View tools — zoom out / in, reset, print, fullscreen — for
// Card View. The bar lives OUTSIDE #dutiesContainer, just above it:
// drag_drop.js sorts #dutiesContainer's direct children in Card View
// and observes it for re-renders, so nothing foreign may sit inside.
// Zoom is CSS `zoom` on each .duty-row (via --cv-zoom), so cards keep
// their own layout and drag & drop is untouched.

const SS_CARD_ZOOM   = 'dacum_card_zoom';
const CARD_ZOOM_MIN  = 0.5;
const CARD_ZOOM_MAX  = 1.5;

function _getCardZoom() {
  let raw = null;
  try { raw = sessionStorage.getItem(SS_CARD_ZOOM); } catch (_) {}
  const n = raw ? parseFloat(raw) : 1;
  return (isFinite(n) && n >= CARD_ZOOM_MIN && n <= CARD_ZOOM_MAX) ? n : 1;
}

function _setCardZoom(z) {
  const clamped = Math.round(Math.max(CARD_ZOOM_MIN, Math.min(CARD_ZOOM_MAX, z)) * 100) / 100;
  try { sessionStorage.setItem(SS_CARD_ZOOM, String(clamped)); } catch (_) {}
  return clamped;
}

function _applyCardZoom(container) {
  const z = _getCardZoom();
  (container || document.getElementById('dutiesContainer'))?.style.setProperty('--cv-zoom', String(z));
  const pct = document.querySelector('#cardViewToolbar .wv-zoom-pct');
  if (pct) pct.textContent = `${Math.round(z * 100)}%`;
  const out = document.querySelector('#cardViewToolbar [data-cv-action="zoom-out"]');
  const inn = document.querySelector('#cardViewToolbar [data-cv-action="zoom-in"]');
  if (out) out.disabled = z <= CARD_ZOOM_MIN;
  if (inn) inn.disabled = z >= CARD_ZOOM_MAX;
  _syncCardExitButton();
}

/* Exit is live while there is something to leave: fullscreen, or a
   zoom other than 100 %. */
function _syncCardExitButton() {
  const b = document.querySelector('#cardViewToolbar [data-cv-action="exit"]');
  if (b) b.disabled = !document.fullscreenElement && _getCardZoom() === 1;
}

function _cardToolbarHtml() {
  const fs = !!document.fullscreenElement;
  const canExit = fs || _getCardZoom() !== 1;
  return `
    <div class="wv-left">
      <button type="button" class="wv-btn wv-btn-exit" data-cv-action="exit" title="${_t('ttCvExit')}"${canExit ? '' : ' disabled'}>✕ ${_t('wvExit')}</button>
    </div>
    <div class="wv-center">
      <button type="button" class="wv-btn" data-cv-action="zoom-out" title="${_t('ttWvZoomOut').replace(/\s*\(.*\)$/, '')}" aria-label="${_t('ttWvZoomOut').replace(/\s*\(.*\)$/, '')}">🔍−</button>
      <span class="wv-zoom-pct" aria-live="polite">100%</span>
      <button type="button" class="wv-btn" data-cv-action="zoom-in" title="${_t('ttWvZoomIn').replace(/\s*\(.*\)$/, '')}" aria-label="${_t('ttWvZoomIn').replace(/\s*\(.*\)$/, '')}">🔍+</button>
      <button type="button" class="wv-btn" data-cv-action="zoom-reset" title="${_t('ttCvZoomReset')}">⟲ ${_t('wvReset')}</button>
    </div>
    <div class="wv-right">
      <button type="button" class="wv-btn" data-cv-action="print" title="${_t('ttCvPrint')}">🖨 ${_t('wvPrint')}</button>
      <button type="button" class="wv-btn${fs ? ' is-on' : ''}" data-cv-action="fullscreen" title="${_t('ttWvFullscreen')}" aria-pressed="${fs}">🖥 ${_t('wvFullscreen')}</button>
    </div>`;
}

function _setCardToolbar(mode, container) {
  let bar = document.getElementById('cardViewToolbar');
  if (mode !== 'card') {
    if (bar) bar.style.display = 'none';
    if (container) container.style.removeProperty('--cv-zoom');
    if (document.body.classList.contains('card-view-fullscreen')) _exitFullscreen();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cardViewToolbar';
    bar.className = 'wall-toolbar cv-toolbar';
    bar.setAttribute('role', 'toolbar');
    if (container && container.parentNode) container.parentNode.insertBefore(bar, container);
    bar.addEventListener('click', _onCardToolbarClick);
  }
  /* Rebuilt on every render so labels follow a language switch. */
  bar.innerHTML = _cardToolbarHtml();
  bar.setAttribute('aria-label', _t('ariaCvToolbar'));
  bar.style.display = '';
}

function _onCardToolbarClick(e) {
  const btn = e.target.closest('[data-cv-action]');
  if (!btn || btn.disabled) return;
  switch (btn.getAttribute('data-cv-action')) {
    case 'zoom-in':    _setCardZoom(_getCardZoom() + 0.1); _applyCardZoom(); break;
    case 'zoom-out':   _setCardZoom(_getCardZoom() - 0.1); _applyCardZoom(); break;
    case 'zoom-reset': _setCardZoom(1);                    _applyCardZoom(); break;
    case 'print':      _printCardView(); break;
    case 'fullscreen': _toggleCardFullscreen(); break;
    case 'exit':
      _setCardZoom(1); _applyCardZoom();
      if (document.fullscreenElement) _exitFullscreen();
      break;
  }
}

function _printCardView() {
  _populatePrintHeader();
  document.body.classList.add('card-view-printing');
  const done = () => {
    document.body.classList.remove('card-view-printing');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  /* Chromium's print() blocks until the dialog closes; afterprint has
     already fired by now. The timeout covers browsers where it has not. */
  setTimeout(done, 1500);
}

function _toggleCardFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement) { _exitFullscreen(); return; }
  if (!root.requestFullscreen) return;
  document.body.classList.add('card-view-fullscreen');
  root.requestFullscreen()
    .then(() => {
      _syncCardFsButton();
      window.scrollTo(0, 0);
      const c = document.getElementById('dutiesContainer');
      if (c) c.scrollTop = 0;
    })
    .catch(() => { document.body.classList.remove('card-view-fullscreen'); });
}

function _syncCardFsButton() {
  const b = document.querySelector('#cardViewToolbar [data-cv-action="fullscreen"]');
  if (!b) return;
  const on = !!document.fullscreenElement;
  b.classList.toggle('is-on', on);
  b.setAttribute('aria-pressed', String(on));
  _syncCardExitButton();
}

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) document.body.classList.remove('card-view-fullscreen');
    _syncCardFsButton();
  });
}

// ── Add Duty button visibility ────────────────────────────────

function _setAddDutyVisibility(mode) {
  const orig   = document.getElementById('btnAddDuty');
  let   cardBtn = document.getElementById('btnAddDutyCard');

  // Card View AND Wall View both need the floating "＋ Add Duty"
  // button — Wall View is no longer read-only (see _renderWallView):
  // its duty/task cards carry the same add/remove/drag affordances
  // as Card View, so the trainer can build the chart directly on
  // the wall during a live session.
  if (mode === 'card' || mode === 'wall') {
    if (orig) orig.style.display = 'none';
    if (!cardBtn) {
      cardBtn           = document.createElement('button');
      cardBtn.id        = 'btnAddDutyCard';
      cardBtn.className = 'dcv-add-duty-btn';
      // Insert after dutiesContainer
      const container = document.getElementById('dutiesContainer');
      if (container && container.parentNode) {
        container.parentNode.insertBefore(cardBtn, container.nextSibling);
      }
      // Wire ONCE with onclick — never accumulates extra listeners
      cardBtn.onclick = () => addDuty();
    }

    /* Label set on EVERY call, not only at creation. This button is
       created once and then merely shown/hidden, so it is invisible to
       both translation passes: applyTranslations() skips it (no
       data-i18n, since it has no markup in index.html) and a re-render
       does not rebuild it. Setting the text inside the creation branch
       froze it in whichever language happened to be active the first
       time Card or Wall view was opened. */
    cardBtn.innerHTML = '＋ ' + _t('btnAddDuty');

    cardBtn.style.display = 'inline-flex';
  } else {
    if (orig)    orig.style.display    = '';
    if (cardBtn) cardBtn.style.display = 'none';
  }
}

// ── State sync helpers (called from events.js input handler) ──

/**
 * Sync a duty title from a live DOM input/textarea into appState.
 * Works for both table view (input) and card view (textarea).
 */
export function syncDutyTitle(dutyId, value) {
  const duty = (appState.dutiesData || []).find(d => d.id === dutyId);
  if (duty) duty.title = value;
}

/**
 * Sync a task text from a live DOM input/textarea into appState.
 */
export function syncTaskText(taskInputId, value) {
  for (const duty of (appState.dutiesData || [])) {
    const task = duty.tasks.find(t => t.inputId === taskInputId);
    if (task) { task.text = value; return; }
  }
}

/**
 * Walk every visible duty/task input OR textarea in the DOM and flush
 * values into appState.dutiesData.  Works for both view modes.
 */
export function syncAllFromDOM() {
  // duty inputs (table) and textareas (card)
  document.querySelectorAll('input[data-duty-id], textarea[data-duty-id]').forEach(el => {
    syncDutyTitle(el.getAttribute('data-duty-id'), el.value);
  });
  // task inputs (table) and textareas (card)
  document.querySelectorAll('input[data-task-id], textarea[data-task-id]').forEach(el => {
    syncTaskText(el.getAttribute('data-task-id'), el.value);
  });
}

// ── Structural mutations (pure state + re-render, NO history) ─

export function addDuty() {
  if (appState.dutyCount === 0) appState.dutiesData = [];
  appState.dutyCount++;
  const dutyId = `duty_${appState.dutyCount}`;

  // Every duty is born with one empty task card.
  // Rationale: a duty with zero tasks has no task card to click "＋"
  // on, and in Wall View an empty duty row collapses to a bare strip
  // with nothing to drag or type into. Seeding one task keeps every
  // duty immediately usable in all three views. Uses the exact same
  // id scheme + taskCounts bookkeeping as addTask() so the two stay
  // interchangeable (no duplicate ids, correct numbering afterwards).
  appState.taskCounts[dutyId] = 1;
  const firstTask = {
    divId:   `task_${dutyId}_1`,
    inputId: `${dutyId}_1`,
    num:     1,
    text:    '',
  };

  appState.dutiesData.push({
    id:    dutyId,
    num:   appState.dutyCount,
    title: '',
    tasks: [firstTask],
  });
  renderDutiesFromState();
}

export function removeDuty(dutyId) {
  syncAllFromDOM();
  appState.dutiesData = (appState.dutiesData || []).filter(d => d.id !== dutyId);
  renderDutiesFromState();
}

export function addTask(dutyId) {
  if (!appState.taskCounts[dutyId]) appState.taskCounts[dutyId] = 0;
  appState.taskCounts[dutyId]++;
  const n       = appState.taskCounts[dutyId];
  const divId   = `task_${dutyId}_${n}`;
  const inputId = `${dutyId}_${n}`;

  const duty = (appState.dutiesData || []).find(d => d.id === dutyId);
  if (duty) duty.tasks.push({ divId, inputId, num: n, text: '' });

  renderDutiesFromState();
}

export function removeTask(taskDivId) {
  syncAllFromDOM();
  for (const duty of (appState.dutiesData || [])) {
    const idx = duty.tasks.findIndex(t => t.divId === taskDivId);
    if (idx !== -1) { duty.tasks.splice(idx, 1); break; }
  }
  renderDutiesFromState();
}

export function clearDuty(dutyId) {
  // Same reasoning as _confirmClear in projects.js: an empty duty has
  // nothing to lose, so warning about losing it is false and trains the
  // user to dismiss the prompt unread.
  syncAllFromDOM();
  const existing = (appState.dutiesData || []).find(d => d.id === dutyId);
  const isBlank  = !existing || (!(existing.title || '').trim() && !(existing.tasks || []).length);

  if (isBlank) {
    showStatus(_t('msgDutyAlreadyEmpty'), 'success');
    return;
  }
  if (!confirm(_t('confirmClearDuty'))) return;
  existing.title = '';
  existing.tasks = [];
  appState.taskCounts[dutyId] = 0;
  renderDutiesFromState();
  showStatus(_t('msgDutyCleared') + ' ✓', 'success');
}

// ── Utility (unchanged public API) ───────────────────────────
//
// getTaskCode() is kept as a named re-export from ./codes.js for
// backward compatibility — the new implementation reads the live
// position from appState.dutiesData so it stays correct after a
// drag & drop reorder.  Old callers keep working without change.
export function getTaskCode(taskInputId) {
  return _codesTaskCode(taskInputId);
}

export function extractDutiesAndTasks() {
  const result = {};
  for (const duty of (appState.dutiesData || [])) {
    const tasks = duty.tasks
      .filter(t => t.text.trim())
      .map(t => ({ id: t.inputId, text: t.text }));
    if (duty.title.trim() || tasks.length > 0) {
      result[duty.id] = { title: duty.title, tasks };
    }
  }
  return result;
}

// ── Private helpers ───────────────────────────────────────────

function _esc(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── WALL VIEW (interactive, full-width, auto-zoom) ────────────
//
// Horizontal layout per duty: blue duty card on the left, yellow
// sticky-note-style task cards flowing to the right.  Tasks wrap
// onto multiple rows within the duty row when they exceed viewport
// width — no horizontal scrollbar pollution.
//
// Auto-zoom runs on each render: computes a base font-size + card
// width from the largest task row and the viewport.  A sessionStorage
// multiplier lets the user override via 🔍+ / 🔍− buttons; it does
// NOT cross sessions.
//
// Editing is fully enabled (as of the sticky-note redesign): each
// duty/task card is the SAME .dcv-duty-card / .dcv-task-card markup
// Card View uses (see _makeWallDutyCard / _makeWallTaskCard below),
// just visually scaled down via the --wv-* CSS custom properties.
// Because events.js's click/input delegation and drag_drop.js's
// SortableJS wiring both key off those class names + data-action
// attributes rather than the active view mode, add / remove / edit /
// drag-and-drop all work here automatically — see drag_drop.js's
// `_dragEnabled()` guard, which now also allows Wall View.

const SS_WALL_ZOOM = 'dacum_wall_zoom';

// Zoom-out now reaches 25% so a very large chart can be shown whole on
// a projector or smartboard.
const WALL_ZOOM_MIN = 0.25;
const WALL_ZOOM_MAX = 1.5;

/**
 * Readability compensation.
 *
 * Zooming out shrinks the cards, but text has a hard floor: below
 * roughly 9-10px nothing is readable from the back of a room, and at
 * 25% a linear scale would give ~3px — a grey smudge. So the FONT is
 * deliberately scaled less aggressively than the LAYOUT.
 *
 * The compensation grows as the zoom drops (none at 100%, strongest at
 * 25%), which is exactly the trade a facilitator wants: at low zoom
 * they are looking for structure and want the words still legible, and
 * they accept that cards hold fewer words per line to buy it.
 *
 * Zooming IN is left untouched (factor 1) — text there is already
 * comfortable and inflating it further would just waste card space.
 */
function _fontZoomFactor(zoom) {
  if (zoom >= 1) return zoom;
  // Geometric blend: at 25% the layout is at 0.25 but the font sits
  // near 0.5, at 50% the font sits near 0.7, at 75% near 0.87.
  return Math.sqrt(zoom);
}

/**
 * Zoom step. Finer below 50% because the same 10 points of zoom is a
 * far bigger visual jump down there — and because a flat 0.1 step
 * skips straight from 30% to the 25% floor.
 */
function _zoomStep(current, dir) {
  const step = current <= 0.5 ? 0.05 : 0.1;
  return Math.round((current + (dir * step)) * 100) / 100;
}

function _getWallZoom() {
  const raw = sessionStorage.getItem(SS_WALL_ZOOM);
  const n   = raw ? parseFloat(raw) : 1;
  return (isFinite(n) && n >= WALL_ZOOM_MIN && n <= WALL_ZOOM_MAX) ? n : 1;
}

function _setWallZoom(z) {
  const clamped = Math.max(WALL_ZOOM_MIN, Math.min(WALL_ZOOM_MAX, z));
  sessionStorage.setItem(SS_WALL_ZOOM, String(clamped));
  return clamped;
}

function _renderWallView(container) {
  container.className = 'wall-view-mode';
  container.innerHTML = '';

  // Hide Card-View's add-duty-card floating button (if present)
  _setAddDutyVisibility('wall');

  const duties = appState.dutiesData || [];

  // Toolbar (always visible — outside scroll area)
  container.appendChild(_makeWallToolbar());

  // Empty-state — Wall View is interactive now, so let the trainer
  // start building the chart right here instead of bouncing to Card View.
  if (duties.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'wall-empty-state';
    empty.innerHTML = `
      <div class="wall-empty-icon">🧱</div>
      <h3>${_t('emptyWallTitle')}</h3>
      <p>${_t('emptyWallBody')}</p>
      <button class="wall-btn-primary" data-wall-empty-action="add-duty">＋ Add First Duty</button>
    `;
    // Matches the floating "＋ Add Duty" button's own onclick (see
    // _setAddDutyVisibility) — neither pushes history before adding,
    // consistent with existing Card View behaviour.
    empty.querySelector('[data-wall-empty-action="add-duty"]').addEventListener('click', () => addDuty());
    container.appendChild(empty);
    return;
  }

  // Compute auto-zoom metrics once per render
  const metrics  = _computeWallAutoZoom(duties);
  const userZoom = _getWallZoom();

  // Layout scales with the raw zoom; type scales with the compensated
  // curve, then gets an absolute 8px floor as a last line of defence.
  const fontZoom = _fontZoomFactor(userZoom);
  const fontPx   = Math.max(8, Math.round(metrics.fontSize * fontZoom));
  const cardW    = Math.max(60, Math.round(metrics.cardWidth * userZoom));
  const dutyW    = Math.max(90, Math.round(220 * userZoom));

  // Apply CSS custom properties for this render
  container.style.setProperty('--wv-font',      `${fontPx}px`);
  container.style.setProperty('--wv-card-w',    `${cardW}px`);
  container.style.setProperty('--wv-duty-w',    `${dutyW}px`);
  container.style.setProperty('--wv-task-gap',  `${Math.max(3, Math.round(8 * userZoom))}px`);
  // Square duty card: the CSS uses this as a min-height so the card
  // starts square and only grows when its text needs more room.
  container.style.setProperty('--wv-duty-h',    `${dutyW}px`);

  // Update zoom percentage label in the toolbar
  const pctEl = container.querySelector('.wv-zoom-pct');
  if (pctEl) pctEl.textContent = `${Math.round(userZoom * 100)}%`;

  // Rows (inside a scroll wrapper so fullscreen can constrain height
  // and show horizontal/vertical scrollbars when zoomed content overflows)
  //
  // NOTE: Wall View rows now reuse the SAME .duty-row / .dcv-row /
  // .dcv-duty-card / .dcv-tasks-scroll / .dcv-task-card structure as
  // Card View (see _renderCardView above + _makeWallDutyCard /
  // _makeWallTaskCard below). This is intentional: events.js's click /
  // input delegation and drag_drop.js's SortableJS wiring are both
  // generic over these class names + data-action attributes — they are
  // NOT gated to Card View — so editing, add/remove buttons, and drag
  // & drop all work here for free, with zero changes to events.js.
  // Sizing is scaled via the --wv-font / --wv-card-w / --wv-duty-w /
  // --wv-task-gap custom properties set below (see the CSS rules
  // scoped under .wall-view-mode in index.html).
  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'wall-rows-scroll';

  const rows = document.createElement('div');
  rows.className = 'wall-rows';
  duties.forEach((duty, dutyIndex) => {
    const letter = getDutyLetter(dutyIndex);

    // Outer wrapper keeps the same id as Card View so drag_drop.js's
    // ':scope > .duty-row' re-order lookup and events.js delegation
    // both work unchanged.
    const dutyDiv = document.createElement('div');
    dutyDiv.className = 'duty-row';
    dutyDiv.id = duty.id;

    const row = document.createElement('div');
    row.className = 'dcv-row';
    row.appendChild(_makeWallDutyCard(duty, letter));

    const tasksArea = document.createElement('div');
    tasksArea.className = 'dcv-tasks-area';

    const tasksScroll = document.createElement('div');
    tasksScroll.className = 'dcv-tasks-scroll';
    tasksScroll.id = `tasks_${duty.id}`;

    (duty.tasks || []).forEach((task, taskIndex) => {
      tasksScroll.appendChild(_makeWallTaskCard(task, `${letter}${taskIndex + 1}`, duty.id));
    });

    tasksArea.appendChild(tasksScroll);
    row.appendChild(tasksArea);
    dutyDiv.appendChild(row);
    rows.appendChild(dutyDiv);
  });
  scrollWrap.appendChild(rows);
  container.appendChild(scrollWrap);
}

// ── Wall View card builders ───────────────────────────────────
//
// Reuses the SAME class names as Card View (.dcv-duty-card,
// .dcv-task-card, .dcv-duty-drag-handle, .dcv-close-btn, .dcv-*-input,
// data-action attributes …) so events.js delegation and drag_drop.js's
// SortableJS wiring keep working unchanged — but the markup itself
// and its visual skin are Wall-View-specific (indigo/cream sticky
// notes with an inline header bar: drag-dots + title on the left,
// small square ＋ / ✕ icon buttons on the right — see the reference
// "after" screenshot). All of the visual skin is scoped under
// .wall-view-mode in index.html, so Card View's own cards, which
// share the same class names, are completely untouched.
//
// ＋ button semantics differ by card type, matching what's directly
// under the cursor: on a DUTY card it adds a new duty (a whole new
// row); on a TASK card it adds another task to that same duty.
//
// The drag handle uses an inline SVG dot-grid (not a text glyph) so
// it renders identically across browsers/fonts instead of depending
// on Braille/dot-glyph support.

const _DRAG_DOTS_SVG = `
  <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/>
    <circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/>
    <circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/>
  </svg>`;

function _makeWallDutyCard(duty, dutyLetter) {
  const card = document.createElement('div');
  card.className = 'dcv-duty-card';
  card.setAttribute('data-duty-card-id', duty.id);
  card.innerHTML = `
    <div class="dcv-card-top">
      <div class="dcv-card-top-left">
        <span class="dcv-duty-drag-handle" title="${_t('ttDragDuty')}" aria-label="${_t('ttDragDuty')}">${_DRAG_DOTS_SVG}</span>
        <span class="dcv-duty-label">${_tf('lblDuty', { code: _bdi(_esc(dutyLetter)) })}</span>
      </div>
      <div class="dcv-card-top-right">
        <button class="dcv-add-btn" data-action="add-duty"
                title="${_t('ttAddDuty')}" aria-label="${_t('ttAddDuty')}">＋</button>
        <button class="dcv-close-btn" data-action="remove-duty" data-duty-id="${duty.id}"
                title="${_t('ttRemoveDuty')}" aria-label="${_t('ttRemoveDuty')}">✕</button>
      </div>
    </div>
    <textarea class="dcv-duty-input"
              data-duty-id="${duty.id}"
              placeholder="${_t('phEnterDuty')}…"
              rows="2">${_esc(duty.title)}</textarea>
  `;
  return card;
}

function _makeWallTaskCard(task, displayCode, dutyId) {
  const card = document.createElement('div');
  card.className = 'dcv-task-card';
  card.id = task.divId;
  card.innerHTML = `
    <div class="dcv-card-top">
      <div class="dcv-card-top-left">
        <span class="dcv-task-drag-handle" title="${_t('ttDragTask')}" aria-label="${_t('ttDragTask')}">${_DRAG_DOTS_SVG}</span>
        <span class="dcv-task-label">${_tf('lblTask', { code: _bdi(displayCode) })}</span>
      </div>
      <div class="dcv-card-top-right">
        <button class="dcv-add-btn" data-action="add-task" data-duty-id="${dutyId}"
                title="${_t('ttAddTask')}" aria-label="${_t('ttAddTask')}">＋</button>
        <button class="dcv-close-btn" data-action="remove-task" data-task-div-id="${task.divId}"
                title="${_t('ttRemoveTask')}" aria-label="${_t('ttRemoveTask')}">✕</button>
      </div>
    </div>
    <textarea class="dcv-task-input"
              data-task-id="${task.inputId}"
              placeholder="${_t('phEnterTask')}…"
              rows="2">${_esc(task.text)}</textarea>
  `;
  return card;
}

function _computeWallAutoZoom(duties) {
  // Largest task row defines how small cards must be to fit a single line.
  // We don't try to single-line everything (we let it wrap) — we just scale
  // the baseline down when density is high.
  const maxTasks = duties.reduce((m, d) => Math.max(m, (d.tasks || []).length), 0);
  const totalDuties = duties.length;

  // Rough viewport approximation — don't call getBoundingClientRect here
  // because container might not be laid out yet at first call.
  const vw = Math.max(800, window.innerWidth);

  // Base card width target when there are up to 10 tasks per duty and
  // 8 duties, on a 1400px viewport: ~130px card width, ~13px font.
  // Scale down gracefully as density grows.
  //
  // FLOOR = 132px, not 80px: each task card's header row now carries a
  // drag handle + "Task A1" label + ＋ and ✕ buttons (~56px of fixed
  // chrome). Below ~130px the header ran out of room and squeezed the
  // task text out of sight behind the buttons. Very dense charts now
  // shrink the FONT further and wrap onto more rows instead of
  // shrinking the card past the point of readability.
  const densityFactor = Math.max(1, (maxTasks * totalDuties) / 60);
  const cardWidth = Math.max(132, Math.min(180, 150 / Math.sqrt(densityFactor) * (vw / 1400)));
  const fontSize  = Math.max(9,  Math.min(14, 13 / Math.sqrt(densityFactor) * (vw / 1400)));

  return { cardWidth, fontSize };
}

function _makeWallToolbar() {
  const bar = document.createElement('div');
  bar.className = 'wall-toolbar';
  bar.innerHTML = `
    <div class="wv-left">
      <button class="wv-btn wv-btn-exit" data-wv-action="exit"  title="${_t('ttWvExit')}">✕ ${_t('wvExit')}</button>
    </div>
    <div class="wv-center">
      <button class="wv-btn"  data-wv-action="zoom-out"  title="${_t('ttWvZoomOut')}">🔍−</button>
      <span class="wv-zoom-pct">100%</span>
      <button class="wv-btn"  data-wv-action="zoom-in"   title="${_t('ttWvZoomIn')}">🔍+</button>
      <button class="wv-btn"  data-wv-action="zoom-reset" title="${_t('ttWvZoomReset')}">⟲ ${_t('wvReset')}</button>
    </div>
    <div class="wv-right">
      <button class="wv-btn"  data-wv-action="print"      title="${_t('ttWvPrint')}">🖨 ${_t('wvPrint')}</button>
      <button class="wv-btn"  data-wv-action="fullscreen" title="${_t('ttWvFullscreen')}">🖥 ${_t('wvFullscreen')}</button>
    </div>
  `;

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wv-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-wv-action');
    switch (action) {
      case 'exit':        switchToViewMode('card'); _exitFullscreen(); break;
      case 'zoom-in':     _setWallZoom(_zoomStep(_getWallZoom(), +1)); renderDutiesFromState(); break;
      case 'zoom-out':    _setWallZoom(_zoomStep(_getWallZoom(), -1)); renderDutiesFromState(); break;
      case 'zoom-reset':  _setWallZoom(1);                     renderDutiesFromState(); break;
      case 'print':       _populatePrintHeader(); window.print(); break;
      case 'fullscreen':  _toggleFullscreen(); break;
    }
  });

  return bar;
}

/**
 * Populate the hidden #wallPrintHeader with the current project's title
 * and subtitle.  Called right before window.print() so the header is
 * always fresh and reflects the live values in Chart Info.
 */
function _populatePrintHeader() {
  const titleEl = document.getElementById('wallPrintTitle');
  const subEl   = document.getElementById('wallPrintSubtitle');
  if (!titleEl || !subEl) return;

  const occ  = (document.getElementById('occupationTitle')?.value || '').trim() || 'Untitled Occupation';
  const job  = (document.getElementById('jobTitle')?.value        || '').trim();
  const now  = new Date();
  const date = now.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

  titleEl.textContent = _tf('wallPrintTitle', { occ: occ });
  subEl.textContent   = job ? `${job} · ${date}` : date;
}

function _toggleFullscreen() {
  const root = document.documentElement;
  if (!document.fullscreenElement) {
    if (root.requestFullscreen) {
      root.requestFullscreen()
        .then(() => { document.body.classList.add('wall-view-fullscreen'); })
        .catch(() => {});
    }
  } else {
    _exitFullscreen();
  }
}

function _exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  // Class is removed by the fullscreenchange handler below
}

// ── Global key + resize handlers for Wall View ────────────────
// Wire once — idempotent via a module flag.
let _wallHandlersWired = false;
function _wireWallHandlers() {
  if (_wallHandlersWired) return;
  _wallHandlersWired = true;

  // ESC → exit wall view (only when active)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.body.classList.contains('wall-view-active') && !document.fullscreenElement) {
      switchToViewMode('card');
    }
  });

  // Ctrl/Cmd + = / − : zoom
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('wall-view-active')) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); _setWallZoom(_zoomStep(_getWallZoom(), +1)); renderDutiesFromState(); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); _setWallZoom(_zoomStep(_getWallZoom(), -1)); renderDutiesFromState(); }
    else if (e.key === '0') { e.preventDefault(); _setWallZoom(1); renderDutiesFromState(); }
  });

  // Auto-zoom recomputes on resize (only when active, debounced)
  let rt = null;
  window.addEventListener('resize', () => {
    if (!document.body.classList.contains('wall-view-active')) return;
    clearTimeout(rt);
    rt = setTimeout(() => renderDutiesFromState(), 180);
  });

  // Fullscreen change — sync body class to real fullscreen state.
  // Handles ESC-out-of-fullscreen, browser-close-of-fullscreen, etc.
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      document.body.classList.add('wall-view-fullscreen');
    } else {
      document.body.classList.remove('wall-view-fullscreen');
    }
  });

  // Auto-exit Wall View when user switches to a non-duties tab.
  // The app exposes switchTab via window.switchTab; the sidebar and
  // various buttons call it.  We wrap it so any call that navigates
  // away from duties-tab exits Wall View first, preventing the UI
  // from getting stuck on a hidden tab (the known black-screen bug).
  // Guarded so we don't double-wrap on multiple boots.
  //
  // Deferred because window.switchTab is assigned inside app.js at
  // DOMContentLoaded time — this module may be imported before that.
  function _wrapSwitchTab() {
    if (typeof window.switchTab !== 'function' || window.switchTab._wallWrapped) return false;
    const original = window.switchTab;
    const wrapped = function (tabId) {
      if (tabId !== 'duties-tab' && document.body.classList.contains('wall-view-active')) {
        switchToViewMode('card');
        _exitFullscreen();
      }
      return original.apply(this, arguments);
    };
    wrapped._wallWrapped = true;
    window.switchTab = wrapped;
    return true;
  }
  // Try now, and again after DOM is ready, and once more as a safety net
  if (!_wrapSwitchTab()) {
    document.addEventListener('DOMContentLoaded', () => {
      if (!_wrapSwitchTab()) setTimeout(_wrapSwitchTab, 300);
    });
  }

  // Also catch tab clicks that don't go through window.switchTab —
  // e.g. explicit [data-tab] clicks or .tab-button clicks.  Any such
  // click that targets a non-duties destination triggers Wall exit.
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('wall-view-active')) return;
    const tabTrigger = e.target.closest('[data-tab], .tab-button');
    if (!tabTrigger) return;
    const target = tabTrigger.getAttribute('data-tab') ||
                   tabTrigger.getAttribute('data-tab-id') || '';
    if (target && target !== 'duties-tab') {
      switchToViewMode('card');
      _exitFullscreen();
    }
  }, true);   // capture phase so we run BEFORE the tab handler
}
_wireWallHandlers();


/* ── Re-render on language change ───────────────────────────────────
   Card and wall views bake their labels into innerHTML at render time,
   so applyTranslations() cannot reach them — it only rewrites elements
   carrying data-i18n, and these are generated after that pass runs.
   Re-rendering from state is cheap (the DOM is rebuilt on every edit
   anyway) and guarantees labels, placeholders and tooltips all follow
   the switch in one atomic repaint rather than half-updating. */
window.addEventListener('dacum:langchange', () => {
  // Guard: the duties tab may never have been opened yet this session.
  if (document.getElementById('dutiesContainer')) renderDutiesFromState();
});
