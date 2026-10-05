// ============================================================
// /dacum_projects.js
// Multi-Project System for DACUM Live Pro.
//
// Naming note: the existing projects.js owns clearAll/switchTab/
// generateAIDacum — this module uses the name dacum_projects.js
// to avoid any collision.
//
// Storage          : project_store.js owns 'dacum_projects'
//                    (localStorage by default, IndexedDB as fallback)
// Active project   : 'dacum_active_project'
// Max projects     : 50
// ============================================================

import { appState, defaultSupplementaryVerification,
         normalizeModuleCurriculumData } from './state.js';
import { showStatus }         from './renderer.js';
import { syncAllFromDOM }     from './duties.js';
import { clearAllSilent }     from './projects.js';
import { setImage, getImageSync, imageKey,
         removeProjectImages }  from './image_store.js';
import { readProjects, writeProjectsPayload, getStorageBackend,
         isProjectStoreLocked, canUseLargeStorage, getProjectsBytes,
         getStorageInfo, migrateToIdb, migrateToLocal,
         onProjectStoreError, isMigrating } from './project_store.js';
import { renderAvailableTasks, renderClusters,
         renderPCSourceList, renderLearningOutcomes,
         renderModuleLoList, renderModules } from './modules.js';
import { renderAll }          from './workshop_snapshots.js';
import { resetHistoryToCurrentState } from './history.js';
import { renderModuleCurriculum } from './module_curriculum.js';

/* i18n access — resolved lazily; see duties.js for why.
   _tp() picks the correct plural form: Arabic has six categories and
   "2 duties" must render as the dual «واجبان», not «2 واجب». */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)      : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v)  : k);
const _tp = (k, n) => (window.i18n ? window.i18n.tp(k, n)  : k);


const LS_ACTIVE   = 'dacum_active_project';
const MAX_PROJECTS = 50;

let _searchQuery = '';

// ── Public API ────────────────────────────────────────────────

export function createProject(name) {
  hideWelcomeOverlay();   // dismiss welcome screen if visible
  const label    = (name || '').trim() || 'Untitled DACUM Project';
  const id       = `project_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // ── Persist the outgoing project before wiping the workspace ──
  // Without this, any unsaved edits in the project the user is
  // leaving would be destroyed by the reset below.
  const previousId = _getActive();
  if (previousId) {
    try { saveCurrentProject(); } catch (_) { /* best effort */ }
  }

  // ── Blank the workspace, THEN capture ────────────────────────
  // _captureState() snapshots the live DOM + appState. Called while
  // another project is still loaded, it copied that project's duties,
  // tasks and chart info straight into the "new" project — which is
  // exactly the bug this guards against. Clearing first guarantees a
  // genuinely empty starting point (one blank duty + one blank task,
  // the same baseline the app boots with).
  clearAllSilent();

  const projects = _loadProjects();   // re-read AFTER the save above

  const project = {
    id,
    name:    label,
    created: Date.now(),
    state:   _captureState(),
  };

  projects.push(project);
  if (projects.length > MAX_PROJECTS) projects.splice(0, 1);

  _saveProjects(projects);
  _setActive(id);

  // The clear wiped the workspace, so the undo stack's baseline must
  // move with it — otherwise Ctrl+Z would resurrect the old project's
  // content inside this new one.
  try { resetHistoryToCurrentState(); } catch (_) {}

  renderProjectsSidebar();
  showStatus('✅ ' + _tf('msgProjectCreated', { name: label }), 'success');
  return id;
}

// ── Import a project from parsed JSON data ────────────────────
// Called by snapshots.js after parsing each imported file.
// Creates a new project entry in the sidebar automatically.
export function importProjectFromData(data, fileName) {
  // Extract name from filename first — strip date/time suffix (e.g. _2026-03-14_22-45.json)
  // This preserves user-renamed project names when re-importing exported files
  const stemFromFile = fileName
    .replace(/\.json$/i, '')                        // remove .json
    .replace(/_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/, '') // strip _YYYY-MM-DD_HH-MM
    .replace(/_\d{4}-\d{2}-\d{2}$/, '')             // strip _YYYY-MM-DD (older format)
    .replace(/[_]+/g, ' ')                           // underscores → spaces
    .trim();

  let label = stemFromFile
             || (data?.chartInfo?.occupationTitle || '').trim()
             || (data?.chartInfo?.jobTitle || '').trim()
             || 'Imported Project';

  const id = `project_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const projects = _loadProjects();

  // Build state object from imported JSON — mirrors _applyState fields
  const s = data;
  const state = {
    // Prefer dutiesData (rich format saved by new export), fall back to duties (flat legacy)
    dutiesData:               s.dutiesData && s.dutiesData.length > 0
                              ? s.dutiesData
                              : _dutiesArrayToState(s.duties || []),
    dutyCount:                s.dutiesData && s.dutiesData.length > 0
                              ? s.dutiesData.length
                              : (s.duties ? s.duties.length : 0),
    taskCounts:               s.taskCounts || {},
    producedForImage:         s.chartInfo?.producedForImage || null,
    producedByImage:          s.chartInfo?.producedByImage  || null,
    customSectionCounter:     0,
    // 3.51.0: a file without the matrix (hand-made or from another tool)
    // gets an empty one; renderSkillsLevel() then seeds the defaults.
    skillsLevelData:          Array.isArray(s.skillsLevelMatrix) ? s.skillsLevelMatrix
                              : Array.isArray(s.skillsLevelData) ? s.skillsLevelData : [],
    skillsLevelColumns:       s.skillsLevelColumns || null,
    verificationRatings:      s.verification?.ratings        || {},
    taskMetadata:             s.verification?.taskMetadata   || {},
    // s.taskAnalysis is the key saveToJSON() writes (see snapshots.js).
    // Absent in files exported before this feature existed — {} then.
    taskAnalysisData:         s.taskAnalysis                 || {},
    taskAnalysisPriority:     s.taskAnalysisPriority          || {},
    // 3.46.0 — absent in older files: no added sections.
    taskAnalysisCustomSections: Array.isArray(s.taskAnalysisCustomSections) ? s.taskAnalysisCustomSections : [],
    // Absent in files exported before Supplementary Verification existed.
    supplementaryVerification: s.supplementaryVerification    || null,
    collectionMode:           s.verification?.collectionMode || 'workshop',
    workflowMode:             s.verification?.workflowMode   || 'standard',
    workshopParticipants:     s.verification?.workshopParticipants || 10,
    priorityFormula:          s.verification?.priorityFormula || 'if',
    workshopCounts:           s.verification?.workshopCounts || {},
    workshopResults:          s.verification?.workshopResults || {},
    tvExportMode:             'appendix',
    trainingLoadMethod:       s.verification?.trainingLoadMethod || 'advanced',
    clusteringData:           s.competencyClusters
                              ? { clusters: s.competencyClusters.clusters || [],
                                  availableTasks: s.competencyClusters.availableTasks || [],
                                  clusterCounter: s.competencyClusters.clusterCounter || 0 }
                              : { clusters: [], availableTasks: [], clusterCounter: 0 },
    learningOutcomesData:     s.learningOutcomes
                              ? { outcomes: s.learningOutcomes.outcomes || [],
                                  outcomeCounter: s.learningOutcomes.outcomeCounter || 0 }
                              : { outcomes: [], outcomeCounter: 0 },
    moduleMappingData:        s.moduleMapping
                              ? { modules: s.moduleMapping.modules || [],
                                  moduleCounter: s.moduleMapping.moduleCounter || 0,
                                  // Absent in files exported before 3.33.0.
                                  ...(s.moduleMapping.levelCount ? { levelCount: s.moduleMapping.levelCount } : {}),
                                  ...(s.moduleMapping.labelMode ? { labelMode: s.moduleMapping.labelMode } : {}) }
                              : { modules: [], moduleCounter: 0 },
    // Module Curriculum (3.33.0). Absent in older files — normalised to
    // the default when the project is opened (_applyState).
    moduleCurriculumData:     s.moduleCurriculum || null,
    // An imported chart that already contains clusters has, by
    // definition, been through the verification decision already —
    // forcing the gate shut would lock the user out of their own
    // clustering work until they re-made a decision they had made
    // before exporting.
    verificationDecisionMade: (s.competencyClusters?.clusters?.length || 0) > 0,
    clusteringAllowed:        (s.competencyClusters?.clusters?.length || 0) > 0,
    lwSessionId:              null,
    lwFinalizedData:          null,
    lwAggregatedResults:      null,
    lwIsFinalized:            false,
    lwParticipantUrl:         '',
    _chartInfo: {
      dacumDate:       s.chartInfo?.dacumDate       || '',
      dacumDateEnd:    s.chartInfo?.dacumDateEnd    || '',
      venue:           s.chartInfo?.venue            || '',
      workshopFormat:  s.chartInfo?.workshopFormat   || 'inperson',
      producedFor:     s.chartInfo?.producedFor      || '',
      producedBy:      s.chartInfo?.producedBy       || '',
      occupationTitle: s.chartInfo?.occupationTitle  || '',
      scopeOfWork:     s.chartInfo?.scopeOfWork      || '',
      jobTitle:        s.chartInfo?.jobTitle         || '',
      sector:          s.chartInfo?.sector           || '',
      context:         s.chartInfo?.context          || '',
      facilitators:    s.chartInfo?.facilitators     || [],
      observers:       s.chartInfo?.observers        || [],
      panelMembers:    s.chartInfo?.panelMembers     || [],
    },
    _additionalInfo: {
      headings: s.additionalInfo?.headings || {},
      content:  s.additionalInfo?.content  || {},
      customSections: s.additionalInfo?.customSections || [],
    },
  };

  // Recalculate dutyCount and taskCounts from dutiesData.
  // From the highest number in the ids, never just the count: after a
  // deletion (duty_1, duty_3) the count is 2, and the next "Add duty"
  // would create a second duty_3 — two tasks sharing one id and all its
  // keyed data. The count is kept as a floor for legacy files.
  if (state.dutiesData && state.dutiesData.length > 0) {
    const _num = (re, id) => { const m = re.exec(String(id || '')); return m ? parseInt(m[1], 10) : 0; };
    state.dutyCount = Math.max(state.dutiesData.length,
      ...state.dutiesData.map(d => _num(/^duty_(\d+)$/, d.id)));
    state.dutiesData.forEach(duty => {
      const tasks = duty.tasks || [];
      state.taskCounts[duty.id] = Math.max(tasks.length,
        ...tasks.map(t => _num(/_(\d+)$/, t && t.inputId)), 0);
    });
  } else {
    state.dutyCount = 0;
  }

  // ── Duplicate guard ──────────────────────────────────────────
  // Re-importing the same file used to append ANOTHER project every
  // time, so a facilitator who imported a chart three times ended up
  // with three identical cards and no way to tell them apart. Now an
  // existing project with the same name is offered for replacement.
  // The choice is the user's: replacing is right when re-importing a
  // corrected export, keeping both is right when comparing revisions.
  const existingIdx = projects.findIndex(
    p => (p.name || '').trim().toLowerCase() === label.trim().toLowerCase()
  );

  if (existingIdx !== -1) {
    const existing = projects[existingIdx];
    const when = existing.lastSaved
      ? new Date(existing.lastSaved).toLocaleString()
      : _t('lblUnknownDate');

    const replace = confirm(
      _tf('confirmReplaceProject', { name: label, when: when })
    );

    if (replace) {
      projects[existingIdx] = {
        ...existing,
        name:      label,
        lastSaved: Date.now(),
        state,
      };
      _saveProjects(projects);
      return { id: existing.id, label };
    }

    // Keep both: disambiguate the new one so the sidebar stays readable
    let n = 2;
    const taken = new Set(projects.map(p => (p.name || '').trim().toLowerCase()));
    while (taken.has(`${label} (${n})`.toLowerCase())) n++;
    label = `${label} (${n})`;
  }

  const project = { id, name: label, created: Date.now(), lastSaved: Date.now(), state };
  projects.push(project);
  if (projects.length > MAX_PROJECTS) projects.splice(0, 1);
  _saveProjects(projects);

  return { id, label };
}

