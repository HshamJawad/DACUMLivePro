// ============================================================
// /events.js
// All addEventListener calls and delegated event handling.
// Replaces all inline onclick="..." attributes.
// ============================================================

import { appState }             from './state.js';
import { generateAdditionalInfoAI } from './additional_info_ai.js';
import { generateOneModulePerOutcome,
         generateModulesAI } from './module_mapping_ai.js';
import { suggestClustersAI, generateRangeAndCriteriaAI,
         generateForSingleCluster } from './clustering_ai.js';
import { generateLearningOutcomesAI } from './learning_outcomes_ai.js';
import { addDuty, addTask, removeDuty, removeTask, clearDuty,
         syncAllFromDOM, syncDutyTitle, syncTaskText,
         toggleViewMode, switchToViewMode }            from './duties.js';
import { pushHistoryState, undo, redo,
         resetHistoryToCurrentState }                  from './history.js';
import { updateCollectionMode, updateWorkflowMode, updateParticipantCount,
  updatePriorityFormula, updateTrainingLoadMethod,
  loadDutiesForVerification, refreshVerificationTab, updateRating, updatePerformsTask, updateComments,
  updateWorkshopCount, validateAndComputeTask, validateAndComputeWorkshopResults,
  toggleDashboard, refreshDashboard, toggleDutyLevelSummary, exportDashboard,
  renderDashboardProjectSelector,
  attachAccordionListeners }    from './tasks.js';
import { bypassToClusteringTab, resetVerificationDecision, initializeClusteringFromTasks,
  updateCreateClusterButton, createCluster, renameCluster, deleteCluster,
  removeTaskFromCluster, addTaskToClusterFromDropdown, updateClusterRange,
  updateClusterCriteria, updateClusterCriteriaFromNumbered,
  handleCriteriaKeydown, initCriteriaNumber, proceedToClusteringFromVerification,
  proceedToClusteringFromTaskAnalysis,
  updateCreateLOButton, createLearningOutcome, toggleEditLO, deleteLearningOutcome,
  reassignPCToLO, unassignPCFromLO,
  updateCreateModuleButton, createModule, renameModule, deleteModule,
  removeLoFromModule, addLoToModuleFromDropdown,
  openModuleBuilderFromMapping, exportModuleMappingJSON }  from './modules.js';
import { showStatus, escapeHtml,
  toggleSkillsLevelSection, addSkillsCategory, removeSkillsCategory,
  updateSkillsCategoryName, addSkillsCompetency, removeSkillsCompetency,
  updateSkillsCompetencyText, handleSkillsLevelChange, resetSkillsLevel,
  toggleEditHeading, clearSection, formatList,
  addCustomSection, removeCustomSection }                  from './renderer.js';
import { exportToPDF, exportTaskVerificationPDF }         from './exports_pdf.js';
import { exportToWord, exportTaskVerificationWord }       from './exports_docx.js';
import { exportOccupationalStandardWord }                 from './exports_os_docx.js';
import { clearAll, clearAllSilent, clearCurrentTab, generateAIDacum,
         switchTab } from './projects.js';
import { handleImageUpload, removeImage }                  from './storage.js';
import { saveToJSON, loadFromJSON }                        from './snapshots.js';
import { saveSnapshot, restoreSnapshot,
         deleteSnapshot,
         renderSnapshotPanel }                             from './workshop_snapshots.js';
import { saveCurrentProject,
         loadProject,
         renderProjectsSidebar,
         deleteActiveProject }                              from './dacum_projects.js';
import { lwFinalizeAndCreateSession, lwCopyLink, lwShowQRCode,
  lwCloseQRModal, lwDownloadQRPNG, lwFetchResults,
  lwExportJSON, lwExportCSV, lwExportSnapshot,
  lwCloseVoting, lwExportVerifiedPDF, lwExportVerifiedDOCX }  from './workshop.js';
import { markAiGenerated, refineResults,
         clearAiGeneratedFlag }                               from './refine.js';
import { setupTaskAnalysisEvents }                             from './task_analysis.js';

