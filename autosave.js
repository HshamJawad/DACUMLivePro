// ============================================================
// /autosave.js
// Auto Save + Crash Recovery for DACUM Live Pro.
//
// Strategy:
//   - Observes dutiesContainer + document-level state-change
//     events via a MutationObserver + input listener.
//   - Debounces writes (800 ms) to avoid hammering localStorage.
//   - Writes two places on every autosave trigger:
//       1. dacum_projects  (via saveCurrentProject)
//       2. dacum_session_backup  (lightweight crash guard)
//   - On startup, checks the session backup and offers recovery
//     via a non-blocking dialog rendered in JS (no HTML changes).
//
// Rules obeyed:
//   ✗ Never touches duties.js / tasks.js / history.js / snapshots.js
//   ✗ Never resets undo/redo
//   ✗ Never modifies renderer logic
// ============================================================

import { saveCurrentProject,
         getActiveProjectId,
         loadProject }         from './dacum_projects.js';
import { renderAll }           from './workshop_snapshots.js';
import { appState, defaultSupplementaryVerification } from './state.js';
import { syncAllFromDOM }      from './duties.js';
import { getImageSync }        from './image_store.js';

const LS_BACKUP     = 'dacum_session_backup';
// Marks whether the previous session ended in an orderly way. Written
// to localStorage (NOT sessionStorage) precisely because it has to
// survive the browser dying — that is the event it exists to detect.
const LS_CLEAN_EXIT = 'dacum_clean_exit';
const DEBOUNCE_MS   = 800;
let   _debounceTimer = null;
let   _started       = false;

function _markSessionRunning() {
  try { localStorage.setItem(LS_CLEAN_EXIT, '0'); } catch (e) {}
}

function _markSessionClosed() {
  try { localStorage.setItem(LS_CLEAN_EXIT, '1'); } catch (e) {}
}

function _previousSessionEndedCleanly() {
  try { return localStorage.getItem(LS_CLEAN_EXIT) !== '0'; } catch (e) { return true; }
}

// ── Public API ────────────────────────────────────────────────

/**
 * Attach observers to the duties container and document inputs.
 * Safe to call multiple times — guards against double-init.
 */
export function startAutoSave() {
  if (_started) return;
  _started = true;

  // Wait until DOM is ready (called from DOMContentLoaded, but be safe)
  const attach = () => {
    _watchDutiesContainer();
    _watchDocumentInputs();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
}

/**
 * Immediately flush current state to the session backup key.
 * Also called internally on every debounced save.
 */
export function saveSessionBackup() {
  try {
    syncAllFromDOM();
    const backup = {
      timestamp: Date.now(),
      projectId: getActiveProjectId() || null,
      state:     _snapshotAppState(),
    };
    localStorage.setItem(LS_BACKUP, JSON.stringify(backup));
  } catch (e) {
    // Storage full or serialisation error — silently skip backup
    console.warn('[autosave] session backup failed:', e);
  }
}

/**
 * Check for a crash-recovery backup on startup.
 * If one exists and is newer than the stored project, show the
 * recovery dialog.  Must be called after the project system is
 * initialised (i.e. after initProjectsSidebar in app.js).
 */
export function checkCrashRecovery() {
  try {
    const endedCleanly = _previousSessionEndedCleanly();

    // Claim the session immediately, whatever happens below, so a crash
    // from this point on is still detected next time.
    _markSessionRunning();
    _installExitHandlers();

    const raw = localStorage.getItem(LS_BACKUP);
    if (!raw) return;

    const backup = JSON.parse(raw);
    if (!backup || !backup.timestamp || !backup.state) {
      localStorage.removeItem(LS_BACKUP);
      return;
    }

    // ── Why this is a clean-exit flag and not a timestamp race ──
    // The previous rule offered recovery only when the backup was more
    // than 5 s newer than the project's lastSaved. But _flushAutoSave()
    // writes BOTH in the same tick, so the gap was always ~0 ms and the
    // condition could never be true: the dialog was unreachable in
    // normal use and every backup was deleted silently at startup.
    //
    // What actually matters is not which write is newer, but whether
    // the last session got the chance to shut down at all. If it did,
    // autosave had already persisted everything and there is nothing to
    // recover. If it did not — crash, tab kill, power loss — the last
    // few edits may live only in the backup. That is exactly what the
    // flag records.
    if (endedCleanly) {
      localStorage.removeItem(LS_BACKUP);
      return;
    }

    _showRecoveryDialog(backup);
  } catch (e) {
    console.warn('[autosave] crash recovery check failed:', e);
    localStorage.removeItem(LS_BACKUP);
  }
}

/**
 * Mark the session closed on the way out, flushing any edit still
 * sitting in the debounce window.
 *
 * Both events are registered on purpose: `beforeunload` is the classic
 * desktop signal, but mobile browsers routinely discard a tab without
 * ever firing it — `pagehide` is the one that survives there. Marking
 * clean twice is harmless; missing it entirely would show a false
 * recovery prompt on the next launch.
 */
function _installExitHandlers() {
  const onExit = () => {
    try {
      clearTimeout(_debounceTimer);
      _flushAutoSave();     // capture edits newer than the last debounce
    } catch (e) { /* best effort */ }
    _markSessionClosed();
  };

  window.addEventListener('pagehide', onExit);
  window.addEventListener('beforeunload', onExit);
}

// ── Internal: debounced autosave trigger ─────────────────────

function _scheduleAutoSave() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(_flushAutoSave, DEBOUNCE_MS);
}

