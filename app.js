// ============================================================
// /app.js
// Application entry point — wires everything together on DOMContentLoaded.
// ============================================================

import { appState }          from './state.js';
import { renderSkillsLevel } from './renderer.js';
import { updateUsageBadge }  from './storage.js';
import { setupTabs }         from './tabs.js';
import { setupEvents }       from './events.js';
import { switchTab }         from './projects.js';
import { addDuty }           from './duties.js';
import { updateCollectionMode, updateWorkflowMode, updateDutyLevelSummary } from './tasks.js';
import { lwCheckAndShowSection } from './workshop.js';
import { setBaseline }       from './history.js';
import { renderSnapshotPanel } from './workshop_snapshots.js';
import { initProjectStore, isProjectStoreLocked } from './project_store.js';
import { initProjectsSidebar, saveCurrentProject,
         createProject, getActiveProjectId,
         getProjects, loadProject } from './dacum_projects.js';
import { startAutoSave, checkCrashRecovery } from './autosave.js';
import { initImageStore }     from './image_store.js';
import { clearAiGeneratedFlag } from './refine.js';
import { initDragDrop }        from './drag_drop.js';
import { initVerificationCharts } from './verification_charts.js';
import { initSupplementaryVerification } from './supplementary_verification.js';
import { initI18nDefaults } from './i18n_defaults.js';
import { renderDraftCard }        from './draft_ui.js';
import { renderRegenButtons }     from './draft_regen.js';
import { renderUnverifiedBanner } from './draft_unverified.js';

// Expose switchTab globally (called from HTML onclick and live workshop guards)
window.switchTab = switchTab;
window.updateDutyLevelSummary = updateDutyLevelSummary;

/* ── Reopen the active project on start-up ───────────────────────────
   THE BUG THIS FIXES: the page boots into the default blank workspace
   (one empty duty, one empty task) and nothing ever loaded the active
   project's saved state back into it. The first save after that — the
   beforeunload handler, or autosave on the first edit — then captured
   the blank screen and wrote it OVER the saved project. Closing and
   reopening the tool therefore emptied every project down to
   "1 duty · 1 task", without Clear All ever being pressed.

   loadProject() is reused rather than duplicated, but it begins by
   saving the CURRENT workspace into the active project — on boot that
   workspace is the blank screen, i.e. the very overwrite described
   above. So the active marker is lifted for the duration of the call:
   saveCurrentProject() does nothing without an active project, and
   loadProject() sets the marker again itself once the state is applied.

   If loading fails part-way, the marker is deliberately NOT put back:
   with no active project nothing can save over the stored copy, and the
   boot code below simply starts a fresh project. The saved project
   stays intact in the sidebar and can be opened by clicking it. */