/* i18n access — window.i18n is installed by a plain <script>, so it is
   read lazily on each call rather than captured at module evaluation. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);



// ── Delegation helper ─────────────────────────────────────────

function delegate(container, selector, eventType, handler) {
  if (!container) return;
  container.addEventListener(eventType, function (e) {
    const target = e.target.closest(selector);
    if (target && container.contains(target)) {
      handler(e, target);
    }
  });
}

// ── Setup all events ──────────────────────────────────────────

export function setupEvents() {
  // ── Task Analysis tab: all its clicks/inputs are wired inside its
  // own module (same self-contained pattern as the tab itself) — this
  // just needs to be called once, after the tab's HTML exists in the
  // DOM (it does, it's static markup in index.html, unlike the tabs
  // that render their containers dynamically).
  setupTaskAnalysisEvents();

  // ── Static buttons ────────────────────────────────────────

  _on('btnAddDuty', 'click', () => { syncAllFromDOM(); pushHistoryState(); addDuty(); });
  _on('btnSaveJSON',  'click', () => saveToJSON());
  _on('btnClearAll',  'click', () => {
    // clearAll() shows the confirm dialog and returns false if cancelled
    const cleared = clearAll();
    if (!cleared) return;

    // Remove the active project card from sidebar —
    // the state is now empty so there is nothing to save
    deleteActiveProject();

    // Reset undo/redo stack to the empty state
    resetHistoryToCurrentState();

    // Hide the Refine Results card — there is nothing AI-generated to refine
    clearAiGeneratedFlag();
  });

  // Undo / Redo buttons
  _on('btnUndo', 'click', () => undo());
  _on('btnRedo', 'click', () => redo());

  // Keyboard shortcuts (active only on duties tab)
  document.addEventListener('keydown', function (e) {
    const dutiesTab = document.getElementById('duties-tab');
    if (!dutiesTab || !dutiesTab.classList.contains('active')) return;
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
  });

  // Save Snapshot button (toolbar)
  _on('btnSaveSnapshot', 'click', () => {
    const name = prompt('Enter a name for this snapshot:', _defaultSnapName());
    if (name) saveSnapshot(name);
  });

  // Snapshot lens button — open modal
  _on('btnOpenSnapshots', 'click', () => {
    renderSnapshotPanel();
    const m = document.getElementById('snapModal');
    if (m) m.style.display = 'block';
  });
  // Modal save button
  _on('snapModalSave', 'click', () => {
    const name = prompt('Snapshot name:', _defaultSnapName());
    if (name) { saveSnapshot(name); renderSnapshotPanel(); }
  });
  // Close modal
  _on('snapModalClose', 'click', () => {
    const m = document.getElementById('snapModal');
    if (m) m.style.display = 'none';
  });
  _on('snapModalOverlay', 'click', () => {
    const m = document.getElementById('snapModal');
    if (m) m.style.display = 'none';
  });
  _on('aiGenerateBtn', 'click', () => {
    generateAIDacum()
      .then((ok) => {
        resetHistoryToCurrentState();
        saveCurrentProject();
        renderProjectsSidebar();
        // Reveal the Refine Results card only if generation actually ran
        if (ok) markAiGenerated();
      })
      .catch(() => {});
  });

  // ── Step navigation: "← Back to …" buttons ───────────────────
  // One delegated listener for every back button in the workflow
  // chain; each declares its own destination via data-nav-back, so
  // adding a step later needs no JS change. Delegated on document
  // because some of these live inside containers that are re-rendered.
  // switchTab() re-renders the destination tab's views on entry, so
  // the user always returns to their work as they left it.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav-back]');
    if (!btn) return;
    switchTab(btn.getAttribute('data-nav-back'));
  });

  // Forward navigation, mirroring the block above. The "Proceed to …"
  // buttons previously used inline onclick="window.switchTab(...)",
  // which is why they also carried inline style attributes and had
  // drifted out of visual step with their Back counterparts — nothing
  // tied the two halves of a step-nav row together. They now share the
  // same delegation and the same .btn-next-step / .btn-back-step pair.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav-next]');
    if (!btn) return;
    switchTab(btn.getAttribute('data-nav-next'));
  });

  // ── Tab "?" help modals ─────────────────────────────────────
  _on('addInfoHelpBtn',    'click', () => _showAdditionalInfoHelp());
  _on('dutiesHelpBtn',        'click', () => _showDutiesHelp());
  _on('clusteringHelpBtn',    'click', () => _showClusteringHelp());
  _on('loHelpBtn',            'click', () => _showLearningOutcomesHelp());
  _on('mmHelpBtn',            'click', () => _showModuleMappingHelp());
  _on('taskVerifyHelpBtn',    'click', () => _showTaskVerificationHelp());
  _on('taskAnalysisHelpBtn',  'click', () => _showTaskAnalysisHelp());

  // ── Competency Clusters: AI assistance ──────────────────────
  // Two separate actions on purpose — see clustering_ai.js. Both save
  // afterwards so the result survives a reload.
  const _afterClusterAI = (ok) => {
    if (!ok) return;
    saveCurrentProject();
    renderProjectsSidebar();
  };

  _on('aiSuggestClustersBtn', 'click', () => {
    suggestClustersAI().then(_afterClusterAI).catch(() => {});
  });

  _on('aiGenCriteriaBtn', 'click', () => {
    generateRangeAndCriteriaAI().then(_afterClusterAI).catch(() => {});
  });

  // ── Learning Outcomes: pattern-based generation ──────────────
  // The pattern is a per-run choice, not a stored setting — see the
  // help modal: a facilitator may apply a different one to each cluster.
  ['A', 'B', 'C'].forEach(pattern => {
    _on(`loGenPattern${pattern}Btn`, 'click', () => {
      generateLearningOutcomesAI(pattern)
        .then((ok) => {
          if (!ok) return;
          saveCurrentProject();
          renderProjectsSidebar();
        })
        .catch(() => {});
    });
  });

  // ── Module Mapping: automatic module generation ──────────────
  // Mode 1 is local and synchronous; the AI grouping is async. Both
  // save afterwards so the rebuilt module set survives a reload.
  _on('mmGenOneToOneBtn', 'click', () => {
    if (generateOneModulePerOutcome()) {
      saveCurrentProject();
      renderProjectsSidebar();
    }
  });

  _on('mmGenAIBtn', 'click', () => {
    generateModulesAI()
      .then((ok) => {
        if (!ok) return;
        saveCurrentProject();
        renderProjectsSidebar();
      })
      .catch(() => {});
  });
  _on('clusterNamingHelpBtn', 'click', () => _showClusterNamingHelp());
  _on('jobTitleHelpBtn', 'click', () => _showHelpModal({
    id:    'jobTitleHelpModal',
    icon:  '\u{1F454}',
    title: _t('ttJobTitleHelp'),
    intro: _t('hintJobTitle'),
  }));

  // ── Additional Information tab: AI supporting-info generation ──
  // No markAiGenerated() here — the Refine Results card operates on
  // duties/tasks only, so surfacing it after this run would be wrong.
  // The generated text lives in plain textareas that saveCurrentProject()
  // already reads straight from the DOM, so a save is all that's needed.
  _on('aiGenerateInfoBtn', 'click', () => {
    generateAdditionalInfoAI()
      .then((ok) => {
        if (!ok) return;
        saveCurrentProject();
        renderProjectsSidebar();
      })
      .catch(() => {});
  });

  // ── "Generate Anyway" path (from the yellow Scope warning card) ──
  // projects.js dispatches this event after a successful generation
  // that bypassed the scope gate.  We mirror the main Generate button's
  // post-success behaviour so Refine Results + history reset + project
  // save + sidebar render all happen identically.
  document.addEventListener('dacum:ai-generated', () => {
    resetHistoryToCurrentState();
    saveCurrentProject();
    renderProjectsSidebar();
    markAiGenerated();
  });
  // Refine Results — runs soft cleanup on AI-generated duties/tasks
  _on('btnRefineResults', 'click', () => refineResults());
  _on('btnExportPDF',          'click', () => exportToPDF());
  _on('btnExportWord',         'click', () => exportToWord());
  _on('btnExportOS',           'click', () => exportOccupationalStandardWord());

  // Task Verification controls
  _onRadioGroup('collectionMode',  () => { updateCollectionMode(); });
  _onRadioGroup('workflowMode',    () => updateWorkflowMode());
  _onRadioGroup('priorityFormula', () => updatePriorityFormula());
  _onRadioGroup('trainingLoadMethod', () => updateTrainingLoadMethod());
  _on('workshopParticipants', 'change', () => updateParticipantCount());
  _on('btnLoadDutiesForVerification', 'click', () => refreshVerificationTab());

  // Standalone verification report. These replace the old tvExportMode
  // radios: the same two exporters, but invoked directly instead of by
  // silently re-routing the main toolbar's PDF/Word buttons.
  //
  // When Live Workshop voting has been finalised, the verified dataset
  // lives in lwFinalizedData / lwAggregatedResults and the generic
  // exporters would miss it, so those runs are handed to the dedicated
  // lwExportVerified* pair — the same delegation exportToPDF/Word used
  // to perform internally.
  _on('btnTVExportPDF',  'click', () => {
    if (_hasVerifiedLiveWorkshopData()) lwExportVerifiedPDF();
    else exportTaskVerificationPDF();
  });
  _on('btnTVExportDOCX', 'click', () => {
    if (_hasVerifiedLiveWorkshopData()) lwExportVerifiedDOCX();
    else exportTaskVerificationWord();
  });
  _on('btnValidateAll',        'click', () => validateAndComputeWorkshopResults());
  _on('btnToggleDashboard',    'click', () => toggleDashboard());
  _on('btnRefreshDashboard',   'click', () => refreshDashboard());
  // Project selector — load the selected project (updates sidebar, session card, dashboard)
  _on('dashboardProjectSelector', 'change', () => {
    const sel = document.getElementById('dashboardProjectSelector');
    if (sel && sel.value) loadProject(sel.value);
  });
  _on('btnToggleDutyLevelSummary', 'click', () => toggleDutyLevelSummary());
  _on('btnExportDashboard',    'click', () => exportDashboard());
  _on('btnExportTVPDF',        'click', () => exportTaskVerificationPDF());
  _on('btnExportTVWord',       'click', () => exportTaskVerificationWord());

  // Clustering
  _on('btnBypassToClustering',      'click', () => bypassToClusteringTab());
  _on('btnResetDecision',           'click', () => resetVerificationDecision());
  _on('btnProceedToClustering',     'click', () => proceedToClusteringFromVerification());
  _on('btnTAProceedToClustering',   'click', () => proceedToClusteringFromTaskAnalysis());
  _on('btnCreateCluster',           'click', () => createCluster());

  // Learning Outcomes
  _on('btnCreateLO',                'click', () => createLearningOutcome());

  // Module Mapping
  _on('btnCreateModule',            'click', () => createModule());
  _on('btnOpenModuleBuilder',       'click', () => openModuleBuilderFromMapping());
  _on('btnExportModuleMapping',     'click', () => exportModuleMappingJSON());

  // Skills Level
  _on('btnToggleSkillsLevel',       'click', () => toggleSkillsLevelSection());
  _on('btnAddSkillsCategory',       'click', () => addSkillsCategory());
  _on('btnResetSkillsLevel',        'click', () => resetSkillsLevel());

  // Additional Info
  _on('btnAddCustomSection',        'click', () => addCustomSection());
  /* btnToggleInfoBox removed in 3.20.1 along with toggleInfoBox():
     the element it targeted is no longer in index.html, so _on() had
     been silently skipping it. */

  // Image upload
  // handleImageUpload is async now (it downscales the logo before
  // storing it). The autosave 'change' listener fires immediately, i.e.
  // BEFORE compression finishes, so without an explicit save here the
  // logo would sit in appState unpersisted until the next edit.
  const _uploadThenSave = (e, type) =>
    handleImageUpload(e, type).then(() => saveCurrentProject()).catch(() => {});

  _on('producedForImageInput',      'change', (e) => _uploadThenSave(e, 'producedFor'));
  _on('producedByImageInput',       'change', (e) => _uploadThenSave(e, 'producedBy'));
  _on('removeProducedForImage',     'click',  () => removeImage('producedFor'));
  _on('removeProducedByImage',      'click',  () => removeImage('producedBy'));

  // JSON Save/Load
  _on('loadFileInput', 'change', (e) => {
    loadFromJSON(e);
    // Project creation, sidebar render, and resetHistory are now
    // handled inside loadFromJSON via importProjectFromData + loadProject
  });

  // Live Workshop
  _on('btnLWFinalize',              'click', () => lwFinalizeAndCreateSession());
  _on('btnLWCopyLink',              'click', () => lwCopyLink());
  _on('btnLWShowQR',                'click', () => lwShowQRCode());
  _on('btnLWFetchResults',          'click', () => lwFetchResults());
  _on('btnLWExportJSON',            'click', () => lwExportJSON());
  _on('btnLWExportCSV',             'click', () => lwExportCSV());
  _on('btnLWExportSnapshot',        'click', () => lwExportSnapshot());
  _on('btnLWCloseVoting',           'click', () => lwCloseVoting());
  _on('btnLWExportVerifiedPDF',     'click', () => lwExportVerifiedPDF());
  _on('btnLWExportVerifiedDOCX',    'click', () => lwExportVerifiedDOCX());
  _on('btnLWCloseQR',               'click', () => lwCloseQRModal());

  // Register refreshDashboard callback so workshop.js can trigger it after live votes arrive
  appState._onResultsRefreshed = () => refreshDashboard();
  _on('btnLWDownloadQR',            'click', () => lwDownloadQRPNG());

  // Per-tab clear buttons (may use data-tab-id)
  document.querySelectorAll('[data-action="clear-tab"]').forEach(btn => {
    btn.addEventListener('click', function () {
      clearCurrentTab(this.getAttribute('data-tab-id'));
    });
  });

  // ── Delegated events ──────────────────────────────────────

  // Duties container
  const dutiesCont = document.getElementById('dutiesContainer');
  if (dutiesCont) {

    // Structural clicks — sync → push history → mutate
    dutiesCont.addEventListener('click', function (e) {
      const target = e.target;
      if (target.matches('[data-action="add-task"]')) {
        syncAllFromDOM(); pushHistoryState();
        addTask(target.getAttribute('data-duty-id'));
      } else if (target.matches('[data-action="add-duty"]')) {
        // Wall View duty cards carry their own ＋ button that adds a
        // whole new duty row (task cards' ＋ adds a task instead).
        syncAllFromDOM(); pushHistoryState();
        addDuty();
      } else if (target.matches('[data-action="remove-duty"]')) {
        pushHistoryState();           // syncAllFromDOM called inside removeDuty
        removeDuty(target.getAttribute('data-duty-id'));
      } else if (target.matches('[data-action="remove-task"]')) {
        pushHistoryState();           // syncAllFromDOM called inside removeTask
        removeTask(target.getAttribute('data-task-div-id'));
      } else if (target.matches('[data-action="clear-duty"]')) {
        pushHistoryState();           // syncAllFromDOM called inside clearDuty
        clearDuty(target.getAttribute('data-duty-id'));
      }
    });

    // View toggle button (legacy 2-state Card ↔ Table)
    _on('btnToggleDutiesView', 'click', toggleViewMode);

    // Segmented view switch (3-state: Card / Table / Wall) — delegated
    // so it works even if the buttons are re-rendered.  Any element
    // with data-view-switch="card|table|wall" triggers switchToViewMode.
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-view-switch]');
      if (!btn) return;
      const mode = btn.getAttribute('data-view-switch');
      if (mode === 'card' || mode === 'table' || mode === 'wall') {
        switchToViewMode(mode);
      }
    });

    // Word-level text undo (burst model) — works for input (table) and textarea (card)
    const _dutyOrTask = 'input[data-duty-id], input[data-task-id], textarea[data-duty-id], textarea[data-task-id]';
    let _burstPushed = false;
    let _burstTimer  = null;

    dutiesCont.addEventListener('focusin', function (e) {
      if (e.target.matches(_dutyOrTask)) {
        clearTimeout(_burstTimer); _burstPushed = false;
      }
    });

    dutiesCont.addEventListener('input', function (e) {
      const t = e.target;
      if      (t.matches('input[data-duty-id], textarea[data-duty-id]'))
        syncDutyTitle(t.getAttribute('data-duty-id'), t.value);
      else if (t.matches('input[data-task-id], textarea[data-task-id]'))
        syncTaskText(t.getAttribute('data-task-id'), t.value);
      else return;
      if (!_burstPushed) { pushHistoryState(); _burstPushed = true; }
      clearTimeout(_burstTimer);
      _burstTimer = setTimeout(() => { _burstPushed = false; }, 120);
    });

    dutiesCont.addEventListener('focusout', function (e) {
      if (e.target.matches(_dutyOrTask)) {
        clearTimeout(_burstTimer); _burstPushed = false;
      }
    });
  }

  // Verification accordion
  const verCont = document.getElementById('verificationAccordionContainer');
  if (verCont) {
    verCont.addEventListener('click', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      const taskKey = target.getAttribute('data-task-key');
      const dimension = target.getAttribute('data-dimension');
      if (action === 'update-rating') {
        updateRating(taskKey, dimension, target.value);
      } else if (action === 'update-performs-task') {
        updatePerformsTask(taskKey, target.value);
      } else if (action === 'update-comments') {
        updateComments(taskKey, target.value);
      } else if (action === 'update-workshop-count') {
        updateWorkshopCount(taskKey, dimension, target.getAttribute('data-scale'), parseInt(target.value));
      } else if (action === 'validate-compute-task') {
        validateAndComputeTask(taskKey);
      }
    });
    verCont.addEventListener('change', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      const taskKey = target.getAttribute('data-task-key');
      const dimension = target.getAttribute('data-dimension');
      if (action === 'update-rating') {
        updateRating(taskKey, dimension, target.value);
      } else if (action === 'update-performs-task') {
        updatePerformsTask(taskKey, target.value);
      } else if (action === 'update-comments') {
        updateComments(taskKey, target.value);
      }
    });

    // ── FIX: workshop count inputs use 'input' event (not click) ──
    // The count inputs have data-scale (not data-value) as the scale key.
    // Listening on 'input' ensures real-time validation warnings and
    // live mean calculations update as the user types or uses spinners.
    verCont.addEventListener('input', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      if (target.getAttribute('data-action') !== 'update-workshop-count') return;
      const taskKey   = target.getAttribute('data-task-key');
      const dimension = target.getAttribute('data-dimension');
      const scale     = target.getAttribute('data-scale');   // 0 | 1 | 2 | 3
      updateWorkshopCount(taskKey, dimension, scale, parseInt(target.value) || 0);
    });
  }

  // Clusters container
  const clustersCont = document.getElementById('clustersContainer');
  if (clustersCont) {
    clustersCont.addEventListener('click', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      if (action === 'rename-cluster')          renameCluster(target.getAttribute('data-cluster-id'));
      else if (action === 'delete-cluster')     deleteCluster(target.getAttribute('data-cluster-id'));
      else if (action === 'show-pc-range-help') _showPCRangeHelp();
      else if (action === 'regen-cluster-criteria') {
        generateForSingleCluster(target.getAttribute('data-cluster-id'))
          .then((ok) => { if (ok) { saveCurrentProject(); renderProjectsSidebar(); } })
          .catch(() => {});
      }
      else if (action === 'remove-task-from-cluster') {
        removeTaskFromCluster(target.getAttribute('data-cluster-id'), parseInt(target.getAttribute('data-task-index')));
      }
    });
    clustersCont.addEventListener('change', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      if (action === 'update-cluster-range') {
        updateClusterRange(target.getAttribute('data-cluster-id'), target.value);
      }
    });
    clustersCont.addEventListener('blur', function (e) {
      const target = e.target.closest('[data-action-blur]');
      if (!target) return;
      if (target.getAttribute('data-action-blur') === 'update-cluster-criteria-numbered') {
        updateClusterCriteriaFromNumbered(target.getAttribute('data-cluster-id'), target.value);
      }
    }, true);
    clustersCont.addEventListener('focus', function (e) {
      const target = e.target.closest('[data-action-focus]');
      if (!target) return;
      if (target.getAttribute('data-action-focus') === 'init-criteria-number') {
        initCriteriaNumber(e, target.getAttribute('data-cluster-id'));
      }
    }, true);
    clustersCont.addEventListener('keydown', function (e) {
      const target = e.target.closest('[data-action-keydown]');
      if (!target) return;
      if (target.getAttribute('data-action-keydown') === 'handle-criteria-keydown') {
        handleCriteriaKeydown(e, target.getAttribute('data-cluster-id'));
      }
    });
  }

  // Available tasks list (checkboxes + dropdowns)
  const availableTasksList = document.getElementById('availableTasksList');
  if (availableTasksList) {
    availableTasksList.addEventListener('change', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      if (target.getAttribute('data-action') === 'update-cluster-button') {
        updateCreateClusterButton();
      } else if (target.getAttribute('data-action') === 'add-task-to-cluster-dropdown') {
        addTaskToClusterFromDropdown(parseInt(target.getAttribute('data-task-index')), target.value);
        target.value = '';
      }
    });
  }

  // PC Source List (LO)
  const pcSourceList = document.getElementById('pcSourceList');
  if (pcSourceList) {
    pcSourceList.addEventListener('change', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      if (target.getAttribute('data-action') === 'update-lo-button') {
        updateCreateLOButton();
      } else if (target.getAttribute('data-action') === 'reassign-pc-to-lo') {
        reassignPCToLO(
          target.getAttribute('data-pc-id'),
          null,
          null,
          target.value
        );
        target.value = '';
      }
    });
  }

  // LO blocks container
  const loBlocksCont = document.getElementById('loBlocksContainer');
  if (loBlocksCont) {
    loBlocksCont.addEventListener('click', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      if (action === 'toggle-edit-lo')      toggleEditLO(target.getAttribute('data-lo-id'));
      else if (action === 'delete-lo')      deleteLearningOutcome(target.getAttribute('data-lo-id'));
      else if (action === 'unassign-pc-from-lo') {
        unassignPCFromLO(target.getAttribute('data-lo-id'), target.getAttribute('data-pc-id'));
      }
    });
    loBlocksCont.addEventListener('blur', function (e) {
      const target = e.target.closest('[data-action-blur]');
      if (!target) return;
      // saveLOStatement handled via toggleEditLO save path
    }, true);
  }

  // Module LO list
  const moduleLoList = document.getElementById('moduleLoList');
  if (moduleLoList) {
    moduleLoList.addEventListener('change', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      if (target.getAttribute('data-action') === 'update-module-button') {
        updateCreateModuleButton();
      } else if (target.getAttribute('data-action') === 'add-lo-to-module-dropdown') {
        addLoToModuleFromDropdown(target.getAttribute('data-lo-id'), target.value);
        target.value = '';
      }
    });
  }

  // Modules container
  const modulesCont = document.getElementById('modulesContainer');
  if (modulesCont) {
    modulesCont.addEventListener('click', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      if (action === 'rename-module')          renameModule(target.getAttribute('data-module-id'));
      else if (action === 'delete-module')     deleteModule(target.getAttribute('data-module-id'));
      else if (action === 'build-module-in-builder') {
        openModuleBuilderFromMapping(target.getAttribute('data-module-id'));
      }
      else if (action === 'remove-lo-from-module') {
        removeLoFromModule(target.getAttribute('data-module-id'), target.getAttribute('data-lo-id'));
      }
    });
  }

  // Custom sections container
  const customSectCont = document.getElementById('customSectionsContainer');
  if (customSectCont) {
    customSectCont.addEventListener('click', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      if (action === 'toggle-edit-heading') {
        toggleEditHeading(target.getAttribute('data-heading-id'));
      } else if (action === 'clear-section') {
        clearSection(
          target.getAttribute('data-input-id'),
          target.getAttribute('data-heading-id'),
          target.getAttribute('data-default-heading'),
          target.getAttribute('data-default-heading-key')
        );
      } else if (action === 'remove-custom-section') {
        removeCustomSection(target.getAttribute('data-section-id'));
      }
    });
  }

  // Skills Level container
  const skillsCont = document.getElementById('skillsLevelContainer');
  if (skillsCont) {
    skillsCont.addEventListener('click', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      if (action === 'remove-skills-category') {
        removeSkillsCategory(parseInt(target.getAttribute('data-cat-index')));
      } else if (action === 'add-skills-competency') {
        addSkillsCompetency(parseInt(target.getAttribute('data-cat-index')));
      } else if (action === 'remove-skills-competency') {
        removeSkillsCompetency(
          parseInt(target.getAttribute('data-cat-index')),
          parseInt(target.getAttribute('data-comp-index'))
        );
      }
    });
    skillsCont.addEventListener('change', function (e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      if (action === 'update-skills-category-name') {
        updateSkillsCategoryName(parseInt(target.getAttribute('data-cat-index')), target.value);
      } else if (action === 'update-skills-competency-text') {
        updateSkillsCompetencyText(
          parseInt(target.getAttribute('data-cat-index')),
          parseInt(target.getAttribute('data-comp-index')),
          target.value
        );
      } else if (action === 'handle-skills-level-change') {
        handleSkillsLevelChange(
          parseInt(target.getAttribute('data-cat-index')),
          parseInt(target.getAttribute('data-comp-index')),
          target.getAttribute('data-level'),
          target.checked
        );
      }
    });
  }

  // Additional Info static buttons (formatList / toggleEditHeading / clearSection)
  _onStaticInfoButtons();

  // When the last project is deleted via the sidebar bin button,
  // dacum_projects.js dispatches this event so we silently reset the DOM
  document.addEventListener('dacum:last-project-deleted', () => {
    clearAllSilent();
    resetHistoryToCurrentState();
  });

  // ── Snapshot panel delegation ────────────────────────────────
  const snapList = document.getElementById('snapshotList');
  if (snapList) {
    snapList.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const id     = btn.getAttribute('data-snap-id');
      if (action === 'restore-snapshot') restoreSnapshot(id);
      else if (action === 'delete-snapshot')  deleteSnapshot(id);
    });
  }
}