function _flushAutoSave() {
  try {
    saveCurrentProject();   // persists to dacum_projects
    saveSessionBackup();    // persists crash-guard backup
  } catch (e) {
    console.warn('[autosave] flush failed:', e);
  }
}

// ── Internal: observers ───────────────────────────────────────

/** Watch the duties container for DOM mutations (add/remove nodes). */
function _watchDutiesContainer() {
  const container = document.getElementById('dutiesContainer');
  if (!container) return;

  const observer = new MutationObserver(() => _scheduleAutoSave());
  observer.observe(container, { childList: true, subtree: true });
}

/**
 * Watch input/change events on the whole document for text edits
 * in duties, tasks, and chart-info fields.
 */
function _watchDocumentInputs() {
  const WATCHED = [
    'input[data-duty-id]',
    'input[data-task-id]',
    '#dacumDate', '#dacumDateEnd', '#workshopFormat', '#venue', '#producedFor', '#producedBy',
    '#occupationTitle', '#jobTitle', '#sector', '#context', '#scopeOfWork',
    '#facilitators', '#observers', '#panelMembers',
    '#knowledgeInput', '#skillsInput', '#behaviorsInput',
    '#toolsInput', '#trendsInput', '#acronymsInput', '#careerPathInput',
  ].join(', ');

  document.addEventListener('input', function (e) {
    if (e.target.matches(WATCHED)) _scheduleAutoSave();
  }, { passive: true });

  // Also catch select/radio/checkbox changes (e.g. collection mode)
  document.addEventListener('change', function (e) {
    if (e.target.closest('#duties-tab, #info-tab, #additional-info-tab')) {
      _scheduleAutoSave();
    }
  }, { passive: true });
}

// ── Internal: recovery dialog ─────────────────────────────────

