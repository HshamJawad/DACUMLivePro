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
// Two modes:
//   'card'  → default editable card view (with drag & drop); its
//             🖥 Fullscreen is the presentation mode for the room
//   'table' → compact table view (editable, no drag)
//
// 3.65.0: Wall View was removed — Card View's toolbar does all it did.
// A 'wall' value left in localStorage by an older build reads as 'card'.

const LS_VIEW = 'dacum_view_mode';

export function getViewMode() {
  const m = localStorage.getItem(LS_VIEW) || 'card';
  return m === 'table' ? 'table' : 'card';
}

export function setViewMode(mode) {
  localStorage.setItem(LS_VIEW, mode === 'table' ? 'table' : 'card');
}

/** Toggle Card ↔ Table (legacy single-button behaviour). */
export function toggleViewMode() {
  const cur  = getViewMode();
  const next = cur === 'card' ? 'table' : 'card';
  setViewMode(next);
  renderDutiesFromState();
  _updateToggleButton();
}

/** Switch to a specific view mode — used by the segmented control. */
export function switchToViewMode(mode) {
  if (!['card','table'].includes(mode)) return;
  setViewMode(mode);
  renderDutiesFromState();
  _updateToggleButton();
}

function _activeMode() {
  return getViewMode();
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
    heading.textContent = mode === 'card' ? _t('headingCardView') : _t('headingTableView');
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
  if (mode === 'card')       _renderCardView(container);
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
// Card View tools — exit, zoom out / in, reset, print, fullscreen. The bar lives OUTSIDE #dutiesContainer, just above it:
// drag_drop.js sorts #dutiesContainer's direct children in Card View
// and observes it for re-renders, so nothing foreign may sit inside.
// Zoom is CSS `zoom` on each .duty-row (via --cv-zoom), so cards keep
// their own layout and drag & drop is untouched.

const SS_CARD_ZOOM   = 'dacum_card_zoom';
const CARD_ZOOM_MIN  = 0.25;   // 3.64.0: was 0.5 — a whole chart on one screen
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
  if (b) b.disabled = !_isPresenting() && _getCardZoom() === 1;
}