// ── Private helpers ───────────────────────────────────────────

function _on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

function _defaultSnapName() {
  const occ = (document.getElementById('occupationTitle')?.value || '').trim();
  const now = new Date();
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return occ ? `${occ} — ${time}` : `Workshop checkpoint — ${time}`;
}

function _onRadioGroup(name, handler) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
    radio.addEventListener('change', handler);
  });
}

function _onStaticInfoButtons() {
  // Heading rename buttons and format buttons are in the static HTML
  document.querySelectorAll('[data-action="toggle-edit-heading"]').forEach(btn => {
    btn.addEventListener('click', function () {
      toggleEditHeading(this.getAttribute('data-heading-id'));
    });
  });
  document.querySelectorAll('[data-action="clear-section"]').forEach(btn => {
    btn.addEventListener('click', function () {
      clearSection(
        this.getAttribute('data-input-id'),
        this.getAttribute('data-heading-id'),
        this.getAttribute('data-default-heading'),
        this.getAttribute('data-default-heading-key')
      );
    });
  });
  document.querySelectorAll('[data-action="format-list"]').forEach(btn => {
    btn.addEventListener('click', function () {
      formatList(this.getAttribute('data-input-id'), this.getAttribute('data-format-type'));
    });
  });
}

// ── Tab help modals ───────────────────────────────────────────
// Small "?" buttons next to a tab heading open a guidance modal.
// These replace the permanent hint paragraphs that used to sit under
// each heading — the guidance stays available without spending
// vertical space above the fields the facilitator actually works in.
//
// _showHelpModal is generic so each tab only supplies its content;
// the chrome, animations, and close behaviour are defined once.