function _restoreActiveProjectOnBoot() {
  const id = getActiveProjectId();
  if (!id) return false;

  const exists = getProjects().some(p => p && p.id === id && p.state);
  if (!exists) return false;

  try {
    localStorage.removeItem('dacum_active_project');
    loadProject(id);                       // applies state, renders, re-marks active
    if (getActiveProjectId() !== id) localStorage.setItem('dacum_active_project', id);
    return true;
  } catch (e) {
    console.error('[app] could not reopen the saved project — it was left untouched:', e);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async function () {
  // Open the logo store and warm its in-memory cache BEFORE any project
  // is loaded. Everything downstream reads images synchronously from
  // that cache (see image_store.js), so this has to finish first or a
  // project restored on boot would come up without its logos.
  // It resolves even when IndexedDB is blocked — the store then runs
  // memory-only and logos simply stay inline in the project state.
  try { await initImageStore(); } catch (e) { console.warn('[app] image store init:', e); }

  // Same rule for the project list: project_store.js decides whether it
  // lives in localStorage (default) or IndexedDB, and must have it in
  // memory before the sidebar renders or a project is restored. Resolves
  // in every case; a locked store (flag = IndexedDB, browser refuses it)
  // loads nothing destructive and refuses writes.
  try { await initProjectStore(); } catch (e) { console.warn('[app] project store init:', e); }

  // Initialize Skills Level Matrix
  renderSkillsLevel();

  // Ensure Refine Results button is hidden until AI runs
  clearAiGeneratedFlag();

  // Initialize usage badge
  updateUsageBadge();

  // Wire tabs
  setupTabs();

  // Wire all event listeners
  setupEvents();

  // Add an initial duty if the duties container is empty.
  // addDuty() seeds its own first task (see duties.js), so calling
  // addTask() here as well would create a spare blank task on boot.
  const dutiesContainer = document.getElementById('dutiesContainer');
  if (dutiesContainer && dutiesContainer.children.length === 0) {
    addDuty();
  }

  // Anchor the history baseline
  setBaseline();

  // Render saved snapshots panel
  renderSnapshotPanel();

  // Initialize multi-project sidebar
  initProjectsSidebar();

  // Reopen the project the user was working on. MUST run before the
  // beforeunload handler and autosave below are attached — either of
  // them saving the blank boot screen is what used to wipe projects.
  _restoreActiveProjectOnBoot();

  // If no active project yet, create one automatically from the initial state
  // Never while the store is locked: the real projects are still in
  // IndexedDB, and creating one here would be refused anyway.
  if (!getActiveProjectId() && !isProjectStoreLocked()) {
    const occ = document.getElementById('occupationTitle')?.value?.trim();
    createProject(occ || 'My First DACUM Project');
  }

  // Auto-save active project when user leaves the page
  window.addEventListener('beforeunload', () => saveCurrentProject());

  // Start auto-save observer (debounced, 800 ms)
  startAutoSave();

  // Initialize drag & drop for task cards (Card View only)
  initDragDrop();

  // Check for unsaved work from a previous crashed session
  checkCrashRecovery();

  // The two calls below READ the radio buttons and write them into
  // appState. After a restored project those radios still show the
  // HTML defaults, so tick the project's own values first — otherwise
  // a "survey" or "extended" project would come back as the default.
  [['collectionMode', appState.collectionMode], ['workflowMode', appState.workflowMode]]
    .forEach(([name, val]) => {
      const r = val && document.querySelector(`input[name="${name}"][value="${val}"]`);
      if (r) r.checked = true;
    });

  // Initialize Task Verification controls
  updateCollectionMode();
  updateWorkflowMode();

  // Wire the verification results charts. Bound AFTER the two calls
  // above because they render the accordion; the listener itself is
  // delegated onto the permanent container, so it survives every
  // later re-render when the collection or workflow mode changes.
  initVerificationCharts();

  /* Supplementary Occupational Verification — optional block at the
     foot of the Task Verification tab. Bound after the collection-mode
     init above because it renders counts or radios to match that mode. */
  initSupplementaryVerification();

  /* Default seed content (Skills Matrix rows, Additional Info headings)
     follows the interface language; user-edited text is never touched. */
  initI18nDefaults();

  /* Full Draft card. Rendered rather than written into index.html
     because its labels come from the dictionary and it has to be
     rebuilt on a language change like every other generated block. */
  renderDraftCard();

  /* Regenerate-from-here controls. Rendered after the tabs exist;
     each one hides itself when its stage has no content yet. */
  renderRegenButtons();

  /* Unverified-draft banner. Renders nothing unless a generated
     draft is present, so it is safe to call unconditionally. */
  renderUnverifiedBanner();

  // Check Live Workshop section visibility
  const urlParams = new URLSearchParams(window.location.search);
  const sessionParam = urlParams.get('lwsession');
  if (sessionParam) {
    // Participant mode – redirect
    const currentPath = window.location.pathname;
    const directory   = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
    const participantFileUrl = window.location.origin + directory + 'DACUM_LiveWorkshop_Participant.html';
    window.location.href = `${participantFileUrl}?lwsession=${sessionParam}`;
  } else {
    setTimeout(lwCheckAndShowSection, 100);
  }
});