// Convert old flat duties format [{duty, tasks:[]}] → appState dutiesData format
function _dutiesArrayToState(dutiesArr) {
  return (dutiesArr || []).map((d, i) => {
    const dutyId = `duty_${i + 1}`;
    const tasks  = (d.tasks || []).map((text, j) => ({
      divId:   `task_${dutyId}_${j + 1}`,
      inputId: `${dutyId}_${j + 1}`,
      num:     j + 1,
      text:    String(text || '').trim()
    }));
    return { id: dutyId, num: i + 1, title: String(d.duty || '').trim(), tasks };
  });
}

export function loadProject(id) {
  const projects = _loadProjects();
  const project  = projects.find(p => p.id === id);
  if (!project) { showStatus('❌ ' + _t('msgProjectNotFound'), 'error'); return; }

  // Auto-save current project before switching
  saveCurrentProject();

  _applyState(project.state);
  renderAll();
  resetHistoryToCurrentState();
  _setActive(id);
  renderProjectsSidebar();

  // ── Auto-refresh dashboard and sync dropdown to loaded project ──
  try {
    // Sync dropdown selection to this project (if it has results)
    const sel = document.getElementById('dashboardProjectSelector');
    if (sel) {
      const hasResults = Object.keys(project.state?.workshopResults || {}).length > 0;
      // Rebuild options then select this project (or current)
      // renderDashboardProjectSelector is called inside refreshDashboard
    }
    // Import refreshDashboard dynamically from appState callback, or fire directly
    if (typeof appState._onResultsRefreshed === 'function') {
      // Reuse existing callback mechanism
    }
    // Direct approach: dispatch a custom event that tasks.js can listen to
    document.dispatchEvent(new CustomEvent('dacum:project-loaded', { detail: { projectId: id } }));
  } catch(e) {}

  showStatus('📂 ' + _tf('msgProjectLoaded', { name: project.name }), 'success');
}

export function saveCurrentProject() {
  const id = _getActive();
  if (!id) return;
  const projects = _loadProjects();
  const idx      = projects.findIndex(p => p.id === id);
  if (idx === -1) return;
  projects[idx].state     = _captureState();
  projects[idx].lastSaved = Date.now();   // ← timestamp used by crash recovery
  _saveProjects(projects);
}

export function renameProject(id, newName) {
  const label    = (newName || '').trim();
  if (!label) return;
  const projects = _loadProjects();
  const project  = projects.find(p => p.id === id);
  if (!project) return;
  project.name = label;
  _saveProjects(projects);
  renderProjectsSidebar();
  showStatus('✏️ ' + _tf('msgProjectRenamed', { name: label }), 'success');
}

export function deleteProject(id) {
  let projects = _loadProjects();
  const project = projects.find(p => p.id === id);
  if (!project) return;
  projects = projects.filter(p => p.id !== id);
  _saveProjects(projects);

  // Images live outside localStorage now, so deleting the project row
  // no longer removes them — do it explicitly or they accumulate in
  // IndexedDB with no owner and no way for the user to reach them.
  removeProjectImages(id);

  // If deleted project was active, switch to the next available one
  if (_getActive() === id) {
    if (projects.length > 0) {
      loadProject(projects[projects.length - 1].id);
    } else {
      _setActive(null);
      renderProjectsSidebar();
      // Signal events.js to silently reset the DOM (no confirm dialog)
      document.dispatchEvent(new CustomEvent('dacum:last-project-deleted'));
      showWelcomeOverlay();
    }
  }
  renderProjectsSidebar();
  showStatus('🗑️ ' + _t('msgProjectDeleted'), 'success');
}

export function getProjects() {
  return _loadProjects();
}

export function getActiveProjectId() {
  return _getActive();
}

/**
 * deleteActiveProject — removes the currently active project card from the sidebar
 * WITHOUT touching the DOM (caller is responsible for having cleared the DOM first).
 * Shows the welcome overlay afterwards.
 * Called by events.js after a confirmed clearAll().
 */
export function deleteActiveProject() {
  const id = _getActive();
  let remaining = _loadProjects();

  if (id) {
    remaining = remaining.filter(p => p.id !== id);
    _saveProjects(remaining);
    removeProjectImages(id);   // see deleteProject() for why
    _setActive(null);
  }
  renderProjectsSidebar();

  // Only block the screen with the welcome overlay when there is
  // genuinely nothing to return to. If other projects are still in the
  // sidebar, the user's next step is to pick one — an overlay telling
  // them to "create your first project" would be both wrong and in the
  // way. The sidebar already shows the available options.
  if (remaining.length === 0) {
    showWelcomeOverlay();
  } else {
    showStatus(_t('msgWorkspaceCleared'), 'success');
  }
}

/**
 * showWelcomeOverlay — full-screen overlay prompting the user to create a project.
 * Automatically dismissed when createProject() succeeds.
 */
export function showWelcomeOverlay() {
  hideWelcomeOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'dacumWelcomeOverlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:900;display:flex;align-items:center;' +
    'justify-content:center;background:rgba(15,23,42,0.90);' +
    'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
    'animation:dacumWelcomeFadeIn 0.25s ease;';

  overlay.innerHTML = `
    <div style="
      background:#1e1e2e;
      border:1px solid #313244;
      border-radius:20px;
      max-width:460px;
      width:90%;
      padding:44px 40px 36px;
      text-align:center;
      box-shadow:0 32px 80px rgba(0,0,0,0.55);
      font-family:'Segoe UI',system-ui,sans-serif;
      animation:dacumWelcomeSlideIn 0.28s cubic-bezier(.16,1,.3,1);
    ">
      <div style="font-size:3.2em;line-height:1;margin-bottom:16px;">📋</div>
      <h2 style="
        color:#cba6f7;font-size:1.45em;margin:0 0 12px;
        font-weight:800;letter-spacing:-0.01em;
      ">${_t('wcTitle')}</h2>
      <p style="
        color:#a6adc8;font-size:0.91em;line-height:1.75;margin:0 0 8px;
      ">${_t('wcLine1')}</p>
      <p style="
        color:#a6adc8;font-size:0.91em;line-height:1.75;margin:0 0 28px;
      ">${_t('wcLine2')}</p>

      <button id="dacumWelcomeNewBtn" style="
        display:block;width:100%;
        background:linear-gradient(135deg,#cba6f7 0%,#89b4fa 100%);
        color:#1e1e2e;border:none;border-radius:12px;
        padding:15px 28px;font-size:1.05em;font-weight:800;
        cursor:pointer;letter-spacing:0.01em;
        box-shadow:0 4px 20px rgba(203,166,247,0.3);
        transition:opacity 0.15s,transform 0.1s;
      "
      onmouseover="this.style.opacity='0.88'"
      onmouseout="this.style.opacity='1'"
      onmousedown="this.style.transform='scale(0.97)'"
      onmouseup="this.style.transform='scale(1)'">
        + &nbsp;${_t('wcBtnNew')}
      </button>

      <div style="display:flex;align-items:center;gap:12px;margin:18px 0;">
        <span style="flex:1;height:1px;background:#313244;"></span>
        <span style="color:#585b70;font-size:0.72em;font-weight:700;letter-spacing:0.06em;">${_t('wcOr')}</span>
        <span style="flex:1;height:1px;background:#313244;"></span>
      </div>

      <button id="dacumWelcomeOpenBtn" style="
        display:block;width:100%;
        background:transparent;
        color:#cdd6f4;border:1.5px solid #45475a;border-radius:12px;
        padding:14px 28px;font-size:1em;font-weight:700;
        cursor:pointer;letter-spacing:0.01em;
        transition:background 0.15s,border-color 0.15s,transform 0.1s;
      "
      onmouseover="this.style.background='#313244';this.style.borderColor='#585b70'"
      onmouseout="this.style.background='transparent';this.style.borderColor='#45475a'"
      onmousedown="this.style.transform='scale(0.97)'"
      onmouseup="this.style.transform='scale(1)'">
        📂 &nbsp;${_t('wcBtnOpen')}
      </button>

      <p style="color:#45475a;font-size:0.76em;margin:20px 0 0;line-height:1.6;">
        ${_t('wcFootnote')}
      </p>
    </div>`;

  if (!document.getElementById('dacumWelcomeStyles')) {
    const s = document.createElement('style');
    s.id = 'dacumWelcomeStyles';
    s.textContent =
      '@keyframes dacumWelcomeFadeIn  { from{opacity:0} to{opacity:1} }' +
      '@keyframes dacumWelcomeSlideIn { from{transform:translateY(-18px);opacity:0} to{transform:translateY(0);opacity:1} }';
    document.head.appendChild(s);
  }

  document.body.appendChild(overlay);

  document.getElementById('dacumWelcomeNewBtn').addEventListener('click', () => {
    const name = prompt(_t('promptProjectName'),
      _tf('defaultProjectName', { n: _loadProjects().length + 1 }));
    if (name !== null) createProject(name);
  });

  // ── "Open Existing Project" ────────────────────────────────
  // Reuses the toolbar's hidden #loadFileInput rather than creating a
  // second file input: events.js already wires its change event to
  // loadFromJSON(), which handles parsing, project creation, sidebar
  // refresh and history reset. Duplicating that pipeline here would
  // mean two code paths to keep in sync.
  const openBtn = document.getElementById('dacumWelcomeOpenBtn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      const input = document.getElementById('loadFileInput');
      if (!input) {
        alert(_t('msgImportUnavailable'));
        return;
      }

      // Dismiss the overlay only once a project actually exists.
      // The import is asynchronous (FileReader) and can fail on a
      // malformed file; hiding immediately would strand the user on an
      // empty screen with no way back to these two buttons.
      const onPicked = () => {
        let tries = 0;
        const poll = setInterval(() => {
          if (_getActive()) {
            clearInterval(poll);
            hideWelcomeOverlay();
          } else if (++tries > 20) {          // ~4s ceiling
            clearInterval(poll);              // import failed → overlay stays
          }
        }, 200);
      };

      input.addEventListener('change', onPicked, { once: true });
      input.click();
    });
  }
}

function hideWelcomeOverlay() {
  const el = document.getElementById('dacumWelcomeOverlay');
  if (el) el.remove();
}