function _hasVerifiedLiveWorkshopData() {
  return typeof appState.lwFinalizedData    !== 'undefined' && appState.lwFinalizedData &&
         typeof appState.lwAggregatedResults !== 'undefined' && appState.lwAggregatedResults;
}

function _showHelpModal({ id, icon, title, intro, items, note, bodyHtml, maxWidth }) {
  const existing = document.getElementById(id);
  if (existing) { existing.remove(); return; }   // second click closes it

  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);
  /* The dialog is appended to <body>, so it inherits dir from <html> —
     except its inner text alignment, which the inline styles below set
     explicitly. Setting dir on the overlay keeps the modal correct even
     if it is ever re-parented. */
  overlay.setAttribute('dir', (window.i18n && window.i18n.isRTL()) ? 'rtl' : 'ltr');

  overlay.style.cssText =
    'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;' +
    'justify-content:center;padding:20px;background:rgba(0,0,0,0.55);' +
    'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);' +
    'animation:aiErrFadeIn 0.2s ease;';

  const rows = (items || []).map(([bullet, strong, rest]) =>
    '<li style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;' +
    'border-bottom:1px solid #f1f5f9;">' +
      '<span style="font-size:1.05em;line-height:1.4;flex-shrink:0;">' + bullet + '</span>' +
      '<span style="font-size:0.87em;line-height:1.6;color:#334155;">' +
        (strong ? '<strong style="color:#1e293b;">' + strong + '</strong>' + (rest ? ' — ' : '') : '') +
        (rest || '') +
      '</span>' +
    '</li>'
  ).join('');

  const noteHtml = note
    ? '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;' +
      'padding:11px 13px;margin-bottom:18px;font-size:0.84em;line-height:1.6;color:#92400e;">' +
      note + '</div>'
    : '';

  overlay.innerHTML =
    '<div style="background:#fff;border-radius:16px;max-width:' + (maxWidth || '480px') + ';width:100%;' +
    'box-shadow:0 24px 60px rgba(0,0,0,0.35);overflow:hidden;' +
    'font-family:\'Segoe UI\',system-ui,sans-serif;animation:aiErrSlideIn 0.22s ease;' +
    'max-height:86vh;display:flex;flex-direction:column;">' +
      '<div style="padding:20px 22px 16px;display:flex;align-items:center;gap:12px;' +
      'background:linear-gradient(135deg,#eef2ff,#e0e7ff);border-bottom:1px solid #c7d2fe;' +
      'flex-shrink:0;">' +
        '<span style="font-size:1.7em;line-height:1;">' + icon + '</span>' +
        '<p style="margin:0;font-size:1em;font-weight:800;color:#3730a3;">' + title + '</p>' +
      '</div>' +
      '<div style="padding:18px 22px 20px;overflow-y:auto;">' +
        (intro
          ? '<p style="margin:0 0 8px;font-size:0.88em;color:#475569;line-height:1.6;">' +
            intro + '</p>'
          : '') +
        (rows ? '<ul style="list-style:none;margin:0 0 18px;padding:0;">' + rows + '</ul>' : '') +
        (bodyHtml || '') +
        noteHtml +
        '<div style="display:flex;justify-content:flex-end;">' +
          '<button data-help-close style="padding:9px 22px;background:#667eea;' +
          'color:#fff;border:none;border-radius:8px;font-size:0.9em;font-weight:700;' +
          'cursor:pointer;font-family:inherit;">' + _t('btnGotIt') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Reuses the keyframes the AI error modals inject; create them only
  // if nothing has needed them yet this session.
  if (!document.getElementById('aiErrStyles')) {
    const st = document.createElement('style');
    st.id = 'aiErrStyles';
    st.textContent =
      '@keyframes aiErrFadeIn  { from{opacity:0} to{opacity:1} }' +
      '@keyframes aiErrSlideIn { from{transform:translateY(-14px);opacity:0}' +
      ' to{transform:translateY(0);opacity:1} }';
    document.head.appendChild(st);
  }

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('[data-help-close]').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