function _cardToolbarHtml() {
  const fs = _isPresenting();
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
      <button type="button" class="wv-btn${fs ? ' is-on' : ''}" data-cv-action="fullscreen" title="${_t('ttCvFullscreen')}" aria-pressed="${fs}">🖥 ${_t('wvFullscreen')}</button>
    </div>`;
}

function _setCardToolbar(mode, container) {
  let bar = document.getElementById('cardViewToolbar');
  if (mode !== 'card') {
    if (bar) bar.style.display = 'none';
    if (container) container.style.removeProperty('--cv-zoom');
    if (_isPresenting()) _leavePresentation();
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
    /* 5 points below 50 %, 10 above. */
    case 'zoom-in':    _setCardZoom(_zoomStep(_getCardZoom(), +1)); _applyCardZoom(); break;
    case 'zoom-out':   _setCardZoom(_zoomStep(_getCardZoom(), -1)); _applyCardZoom(); break;
    case 'zoom-reset': _setCardZoom(1);                    _applyCardZoom(); break;
    case 'print':      _printCardView(); break;
    case 'fullscreen': _isPresenting() ? _leavePresentation() : _enterPresentation(); break;
    case 'exit':
      _setCardZoom(1); _applyCardZoom();
      if (_isPresenting()) _leavePresentation();
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

// ── Presentation mode (3.65.0) ────────────────────────────────
// 🖥 Fullscreen is the room view that Wall View used to be: the app
// chrome disappears and each duty's tasks WRAP onto as many lines as
// needed, so the whole chart is on screen with no sideways scrolling.
// Normal Card View keeps its one-line scroll strips for editing.
// Where the page cannot go fullscreen (iPhone Safari, or a refused
// request) the same view is shown inside the window instead
// ("pseudo" mode) — the button works on every device.
// Esc, ✕ Exit, the button again, or leaving the tab end it.

function _isPresenting() {
  return document.body.classList.contains('card-view-fullscreen');
}

function _enterPresentation() {
  const body = document.body;
  body.classList.add('card-view-fullscreen');
  const done = () => {
    window.scrollTo(0, 0);
    const c = document.getElementById('dutiesContainer');
    if (c) c.scrollTop = 0;
    _syncCardFsButton();
  };
  const root = document.documentElement;
  if (root.requestFullscreen) {
    root.requestFullscreen().then(done).catch(() => {
      body.classList.add('card-view-pseudo-fs');
      done();
    });
  } else {
    body.classList.add('card-view-pseudo-fs');
    done();
  }
}

function _leavePresentation() {
  document.body.classList.remove('card-view-fullscreen', 'card-view-pseudo-fs');
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  _syncCardFsButton();
}

function _syncCardFsButton() {
  const b = document.querySelector('#cardViewToolbar [data-cv-action="fullscreen"]');
  if (b) {
    const on = _isPresenting();
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  _syncCardExitButton();
}

if (typeof document !== 'undefined') {
  /* Real fullscreen ended (Esc, F11, browser UI): leave the view too —
     unless it is the in-window variant, which has no real fullscreen. */
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && !document.body.classList.contains('card-view-pseudo-fs')) {
      document.body.classList.remove('card-view-fullscreen');
    }
    _syncCardFsButton();
  });
  /* Esc leaves the presentation. The browser also leaves real
     fullscreen on Esc by itself; this covers the in-window variant
     and any case where the key reaches the page first. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _isPresenting()) _leavePresentation();
  });
  /* Leaving the Duties tab ends the presentation, so no other tab is
     ever shown without the app's navigation. window.switchTab is set
     by app.js after this module loads, hence the deferred wrap. */
  const wrap = () => {
    const orig = window.switchTab;
    if (typeof orig !== 'function' || orig._cvWrapped) return typeof orig === 'function';
    const wrapped = function (tabId, ...rest) {
      if (tabId !== 'duties-tab' && _isPresenting()) _leavePresentation();
      return orig.call(this, tabId, ...rest);
    };
    wrapped._cvWrapped = true;
    window.switchTab = wrapped;
    return true;
  };
  if (!wrap()) {
    document.addEventListener('DOMContentLoaded', () => { if (!wrap()) setTimeout(wrap, 300); });
  }
}

// ── Add Duty button visibility ────────────────────────────────

function _setAddDutyVisibility(mode) {
  const orig   = document.getElementById('btnAddDuty');
  let   cardBtn = document.getElementById('btnAddDutyCard');

  // Card View uses the floating "＋ Add Duty" button below the rows.
  if (mode === 'card') {
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
       time Card view was opened. */
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
  // on, and an empty duty row collapses to a bare strip
  // with nothing to drag or type into. Seeding one task keeps every
  // duty immediately usable in both views. Uses the exact same
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

// Drag-handle dot grid — inline SVG so it renders the same on every
// browser/font (used by the Card View duty and task cards).
const _DRAG_DOTS_SVG = `
  <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/>
    <circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/>
    <circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/>
  </svg>`;

// ── Zoom step (shared by the Card View toolbar) ───────────────
/**
 * Zoom step. Finer below 50% because the same 10 points of zoom is a
 * far bigger visual jump down there — and because a flat 0.1 step
 * skips straight from 30% to the 25% floor.
 */
function _zoomStep(current, dir) {
  const step = current <= 0.5 ? 0.05 : 0.1;
  return Math.round((current + (dir * step)) * 100) / 100;
}

/**
 * Populate the hidden #wallPrintHeader (kept id) with the current project's title
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

/* ── Re-render on language change ───────────────────────────────────
   Card and table views bake their labels into innerHTML at render time,
   so applyTranslations() cannot reach them — it only rewrites elements
   carrying data-i18n, and these are generated after that pass runs.
   Re-rendering from state is cheap (the DOM is rebuilt on every edit
   anyway) and guarantees labels, placeholders and tooltips all follow
   the switch in one atomic repaint rather than half-updating. */
window.addEventListener('dacum:langchange', () => {
  // Guard: the duties tab may never have been opened yet this session.
  if (document.getElementById('dutiesContainer')) renderDutiesFromState();
});