/** Inject sidebar HTML into the page (call once from app.js). */
export function initProjectsSidebar() {
  if (document.getElementById('dacumProjectsSidebar')) return;

  // Sidebar element — 3-section ChatGPT-style layout
  const aside = document.createElement('aside');
  aside.id = 'dacumProjectsSidebar';
  aside.className = 'dps-sidebar';
  aside.innerHTML = `
    <!-- ── TOP: Brand + collapse button ── -->
    <div class="dps-top">
      <div class="dps-brand">
        <span class="dps-brand-text">DACUM Live Pro</span>
      </div>
      <button class="dps-collapse-btn" id="dpsCollapseBtn" title="${_t('ttToggleSidebar')}" aria-label="${_t('ttToggleSidebar')}">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true" style="display:block;stroke:currentColor;">
          <path d="M12 5l-5 5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <!-- ── MIDDLE: Navigation tabs ── -->
    <nav class="dps-nav" id="dpsSidebarNav" aria-label="Main navigation">
      <div class="dps-nav-label">${_t('sbNavLabel')}</div>
      <button class="dps-nav-item dps-nav-active" data-target-tab="info-tab" data-tooltip="${_t('tabChartInfo')}">
        <span class="dps-nav-icon">📋</span>
        <span class="dps-nav-text">${_t('tabChartInfo')}</span>
      </button>
      <button class="dps-nav-item" data-target-tab="duties-tab" data-tooltip="${_t('tabDuties')}">
        <span class="dps-nav-icon">✅</span>
        <span class="dps-nav-text">${_t('tabDuties')}</span>
      </button>
      <button class="dps-nav-item" data-target-tab="additional-info-tab" data-tooltip="${_t('tabAdditionalInfo')}">
        <span class="dps-nav-icon">📚</span>
        <span class="dps-nav-text">${_t('tabAdditionalInfo')}</span>
      </button>
      <button class="dps-nav-item" data-target-tab="verification-tab" data-tooltip="${_t('tabVerification')}">
        <span class="dps-nav-icon">🎯</span>
        <span class="dps-nav-text">${_t('tabVerification')}</span>
      </button>
      <button class="dps-nav-item" data-target-tab="task-analysis-tab" data-tooltip="${_t('tabTaskAnalysis')}">
        <span class="dps-nav-icon">🔬</span>
        <span class="dps-nav-text">${_t('tabTaskAnalysis')}</span>
      </button>
      <button class="dps-nav-item" data-target-tab="clustering-tab" data-tooltip="${_t('tabClustering')}">
        <span class="dps-nav-icon">🧩</span>
        <span class="dps-nav-text">${_t('tabClustering')}</span>
      </button>
      <button class="dps-nav-item" data-target-tab="occupational-standard-tab" data-tooltip="${_t('tabOccStandard')}">
        <span class="dps-nav-icon">📜</span>
        <span class="dps-nav-text">${_t('tabOccStandard')}</span>
      </button>
      <button class="dps-nav-item" data-target-tab="learning-outcomes-tab" data-tooltip="${_t('tabLearningOutcomes')}">
        <span class="dps-nav-icon">🎓</span>
        <span class="dps-nav-text">${_t('tabLearningOutcomes')}</span>
      </button>
      <button class="dps-nav-item" data-target-tab="module-mapping-tab" data-tooltip="${_t('tabModuleMapping')}">
        <span class="dps-nav-icon">📦</span>
        <span class="dps-nav-text">${_t('tabModuleMapping')}</span>
      </button>
      <button class="dps-nav-item" data-target-tab="module-curriculum-tab" data-tooltip="${_t('tabModuleCurriculum')}">
        <span class="dps-nav-icon">📘</span>
        <span class="dps-nav-text">${_t('tabModuleCurriculum')}</span>
      </button>
      <!-- ── Export Settings ──────────────────────────────────────
           Sits immediately before Help, and takes its SHAPE from
           .dps-nav-item (icon, size, padding, collapsed-rail tooltip)
           so it reads as part of the rail rather than something glued
           on. It deliberately does NOT take that class's BEHAVIOUR:
           it carries no data-target-tab, and the delegated navigation
           handler below is scoped to nav items that HAVE one, so it
           cannot match this button and cannot clear the active tab.
           Its own click listener is bound directly to the element. -->
      <button class="dps-nav-item dps-nav-settings" id="dpsExportSettings"
              type="button" data-tooltip="${_t('esTitle')}">
        <span class="dps-nav-icon">⚙️</span>
        <span class="dps-nav-text">${_t('esTitle')}</span>
      </button>
      <button class="dps-nav-item" data-target-tab="contact-tab" data-tooltip="${_t('tabHelp')}">
        <span class="dps-nav-icon">❓</span>
        <span class="dps-nav-text">${_t('tabHelp')}</span>
      </button>
    </nav>

    <!-- ── BOTTOM: Project cards (UNCHANGED structure) ── -->
    <div class="dps-projects-section">
      <div class="dps-header">
        <span class="dps-title">📁 ${_t('sbProjects')}</span>
        <button class="dps-new-btn" id="dpsNewProject" title="${_t('ttNewProject')}">＋ ${_t('sbNew')}</button>
      </div>
      <div class="dps-search-wrap">
        <div class="dps-search-box">
          <svg class="dps-search-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="dpsSearchGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#cba6f7"/>
                <stop offset="100%" stop-color="#89b4fa"/>
              </linearGradient>
            </defs>
            <circle cx="8.5" cy="8.5" r="5" stroke="url(#dpsSearchGrad)" stroke-width="1.8"/>
            <line x1="12.5" y1="12.5" x2="16" y2="16" stroke="url(#dpsSearchGrad)" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <input class="dps-search" id="dpsSearch" type="text"
                 placeholder="${_t('phSearchProjects')}" autocomplete="off">
        </div>
      </div>
      <div class="dps-list" id="dpsProjectList"></div>
      <button type="button" class="dps-storage-row" id="dpsStorageRow">
        <span class="dps-storage-icon" aria-hidden="true">💾</span>
        <span class="dps-storage-label" id="dpsStorageLabel"></span>
      </button>
    </div>

    <!-- Legacy toggle kept in DOM (hidden) for dacum-mobile.js compatibility -->
    <button id="dpsToggle" style="display:none!important" aria-hidden="true">◀</button>
  `;

  // Inject CSS
  _injectCSS();

  // Wrap main content so sidebar pushes it
  const app = document.querySelector('.container') || document.body;
  const wrapper = document.createElement('div');
  wrapper.id = 'dacumAppWrapper';
  app.parentNode.insertBefore(wrapper, app);
  wrapper.appendChild(aside);
  wrapper.appendChild(app);

  // ── Wire: New project button ──
  document.getElementById('dpsNewProject').addEventListener('click', () => {
    const name = prompt(_t('promptProjectName'),
      _tf('defaultProjectName', { n: _loadProjects().length + 1 }));
    if (name !== null) createProject(name);
  });

  // ── Wire: Storage row ──
  document.getElementById('dpsStorageRow').addEventListener('click', _openStorageDialog);

  // ── Wire: Search ──
  const _dpsSearchEl = document.getElementById('dpsSearch');
  _dpsSearchEl.addEventListener('input', function () {
    _searchQuery = this.value.trim().toLowerCase();
    const box = this.closest('.dps-search-box');
    if (box) box.classList.toggle('has-value', this.value.length > 0);
    renderProjectsSidebar();
  });
  _dpsSearchEl.addEventListener('focus', function () {
    const box = this.closest('.dps-search-box');
    if (box) box.classList.add('is-focused');
  });
  _dpsSearchEl.addEventListener('blur', function () {
    const box = this.closest('.dps-search-box');
    if (box) box.classList.remove('is-focused');
  });

  // ── Wire: Collapse/expand button ──
  document.getElementById('dpsCollapseBtn').addEventListener('click', _toggleSidebar);

  // ── Wire: Export Settings (own handler, not the nav delegate) ──
  // Bound to the element itself so it can never participate in tab
  // switching. The module is loaded lazily: the modal is only needed
  // when the button is pressed, and keeping it off the boot path means
  // this addition cannot slow or break startup.
  const _esBtn = document.getElementById('dpsExportSettings');
  if (_esBtn) {
    _esBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      import('./export_settings.js')
        .then(m => m.openExportSettings())
        .catch(err => console.error('[export-settings] load failed:', err));
    });
  }

  // ── Wire: Navigation tab items → delegate to window.switchTab ──
  document.getElementById('dpsSidebarNav').addEventListener('click', function (e) {
    const item = e.target.closest('.dps-nav-item[data-target-tab]');
    if (!item) return;
    const tabId = item.getAttribute('data-target-tab');
    if (tabId && typeof window.switchTab === 'function') {
      window.switchTab(tabId);
    }
  });

  // ── Sync active nav item when real (hidden) tabs change active class ──
  const realTabs = document.querySelectorAll('#dacumMainTabsHidden .tab[data-tab]');
  if (realTabs.length > 0) {
    const _navObserver = new MutationObserver(function () {
      const activeTab = document.querySelector('#dacumMainTabsHidden .tab.active');
      if (!activeTab) return;
      const targetId = activeTab.getAttribute('data-tab');
      document.querySelectorAll('#dpsSidebarNav .dps-nav-item').forEach(function (navItem) {
        navItem.classList.toggle('dps-nav-active',
          navItem.getAttribute('data-target-tab') === targetId);
      });
    });
    realTabs.forEach(function (tab) {
      _navObserver.observe(tab, { attributes: true, attributeFilter: ['class'] });
    });
  }

  // ── Restore persisted collapsed state ──
  // Guarded by viewport. `dps-collapsed` is the 68px desktop rail and
  // is meaningless on mobile, where the sidebar is a drawer — applying
  // it there produces a full-width panel with no labels. Without this
  // guard, one stale '1' in localStorage reproduced the stuck-sidebar
  // bug on every subsequent mobile launch, before the user touched
  // anything. dacum-mobile.js re-asserts the correct state on resize,
  // so crossing the breakpoint later is handled too.
  const _wantsRail = localStorage.getItem('dps_sidebar_collapsed') === '1';
  const _isNarrow  = window.DacumSidebar && typeof window.DacumSidebar.isMobile === 'function'
    ? window.DacumSidebar.isMobile()
    : window.innerWidth <= 1100;

  if (_wantsRail && !_isNarrow) {
    const sb = document.getElementById('dacumProjectsSidebar');
    const wr = document.getElementById('dacumAppWrapper');
    if (sb) sb.classList.add('dps-collapsed');
    if (wr) wr.classList.add('dps-is-collapsed');
    _updateCollapseIcon(true);
  }

  _positionToggle();
  renderProjectsSidebar();
  _watchDutiesForStats();

  // Store locked (projects are in IndexedDB but it will not open):
  // say so at once, and do not greet the user as if they had no projects.
  if (isProjectStoreLocked()) {
    _warnStoreLocked();
    // A status line is easily replaced by later boot messages, and the
    // user is looking at an empty project list — explain it in the
    // Storage dialog once, after the rest of the boot has settled.
    setTimeout(() => { try { _openStorageDialog(); } catch (_) {} }, 600);
  } else if (_loadProjects().length === 0) {
    // Show welcome overlay on first open if no projects exist yet
    showWelcomeOverlay();
  }
}