// Task Verification guidance.
//
// This content used to sit in a permanent instructions card at the top
// of the tab. Moved into a modal for consistency with the other tabs,
// and because a card that is always open is skimmed once and then
// scrolled past forever — the scale definitions are exactly what a
// facilitator needs to re-check mid-session, and they were pushed off
// screen by the duty accordions.
//
// Expanded beyond the original card with the points a new user most
// often gets wrong: that verification prioritises rather than filters,
// that all three dimensions must be set before a task counts, and that
// a high total is not by itself a call for intensive training.
function _showTaskVerificationHelp() {
  const P = 'margin:0 0 10px;font-size:0.86em;color:#475569;line-height:1.65;';

  _showHelpModal({
    id:    'taskVerificationHelpModal',
    icon:  '\u{1F3AF}',
    title: _t('helpTVTitle'),
    maxWidth: '560px',
    intro: _t('helpTVIntro'),
    items: [
      ['\u2B50',        _t('helpTVK1'), _t('helpTVV1')],
      ['\u{1F501}',     _t('helpTVK2'), _t('helpTVV2')],
      ['\u{1F9E0}',     _t('helpTVK3'), _t('helpTVV3')],
      ['\u{1F465}',     _t('helpTVK4'), _t('helpTVV4')],
      ['\u2705',        _t('helpTVK5'), _t('helpTVV5')],
      ['\u{1F4CA}',     _t('helpTVK6'), _t('helpTVV6')],
    ],
    bodyHtml: '<p style="' + P + '">' + _t('helpTVBody') + '</p>',
    note: _t('helpTVNote'),
  });
}