/** Escape a user-supplied string before it enters innerHTML. */
function _esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function _showRecoveryDialog(backup) {
  // Inject dialog styles once
  if (!document.getElementById('as-dialog-styles')) {
    const s = document.createElement('style');
    s.id = 'as-dialog-styles';
    s.textContent = `
      #asRecoveryOverlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.55);
        z-index: 9999;
        display: flex; align-items: center; justify-content: center;
      }
      #asRecoveryDialog {
        background: #fff;
        border-radius: 14px;
        padding: 28px 32px;
        max-width: 420px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        font-family: inherit;
        text-align: center;
      }
      #asRecoveryDialog h2 {
        margin: 0 0 10px;
        font-size: 1.15em;
        color: #1f2937;
      }
      #asRecoveryDialog p {
        margin: 0 0 22px;
        font-size: 0.92em;
        color: #6b7280;
        line-height: 1.55;
      }
      #asRecoveryDialog .as-meta-row {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        margin-bottom: 20px;
      }
      #asRecoveryDialog .as-meta {
        display: inline-block;
        background: #f3f4f6;
        border-radius: 6px;
        padding: 4px 12px;
        font-size: 0.82em;
        color: #374151;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* The project name is the key detail — give it more weight than
         the timestamp so it reads first. */
      #asRecoveryDialog .as-meta-project {
        background: #eef2ff;
        color: #3730a3;
        font-weight: 700;
      }
      #asRecoveryDialog .as-meta-missing {
        background: #fef2f2;
        color: #b91c1c;
        font-weight: 700;
      }
      #asRecoveryDialog .as-warning {
        margin: -6px 0 18px;
        padding: 9px 12px;
        background: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: 8px;
        font-size: 0.8em;
        color: #92400e;
        line-height: 1.5;
      }
      .as-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        transform: none !important;
      }
      .as-btn-row { display: flex; gap: 12px; justify-content: center; }
      .as-btn {
        border: none; border-radius: 8px;
        padding: 10px 26px; font-size: 0.95em;
        font-weight: 600; cursor: pointer;
        transition: all 0.15s;
      }
      .as-btn-restore {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      .as-btn-restore:hover { opacity: 0.88; transform: translateY(-1px); }
      .as-btn-discard {
        background: #f3f4f6; color: #6b7280;
      }
      .as-btn-discard:hover { background: #e5e7eb; }
    `;
    document.head.appendChild(s);
  }

  const date    = new Date(backup.timestamp);
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  // ── Which project does this backup belong to? ────────────────
  // Without this the user is asked to restore "unsaved work" with no
  // way to tell which of several projects it came from.
  const info      = _getProjectInfo(backup.projectId);
  const activeId  = getActiveProjectId();
  const isForeign = info.exists && backup.projectId && backup.projectId !== activeId;

  let projectLine;
  if (info.exists) {
    projectLine = `<span class="as-meta as-meta-project">📁 ${_esc(info.name)}</span>`;
  } else {
    // The project was deleted after the crash — restoring would have
    // nowhere to go, so say so instead of showing an empty name.
    projectLine = `<span class="as-meta as-meta-missing">📁 Project no longer exists</span>`;
  }

  // Restoring into a DIFFERENT project than the one open would silently
  // overwrite the open project's workspace with another project's
  // content — and autosave would then persist that. Warn, and switch.
  const foreignWarning = isForeign
    ? `<p class="as-warning">⚠️ This belongs to a different project than the one
       currently open. Restoring will switch you to it.</p>`
    : '';

  const overlay = document.createElement('div');
  overlay.id = 'asRecoveryOverlay';
  overlay.innerHTML = `
    <div id="asRecoveryDialog">
      <h2>⚡ Unsaved Work Found</h2>
      <p>We found unsaved work from your previous session.<br>Would you like to restore it?</p>
      <div class="as-meta-row">
        ${projectLine}
        <span class="as-meta">📅 ${dateStr} · ${timeStr}</span>
      </div>
      ${foreignWarning}
      <div class="as-btn-row">
        <button class="as-btn as-btn-restore" id="asBtnRestore"
                ${info.exists ? '' : 'disabled title="The original project was deleted"'}>↩ Restore</button>
        <button class="as-btn as-btn-discard" id="asBtnDiscard">Discard</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('asBtnRestore').addEventListener('click', () => {
    if (!info.exists) return;

    // Make the backup's own project active FIRST, so the recovered
    // state lands where it came from rather than on top of whatever
    // happens to be open.
    if (isForeign) {
      try { loadProject(backup.projectId); } catch (e) {
        console.warn('[autosave] could not switch project before restore:', e);
      }
    }

    _applyBackupState(backup.state);
    renderAll();
    localStorage.removeItem(LS_BACKUP);
    overlay.remove();
  });

  document.getElementById('asBtnDiscard').addEventListener('click', () => {
    localStorage.removeItem(LS_BACKUP);
    overlay.remove();
  });
}

// ── Internal: state helpers ───────────────────────────────────

/** Lightweight serialisable snapshot of appState (no DOM, no functions). */
function _snapshotAppState() {
  try {
    return JSON.parse(JSON.stringify({
      dutiesData:               appState.dutiesData              || [],
      dutyCount:                appState.dutyCount               || 0,
      taskCounts:               appState.taskCounts              || {},
      // Logos are deliberately NOT copied into the backup. They live in
      // IndexedDB (image_store.js) and are unchanged by a crash, so
      // duplicating megabytes of base64 into localStorage on every
      // keystroke would reintroduce the quota pressure this whole
      // change removes. The project's own reference is what restores
      // them — see _applyBackupState.
      producedForImage:         null,
      producedByImage:          null,
      customSectionCounter:     appState.customSectionCounter    || 0,
      skillsLevelData:          appState.skillsLevelData,
      verificationRatings:      appState.verificationRatings     || {},
      taskMetadata:             appState.taskMetadata            || {},
      supplementaryVerification: appState.supplementaryVerification || null,
      collectionMode:           appState.collectionMode,
      workflowMode:             appState.workflowMode,
      workshopParticipants:     appState.workshopParticipants,
      priorityFormula:          appState.priorityFormula,
      workshopCounts:           appState.workshopCounts          || {},
      workshopResults:          appState.workshopResults         || {},
      tvExportMode:             appState.tvExportMode,
      trainingLoadMethod:       appState.trainingLoadMethod,
      clusteringData:           appState.clusteringData,
      learningOutcomesData:     appState.learningOutcomesData,
      moduleMappingData:        appState.moduleMappingData,
      verificationDecisionMade: appState.verificationDecisionMade,
      clusteringAllowed:        appState.clusteringAllowed,
      _chartInfo:               appState._chartInfo              || {},
      _additionalInfo:          appState._additionalInfo         || {},
    }));
  } catch { return {}; }
}

/** Apply a raw state object into appState (same as _applyState in dacum_projects). */
function _applyBackupState(s) {
  if (!s) return;
  appState.dutiesData               = s.dutiesData               || [];
  appState.dutyCount                = s.dutyCount                || 0;
  appState.taskCounts               = s.taskCounts               || {};
  // Keep whatever is already loaded rather than blanking the logos:
  // the backup never carries them (see _snapshotAppState), so a null
  // here would wipe a perfectly good logo on restore.
  appState.producedForImage         = getImageSync(s.producedForImage) || appState.producedForImage || null;
  appState.producedByImage          = getImageSync(s.producedByImage)  || appState.producedByImage  || null;
  appState.customSectionCounter     = s.customSectionCounter     || 0;
  if (s.skillsLevelData) appState.skillsLevelData = s.skillsLevelData;
  appState.verificationRatings      = s.verificationRatings      || {};
  appState.taskMetadata             = s.taskMetadata             || {};
  appState.supplementaryVerification = s.supplementaryVerification || defaultSupplementaryVerification();
  appState.collectionMode           = s.collectionMode           || 'workshop';
  appState.workflowMode             = s.workflowMode             || 'standard';
  appState.workshopParticipants     = s.workshopParticipants     || 10;
  appState.priorityFormula          = s.priorityFormula          || 'if';
  appState.workshopCounts           = s.workshopCounts           || {};
  appState.workshopResults          = s.workshopResults          || {};
  // Forced to 'appendix'. The radio pair that could set 'standalone' is
  // gone, and that value makes exportToPDF/exportToWord return the
  // verification report INSTEAD of the DACUM report. A project saved
  // while the old radio was on "Standalone" would therefore have its
  // main exports permanently hijacked, with no surviving control to
  // switch it back. Standalone output now comes from its own buttons.
  appState.tvExportMode             = 'appendix';
  appState.trainingLoadMethod       = s.trainingLoadMethod       || 'advanced';
  appState.clusteringData           = s.clusteringData           || { clusters: [], availableTasks: [], clusterCounter: 0 };
  appState.learningOutcomesData     = s.learningOutcomesData     || { outcomes: [], outcomeCounter: 0 };
  appState.moduleMappingData        = s.moduleMappingData        || { modules: [], moduleCounter: 0 };
  appState.verificationDecisionMade = s.verificationDecisionMade || false;
  appState.clusteringAllowed        = s.clusteringAllowed        || false;
  appState._chartInfo               = s._chartInfo               || {};
  appState._additionalInfo          = s._additionalInfo          || {};
}

/**
 * Look up the project a backup belongs to.
 * Returns { name, exists } — `exists:false` when the project has since
 * been deleted, which the dialog must say out loud rather than showing
 * a blank name.
 */
function _getProjectInfo(projectId) {
  if (!projectId) return { name: '', exists: false };
  try {
    const projects = JSON.parse(localStorage.getItem('dacum_projects') || '[]');
    const p = projects.find(x => x.id === projectId);
    return p ? { name: p.name || 'Untitled Project', exists: true }
             : { name: '', exists: false };
  } catch { return { name: '', exists: false }; }
}

// NOTE: _getProjectLastSaved() lived here and compared the backup's
// timestamp against the project's lastSaved. It was removed along with
// that rule — see checkCrashRecovery() for why the comparison could
// never succeed. Recovery is now decided by the clean-exit flag.