/** Re-render the project list cards. */
export function renderProjectsSidebar() {
  const list = document.getElementById('dpsProjectList');
  if (!list) return;

  _refreshStorageRow();

  const activeId = _getActive();
  let projects   = _loadProjects().slice().reverse(); // newest first

  // Search filter — prefix-first sort
  if (_searchQuery) {
    projects = projects.filter(p => p.name.toLowerCase().includes(_searchQuery));
    projects.sort((a, b) => {
      const aStart = a.name.toLowerCase().startsWith(_searchQuery) ? 0 : 1;
      const bStart = b.name.toLowerCase().startsWith(_searchQuery) ? 0 : 1;
      return aStart - bStart;
    });
  }

  if (projects.length === 0) {
    list.innerHTML = `<p class="dps-empty">${_t(_searchQuery ? 'sbNoMatch' : 'sbNoProjects')}</p>`;
    return;
  }

  list.innerHTML = projects.map(p => {
    const isActive  = p.id === activeId;
    const dutyCount = (p.state?.dutiesData || []).length;
    const taskCount = (p.state?.dutiesData || []).reduce((s, d) => s + (d.tasks?.length || 0), 0);
    const locale    = window.i18n ? window.i18n.getLang() : undefined;
    const date      = new Date(p.created).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });

    return `
      <div class="dps-card${isActive ? ' dps-active' : ''}" data-project-id="${p.id}">
        <div class="dps-card-body" data-action="load-project" data-project-id="${p.id}">
          <div class="dps-card-name-wrap">
            <span class="dps-card-name" data-project-id="${p.id}">${_esc(p.name)}</span>
            <input class="dps-card-name-input" data-project-id="${p.id}"
                   value="${_esc(p.name)}" style="display:none"
                   maxlength="60" autocomplete="off" spellcheck="false">
          </div>
          <div class="dps-card-meta">🕐 ${date}</div>
          <div class="dps-card-stats">
            <span class="dps-stat-duties">📋 ${_tp('countDuty', dutyCount)}</span>
            <span class="dps-stat-tasks">✅ ${_tp('countTask', taskCount)}</span>
          </div>
        </div>
        <div class="dps-card-actions">
          <button class="dps-icon-btn dps-rename" data-action="rename-project" data-project-id="${p.id}" title="${_t('ttRenameProject')}">✏️</button>
          <button class="dps-icon-btn dps-delete" data-action="delete-project" data-project-id="${p.id}" title="${_t('ttDeleteProject')}">✕</button>
        </div>
      </div>`;
  }).join('');

  // The saved copy can lag the live chart (it is only written on save),
  // so the active card is patched with the live counts after each render.
  _applyLiveStats();

  // Delegated click handler (re-attach each render using event delegation on stable parent)
  list.onclick = function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id     = btn.getAttribute('data-project-id');

    if (action === 'load-project') {
      loadProject(id);
    } else if (action === 'rename-project') {
      _startInlineRename(id);
    } else if (action === 'confirm-rename') {
      // Trigger blur on the input to commit
      const card  = e.target.closest('.dps-card');
      const input = card?.querySelector('.dps-card-name-input');
      if (input) input.blur();
    } else if (action === 'delete-project') {
      const proj = _loadProjects().find(p => p.id === id);
      const confirmed = confirm(
        _tf('confirmDeleteProject', { name: proj?.name || _t('lblThisProject') })
      );
      if (confirmed) deleteProject(id);
    }
  };
}

// ── State capture / apply (mirrors workshop_snapshots logic) ──

function _captureState() {
  syncAllFromDOM();

  const chartInfo = {
    dacumDate:       _val('dacumDate'),
    dacumDateEnd:    _val('dacumDateEnd'),
    venue:           _val('venue'),
    workshopFormat:  _val('workshopFormat') || 'inperson',
    producedFor:     _val('producedFor'),
    producedBy:      _val('producedBy'),
    occupationTitle: _val('occupationTitle'),
    scopeOfWork:     _val('scopeOfWork'),
    jobTitle:        _val('jobTitle'),
    sector:          _val('sector'),
    context:         _val('context'),
    facilitators:    _val('facilitators'),
    observers:       _val('observers'),
    panelMembers:    _val('panelMembers'),
  };

  const additionalInfo = {
    headings: {
      knowledge:  _text('knowledgeHeading'),
      skills:     _text('skillsHeading'),
      behaviors:  _text('behaviorsHeading'),
      tools:      _text('toolsHeading'),
      trends:     _text('trendsHeading'),
      acronyms:   _text('acronymsHeading'),
      careerPath: _text('careerPathHeading'),
    },
    content: {
      knowledge:  _val('knowledgeInput'),
      skills:     _val('skillsInput'),
      behaviors:  _val('behaviorsInput'),
      tools:      _val('toolsInput'),
      trends:     _val('trendsInput'),
      acronyms:   _val('acronymsInput'),
      careerPath: _val('careerPathInput'),
    },
    customSections: _captureCustomSections(),
  };

  return JSON.parse(JSON.stringify({
    dutiesData:               appState.dutiesData              || [],
    dutyCount:                appState.dutyCount,
    taskCounts:               appState.taskCounts              || {},
    // Logos live in IndexedDB (see image_store.js); only a short
    // reference is written into localStorage. Keeping the base64 here
    // is what used to make a single project weigh megabytes and put the
    // whole store within reach of the quota ceiling.
    producedForImage:         _persistLogo('producedFor', appState.producedForImage),
    producedByImage:          _persistLogo('producedBy',  appState.producedByImage),
    customSectionCounter:     appState.customSectionCounter,
    skillsLevelData:          appState.skillsLevelData,
    skillsLevelColumns:       appState.skillsLevelColumns      || null,
    verificationRatings:      appState.verificationRatings     || {},
    taskMetadata:             appState.taskMetadata            || {},
    taskAnalysisData:         appState.taskAnalysisData        || {},
    taskAnalysisPriority:     appState.taskAnalysisPriority    || {},
    taskAnalysisCustomSections: appState.taskAnalysisCustomSections || [],
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
    moduleCurriculumData:     appState.moduleCurriculumData    || null,
    verificationDecisionMade: appState.verificationDecisionMade,
    clusteringAllowed:        appState.clusteringAllowed,
    _chartInfo:               chartInfo,
    _additionalInfo:          additionalInfo,
    // ── Live Workshop session ──────────────────────────────
    lwSessionId:              appState.lwSessionId         || null,
    lwFinalizedData:          appState.lwFinalizedData      || null,
    lwAggregatedResults:      appState.lwAggregatedResults  || null,
    lwParticipantUrl:         (function() {
      const el = document.getElementById('lwParticipantLink');
      return el ? el.getAttribute('data-full-url') || '' : '';
    })(),
    lwIsFinalized:            appState.lwIsFinalized        || false,
  }));
}

function _applyState(s) {
  if (!s) return;
  appState.dutiesData               = s.dutiesData               || [];
  appState.dutyCount                = s.dutyCount                || 0;
  appState.taskCounts               = s.taskCounts               || {};
  // getImageSync resolves an `idb:` reference from the in-memory cache
  // and passes a legacy inline data URL straight through, so projects
  // saved before this change keep working untouched.
  appState.producedForImage         = getImageSync(s.producedForImage) || null;
  appState.producedByImage          = getImageSync(s.producedByImage)  || null;
  appState.customSectionCounter     = s.customSectionCounter     || 0;
  // 3.51.0: never undefined — projects imported before this fix from a
  // file without the matrix were stored with none.
  appState.skillsLevelData          = Array.isArray(s.skillsLevelData) ? s.skillsLevelData : [];
  // Absent in projects saved before 3.40.0 → the four default levels.
  appState.skillsLevelColumns       = s.skillsLevelColumns       || null;
  appState.verificationRatings      = s.verificationRatings      || {};
  appState.taskMetadata             = s.taskMetadata             || {};
  // Older projects saved before Task Analysis existed simply have no
  // key here — falling back to {} is what makes them load normally.
  appState.taskAnalysisData         = s.taskAnalysisData         || {};
  appState.taskAnalysisPriority     = s.taskAnalysisPriority     || {};
  appState.taskAnalysisCustomSections = Array.isArray(s.taskAnalysisCustomSections) ? s.taskAnalysisCustomSections : [];
  // Older projects have no such key — the default is the feature OFF,
  // which is exactly how those projects behaved before.
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
  // Projects saved before 3.33.0 have no curriculum — the default
  // (empty, 25 h per credit, 10/45/5/35/5) is what they get.
  appState.moduleCurriculumData     = normalizeModuleCurriculumData(s.moduleCurriculumData);
  appState.verificationDecisionMade = s.verificationDecisionMade || false;
  appState.clusteringAllowed        = s.clusteringAllowed        || false;
  appState._chartInfo               = s._chartInfo               || {};
  appState._additionalInfo          = s._additionalInfo          || {};
  // ── Live Workshop session ──────────────────────────────
  appState.lwSessionId              = s.lwSessionId              || null;
  appState.lwFinalizedData          = s.lwFinalizedData          || null;
  appState.lwAggregatedResults      = s.lwAggregatedResults      || null;
  appState.lwIsFinalized            = s.lwIsFinalized            || false;

  // ── Chart Info DOM hydration ───────────────────────────
  // Writes the saved chartInfo values back into the input fields so
  // switching between projects actually shows each project's own
  // chart-info values.  Guards per-field so a missing input (e.g.
  // during early init) never throws.  `_arrField` joins arrays with
  // newlines for the facilitators/observers/panel textareas.
  _hydrateChartInfoDOM(s._chartInfo || s.chartInfo || {});

  _applyLiveWorkshopDOM(s);

  // ── Downstream views: re-render from the state just applied ──
  // These three tabs render into containers that are NOT rebuilt by
  // anything above. Without this, switching or loading a project left
  // the previous project's clusters, learning outcomes and modules
  // sitting in the DOM while appState already held the new project's
  // data — the two silently disagreed until something happened to
  // trigger a re-render. Each render call is guarded independently so
  // one failure can't abort the rest of the load.
  [renderAvailableTasks, renderClusters,
   renderPCSourceList,   renderLearningOutcomes,
   renderModuleLoList,   renderModules, renderModuleCurriculum].forEach(fn => {
    try { fn(); } catch (err) { console.warn('[project] render skipped:', err); }
  });
}

function _hydrateChartInfoDOM(ci) {
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el && typeof v !== 'undefined') el.value = (v == null ? '' : v);
  };
  const arrToText = a => Array.isArray(a) ? a.join('\n') : (a || '');

  setVal('dacumDate',       ci.dacumDate);
  setVal('dacumDateEnd',    ci.dacumDateEnd || '');
  setVal('workshopFormat',  ci.workshopFormat || 'inperson');
  setVal('venue',           ci.venue);
  setVal('producedFor',     ci.producedFor);
  setVal('producedBy',      ci.producedBy);
  setVal('occupationTitle', ci.occupationTitle);
  setVal('scopeOfWork',     ci.scopeOfWork);
  setVal('jobTitle',        ci.jobTitle);
  setVal('sector',          ci.sector);
  setVal('context',         ci.context);
  setVal('facilitators',    arrToText(ci.facilitators));
  setVal('observers',       arrToText(ci.observers));
  setVal('panelMembers',    arrToText(ci.panelMembers));
}

// ── Restore live workshop DOM after project switch ─────────────