// Task Analysis guidance — same pattern as _showTaskVerificationHelp().
function _showTaskAnalysisHelp() {
  _showHelpModal({
    id:    'taskAnalysisHelpModal',
    icon:  '\u{1F52C}',
    title: _t('helpTATitle'),
    maxWidth: '560px',
    intro: _t('helpTAIntro'),
    items: [
      ['\u{1F4CB}', _t('helpTAK1'), _t('helpTAV1')],
      ['\u{1F9E0}', _t('helpTAK2'), _t('helpTAV2')],
      ['\u{1F6E0}', _t('helpTAK3'), _t('helpTAV3')],
      ['\u26A0\uFE0F', _t('helpTAK4'), _t('helpTAV4')],
      ['\u2705', _t('helpTAK5'), _t('helpTAV5')],
    ],
    note: _t('helpTANote'),
  });
}

function _showAdditionalInfoHelp() {
  _showHelpModal({
    id:    'addInfoHelpModal',
    icon:  '💡',
    title: _t('helpAddInfoTitle'),
    intro: _t('helpAddInfoIntro'),
    items: [
      ['📚', _t('helpAddInfoK1'), _t('helpAddInfoV1')],
      ['🧭', _t('helpAddInfoK2'), _t('helpAddInfoV2')],
      ['🛠️', _t('helpAddInfoK3'), _t('helpAddInfoV3')],
      ['📈', _t('helpAddInfoK4'), _t('helpAddInfoV4')],
    ],
  });
}

function _showClusteringHelp() {
  _showHelpModal({
    id:    'clusteringHelpModal',
    icon:  '\u{1F3AF}',
    title: _t('helpClusterTitle'),
    intro: _t('helpClusterIntro'),
    items: [
      ['\u{1F3AF}', '', _t('helpClusterV1')],
      ['\u{1F504}', '', _t('helpClusterV2')],
      ['\u{1F9E0}', '', _t('helpClusterV3')],
    ],
    note: _t('helpClusterNote'),
  });
}

function _showClusterNamingHelp() {
  _showHelpModal({
    id:    'clusterNamingHelpModal',
    icon:  '\u270D\uFE0F',
    title: _t('helpNamingTitle'),
    intro: _t('helpNamingIntro'),
    items: [
      ['\u{1F9E9}', _t('helpNamingK1'), _t('helpNamingV1')],
      ['\u{1F4AC}', _t('helpNamingK2'), _t('helpNamingV2')],
    ],
    note: _t('helpNamingNote'),
  });
}

// Performance Criteria + Range guidance.
// One modal, opened from BOTH section headings inside every cluster
// card — the two concepts are defined in relation to each other
// (criteria = the standard, range = the conditions the standard
// applies across), so splitting them into two modals would force the
// facilitator to open both to understand either.
function _showPCRangeHelp() {
  const P  = 'margin:0 0 8px;font-size:0.88em;color:#475569;line-height:1.6;';
  const LI = 'font-size:0.87em;line-height:1.7;color:#334155;';

  /* padding-inline-start, not padding-left. These lists are built as
     inline style strings, which no stylesheet can override — so the RTL
     fix has to be made here, at the point the markup is written. */
  const LIST = 'margin:0 0 16px;padding-inline-start:20px;';

  const component = (label, colour, desc) =>
    '<div style="flex:1 1 150px;min-width:0;background:#fff;border:1px solid #e2e8f0;' +
    'border-radius:8px;padding:10px 12px;">' +
      '<p style="margin:0 0 3px;font-size:0.84em;font-weight:800;color:' + colour + ';">' +
        label + '</p>' +
      '<p style="margin:0;font-size:0.79em;color:#64748b;line-height:1.5;">' + desc + '</p>' +
    '</div>';

  const chip = (text, bg, fg) =>
    '<span style="display:inline-block;background:' + bg + ';color:' + fg + ';' +
    'border-radius:5px;padding:1px 7px;font-size:0.88em;font-weight:700;' +
    'font-style:italic;white-space:nowrap;">(' + text + ')</span>';

  const bodyHtml =
    '<p style="' + P + '">' + _t('helpPCLead') + '</p>' +
    '<ol style="' + LIST + '">' +
      '<li style="' + LI + '">' + _t('helpPCLi1') + '</li>' +
      '<li style="' + LI + '">' + _t('helpPCLi2') + '</li>' +
      '<li style="' + LI + '">' + _t('helpPCLi3') + '</li>' +
    '</ol>' +

    '<p style="' + P + '">' + _t('helpPCRangeLead') + '</p>' +
    '<ul style="' + LIST + '">' +
      '<li style="' + LI + '">' + _t('helpPCRange1') + '</li>' +
      '<li style="' + LI + '">' + _t('helpPCRange2') + '</li>' +
      '<li style="' + LI + '">' + _t('helpPCRange3') + '</li>' +
    '</ul>' +

    '<p style="margin:0 0 10px;font-size:0.88em;font-weight:700;color:#1e293b;">' +
      _t('helpPCComponents') + '</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;">' +
      component(_t('helpPCWhat'),      '#2563eb', _t('helpPCWhatDesc')) +
      component(_t('helpPCAction'),    '#16a34a', _t('helpPCActionDesc')) +
      component(_t('helpPCQualifier'), '#9333ea', _t('helpPCQualifierDesc')) +
    '</div>' +

    /* The example is assembled from three labelled fragments rather than
       one interpolated sentence: Arabic places the verb before its
       object, so a fixed English word order would be baked in. */
    '<div style="background:linear-gradient(135deg,#3b82f6,#2563eb);border-radius:10px;' +
    'padding:14px 16px;margin-bottom:4px;">' +
      '<p style="margin:0 0 8px;font-size:0.86em;font-weight:800;color:#fff;">' +
        _t('helpPCExampleLabel') + '</p>' +
      '<p style="margin:0;font-size:0.87em;color:#fff;line-height:2;">' +
        '\u201C' + _t('helpPCExPart1') + ' ' + chip(_t('chipWhat'), '#bfdbfe', '#1e3a8a') +
        ' ' + _t('helpPCExPart2') + ' ' + chip(_t('chipAction'), '#bbf7d0', '#14532d') +
        ' ' + _t('helpPCExPart3') + ' ' + chip(_t('chipQualifier'), '#e9d5ff', '#581c87') +
        '\u201D' +
      '</p>' +
    '</div>';

  _showHelpModal({
    id:       'pcRangeHelpModal',
    icon:     '\u{1F4D0}',
    title:    _t('helpPCTitle'),
    maxWidth: '620px',
    bodyHtml,
  });
}