function _applyLiveWorkshopDOM(s) {
  const sessionId      = s.lwSessionId     || null;
  const participantUrl = s.lwParticipantUrl || '';
  const isFinalized    = s.lwIsFinalized    || false;
  const hasDecision    = s.verificationDecisionMade || false;

  const lwSection    = document.getElementById('liveWorkshopSection');
  const lwStep1      = document.getElementById('lwStep1-finalize');
  const lwStep2      = document.getElementById('lwStep2-session');
  const lwSessionEl  = document.getElementById('lwSessionId');
  const lwLinkEl     = document.getElementById('lwParticipantLink');
  const lwResults    = document.getElementById('lwResultsContainer');
  const lwExport     = document.getElementById('lwExportButtons');
  const lwQRModal    = document.getElementById('lwQRModal');
  const btnFinalize  = document.getElementById('btnLWFinalize');
  const btnBypass    = document.getElementById('btnBypassToClustering');
  const btnReset     = document.getElementById('btnResetDecision');

  // Always close QR modal on project switch
  if (lwQRModal) lwQRModal.style.display = 'none';

  // lwStep1 (Finalize / Bypass buttons) is ALWAYS visible —
  // it's the entry point for any project.
  if (lwSection) lwSection.style.display = 'block';
  if (lwStep1)   lwStep1.style.display   = 'block';

  if (sessionId && isFinalized) {
    // ── Project has an active session ─────────────────────
    if (lwStep2)     lwStep2.style.display  = 'block';
    if (lwSessionEl) lwSessionEl.textContent = sessionId;

    // Populate project info row (name + duties/tasks count)
    const lwProjectInfo  = document.getElementById('lwProjectInfo');
    const lwProjectName  = document.getElementById('lwProjectName');
    const lwProjectStats = document.getElementById('lwProjectStats');
    const activeId = localStorage.getItem('dacum_active_project') || '';
    let allProjects = [];
    try { allProjects = readProjects(); } catch(e){}
    const proj = allProjects.find(p => p.id === activeId);
    if (proj && lwProjectInfo && lwProjectName && lwProjectStats) {
      const dCount = (proj.state?.dutiesData || []).length;
      const tCount = (proj.state?.dutiesData || []).reduce((a, d) => a + (d.tasks?.length || 0), 0);
      lwProjectName.textContent  = proj.name;
      lwProjectStats.textContent = `${_tp('countDuty', dCount)} · ${_tp('countTask', tCount)}`;
      lwProjectInfo.style.display = 'block';
    } else if (lwProjectInfo) {
      lwProjectInfo.style.display = 'none';
    }

    if (lwLinkEl && participantUrl) {
      const shortLink = participantUrl.includes('/')
        ? participantUrl.substring(participantUrl.lastIndexOf('/') + 1)
        : participantUrl;
      lwLinkEl.textContent = shortLink;
      lwLinkEl.setAttribute('data-full-url', participantUrl);
    } else if (lwLinkEl) {
      lwLinkEl.textContent = '';
      lwLinkEl.removeAttribute('data-full-url');
    }

    // Results area
    if (s.lwAggregatedResults && lwResults) {
      lwResults.innerHTML = `<p style="color:#16a34a;font-style:italic;text-align:center;padding:20px;">✅ ${_t('msgVotingAvailable')}</p>`;
    } else if (lwResults) {
      lwResults.innerHTML = `<p style="color:#999;font-style:italic;text-align:center;padding:30px;">${_t('msgNoVotesYet')}</p>`;
    }
    if (lwExport) lwExport.style.display = s.lwAggregatedResults ? 'block' : 'none';

    // Session active: hide Finalize + Bypass, only show Reset Decision
    if (btnFinalize) btnFinalize.style.display = 'none';
    if (btnBypass)   btnBypass.style.display   = 'none';
    if (btnReset)    btnReset.style.display     = 'inline-block';

  } else {
    // ── No session yet — fresh project ────────────────────
    if (lwStep2)     lwStep2.style.display  = 'none';
    if (lwSessionEl) lwSessionEl.textContent = '';
    if (lwLinkEl)  { lwLinkEl.textContent = ''; lwLinkEl.removeAttribute('data-full-url'); }
    if (lwResults)   lwResults.innerHTML    = '';
    if (lwExport)    lwExport.style.display = 'none';

    // Hide project info row
    const _lwPI = document.getElementById('lwProjectInfo');
    if (_lwPI) _lwPI.style.display = 'none';

    // No session: show Finalize + Bypass, hide Reset unless decision made
    if (btnFinalize) { btnFinalize.style.display = ''; btnFinalize.disabled = false; btnFinalize.title = ''; }
    if (btnBypass)   { btnBypass.style.display   = ''; btnBypass.disabled   = false; }
    if (btnReset)      btnReset.style.display = hasDecision ? 'inline-block' : 'none';
  }
}

/**
 * Move a logo into the image store and return the reference to save.
 *
 * Keyed by the ACTIVE project id so each project owns its own logos.
 * When no project is active yet (very first boot), the image is left
 * inline — it will be migrated to the store on the next save, once a
 * project id exists to file it under.
 */
function _persistLogo(slot, value) {
  if (!value) return null;
  if (typeof value === 'string' && value.startsWith('idb:')) return value;  // already a ref
  if (typeof value !== 'string' || !value.startsWith('data:')) return value;

  const projectId = _getActive();
  if (!projectId) return value;

  return setImage(imageKey(projectId, slot), value);
}

// ── localStorage ──────────────────────────────────────────────

function _loadProjects() {
  // Routed through project_store.js: localStorage by default, the
  // in-memory copy of the IndexedDB store once projects have moved.
  try { return readProjects(); }
  catch { return []; }
}

// ── Quota handling ────────────────────────────────────────────
//
// The previous behaviour on a full quota was to run list.splice(0, 1)
// and retry — silently destroying the oldest project, announced only by
// a toast that disappears in three seconds. It could delete the project
// the user was actively working on, and there was no undo and no export
// first. Losing a completed DACUM chart, which represents days of panel
// work, is a far worse outcome than a failed save the user can act on.
//
// The rule now: NEVER delete the user's data to make room. Reclaim only
// what the app can regenerate, and if that is not enough, stop and say
// so clearly enough that the user can rescue their work.

let _quotaDialogOpen = false;

function _isQuotaError(err) {
  if (!err) return false;
  return err.name === 'QuotaExceededError' ||
         err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
         err.code === 22 || err.code === 1014;
}

/** Rough byte size of a project once serialised. */
function _projectSize(project) {
  try { return JSON.stringify(project).length; } catch { return 0; }
}

function _fmtSize(bytes) {
  return bytes > 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Persist the project list.
 * @returns {boolean} true when the write succeeded.
 */
// Warn once per session when the store passes this many bytes, so the
// user hears about it while they still have room to export — not at the
// moment a save fails mid-workshop.
const QUOTA_WARN_BYTES = 3.5 * 1024 * 1024;
let _quotaWarned = false;

function _saveProjects(list) {
  // Store locked: the flag says IndexedDB but the browser refuses to open
  // it. Writing now could replace the real list with whatever is on
  // screen, so refuse and keep saying why.
  if (isProjectStoreLocked()) {
    _warnStoreLocked();
    return false;
  }

  let payload;
  try { payload = JSON.stringify(list); }
  catch (err) {
    console.warn('[projects] could not serialise projects:', err);
    showStatus('⚠️ ' + _t('msgCouldNotSave'), 'error');
    return false;
  }

  try {
    writeProjectsPayload(payload);

    // Getting full: move to large storage while there is still room,
    // rather than waiting for a save to fail mid-workshop. Only warn
    // when that is not possible (IndexedDB unavailable or it failed).
    if (payload.length > QUOTA_WARN_BYTES && getStorageBackend() === 'local' && !isMigrating()) {
      if (canUseLargeStorage() && !_autoMoveTried) {
        _autoMoveTried = true;
        _autoMoveToLargeStorage(payload, 'threshold');
      } else if (!_quotaWarned) {
        _quotaWarned = true;
        showStatus(
          '⚠️ ' + _tf('msgStorageFilling',
            { mb: Math.round(payload.length / (1024 * 1024) * 10) / 10 }),
          'error'
        );
      }
    }
    _refreshStorageRow();
    return true;
  } catch (err) {
    if (err && err.name === 'StoreLockedError') {
      _warnStoreLocked();
      return false;
    }
    if (!_isQuotaError(err)) {
      console.warn('[projects] save failed:', err);
      showStatus('⚠️ ' + _t('msgCouldNotSave'), 'error');
      return false;
    }

    // Reclaim regenerable space first: the crash-recovery backup is a
    // duplicate of the current state and is rewritten on the next edit,
    // so dropping it costs the user nothing.
    try {
      localStorage.removeItem('dacum_session_backup');
      writeProjectsPayload(payload);
      console.warn('[projects] quota hit — recovered by dropping session backup');
      _refreshStorageRow();
      return true;
    } catch (_) { /* still full — fall through */ }

    // Still full: move the projects to IndexedDB. The payload is held in
    // memory by the store while it is copied and verified; localStorage
    // keeps its last good copy until then. Only if that fails does the
    // blocking dialog appear — exactly as before.
    if (canUseLargeStorage()) {
      _autoMoveToLargeStorage(payload, 'quota');
      return true;
    }

    _showStorageFullDialog(list);
    return false;
  }
}

// ── Large-storage (IndexedDB) fallback ────────────────────────

let _autoMoveTried     = false;
let _autoMoveAnnounced = false;
let _lockWarned        = false;

function _warnStoreLocked() {
  if (_lockWarned) return;
  _lockWarned = true;
  showStatus('⚠️ ' + _t('msgStoreLocked'), 'error');
}

async function _autoMoveToLargeStorage(payload, reason) {
  const res = await migrateToIdb(payload);
  if (res.ok) {
    if (!_autoMoveAnnounced && res.reason !== 'already') {
      _autoMoveAnnounced = true;
      showStatus('✅ ' + _t('msgMovedToIdb'), 'success');
    }
    console.info('[projects] projects moved to IndexedDB (' + reason + ')');
    _refreshStorageRow();
    return;
  }
  if (res.reason === 'busy') return;   // a move is already under way
  console.warn('[projects] automatic move to IndexedDB failed:', res.reason);
  if (reason === 'quota') {
    _showStorageFullDialog(_loadProjects());
  } else if (!_quotaWarned) {
    _quotaWarned = true;
    showStatus('⚠️ ' + _tf('msgStorageFilling',
      { mb: Math.round(payload.length / (1024 * 1024) * 10) / 10 }), 'error');
  }
  _refreshStorageRow();
}

onProjectStoreError((kind) => {
  if (kind === 'idb-write') showStatus('⚠️ ' + _t('msgIdbWriteFailed'), 'error');
});

// Another tab changed the list or switched storage: show the new list.
window.addEventListener('dacum:projects-external-change', () => {
  try { renderProjectsSidebar(); } catch (_) {}
});

/** Update the small "💾 Storage" line under the project list. */
function _refreshStorageRow() {
  const label = document.getElementById('dpsStorageLabel');
  const row   = document.getElementById('dpsStorageRow');
  if (!label || !row) return;
  const locked  = isProjectStoreLocked();
  const backend = getStorageBackend();
  const name = locked ? _t('stLabelLocked')
             : backend === 'idb' ? _t('stLabelIdb') : _t('stLabelLocal');
  label.textContent = locked ? name : `${name} · ${_fmtSize(getProjectsBytes())}`;
  row.classList.toggle('dps-storage-idb', backend === 'idb' && !locked);
  row.classList.toggle('dps-storage-locked', locked);
  row.title = _t('ttStorage');
  row.setAttribute('aria-label', `${_t('stTitle')}: ${label.textContent}`);
}

let _storageDialogOpen = false;

/** Storage dialog: where projects live, how big they are, and the switch. */
async function _openStorageDialog() {
  if (_storageDialogOpen) return;
  _storageDialogOpen = true;

  const overlay = document.createElement('div');
  overlay.id = 'dpsStorageOverlay';
  overlay.className = 'dps-st-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'dpsStTitle');
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    _storageDialogOpen = false;
    document.removeEventListener('keydown', onKey);
    const r = document.getElementById('dpsStorageRow');
    if (r) r.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const render = async (note, noteKind) => {
    const info    = await getStorageInfo();
    const isIdb   = info.backend === 'idb';
    const tooBig  = info.bytes > QUOTA_WARN_BYTES;
    const where   = info.locked ? _t('stLabelLocked') : isIdb ? _t('stLabelIdb') : _t('stLabelLocal');
    // Sizes are isolated as LTR units so "6 KB" never reorders inside
    // Arabic text. The template is escaped first, then the units added.
    const _size = (b) => `<bdi dir="ltr">${_fmtSize(b)}</bdi>`;
    const quotaHtml = info.quotaEstimate
      ? _esc(_t('stQuotaVal'))
          .replace('{used}',  _size(info.quotaEstimate.usage))
          .replace('{total}', _size(info.quotaEstimate.quota))
      : _esc(_t('stUnknown'));

    let explain, action = '', hint = '';
    if (info.locked) {
      explain = _t('msgStoreLocked');
    } else if (isIdb) {
      explain = _t('stExplainIdb');
      action  = `<button type="button" class="dps-st-btn" id="dpsStMove" ${tooBig ? 'disabled' : ''}>${_t('stBtnToLocal')}</button>`;
      if (tooBig) hint = _tf('stTooBigForLocal', { mb: Math.round(info.bytes / (1024 * 1024) * 10) / 10 });
    } else {
      explain = _t('stExplainLocal');
      action  = `<button type="button" class="dps-st-btn dps-st-btn-primary" id="dpsStMove" ${info.idbSupported ? '' : 'disabled'}>${_t('stBtnToIdb')}</button>`;
      if (!info.idbSupported) hint = _t('stNoIdb');
    }

    overlay.innerHTML = `
      <div class="dps-st-card">
        <div class="dps-st-head">
          <span class="dps-st-icon" aria-hidden="true">💾</span>
          <p class="dps-st-title" id="dpsStTitle">${_t('stTitle')}</p>
        </div>
        <div class="dps-st-body">
          <dl class="dps-st-facts">
            <div><dt>${_t('stCurrent')}</dt><dd>${_esc(where)}</dd></div>
            <div><dt>${_t('stSize')}</dt><dd>${_size(info.bytes)}</dd></div>
            <div><dt>${_t('stQuota')}</dt><dd>${quotaHtml}</dd></div>
          </dl>
          <p class="dps-st-explain">${_esc(explain)}</p>
          ${hint ? `<p class="dps-st-hint">${_esc(hint)}</p>` : ''}
          ${note ? `<p class="dps-st-note dps-st-note-${noteKind}" role="status">${_esc(note)}</p>` : ''}
          <div class="dps-st-actions">
            ${action}
            <button type="button" class="dps-st-btn" id="dpsStClose">${_t('stClose')}</button>
          </div>
        </div>
      </div>`;

    overlay.querySelector('#dpsStClose').addEventListener('click', close);
    const move = overlay.querySelector('#dpsStMove');
    if (move && !move.disabled) {
      move.addEventListener('click', async () => {
        move.disabled = true;
        move.textContent = _t('stBusy');
        // Persist the open project first so what moves is current.
        try { saveCurrentProject(); } catch (_) {}
        const res = isIdb ? await migrateToLocal(QUOTA_WARN_BYTES) : await migrateToIdb();
        let msg, kind;
        if (res.ok) {
          msg  = isIdb ? _t('msgMovedToLocal') : _t('msgMovedToIdbManual');
          kind = 'ok';
          showStatus('✅ ' + msg, 'success');
        } else if (res.reason === 'too-big') {
          msg  = _tf('stTooBigForLocal', { mb: Math.round((res.bytes || info.bytes) / (1024 * 1024) * 10) / 10 });
          kind = 'err';
        } else {
          msg  = _t('msgMoveFailed');
          kind = 'err';
        }
        _refreshStorageRow();
        if (_storageDialogOpen) render(msg, kind);
      });
    }
    const first = overlay.querySelector('#dpsStMove:not([disabled])') || overlay.querySelector('#dpsStClose');
    if (first) first.focus();
  };

  await render();
}

/**
 * Explain the problem and hand the user the actions that fix it.
 * Blocking on purpose: a toast is too easy to miss, and continuing to
 * edit unsaved work makes the situation worse with every keystroke.
 */
function _showStorageFullDialog(list) {
  if (_quotaDialogOpen) return;      // autosave retries constantly
  _quotaDialogOpen = true;

  const activeId = _getActive();
  const biggest = [...(list || [])]
    .map(p => ({ name: p.name || 'Untitled', size: _projectSize(p), active: p.id === activeId }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);

  const rows = biggest.map(p =>
    `<li style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;
                border-bottom:1px solid #f1f5f9;font-size:0.85em;">
       <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#334155;">
         ${p.active ? '▶ ' : ''}${_esc(p.name)}${p.active ? ' <em style="color:#64748b;">(open)</em>' : ''}
       </span>
       <strong style="color:#475569;flex-shrink:0;">${_fmtSize(p.size)}</strong>
     </li>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.id = 'dacumQuotaOverlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;' +
    'justify-content:center;padding:20px;background:rgba(0,0,0,0.6);';

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;max-width:480px;width:100%;
                box-shadow:0 24px 60px rgba(0,0,0,0.35);overflow:hidden;font-family:inherit;">
      <div style="padding:20px 22px 16px;display:flex;align-items:center;gap:12px;
                  background:linear-gradient(135deg,#fef2f2,#fee2e2);border-bottom:1px solid #fecaca;">
        <span style="font-size:1.8em;line-height:1;">💾</span>
        <div>
          <p style="margin:0;font-size:1em;font-weight:800;color:#991b1b;">${_t('quotaTitle')}</p>
          <p style="margin:2px 0 0;font-size:0.78em;color:#b91c1c;">${_t('quotaSub')}</p>
        </div>
      </div>
      <div style="padding:18px 22px 20px;">
        <p style="margin:0 0 14px;font-size:0.88em;color:#374151;line-height:1.6;">
          ${_t('quotaBody')}
        </p>
        <p style="margin:0 0 6px;font-size:0.82em;font-weight:700;color:#1e293b;">${_t('quotaLargest')}</p>
        <ul style="list-style:none;margin:0 0 16px;padding:0;">${rows}</ul>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;
                    padding:11px 13px;margin-bottom:16px;">
          <p style="margin:0;font-size:0.82em;color:#15803d;font-weight:700;">${_t('quotaWhatToDo')}</p>
          <ol style="margin:6px 0 0;padding-inline-start:18px;font-size:0.82em;color:#166534;line-height:1.8;">
            <li>${_t('quotaStep1')}</li>
            <li>${_t('quotaStep2')}</li>
            <li>${_t('quotaStep3')}</li>
          </ol>
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button id="dacumQuotaClose"
                  style="padding:9px 22px;background:#667eea;color:#fff;border:none;
                         border-radius:8px;font-size:0.9em;font-weight:700;cursor:pointer;
                         font-family:inherit;">I understand</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#dacumQuotaClose').addEventListener('click', () => {
    overlay.remove();
    _quotaDialogOpen = false;
  });
}


function _getActive()      { return localStorage.getItem(LS_ACTIVE) || null; }
function _setActive(id)    { id ? localStorage.setItem(LS_ACTIVE, id) : localStorage.removeItem(LS_ACTIVE); }

// ── Inline rename ─────────────────────────────────────────────

function _startInlineRename(id) {
  const card   = document.querySelector(`.dps-card[data-project-id="${id}"]`);
  if (!card) return;

  const nameSpan  = card.querySelector('.dps-card-name');
  const nameInput = card.querySelector('.dps-card-name-input');
  const renameBtn = card.querySelector('.dps-rename');
  if (!nameSpan || !nameInput) return;

  // Switch to edit mode
  nameSpan.style.display  = 'none';
  nameInput.style.display = 'block';

  // CRITICAL: stop click/mousedown/touchstart bubbling so card-body "load-project"
  // handler doesn't fire when user clicks inside the input field.
  // Also stops touch events from reaching the mobile backdrop close handler.
  function _stopBubble(e) { e.stopPropagation(); }
  nameInput.addEventListener('click',      _stopBubble);
  nameInput.addEventListener('mousedown',  _stopBubble);
  nameInput.addEventListener('touchstart', _stopBubble, { passive: true });
  nameInput.addEventListener('touchend',   _stopBubble, { passive: true });

  // Delay focus to next tick so the rename-button's own click event
  // finishes before we attach the blur listener.
  setTimeout(function () {
    nameInput.focus();
    // Place cursor at end (not select-all) so user can click to position
    const len = nameInput.value.length;
    nameInput.setSelectionRange(len, len);
  }, 0);

  // Mark card as editing
  card.classList.add('dps-editing');
  if (renameBtn) renameBtn.setAttribute('data-action', 'confirm-rename');

  function commit() {
    const val = nameInput.value.trim();
    if (val && val !== nameSpan.textContent) {
      renameProject(id, val);   // triggers renderProjectsSidebar
    } else {
      restore();
    }
    cleanup();
  }

  function restore() {
    nameInput.style.display = 'none';
    nameSpan.style.display  = '';
    card.classList.remove('dps-editing');
    if (renameBtn) renameBtn.setAttribute('data-action', 'rename-project');
  }

  function abort() {
    restore();
    cleanup();
  }

  function cleanup() {
    nameInput.removeEventListener('blur',        commit);
    nameInput.removeEventListener('keydown',     onKey);
    nameInput.removeEventListener('click',       _stopBubble);
    nameInput.removeEventListener('mousedown',   _stopBubble);
    nameInput.removeEventListener('touchstart',  _stopBubble);
    nameInput.removeEventListener('touchend',    _stopBubble);
  }

  function onKey(e) {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); abort();  }
  }

  // Add blur listener after a tick so the rename-button click doesn't
  // immediately trigger it.
  setTimeout(function () {
    nameInput.addEventListener('blur',    commit);
    nameInput.addEventListener('keydown', onKey);
  }, 0);
}

// ── Sidebar toggle ────────────────────────────────────────────

function _toggleSidebar() {
  const sb      = document.getElementById('dacumProjectsSidebar');
  const wrapper = document.getElementById('dacumAppWrapper');
  if (!sb) return;

  // Delegate to dacum-mobile.js, which is the only place that knows
  // whether this viewport wants a drawer or an icon rail.
  //
  // The bug this fixes: this function used to toggle `dps-collapsed`
  // unconditionally. That class means "68px icon rail" — a DESKTOP
  // idea. On mobile the sidebar is an off-canvas drawer, and the
  // mobile media query pins it at `width: 260px !important`, which
  // beats the rail's plain `width: 68px`. So on a phone the class
  // hid every label but could not shrink the panel: a full-width
  // drawer showing nothing but icons, and tapping again only toggled
  // the labels back — it never closed.
  //
  // It also wrote dps_sidebar_collapsed='1' from a mobile tap, which
  // is why the desktop layout sometimes came back as a rail for no
  // apparent reason: the two toggle paths were writing the same key
  // with different meanings.
  if (window.DacumSidebar && typeof window.DacumSidebar.toggle === 'function') {
    window.DacumSidebar.toggle();
    _updateCollapseIcon(sb.classList.contains('dps-collapsed'));
    return;
  }

  // Fallback only if dacum-mobile.js failed to load.
  const collapsed = sb.classList.toggle('dps-collapsed');
  if (wrapper) wrapper.classList.toggle('dps-is-collapsed', collapsed);
  _updateCollapseIcon(collapsed);
  try { localStorage.setItem('dps_sidebar_collapsed', collapsed ? '1' : '0'); } catch(e) {}
}

function _updateCollapseIcon(collapsed) {
  const btn = document.getElementById('dpsCollapseBtn');
  if (!btn) return;
  const svgStyle = 'display:block;stroke:currentColor;';
  btn.innerHTML = collapsed
    ? `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true" style="${svgStyle}"><path d="M8 5l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true" style="${svgStyle}"><path d="M12 5l-5 5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function _positionToggle() {
  // No-op: collapse button is now inside the sidebar header (not floating).
  // Kept to avoid any external callers throwing errors.
}

// ── DOM capture helpers ───────────────────────────────────────

function _captureCustomSections() {
  const sections = [];
  document.querySelectorAll('#customSectionsContainer .section-container').forEach(div => {
    const heading  = div.querySelector('h3');
    const textarea = div.querySelector('textarea');
    if (heading && textarea) sections.push({ heading: heading.textContent, content: textarea.value });
  });
  return sections;
}

function _val(id)  { const el = document.getElementById(id); return el ? el.value : ''; }
function _text(id) { const el = document.getElementById(id); return el ? el.textContent : ''; }

function _esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── CSS injection ─────────────────────────────────────────────

function _injectCSS() {
  if (document.getElementById('dps-styles-v8')) return;
  // Remove stale CSS from previous versions
  var _old = document.getElementById('dps-styles');
  if (_old) _old.remove();
  const style = document.createElement('style');
  style.id = 'dps-styles-v8';
  style.textContent = `
/* ══════════════════════════════════════════════════════
   DACUM Projects Sidebar — Modern 3-section layout
   ══════════════════════════════════════════════════════ */

/* ── Layout root ── */
#dacumAppWrapper {
  display: block;
  width: 100%;
}

/* Main container shifts right to make room for fixed sidebar */
#dacumAppWrapper > .container {
  margin-left: 260px;
  transition: margin-left 0.25s cubic-bezier(.4,0,.2,1);
  min-width: 0;
  overflow-x: hidden;
}
/* Collapsed: sidebar is 68px icon rail, content shifts to 68px */
#dacumAppWrapper.dps-is-collapsed > .container {
  margin-left: 68px;
}

/* Tabs now live in sidebar — remove wrapping from main container */
.tabs { flex-wrap: wrap !important; overflow-x: visible !important; }

/* ── Sidebar: base layout ── */
.dps-sidebar {
  position: fixed;
  top: 60px;
  left: 0;
  width: 260px;
  height: calc(100vh - 60px);
  overflow-y: auto;
  overflow-x: hidden;
  background: #1e1e2e;
  color: #cdd6f4;
  display: flex;
  flex-direction: column;
  transition: width 0.25s cubic-bezier(.4,0,.2,1);
  z-index: 300;
  box-shadow: 2px 0 16px rgba(0,0,0,0.3);
  /* Single-unit scrollbar (ChatGPT style) */
  scrollbar-width: thin;
  scrollbar-color: #6c7086 transparent;
}
.dps-sidebar::-webkit-scrollbar       { width: 5px; }
.dps-sidebar::-webkit-scrollbar-track { background: transparent; }
.dps-sidebar::-webkit-scrollbar-thumb { background: #6c7086; border-radius: 5px; }
.dps-sidebar::-webkit-scrollbar-thumb:hover { background: #a6adc8; }

/* Collapsed state: slim 68px icon rail */
.dps-sidebar.dps-collapsed {
  width: 68px;
  overflow: visible;
}

/* ════════════════════════════════════════════════════════
   TOP SECTION: Brand + Collapse button
   ════════════════════════════════════════════════════════ */
.dps-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 0 16px;     /* no top/bottom padding — height from min-height */
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
  min-height: 56px;
  gap: 10px;                   /* guaranteed gap between brand and button */
  overflow: hidden;
}
.dps-brand {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.dps-brand-icon { display: none; }  /* removed per Issue 1 */
.dps-brand-text {
  font-size: 1rem;             /* slightly smaller so it comfortably fits */
  font-weight: 800;
  color: #cba6f7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
  opacity: 1;
  transition: opacity 0.18s;
  /* no max-width — flex:1 on parent is the correct constraint */
}
.dps-sidebar.dps-collapsed .dps-brand-text {
  opacity: 0;
  width: 0;
  pointer-events: none;
  overflow: hidden;
}

/* Collapse / expand button — always visible, never overlaps title */
.dps-collapse-btn {
  background: rgba(203,166,247,0.08);
  border: 1.5px solid #6c7086;
  border-radius: 8px;
  color: #cdd6f4;
  width: 32px;
  height: 32px;
  min-width: 32px;
  max-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  line-height: 0;
  overflow: visible;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.dps-collapse-btn svg {
  display: block;
  flex-shrink: 0;
  stroke: currentColor;
}
.dps-collapse-btn:hover {
  background: rgba(203,166,247,0.22);
  border-color: #cba6f7;
  color: #cba6f7;
}
.dps-sidebar.dps-collapsed .dps-top {
  justify-content: center;
  padding: 0 6px;
}
.dps-sidebar.dps-collapsed .dps-brand {
  display: none;
}

/* ════════════════════════════════════════════════════════
   MIDDLE SECTION: Navigation tabs
   ════════════════════════════════════════════════════════ */
.dps-nav {
  padding: 10px 8px 8px;
  flex-shrink: 0;
  border-bottom: 1px solid #313244;
}
.dps-nav-label {
  font-size: 0.67em;
  font-weight: 700;
  letter-spacing: 0.09em;
  color: #45475a;
  padding: 0 8px 8px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  opacity: 1;
  transition: opacity 0.15s, height 0.25s, padding 0.25s;
  height: auto;
}
.dps-sidebar.dps-collapsed .dps-nav-label {
  opacity: 0;
  height: 0;
  padding: 0;
  pointer-events: none;
  overflow: hidden;
}

/* Tab nav items */
.dps-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 9px 10px;
  cursor: pointer;
  color: #a6adc8;
  font-size: 1rem;       /* ~16px per spec */
  font-weight: 700;
  font-family: inherit;
  text-align: left;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
  overflow: hidden;
  margin-bottom: 2px;
  box-sizing: border-box;
}
.dps-nav-item:hover {
  background: #2a2a3e;
  color: #cdd6f4;
}
.dps-nav-item.dps-nav-active {
  background: #2a273f;
  color: #cba6f7;
}
.dps-nav-item.dps-nav-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  height: 60%;
  width: 3px;
  background: #cba6f7;
  border-radius: 0 3px 3px 0;
}
.dps-nav-icon {
  font-size: 1.1em;
  line-height: 1;
  flex-shrink: 0;
  min-width: 22px;
  text-align: center;
}
.dps-nav-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 1;
  transition: opacity 0.15s;
}
.dps-sidebar.dps-collapsed .dps-nav-text {
  opacity: 0;
  width: 0;
  pointer-events: none;
  overflow: hidden;
}
.dps-sidebar.dps-collapsed .dps-nav-item {
  justify-content: center;
  padding: 10px 0;
  gap: 0;
  overflow: visible;
}
.dps-sidebar.dps-collapsed .dps-nav-item.dps-nav-active::before {
  display: none;
}

/* Tooltip on hover in collapsed mode */
.dps-sidebar.dps-collapsed .dps-nav-item::after {
  content: attr(data-tooltip);
  display: block;
  position: absolute;
  left: 74px;
  top: 50%;
  transform: translateY(-50%);
  background: #313244;
  color: #cdd6f4;
  padding: 5px 12px;
  border-radius: 7px;
  font-size: 0.82em;
  font-weight: 600;
  white-space: nowrap;
  z-index: 9999;
  box-shadow: 0 4px 14px rgba(0,0,0,0.4);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s;
}
.dps-sidebar.dps-collapsed .dps-nav-item:hover::after {
  opacity: 1;
}

/* ════════════════════════════════════════════════════════
   BOTTOM SECTION: Projects header + search + list
   ════════════════════════════════════════════════════════ */
.dps-projects-section {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;   /* don't compress — let sidebar scroll as one unit */
}

/* Projects label row */
.dps-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid #313244;
  gap: 8px;
  flex-shrink: 0;
  min-height: 44px;
}
.dps-title {
  font-size: 0.72em;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  color: #a6adc8;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 1;
  transition: opacity 0.15s;
}
.dps-sidebar.dps-collapsed .dps-title { opacity: 0; }

/* ── New project button ── */
.dps-new-btn {
  background: #cba6f7;
  color: #1e1e2e;
  border: none;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.8em;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s;
}
.dps-new-btn:hover { background: #b4a1e8; }
.dps-sidebar.dps-collapsed .dps-new-btn { display: none; }

/* ── Search ── */
.dps-search-wrap {
  padding: 8px 10px 6px;
  flex-shrink: 0;
}
.dps-sidebar.dps-collapsed .dps-search-wrap { display: none; }
.dps-search-box {
  position: relative;
  display: flex;
  align-items: center;
}
.dps-search-icon {
  position: absolute;
  left: 9px;
  width: 14px;
  height: 14px;
  pointer-events: none;
  flex-shrink: 0;
  opacity: 1;
  transition: opacity 0.12s;
}
.dps-search-box.has-value .dps-search-icon,
.dps-search-box.is-focused .dps-search-icon { opacity: 0; }
.dps-search {
  width: 100%;
  padding: 6px 10px 6px 30px;
  border-radius: 8px;
  border: 1.5px solid #313244;
  background: #181825;
  color: #cdd6f4;
  font-size: 0.8em;
  outline: none;
  box-sizing: border-box;
  height: 32px;
  transition: border-color 0.15s, padding-left 0.12s;
}
.dps-search-box.has-value .dps-search,
.dps-search-box.is-focused .dps-search { padding-left: 10px; }
.dps-search:focus { border-color: #cba6f7; }
.dps-search::placeholder { color: #45475a; font-style: italic; }

/* ── Project list ── */
.dps-list {
  padding: 6px 8px 48px;  /* generous bottom so last card clears viewport */
  min-height: 60px;
}
.dps-sidebar.dps-collapsed .dps-list { display: none; }

/* ── Storage row (project_store.js backend + size) ── */
.dps-storage-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 10px 10px;
  padding: 5px 8px;
  min-height: 30px;
  background: transparent;
  border: 1px dashed #45475a;
  border-radius: 6px;
  color: #7f849c;
  font: inherit;
  font-size: 0.72em;
  text-align: start;
  cursor: pointer;
  max-width: calc(100% - 20px);
  transition: color 0.15s, border-color 0.15s;
}
.dps-storage-row:hover,
.dps-storage-row:focus-visible { color: #cdd6f4; border-color: #89b4fa; outline: none; }
.dps-storage-row.dps-storage-idb    { border-style: solid; border-color: #a6e3a1; color: #a6e3a1; }
.dps-storage-row.dps-storage-locked { border-style: solid; border-color: #f38ba8; color: #f38ba8; }
.dps-storage-icon  { flex-shrink: 0; }
.dps-storage-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dps-sidebar.dps-collapsed .dps-storage-row { display: none; }

/* ── Storage dialog ── */
.dps-st-overlay {
  position: fixed; inset: 0; z-index: 2147483000;
  display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(0,0,0,0.6);
  box-sizing: border-box;
}
.dps-st-card {
  background: #fff; border-radius: 14px; width: 100%; max-width: 440px;
  max-height: calc(100vh - 32px); overflow-y: auto;
  box-shadow: 0 24px 60px rgba(0,0,0,0.35); font-family: inherit;
  box-sizing: border-box; text-align: start;
}
.dps-st-head {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 18px 12px;
  background: linear-gradient(135deg,#eef2ff,#e0e7ff);
  border-bottom: 1px solid #c7d2fe;
}
.dps-st-icon  { font-size: 1.5em; line-height: 1; }
.dps-st-title { margin: 0; font-size: 1em; font-weight: 800; color: #312e81; }
.dps-st-body  { padding: 14px 18px 16px; }
.dps-st-facts { margin: 0 0 12px; padding: 0; }
.dps-st-facts > div {
  display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 0.85em;
}
.dps-st-facts dt { color: #64748b; margin: 0; }
.dps-st-facts dd { color: #1e293b; font-weight: 700; margin: 0; }
.dps-st-explain { margin: 0 0 10px; font-size: 0.85em; color: #374151; line-height: 1.6; overflow-wrap: anywhere; }
.dps-st-hint    { margin: 0 0 10px; font-size: 0.8em; color: #b45309; background: #fffbeb;
                  border: 1px solid #fde68a; border-radius: 8px; padding: 8px 10px; line-height: 1.5; }
.dps-st-note    { margin: 0 0 10px; font-size: 0.82em; border-radius: 8px; padding: 8px 10px; line-height: 1.5; }
.dps-st-note-ok  { color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; }
.dps-st-note-err { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; }
.dps-st-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 6px; }
.dps-st-btn {
  padding: 8px 14px; border-radius: 8px; border: 1px solid #cbd5e1;
  background: #fff; color: #334155; font: inherit; font-size: 0.85em; font-weight: 700;
  cursor: pointer; max-width: 100%; white-space: normal; text-align: center;
}
.dps-st-btn-primary { background: #667eea; border-color: #667eea; color: #fff; }
.dps-st-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dps-st-btn:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
@media (max-width: 420px) {
  .dps-st-actions .dps-st-btn { flex: 1 1 100%; }
}
.dps-empty {
  color: #6c7086;
  font-size: 0.82em;
  text-align: center;
  padding: 20px 8px;
  line-height: 1.6;
}

/* ════════════════════════════════════════════════════════
   PROJECT CARDS — structure UNCHANGED, styling preserved
   ════════════════════════════════════════════════════════ */
.dps-card {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  border-radius: 10px;
  border: 1px solid #313244;
  margin-bottom: 7px;
  background: #181825;
  transition: background 0.15s, border-color 0.15s;
  cursor: pointer;
  padding: 2px 2px 2px 0;
}
.dps-card:hover         { background: #26263a; border-color: #45475a; }
.dps-card.dps-active    { background: #2a273f; border-color: #cba6f7; }
.dps-card.dps-editing   { border-color: #cba6f7; background: #2a273f; }
.dps-card-body          { flex: 1; padding: 8px 4px 8px 10px; min-width: 0; }

/* Name display + inline input */
.dps-card-name-wrap { margin-bottom: 3px; }
.dps-card-name {
  display: block;
  font-size: 0.88em;
  font-weight: 600;
  color: #cdd6f4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dps-active .dps-card-name { color: #cba6f7; }

.dps-card-name-input {
  width: 100%;
  background: #1e1e2e;
  border: 1.5px solid #cba6f7;
  border-radius: 5px;
  color: #cdd6f4;
  font-size: 0.88em;
  font-weight: 600;
  font-family: inherit;
  padding: 3px 7px;
  outline: none;
  box-sizing: border-box;
}

.dps-card-meta  { font-size: 0.72em; color: #6c7086; margin-top: 2px; }
.dps-card-stats {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 0.72em;
  color: #a6adc8;
}

/* ── Card action buttons — always visible, clearly colored ── */
.dps-card-actions {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 7px 7px 0;
  flex-shrink: 0;
}
.dps-icon-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  border-radius: 6px;
  font-size: 0.82em;
  transition: background 0.12s, transform 0.1s;
  padding: 0;
  flex-shrink: 0;
}
.dps-icon-btn:active { transform: scale(0.92); }

/* Rename — blue tint */
.dps-rename { background: #1e3a5f; color: #93c5fd; }
.dps-rename:hover { background: #2563eb; color: #fff; }

/* Delete — red tint */
.dps-delete { background: #3e2a2a; color: #f38ba8; }
.dps-delete:hover { background: #dc2626; color: #fff; }

/* ── Legacy dpsToggle: hidden, kept for dacum-mobile.js compat ── */
#dpsToggle { display: none !important; }
`;
  document.head.appendChild(style);
}


/* ── Re-render on language change ────────────────────────────────────
   The sidebar is built once at startup as one innerHTML string and then
   only updated in place, so applyTranslations() never sees any of it:
   the nav labels, the collapsed-rail tooltips, the search placeholder
   and every project card are all outside its reach.

   Only the pieces that are cheap and stateless are rebuilt. The whole
   <aside> is deliberately NOT re-created: doing so would drop the
   collapse state, the scroll position, an in-progress inline rename and
   every event binding attached at construction time. */
window.addEventListener('dacum:langchange', () => {
  const setText = (sel, key) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = _t(key);
  };

  setText('.dps-nav-label', 'sbNavLabel');
  _refreshStorageRow();

  const NAV_KEYS = {
    'info-tab':              'tabChartInfo',
    'duties-tab':            'tabDuties',
    'additional-info-tab':   'tabAdditionalInfo',
    'verification-tab':      'tabVerification',
    'task-analysis-tab':     'tabTaskAnalysis',
    'clustering-tab':        'tabClustering',
    'occupational-standard-tab': 'tabOccStandard',
    'learning-outcomes-tab': 'tabLearningOutcomes',
    'module-mapping-tab':    'tabModuleMapping',
    'module-curriculum-tab': 'tabModuleCurriculum',
    'contact-tab':           'tabHelp',
  };
  document.querySelectorAll('.dps-nav-item').forEach(btn => {
    const key = NAV_KEYS[btn.getAttribute('data-target-tab')];
    if (!key) return;
    const label = _t(key);
    const txt = btn.querySelector('.dps-nav-text');
    if (txt) txt.textContent = label;
    // The tooltip is the ONLY label visible on the collapsed rail.
    btn.setAttribute('data-tooltip', label);
  });

  /* Not in NAV_KEYS — it has no data-target-tab, by design — so it is
     re-labelled explicitly rather than by the loop above. */
  const esBtn = document.getElementById('dpsExportSettings');
  if (esBtn) {
    const esLabel = _t('esTitle');
    const esTxt = esBtn.querySelector('.dps-nav-text');
    if (esTxt) esTxt.textContent = esLabel;
    esBtn.setAttribute('data-tooltip', esLabel);
  }

  const title = document.querySelector('.dps-title');
  if (title) title.textContent = '\u{1F4C1} ' + _t('sbProjects');

  const newBtn = document.getElementById('dpsNewProject');
  if (newBtn) {
    newBtn.textContent = '\uFF0B ' + _t('sbNew');
    newBtn.title = _t('ttNewProject');
  }

  const search = document.getElementById('dpsSearch');
  if (search) search.placeholder = _t('phSearchProjects');

  const collapse = document.getElementById('dpsCollapseBtn');
  if (collapse) {
    collapse.title = _t('ttToggleSidebar');
    collapse.setAttribute('aria-label', _t('ttToggleSidebar'));
  }

  /* Cards carry the plural counts and the locale-formatted date, so they
     must be regenerated rather than patched. renderProjectsSidebar()
     reads from storage and is already called on every project change. */
  if (document.getElementById('dpsProjectList')) renderProjectsSidebar();
});


/* ── Live duty/task counts on the active project card ────────────────
   The card used to read its counts from the SAVED project in
   localStorage, which is only rewritten on save — so adding, deleting,
   dragging, Undo/Redo or a snapshot restore left the card showing stale
   numbers until the user clicked it or reloaded.

   Every one of those paths ends in renderDutiesFromState(), which
   rebuilds #dutiesContainer from appState. Watching that container's
   child list therefore catches all of them (and any future path) with
   no hook inside duties.js, history.js, drag_drop.js or snapshots.js.
   Typing does not mutate the child list, so this never runs per
   keystroke. Counts follow the same rule as the saved card: every duty
   and every task row in the chart. */
let _liveStats = null;          // { id, duties, tasks } for the active project
let _statsRaf  = 0;

function _computeLiveStats() {
  const duties = Array.isArray(appState.dutiesData) ? appState.dutiesData : [];
  return {
    id:     _getActive(),
    duties: duties.length,
    tasks:  duties.reduce((n, d) => n + ((d && d.tasks) ? d.tasks.length : 0), 0),
  };
}

function _applyLiveStats() {
  if (!_liveStats || !_liveStats.id || _liveStats.id !== _getActive()) return;
  const card = document.querySelector(`.dps-card[data-project-id="${_liveStats.id}"]`);
  if (card) {
    const d = card.querySelector('.dps-stat-duties');
    const t = card.querySelector('.dps-stat-tasks');
    const dTxt = '📋 ' + _tp('countDuty', _liveStats.duties);
    const tTxt = '✅ ' + _tp('countTask', _liveStats.tasks);
    if (d && d.textContent !== dTxt) d.textContent = dTxt;
    if (t && t.textContent !== tTxt) t.textContent = tTxt;
  }
  // Live-workshop panel shows the same pair for the active project.
  const lw = document.getElementById('lwProjectStats');
  if (lw && lw.textContent) {
    lw.textContent = `${_tp('countDuty', _liveStats.duties)} · ${_tp('countTask', _liveStats.tasks)}`;
  }
}

export function refreshActiveProjectStats() {
  _liveStats = _computeLiveStats();
  _applyLiveStats();
}

function _scheduleStatsRefresh() {
  if (_statsRaf) return;
  const run = () => { _statsRaf = 0; refreshActiveProjectStats(); };
  _statsRaf = (typeof requestAnimationFrame === 'function')
    ? requestAnimationFrame(run)
    : setTimeout(run, 16);
}

function _watchDutiesForStats() {
  if (_watchDutiesForStats._on) return;
  const container = document.getElementById('dutiesContainer');
  if (!container || typeof MutationObserver !== 'function') {
    // Container not in the DOM yet — try again once the page settles.
    setTimeout(_watchDutiesForStats, 500);
    return;
  }
  _watchDutiesForStats._on = true;
  new MutationObserver(_scheduleStatsRefresh)
    .observe(container, { childList: true, subtree: true });
  // A project switch re-renders the duties too, but refresh explicitly
  // so the new card never shows the previous project's numbers.
  document.addEventListener('dacum:project-loaded', _scheduleStatsRefresh);
  window.addEventListener('dacum:langchange', _scheduleStatsRefresh);
  _scheduleStatsRefresh();
}