// Duty & Task statement guidelines.
// Duty rules are paraphrased from the duty-statement guidance in
// Robert E. Norton's DACUM Handbook (the standard reference for the
// methodology) rather than quoted, and the source is credited in the
// modal so a facilitator can look it up.
//
// Duties and tasks share one modal because their rules only make
// sense in contrast: a duty is the general heading, a task is the
// specific, observable unit of work beneath it. Facilitators most
// often go wrong at exactly that boundary — writing a task that is
// really a duty, or vice versa.
function _showDutiesHelp() {
  const P  = 'margin:0 0 8px;font-size:0.88em;color:#475569;line-height:1.6;';
  const LI = 'font-size:0.87em;line-height:1.7;color:#334155;margin-bottom:4px;';

  const formatBox = (accent, bg, label, formula, example) =>
    '<div style="background:' + bg + ';border-inline-start:3px solid ' + accent + ';' +
    'border-radius:8px;padding:11px 13px;margin-bottom:10px;">' +
      '<p style="margin:0 0 5px;font-size:0.83em;font-weight:800;color:' + accent + ';">' +
        label + '</p>' +
      '<p style="margin:0 0 5px;font-size:0.85em;color:#334155;line-height:1.6;">' +
        formula + '</p>' +
      '<p style="margin:0;font-size:0.84em;color:#475569;font-style:italic;">' +
        '💡 ' + example + '</p>' +
    '</div>';

  /* Each list item is ONE key including its <strong> tags. Splitting the
     emphasis out would force every language into English word order — in
     Arabic the emphasised phrase frequently sits elsewhere in the
     sentence, so fragment-joining produces nonsense. */
  const LIS = ['helpDutiesLi1','helpDutiesLi2','helpDutiesLi3',
               'helpDutiesLi4','helpDutiesLi5','helpDutiesLi6']
    .map(k => '<li style="' + LI + '">' + _t(k) + '</li>').join('');

  const bodyHtml =
    '<p style="' + P + '">' + _t('helpDutiesLead') + '</p>' +
    '<ul style="margin:0 0 16px;padding-inline-start:20px;">' + LIS + '</ul>' +

    formatBox('#4338ca', '#eef2ff', '\uD83D\uDDC2\uFE0F ' + _t('helpDutyFormatLabel'),
      _t('helpDutyFormula'), _t('helpDutyExample')) +

    formatBox('#a16207', '#fffbeb', '\uD83D\uDCDD ' + _t('helpTaskFormatLabel'),
      _t('helpTaskFormula'), _t('helpTaskExample')) +

    '<p style="margin:12px 0 0;font-size:0.78em;color:#94a3b8;line-height:1.6;">' +
      _t('helpDutiesSource') + '</p>';

  _showHelpModal({
    id:       'dutiesHelpModal',
    icon:     '📋',
    title:    _t('helpDutiesTitle'),
    maxWidth: '560px',
    bodyHtml,
    note: _t('helpDutiesNote'),
  });
}

// Learning Outcome design patterns.
// Previously a permanent card at the top of the tab; moved behind the
// "?" button so the Performance Criteria list starts at the top of the
// screen. The three patterns are a design decision the facilitator
// makes once per programme, not something they need on screen while
// working through dozens of criteria.
function _showLearningOutcomesHelp() {
  /* "Best for X." is its own key with a {what} slot rather than a
     concatenated prefix: in Arabic the preposition attaches to the noun
     that follows it, so gluing a fixed lead-in onto a translated tail
     produces broken grammar. */
  const pattern = (name, rule, best) =>
    '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;' +
    'padding:11px 13px;margin-bottom:9px;">' +
      '<p style="margin:0;font-size:0.86em;line-height:1.6;color:#334155;">' +
        '<strong style="color:#4338ca;">' + name + ':</strong> ' + rule +
        ' <span style="color:#64748b;">' + _tf('helpLOBestFor', { what: best }) + '</span>' +
      '</p>' +
    '</div>';

  const bodyHtml =
    pattern(_t('helpLOPatAName'), _t('helpLOPatARule'), _t('helpLOPatABest')) +
    pattern(_t('helpLOPatBName'), _t('helpLOPatBRule'), _t('helpLOPatBBest')) +
    pattern(_t('helpLOPatCName'), _t('helpLOPatCRule'), _t('helpLOPatCBest'));

  _showHelpModal({
    id:       'loHelpModal',
    icon:     '\u{1F4DA}',
    title:    _t('helpLOTitle'),
    intro:    _t('helpLOIntro'),
    maxWidth: '540px',
    bodyHtml,
    note: '\u{1F4A1} ' + _t('helpLONote'),
  });
}

// Module Mapping purpose + grouping strategies.
//
// NOTE: the three "Module Grouping Strategy" radio buttons that used to
// sit at the top of this tab were purely decorative — no code anywhere
// read the moduleGroupMode input, so selecting a mode changed nothing.
// Rather than leave a control that silently does nothing, the three
// strategies are documented here as guidance on how to use the
// dropdowns below, which is how grouping actually works today.
function _showModuleMappingHelp() {
  /* "Mode {n}:" is a key with a slot rather than 'Mode ' + n — the word
     order differs by language and the number is not always a suffix. */
  const mode = (n, title, detail) =>
    '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;' +
    'padding:11px 13px;margin-bottom:9px;">' +
      '<p style="margin:0;font-size:0.86em;line-height:1.6;color:#334155;">' +
        '<strong style="color:#4338ca;">' + _tf('helpMMModeLabel', { n: n }) + '</strong> ' + title +
        '<br><span style="color:#64748b;">' + detail + '</span>' +
      '</p>' +
    '</div>';

  const bodyHtml =
    '<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;' +
    'padding:12px 14px;margin-bottom:16px;">' +
      '<p style="margin:0;font-size:0.87em;line-height:1.6;color:#3730a3;">' +
        _t('helpMMPurpose') +
      '</p>' +
    '</div>' +

    '<p style="margin:0 0 10px;font-size:0.88em;font-weight:700;color:#1e293b;">' +
      _t('helpMMStrategy') + '</p>' +

    mode(1, _t('helpMMMode1'), _t('helpMMMode1Detail')) +
    mode(2, _t('helpMMMode2'), _t('helpMMMode2Detail')) +
    mode(3, _t('helpMMMode3'), _t('helpMMMode3Detail'));

  _showHelpModal({
    id:       'mmHelpModal',
    icon:     '\u{1F4E6}',
    title:    _t('helpMMTitle'),
    maxWidth: '540px',
    bodyHtml,
    note: _t('helpMMNote'),
  });
}
