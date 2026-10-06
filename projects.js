// ============================================================
// /projects.js
// Project-level ops: clear, switch tab, AI generation
// ============================================================

import { appState, defaultSupplementaryVerification,
         defaultModuleCurriculumData } from './state.js';
import { showStatus } from './renderer.js';
import { addDuty, renderDutiesFromState } from './duties.js';
import { resetSkillsLevel, renderSkillsLevel } from './renderer.js';
import { renderLearningOutcomes, renderPCSourceList, renderModules, renderModuleLoList,
  renderClusters, renderAvailableTasks } from './modules.js';
import { checkUsageLimit, incrementUsage, showLoadingModal, hideLoadingModal } from './storage.js';
import { loadDutiesForVerification, syncVerificationTab } from './tasks.js';
import { syncTaskAnalysisTab, clearAllTaskAnalysis, hasAnyTaskAnalysis,
         countTaskAnalysisRecords } from './task_analysis.js';
import { isBatchRun } from './draft_mode.js';
import { renderOccupationalStandard } from './occupational_standard.js';
import { throwIfAIError, showAIServiceError, BACKEND_URL } from './ai_client.js';
import { renderModuleCurriculum, clearModuleCurriculum,
         isModuleCurriculumEmpty } from './module_curriculum.js';
import { verifyOccupation, needsConfirmation, VERDICT, describeCheck,
         markBypassed, wasBypassed, clearBypass } from './occupation_check.js';

/* i18n access — resolved lazily; see duties.js for why. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
/* Output-language directive, appended to the request like every other
   AI card. This card was the only one without it, so an Arabic or
   French interface could get duties and tasks back in English — and
   the Full Draft's language lock did not reach its first stage. */
const _aiDir = () => (window.i18n && window.i18n.aiDirective ? window.i18n.aiDirective() : '');




// ── Tab Switching ─────────────────────────────────────────────

export function switchTab(tabId) {
  // ── Clustering gate ──────────────────────────────────────────
  // This gate exists to stop someone SKIPPING task verification on the
  // way forward. It must not block someone coming BACK: if clusters
  // already exist, the user has demonstrably passed through this tab
  // already, and re-asking them to "choose an option in Task
  // Verification" is both wrong and a dead end — the ← Back button on
  // Learning Outcomes became unusable because of it.
  //
  // Existing clusters are also the only reliable signal after a project
  // is imported or reloaded, because clusteringAllowed is reset to
  // false in those paths even when the chart is fully clustered.
  if (tabId === 'clustering-tab' && !appState.clusteringAllowed) {
    const hasClusters = (appState.clusteringData?.clusters?.length || 0) > 0;

    if (hasClusters) {
      // Re-open the gate permanently for this session.
      appState.clusteringAllowed = true;
    } else {
      alert(_t('msgChooseVerificationOption'));
      return;
    }
  }

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const selectedTab = document.querySelector(`[data-tab="${tabId}"]`);
  const selectedContent = document.getElementById(tabId);

  if (selectedTab && selectedContent) {
    selectedTab.classList.add('active');
    selectedContent.classList.add('active');

    // Re-render from appState on entry. These containers are not
    // rebuilt anywhere else, so without this they keep showing
    // whatever was last painted — stale data after a project switch,
    // or an empty placeholder for clusters created earlier in the
    // session but never re-rendered since.
    if (tabId === 'clustering-tab') {
      renderAvailableTasks();
      renderClusters();
    }
    if (tabId === 'verification-tab') {
      syncVerificationTab();
    }
    // Same re-render-on-entry rule as setupTabs() in tabs.js — both
    // entry points must behave identically, see the comment there.
    if (tabId === 'task-analysis-tab') {
      syncTaskAnalysisTab();
    }
    if (tabId === 'learning-outcomes-tab') {
      renderPCSourceList();
      renderLearningOutcomes();
    }
    if (tabId === 'module-mapping-tab') {
      renderModuleLoList();
      renderModules();
    }
    if (tabId === 'module-curriculum-tab') {
      renderModuleCurriculum();
    }
    if (tabId === 'occupational-standard-tab') {
      renderOccupationalStandard();
    }
  }
}

// ── Clear All ─────────────────────────────────────────────────

export function clearAll() {
  // ── Smart summary of what will be erased ──────────────────
  const dutyCount   = (appState.dutiesData || []).length;
  const taskCount   = (appState.dutiesData || []).reduce((s, d) => s + (d.tasks || []).length, 0);
  const hasVotes    = Object.keys(appState.workshopResults || {}).length > 0;
  const hasSession  = !!appState.lwSessionId;
  const hasClusters = (appState.clusteringData?.clusters || []).length > 0;
  const hasOutcomes = (appState.learningOutcomesData?.outcomes || []).length > 0;
  const hasModules  = (appState.moduleMappingData?.modules || []).length > 0;
  const occupation  = document.getElementById('occupationTitle')?.value?.trim() || '';

  const lines = [];
  if (occupation)   lines.push(`📋  Occupation: "${occupation}"`);
  if (dutyCount)    lines.push(`✅  ${dutyCount} Duties — ${taskCount} Tasks`);
  if (hasVotes)     lines.push(`🗳️   Voting results & dashboard data`);
  if (hasSession)   lines.push(`📡  Live workshop session`);
  if (hasClusters)  lines.push(`🎯  Competency clusters`);
  if (hasOutcomes)  lines.push(`🎓  Learning outcomes`);
  if (hasModules)   lines.push(`📦  Module mapping`);

  const summary = lines.length
    ? `\nThe following data will be permanently erased:\n\n${lines.join('\n')}\n`
    : '\nAll fields are already empty.\n';

  const message =
    `⚠️  CLEAR ALL DATA\n` +
    `${'─'.repeat(38)}\n` +
    `${summary}\n` +
    `This action cannot be undone.\n` +
    `Are you sure you want to continue?`;

  if (!confirm(message)) return false;

  _doClear();
  showStatus(_t('msgAllDataCleared'), 'success');
  return true;
}

/**
 * clearAllSilent — same as clearAll but no confirm dialog and no status toast.
 * Used internally when the last project is deleted (DOM must be reset quietly).
 */
export function clearAllSilent() {
  _doClear();
}

// ── Internal DOM reset (shared by clearAll and clearAllSilent) ─

function _doClear() {
  // ── Chart Info ────────────────────────────────────────────
  ['dacumDate','dacumDateEnd','workshopFormat','producedFor','producedBy','occupationTitle','scopeOfWork','jobTitle',
   'sector','context','venue','facilitators','observers','panelMembers'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Images
  appState.producedForImage = null;
  appState.producedByImage  = null;
  _resetImagePreview('producedFor');
  _resetImagePreview('producedBy');

  // ── Duties (state-first, then single render) ──────────────
  // addDuty() now seeds its own first task (see duties.js), so the
  // explicit addTask() that used to follow here would produce a
  // second, unwanted blank task on every clear.
  appState.dutiesData = [];
  appState.dutyCount  = 0;
  appState.taskCounts = {};
  addDuty();

  // ── Additional Info ───────────────────────────────────────
  _resetHeading('knowledgeHeading',  'Knowledge Requirements');
  _resetHeading('skillsHeading',     'Skills Requirements');
  _resetHeading('behaviorsHeading',  'Worker Behaviors/Traits');
  _resetHeading('toolsHeading',      'Tools, Equipment, Supplies and Materials');
  _resetHeading('trendsHeading',     'Future Trends and Concerns');
  _resetHeading('acronymsHeading',   'Acronyms');
  _resetHeading('careerPathHeading', 'Career Path');
  ['knowledgeInput','skillsInput','behaviorsInput','toolsInput',
   'trendsInput','acronymsInput','careerPathInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('customSectionsContainer').innerHTML = '';
  appState.customSectionCounter = 0;

  // Skills Level Matrix: back to the default rows AND the default levels.
  // Without this a new project inherited the previous project's ticks
  // (and, since 3.40.0, its renamed or added levels).
  appState.skillsLevelColumns = null;
  resetSkillsLevel(false);

  // Hide the scope-missing warning card if it was shown by a previous generation
  _hideScopeMissingWarning();

  // ── Task Verification (individual ratings + UI) ───────────
  appState.verificationRatings  = {};
  appState.taskMetadata         = {};
  // 3.46.0: Task Analysis was never reset here, so a new project (and
  // Clear All) kept the previous project's analysis, priority stars —
  // keyed by the same task ids (duty_1_1 …) and therefore shown on the
  // new project's tasks.
  appState.taskAnalysisData           = {};
  appState.taskAnalysisPriority       = {};
  appState.taskAnalysisCustomSections = [];
  appState.collectionMode       = 'workshop';
  appState.workflowMode         = 'standard';
  const modeWorkshop = document.getElementById('mode-workshop');
  const modeSurvey   = document.getElementById('mode-survey');
  const wfStandard   = document.getElementById('workflow-standard');
  const wfExtended   = document.getElementById('workflow-extended');
  if (modeWorkshop) modeWorkshop.checked = true;
  if (modeSurvey)   modeSurvey.checked   = false;
  if (wfStandard)   wfStandard.checked   = true;
  if (wfExtended)   wfExtended.checked   = false;
  const verCont = document.getElementById('verificationAccordionContainer');
  if (verCont) { verCont.innerHTML = ''; verCont.classList.remove('workflow-extended'); }
  appState.workshopParticipants = 10;
  appState.workshopCounts       = {};
  appState.workshopResults      = {};
  appState.priorityFormula      = 'if';
  // Back to the default (feature off) — a new project must never
  // inherit the previous project's supplementary lists.
  appState.supplementaryVerification = defaultSupplementaryVerification();
  document.dispatchEvent(new CustomEvent('dacum:supplementary-changed'));
  const wp  = document.getElementById('workshopParticipants');
  const fif = document.getElementById('formula-if');
  const ifd = document.getElementById('formula-ifd');
  if (wp)  wp.value    = 10;
  if (fif) fif.checked = true;
  if (ifd) ifd.checked = false;

  // ── Dashboard DOM ─────────────────────────────────────────
  const dbBody = document.getElementById('dashboardTableBody');
  const dbSum  = document.getElementById('dashboardSummary');
  const dlBody = document.getElementById('dutyLevelTableBody');
  const dlCont = document.getElementById('dutyLevelContent');
  if (dbBody) dbBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#999;">No data — use Task Verification to collect votes.</td></tr>`;
  if (dbSum)  dbSum.innerHTML  = '';
  if (dlBody) dlBody.innerHTML = '';
  if (dlCont && dlCont.style.display !== 'none') dlCont.style.display = 'none';

  // ── Live Workshop session ─────────────────────────────────
  appState.lwSessionId         = null;
  appState.lwFinalizedData     = null;
  appState.lwAggregatedResults = null;

  const lwResults  = document.getElementById('lwResultsContainer');
  const lwExport   = document.getElementById('lwExportButtons');
  const lwSession  = document.getElementById('lwSessionId');
  const lwLink     = document.getElementById('lwParticipantLink');
  const lwQRModal  = document.getElementById('lwQRModal');
  const lwSection  = document.getElementById('liveWorkshopSection');

  if (lwResults)  lwResults.innerHTML  = '<p style="color:#999;font-style:italic;text-align:center;padding:30px;">No votes received yet.</p>';
  if (lwExport)   lwExport.style.display  = 'none';
  if (lwSession)  lwSession.textContent   = '';
  if (lwLink)     { lwLink.textContent = ''; lwLink.removeAttribute('data-full-url'); }
  if (lwQRModal)  lwQRModal.style.display = 'none';
  if (lwSection)  lwSection.style.display = 'none';

  // ── Decision / routing flags ──────────────────────────────
  appState.verificationDecisionMade = false;
  appState.clusteringAllowed        = false;
  const btnLW = document.getElementById('btnLWFinalize');
  const btnBP = document.getElementById('btnBypassToClustering');
  const btnRD = document.getElementById('btnResetDecision');
  if (btnLW) btnLW.disabled        = false;
  if (btnBP) btnBP.disabled        = false;
  if (btnRD) btnRD.style.display   = 'none';

  // ── Clustering ────────────────────────────────────────────
  appState.clusteringData = { availableTasks: [], clusters: [], clusterCounter: 0 };

  // ── Learning Outcomes ─────────────────────────────────────
  appState.learningOutcomesData = { outcomes: [], outcomeCounter: 0 };
  renderLearningOutcomes();
  renderPCSourceList();

  // ── Module Mapping ────────────────────────────────────────
  appState.moduleMappingData = { modules: [], moduleCounter: 0 };
  renderModules();
  renderModuleLoList();

  // ── Module Curriculum (3.33.0) ────────────────────────────
  appState.moduleCurriculumData = defaultModuleCurriculumData();
  try { renderModuleCurriculum(); } catch (_) {}

  // ── Switch to Chart Info tab ──────────────────────────────
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const infoTab  = document.querySelector('[data-tab="info-tab"]');
  const infoCont = document.getElementById('info-tab');
  if (infoTab)  infoTab.classList.add('active');
  if (infoCont) infoCont.classList.add('active');
}

// ── Clear Current Tab ─────────────────────────────────────────

// The DACUM stages form a chain, each built from the one before it:
//
//   Duties & Tasks → Verification → Clustering → Learning Outcomes → Modules
//
// Clearing a stage does not touch the stages after it, so the work
// downstream survives as an orphan: clusters whose tasks no longer
// exist, outcomes with no cluster behind them, modules assembled from
// outcomes that were deleted. Nothing crashes, which is precisely the
// problem — the damage is invisible until someone exports the chart and
// finds the later stages no longer trace back to anything.
//
// So the confirmation names what else is at stake. Only downstream
// stages that ACTUALLY hold data are listed: a warning that fires on
// every clear, including the harmless ones, is a warning users learn to
// click past, which would leave them less protected than before.
const _DOWNSTREAM_OF = {
  'duties-tab':            ['verification', 'taskAnalysis', 'clustering', 'outcomes', 'modules'],
  'verification-tab':      ['taskAnalysis', 'clustering', 'outcomes', 'modules'],
  'task-analysis-tab':     ['clustering', 'outcomes', 'modules'],
  'clustering-tab':        ['outcomes', 'modules'],
  'learning-outcomes-tab': ['modules'],
  'module-mapping-tab':    [],
  'module-curriculum-tab': [],
  'info-tab':              [],
  'additional-info-tab':   [],
};

function _downstreamWork(stage) {
  const s = appState;
  switch (stage) {
    case 'verification': {
      const rated = Object.keys(s.verificationRatings || {}).filter(k => {
        const r = s.verificationRatings[k];
        return r && (r.importance !== null && r.importance !== undefined);
      }).length + Object.keys(s.workshopResults || {}).length;
      return rated ? `${rated} task rating${rated === 1 ? '' : 's'} in Task Verification` : null;
    }
    case 'taskAnalysis': {
      const n = countTaskAnalysisRecords();
      return n ? `${n} task analysis record${n === 1 ? '' : 's'}` : null;
    }
    case 'clustering': {
      const n = s.clusteringData?.clusters?.length || 0;
      return n ? `${n} competency cluster${n === 1 ? '' : 's'}` : null;
    }
    case 'outcomes': {
      const n = s.learningOutcomesData?.outcomes?.length || 0;
      return n ? `${n} learning outcome${n === 1 ? '' : 's'}` : null;
    }
    case 'modules': {
      const n = s.moduleMappingData?.modules?.length || 0;
      return n ? `${n} training module${n === 1 ? '' : 's'}` : null;
    }
    default: return null;
  }
}

// Nothing to lose means nothing to warn about. Clearing an empty tab is
// a no-op, so a modal asking the user to confirm an irreversible action
// is simply false: it describes a consequence that cannot occur. Worse,
// it teaches people to dismiss this exact dialog without reading — which
// is the dialog that has to be read when the tab is NOT empty.
//
// The codebase already uses this idiom in the AI paths (clustering_ai.js
// and learning_outcomes_ai.js both guard their overwrite prompts with
// `if (existing.length && !confirm(...))`). The clear paths just never
// adopted it.
function _isTabEmpty(tabId) {
  const s   = appState;
  const val = id => (document.getElementById(id)?.value || '').trim();

  switch (tabId) {
    case 'info-tab':
      return !['dacumDate','dacumDateEnd','venue','producedFor','producedBy','occupationTitle','scopeOfWork',
               'jobTitle','sector','context','facilitators','observers','panelMembers']
               .some(val) && !s.producedForImage && !s.producedByImage;

    case 'duties-tab':
      return !(s.dutiesData || []).some(d => (d.title || '').trim() || (d.tasks || []).length);

    case 'additional-info-tab':
      return !['knowledgeInput','skillsInput','behaviorsInput','toolsInput',
               'trendsInput','acronymsInput','careerPathInput'].some(val) &&
             !document.getElementById('customSectionsContainer')?.children.length;

    case 'verification-tab':
      return !Object.keys(s.verificationRatings || {}).length &&
             !Object.keys(s.workshopCounts      || {}).length &&
             !Object.keys(s.workshopResults     || {}).length &&
             !_hasSupplementaryResponses();

    case 'task-analysis-tab':
      return !hasAnyTaskAnalysis();

    case 'clustering-tab':
      return !(s.clusteringData?.clusters?.length);

    case 'learning-outcomes-tab':
      return !(s.learningOutcomesData?.outcomes?.length);

    case 'module-mapping-tab':
      return !(s.moduleMappingData?.modules?.length);

    case 'module-curriculum-tab':
      return isModuleCurriculumEmpty();

    default:
      return false;   // unknown tab: never suppress the warning
  }
}

/* Supplementary Occupational Verification — inline, appState-only
   helpers. Importing supplementary_verification.js here would close an
   import cycle through dacum_projects.js; the module re-renders itself
   on the event below. */
function _hasSupplementaryResponses() {
  const sv = appState.supplementaryVerification;
  if (!sv || !Array.isArray(sv.categories)) return false;
  if (sv.enabled) return true;
  return sv.categories.some(c => (c.items || []).some(i =>
    (i.rating !== null && i.rating !== undefined) ||
    [0, 1, 2, 3].some(v => (parseInt(i.counts?.[v]) || 0) > 0)));
}

function _confirmClear(tabId) {
  if (_isTabEmpty(tabId)) {
    showStatus(_t('msgTabAlreadyEmpty'), 'success');
    return false;
  }

  const affected = (_DOWNSTREAM_OF[tabId] || [])
    .map(_downstreamWork)
    .filter(Boolean);

  if (!affected.length) {
    return confirm(_t('confirmClearTab'));
  }

  return confirm(_tf('confirmClearTabDownstream', {
    list: affected.map(a => '  \u2022 ' + a).join('\n')
  }));
}

export function clearCurrentTab(tabId) {
  if (!_confirmClear(tabId)) return;

  if (tabId === 'info-tab') {
    ['dacumDate','dacumDateEnd','workshopFormat','venue','producedFor','producedBy','occupationTitle','scopeOfWork','jobTitle',
     'sector','context','facilitators','observers','panelMembers'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    appState.producedForImage = null;
    appState.producedByImage  = null;
    _resetImagePreview('producedFor');
    _resetImagePreview('producedBy');
    showStatus(_tf('msgTabCleared', { v: _t('tabChartInfo') }), 'success');

  } else if (tabId === 'duties-tab') {
    document.getElementById('dutiesContainer').innerHTML = '';
    appState.dutyCount  = 0;
    appState.taskCounts = {};
    addDuty();          // seeds its own first task — see duties.js
    showStatus(_tf('msgTabCleared', { v: _t('tabDuties') }), 'success');

  } else if (tabId === 'additional-info-tab') {
    ['knowledgeInput','skillsInput','behaviorsInput','toolsInput',
     'trendsInput','acronymsInput','careerPathInput'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('customSectionsContainer').innerHTML = '';
    appState.customSectionCounter = 0;
    appState.skillsLevelColumns = null;   // levels back to the defaults too
    resetSkillsLevel(false); // false = no confirm
    showStatus(_tf('msgTabCleared', { v: _t('tabAdditionalInfo') }), 'success');

  } else if (tabId === 'verification-tab') {
    appState.verificationRatings = {};
    appState.workshopCounts      = {};
    appState.workshopResults     = {};
    // Supplementary Occupational Verification: back to its initial
    // state (feature off, no items, no responses). Items taken from
    // Additional Info reappear automatically when it is re-enabled.
    appState.supplementaryVerification = defaultSupplementaryVerification();
    document.dispatchEvent(new CustomEvent('dacum:supplementary-changed'));
    // Repopulate rather than leave the tab blank. Emptying the container
    // was technically correct — the RATINGS are what "clear" means here —
    // but it looked like the duties themselves had been deleted, and the
    // only way back was the Refresh button further down the page. Now the
    // duties reappear immediately with every rating reset to unanswered,
    // which is what "clear this tab" actually means to the user.
    const verCont = document.getElementById('verificationAccordionContainer');
    if (verCont) {
      verCont.innerHTML = '';
      try { loadDutiesForVerification(); } catch (e) { /* no duties yet */ }
    }
    const dbBody = document.getElementById('dashboardTableBody');
    const dbSum  = document.getElementById('dashboardSummary');
    if (dbBody) dbBody.innerHTML = '';
    if (dbSum)  dbSum.innerHTML  = '';
    appState.verificationDecisionMade = false;
    appState.clusteringAllowed        = false;
    const btnLW = document.getElementById('btnLWFinalize');
    const btnBP = document.getElementById('btnBypassToClustering');
    const btnRD = document.getElementById('btnResetDecision');
    if (btnLW) btnLW.disabled = false;
    if (btnBP) btnBP.disabled = false;
    if (btnRD) btnRD.style.display = 'none';
    showStatus(_tf('msgTabCleared', { v: _t('tabVerification') }), 'success');

  } else if (tabId === 'task-analysis-tab') {
    clearAllTaskAnalysis();
    showStatus(_tf('msgTabCleared', { v: _t('tabTaskAnalysis') }), 'success');

  } else if (tabId === 'clustering-tab') {
    appState.clusteringData = { availableTasks: [], clusters: [], clusterCounter: 0 };
    renderAvailableTasks();
    renderClusters();
    showStatus(_tf('msgTabCleared', { v: _t('tabClustering') }), 'success');

  } else if (tabId === 'learning-outcomes-tab') {
    appState.learningOutcomesData = { outcomes: [], outcomeCounter: 0 };
    renderLearningOutcomes();
    renderPCSourceList();
    showStatus(_tf('msgTabCleared', { v: _t('tabLearningOutcomes') }), 'success');

  } else if (tabId === 'module-mapping-tab') {
    appState.moduleMappingData = { modules: [], moduleCounter: 0 };
    renderModules();
    renderModuleLoList();
    showStatus(_tf('msgTabCleared', { v: _t('tabModuleMapping') }), 'success');

  } else if (tabId === 'module-curriculum-tab') {
    // Curriculum data only — modules and learning outcomes stay.
    clearModuleCurriculum();
    showStatus(_tf('msgTabCleared', { v: _t('tabModuleCurriculum') }), 'success');
  }
}

// ── AI DACUM Generation ───────────────────────────────────────
//
// Flow:
//   generateAIDacum()     → validation + scope gate (may return early)
//   └── _runAIGeneration()→ actual API call + state population
//
// When scope is missing, generateAIDacum shows the yellow warning card
// and RETURNS WITHOUT CALLING THE API.  The "⚡ Generate Anyway" button
// inside that card calls _runAIGeneration() directly to resume with
// the user's explicit consent.  This prevents wasted API quota and
// gives the user a conscious choice.

export async function generateAIDacum() {
  console.log('🚀 AI Generation Started');

  const usageStatus = checkUsageLimit();
  if (!usageStatus.allowed) {
    showStatus(_tf('msgDailyLimitReached', { n: usageStatus.count }), 'error');
    return;
  }

  // ── Read inputs (occupation AND job required since 3.72.0) ──
  const inputs = _readAIInputs();

  // ── Hard validation: only Occupation Title is required ──
  if (!inputs.occupationTitle) {
    // alert() is a hard block; in a pipeline it freezes the run behind
    // a native dialog with the progress list still showing "in
    // progress". The status line carries the same message.
    if (!isBatchRun()) alert(_t('msgOccupationRequiredAlert'));
    showStatus(_t('msgOccupationRequired'), 'error');
    return;
  }

  /* 3.72.0 — DACUM analyses a JOB: the duties and tasks of the people
     who hold it. The occupation is its wider family, so a chart built
     from the occupation alone mixes several jobs. The Job Title may be
     the same as the occupation when the occupation is a single job. */
  if (!inputs.jobTitle) {
    if (!isBatchRun()) alert(_t('msgJobTitleRequiredAlert'));
    showStatus(_t('msgJobTitleRequired'), 'error');
    _focusChartInfoField('jobTitle');
    return;
  }

  /* ── Soft gate: the occupation title itself ──────────────────
     Placed HERE, in the validator, and not in _runAIGeneration():
     that function is what "Generate Anyway" calls directly, so a
     check inside it would re-open the warning the user just chose
     to dismiss.

     Skipped during a Full Draft because draft_ui.js asks the same
     question BEFORE the run starts — which is where it is worth
     most, ahead of seven chained calls and the whole day's quota,
     rather than after the first one has already been spent. */
  if (!isBatchRun() && !wasBypassed(inputs.occupationTitle, inputs.jobTitle)) {
    showStatus(_t('msgCheckingOccupation'), 'info');
    const check = await verifyOccupation(inputs.occupationTitle, inputs.jobTitle);
    if (needsConfirmation(check)) {
      _showOccupationWarning(check);
      showStatus(_t('msgOccupationQuestionable'), 'error');
      return;
    }
    _hideOccupationWarning();
  }

  // ── Soft gate: missing Scope of Work ──
  // If Scope is empty, show the warning card and STOP.  The card's
  // "Generate Anyway" button will resume via _runAIGeneration() when
  // the user explicitly decides to proceed without a scope.  Per
  // spec, we do not remember this choice — the card re-appears on
  // every subsequent attempt while Scope stays empty.
  if (!inputs.scopeOfWork && !isBatchRun()) {
    _showScopeMissingWarning();
    showStatus(_t('msgAddScopeOrProceed'), 'error');
    return;
  }

  // Scope is filled → hide any stale warning card and proceed
  _hideScopeMissingWarning();
  return _runAIGeneration(inputs);
}

// ── Actual generation pipeline (no validation — caller must validate) ──

async function _runAIGeneration(inputs) {
  const { occupationTitle, jobTitle, scopeOfWork, sector, context } = inputs;

  // Restrict to real text fields — buttons in Card View also carry
  // data-duty-id for their remove-duty action, which would incorrectly
  // show up as "existing content" in this guard
  const existingDuties = document.querySelectorAll('input[data-duty-id], textarea[data-duty-id]');
  let hasContent = false;
  existingDuties.forEach(inp => { if (inp.value.trim()) hasContent = true; });

  /* The Full Draft run already confirmed the overwrite once, naming
     every tab involved. Asking again mid-pipeline stalls it behind a
     dialog nobody is watching for. */
  if (hasContent && !isBatchRun()) {
    // Only a real warning when there is real work to lose. On a blank
    // chart this claimed it would "REPLACE ALL EXISTING DUTIES AND
    // TASKS" when there were none — an alarming prompt in front of the
    // first thing a new user is meant to do.
    const hasWork = (appState.dutiesData || []).some(d =>
      (d.title || '').trim() || (d.tasks || []).length
    );
    if (hasWork && !confirm('\u26A0\uFE0F ' + _aiOverwriteMessage())) {
      showStatus(_t('msgAIGenCancelled'), 'error');
      return;
    }
  }

  showLoadingModal();
  await new Promise(resolve => setTimeout(resolve, 100));

  // ── Dynamic prompt — only include fields that are non-empty ──
  // Each optional line is a single template expression that evaluates
  // to '' when the corresponding field is blank, so the AI never sees
  // empty "Field: " lines that would dilute the signal.
  const prompt = `You are an occupational analysis engine specialized in DACUM methodology.
Your task is to generate a DATA-INFORMED DACUM DRAFT that will be injected directly into a DACUM chart UI.

INPUT:
Job Title (UNIT OF ANALYSIS — the job this chart describes): ${jobTitle}
Occupation (CONTEXT ONLY — the wider family this job belongs to): ${occupationTitle}${
  jobTitle.toLowerCase() === occupationTitle.toLowerCase() ? `
(The job and the occupation are the same here: analyse it as ONE job, not as a family of jobs.)` : ''}${scopeOfWork ? `
Scope of Work (CRITICAL BOUNDARY of this job): ${scopeOfWork}` : ''}${sector ? `
Sector: ${sector}` : ''}${context ? `
Country / Context: ${context}` : ''}

UNIT OF ANALYSIS (DACUM — VERY IMPORTANT):
- A DACUM chart describes ONE JOB: the duties and tasks performed by
  competent workers who HOLD THAT JOB. It is not a map of the occupation.
- The occupation is context only — use it for vocabulary, sector norms
  and typical work settings. NEVER include duties or tasks that belong
  to other jobs in the same occupation (other specialisations,
  neighbouring trades, supervisory or managerial roles).
- If Scope of Work is provided → it further DEFINES and LIMITS this job.
- Test every duty and task: "Does a competent holder of THIS job perform
  this as part of the job?" If not, leave it out.

TASK:
Generate a DACUM draft that reflects the REAL WORK performed by holders of this job.

STRUCTURE GUIDELINES (FLEXIBLE):
- Duties: typically 6–12 (based on actual scope coverage)
- Tasks per duty: typically 6–20
- Total tasks: usually 75–125
- STOP when the job scope is logically complete (do NOT force numbers)

DUTY RULES:
- Represent major responsibility areas within the defined scope
- Use verb-based responsibility titles
  (e.g., "Apply Safety, Health, Environment and Quality in the Workplace")
- Avoid overlap or duplication between duties

TASK RULES:
- Start with ONE clear occupational action verb
- Format: Verb + Object (+ qualifier if needed)
- Use only observable, hands-on work actions
- Use ONE verb only per task (no combined or compound verbs)
- NO outcomes, NO intentions (avoid "to ensure", "in order to", etc.)
- NO learning/cognitive verbs (understand, learn, know, recognize)
- NO tools, equipment, materials, knowledge, or competencies as task content
- NO administrative, managerial, or policy-oriented verbs
  (comply, adhere, manage, coordinate, supervise, report)
- Focus strictly on real, hands-on job execution tasks

QUALITY CONTROL:
- Ensure all duties and tasks stay INSIDE this job (and its scope when given)
- Avoid generic occupation-wide tasks that the holder of this job does not perform
- Prefer specificity over completeness when the two conflict

METHODOLOGICAL NOTE:
- Be data-informed using labor-market and contextual signals for realism,
  but prioritize expert DACUM logic and job coherence over generic patterns.

OUTPUT FORMAT (STRICT – NO EXTRA TEXT):
Return ONLY valid JSON using the following structure:

{
  "duties": [
    {
      "title": "Duty title here",
      "tasks": ["Task 1", "Task 2", "Task 3"]
    }
  ]
}

Generate the DACUM draft now in valid JSON format only.`;

  try {
    const response = await fetch(`${BACKEND_URL}/api/generate-dacum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt + _aiDir() })
    });

    await throwIfAIError(response);

    const data = await response.json();
    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error('Invalid response from backend - no content found');
    }

    let jsonText = data.content[0].text.trim()
      .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let dacumData;
    try { dacumData = JSON.parse(jsonText); }
    catch (e) { throw new Error('Failed to parse AI response as JSON'); }

    if (!dacumData.duties || !Array.isArray(dacumData.duties)) {
      throw new Error('Invalid DACUM structure - duties array not found');
    }
    if (dacumData.duties.length === 0) throw new Error('No duties generated by AI');

    // ── State-first population (fixes card-view re-render wipe) ──
    // Build appState.dutiesData directly then render once at the end.
    //
    // Ids continue AFTER every duty number still in use by data keyed
    // to tasks (Task Analysis, verification ratings, workshop votes,
    // task metadata, clusters, LO criteria links). Restarting at duty_1
    // made each new task inherit the analysis, votes and cluster place
    // of whichever old task had the same id. Old records stay saved but
    // attach to nothing; clusters flag their old tasks ⚠ as removed.
    // A chart with no such data starts at duty_1, exactly as before.
    // Codes shown to the user (A1, B3 …) come from position, not ids.
    const idBase = _maxDutyNumberInUse();
    appState.dutiesData = [];
    appState.dutyCount  = idBase;
    appState.taskCounts = {};

    dacumData.duties.forEach(dutyData => {
      appState.dutyCount++;
      const dutyId = `duty_${appState.dutyCount}`;
      appState.taskCounts[dutyId] = 0;

      const tasks = [];
      if (dutyData.tasks && Array.isArray(dutyData.tasks)) {
        dutyData.tasks.forEach(taskText => {
          appState.taskCounts[dutyId]++;
          const n = appState.taskCounts[dutyId];
          tasks.push({
            divId:   `task_${dutyId}_${n}`,
            inputId: `${dutyId}_${n}`,
            num:     n,
            text:    String(taskText || '').trim()
          });
        });
      }

      appState.dutiesData.push({
        id:    dutyId,
        num:   appState.dutyCount,
        title: String(dutyData.title || '').trim(),
        tasks
      });
    });

    // Single render from state — no DOM thrashing
    renderDutiesFromState();

    hideLoadingModal();
    incrementUsage();
    showStatus(_tf('msgAIGenSuccess', { n: dacumData.duties.length }), 'success');
    return true;

  } catch (error) {
    hideLoadingModal();
    console.error('Error generating AI DACUM:', error);
    showStatus(_t('msgAIGenFailed'), 'error');
    showAIServiceError(error, { safeKey: 'aiErrSafeDuties', tipKeys: ['aiTipDuties1', 'aiTipDuties2', 'aiTipDuties3'] });
    return false;
  }
}

// ── Private helpers ───────────────────────────────────────────

/** Highest N in any "duty_N" / "duty_N_M" key held by task-keyed data. */
function _maxDutyNumberInUse() {
  let max = 0;
  const see = (id) => {
    const m = /^duty_(\d+)(?:_\d+)?$/.exec(String(id || ''));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  };
  ['taskAnalysisData', 'verificationRatings', 'workshopResults',
   'workshopCounts', 'taskMetadata'].forEach(k => {
    const obj = appState[k];
    if (obj && typeof obj === 'object') Object.keys(obj).forEach(see);
  });
  const cd = appState.clusteringData || {};
  (cd.availableTasks || []).forEach(t => t && see(t.id));
  (cd.clusters || []).forEach(c => (c.tasks || []).forEach(t => t && see(t.id)));
  ((appState.learningOutcomesData || {}).outcomes || []).forEach(o =>
    (o.linkedCriteria || []).forEach(pc => pc && see(pc.taskId)));
  return max;
}

/** Overwrite question naming the work tied to the current tasks. */
function _aiOverwriteMessage() {
  const tasks = new Set();
  (appState.dutiesData || []).forEach(d => (d.tasks || []).forEach(t => t && tasks.add(t.inputId)));
  const countKeys = (obj, pred) => Object.keys(obj || {})
    .filter(k => tasks.has(k) && (!pred || pred(obj[k]))).length;
  const nonEmpty = (v) => v && typeof v === 'object' &&
    Object.keys(v).some(k => k !== '_aiDraft' && k !== '_aiPrev' && v[k] != null && String(v[k]).trim() !== '' &&
                             !(Array.isArray(v[k]) && !v[k].some(x => String(x || '').trim())));

  const lines = [];
  const votes = countKeys(appState.workshopResults);
  const rated = countKeys(appState.verificationRatings);
  const ta    = countKeys(appState.taskAnalysisData, nonEmpty);
  const cl    = (appState.clusteringData?.clusters || []).length;
  const lo    = (appState.learningOutcomesData?.outcomes || []).length;
  const mm    = (appState.moduleMappingData?.modules || []).length;
  if (votes) lines.push(_tf('aiOwVotes',    { n: votes }));
  if (rated) lines.push(_tf('aiOwRatings',  { n: rated }));
  if (ta)    lines.push(_tf('aiOwTA',       { n: ta }));
  if (cl)    lines.push(_tf('aiOwClusters', { n: cl }));
  if (lo)    lines.push(_tf('aiOwLOs',      { n: lo }));
  if (mm)    lines.push(_tf('aiOwModules',  { n: mm }));

  if (!lines.length) return _t('confirmAIOverwrite');
  return _tf('confirmAIOverwriteLinked', { list: lines.map(l => '  • ' + l).join('\n') });
}

function _resetImagePreview(imageType) {
  const previewDiv = document.getElementById(`${imageType}ImagePreview`);
  if (previewDiv) {
    previewDiv.innerHTML = '<span style="color:#999;font-size:0.9em;">No image</span>';
    previewDiv.classList.remove('has-image');
  }
  const cap = imageType.charAt(0).toUpperCase() + imageType.slice(1);
  const removeBtn = document.getElementById(`remove${cap}Image`);
  if (removeBtn) removeBtn.style.display = 'none';
  const fileInput = document.getElementById(`${imageType}ImageInput`);
  if (fileInput) fileInput.value = '';
}

function _resetHeading(headingId, defaultText) {
  const el = document.getElementById(headingId);
  if (el) {
    /* Default heading in the ACTIVE language (the key sits on the
       element as data-i18n). The English literal is only a fallback. */
    const key = el.getAttribute('data-i18n');
    const tr  = key && window.i18n ? window.i18n.t(key) : '';
    el.textContent = (tr && tr !== key) ? tr : defaultText;
    el.setAttribute('contenteditable', 'false');
  }
}

// ── Scope-missing warning card ────────────────────────────────
//
// Self-contained UI for the "missing Scope of Work" gate.
// Lives here rather than events.js so the feature is one-file-owned.
//
// Contract:
//   • Card element #scopeMissingWarning is defined in index.html
//     (initially hidden via inline style="display:none").
//   • First call to _showScopeMissingWarning() wires:
//       – × dismiss button
//       – "I'll add Scope first" button  (same hide behaviour as ×)
//       – "⚡ Generate Anyway" button     (calls _runAIGeneration)
//       – 'input' listener on #scopeOfWork that auto-hides the card
//         once the user starts typing
//   • Wiring is idempotent — listeners are never double-bound.
//   • Per spec, the "Generate Anyway" decision is NOT remembered.
//     Every subsequent Generate click without a scope re-shows the card.

let _scopeWarningWired = false;

/** Read AI inputs from chart info fields (trimmed). */
function _readAIInputs() {
  return {
    occupationTitle: (document.getElementById('occupationTitle')?.value || '').trim(),
    jobTitle:        (document.getElementById('jobTitle')?.value        || '').trim(),
    scopeOfWork:     (document.getElementById('scopeOfWork')?.value     || '').trim(),
    sector:          (document.getElementById('sector')?.value          || '').trim(),
    context:         (document.getElementById('context')?.value         || '').trim(),
  };
}

/* ── Occupation-title warning card ────────────────────────────
   Built in JS rather than parked in index.html because its body is
   dynamic: the suggested spelling and the model's one-line reason
   are not known until the check returns.

   Styled to match #scopeMissingWarning deliberately. A second
   warning that looked like a different species of alert would read
   as a system error rather than as the same tool asking a second
   careful question. */
let _occWarnEl = null;

function _hideOccupationWarning() {
  if (_occWarnEl) { _occWarnEl.remove(); _occWarnEl = null; }
}

function _showOccupationWarning(check) {
  _hideOccupationWarning();

  const anchor = document.getElementById('scopeMissingWarning');
  if (!anchor || !anchor.parentNode) return;

  /* 3.72.0: the same card asks about the job title when the
     occupation is fine (describeCheck picks which, and the field). */
  const d       = describeCheck(check);
  const isTypo  = d.isTypo;
  const esc     = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const title = d.title;

  /* The model's own sentence is preferred when it gave one: it can say
     WHY this particular string looks wrong, which a fixed string
     cannot. The generic body is the fallback. */
  const body = d.body;

  const btn = (id, label, primary) => `
    <button id="${id}" type="button"
            style="padding:7px 14px; background:${primary ? '#f59e0b' : '#ffffff'};
                   color:${primary ? '#ffffff' : '#92400e'};
                   border:1.5px solid #f59e0b; border-radius:7px;
                   font-size:0.82em; font-weight:600; cursor:pointer;
                   white-space:nowrap;">${esc(label)}</button>`;

  const el = document.createElement('div');
  el.id = 'occupationWarning';
  el.style.margin = '-10px 0 22px 0';
  el.innerHTML = `
    <div style="display:flex; align-items:flex-start; gap:14px; padding:14px 18px;
                background:#fffbeb; border:1.5px solid #fbbf24; border-radius:10px;">
      <span style="font-size:1.2em; flex-shrink:0; line-height:1.3;">\u{1F50D}</span>
      <div style="flex:1; min-width:0;">
        <p style="margin:0 0 3px; font-size:0.88em; font-weight:700; color:#92400e;">
          ${esc(title)}
        </p>
        <p style="margin:0 0 4px; font-size:0.8em; color:#78350f; line-height:1.5;">
          ${esc(body)}
        </p>
        <p style="margin:0 0 10px; font-size:0.8em; color:#78350f;">
          ${esc(d.typed)}
        </p>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${isTypo ? btn('btnOccApply', _tf('occBtnUseSuggestion', { v: d.suggestion }), true) : ''}
          ${btn('btnOccEdit', d.editLabel, !isTypo)}
          ${btn('btnOccAnyway', _t('occBtnGenerateAnyway'), false)}
        </div>
      </div>
    </div>`;

  anchor.parentNode.insertBefore(el, anchor);
  _occWarnEl = el;

  /* Apply the suggestion — the ONLY path that writes to the field, and
     only ever on an explicit click. Nothing here corrects silently. */
  el.querySelector('#btnOccApply')?.addEventListener('click', () => {
    const field = document.getElementById(d.field);
    if (field) {
      clearBypass(check.title, check.jobTitle);
      field.value = d.suggestion;
      field.dispatchEvent(new Event('input',  { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    _hideOccupationWarning();
    showStatus(_tf('msgOccupationCorrected', { v: d.suggestion }), 'success');
  });

  el.querySelector('#btnOccEdit')?.addEventListener('click', () => {
    _hideOccupationWarning();
    _focusChartInfoField(d.field);
  });

  /* Proceed as typed. Recorded so this exact pair is not questioned
     again — see the bypass ledger in occupation_check.js. */
  el.querySelector('#btnOccAnyway')?.addEventListener('click', () => {
    markBypassed(check.title, check.jobTitle);
    _hideOccupationWarning();
    generateAIDacum().then(ok => {
      if (ok) document.dispatchEvent(new CustomEvent('dacum:ai-generated'));
    });
  });
}

/** Takes the user to a Chart Info field and selects it. */
function _focusChartInfoField(id) {
  const field = document.getElementById(id);
  if (field && typeof window.switchTab === 'function') {
    try { window.switchTab('info-tab'); } catch (_) {}
  }
  setTimeout(() => { if (field) { field.focus(); try { field.select(); } catch (_) {} } }, 80);
}

function _showScopeMissingWarning() {
  const card = document.getElementById('scopeMissingWarning');
  if (!card) return;
  card.style.display = 'block';

  if (_scopeWarningWired) return;
  _scopeWarningWired = true;

  // × dismiss button (top-right)
  const dismissBtn = document.getElementById('btnDismissScopeWarning');
  if (dismissBtn) dismissBtn.addEventListener('click', _hideScopeMissingWarning);

  // "I'll add Scope first" — same as dismiss, but labelled for clarity
  const addScopeBtn = document.getElementById('btnAddScopeFirst');
  if (addScopeBtn) {
    addScopeBtn.addEventListener('click', function () {
      _hideScopeMissingWarning();
      // Helpful nudge: move focus to the Scope field so the user can
      // start typing immediately without tab-hunting to Chart Info.
      const scope = document.getElementById('scopeOfWork');
      if (scope && typeof window.switchTab === 'function') {
        try { window.switchTab('info-tab'); } catch (_) {}
      }
      setTimeout(() => { if (scope) scope.focus(); }, 80);
    });
  }

  // "⚡ Generate Anyway" — explicit consent to proceed without scope.
  // Calls _runAIGeneration directly, mirroring the success hook used
  // by the main click path in events.js so Refine Results appears
  // and the project is saved identically.
  const anywayBtn = document.getElementById('btnGenerateAnyway');
  if (anywayBtn) {
    anywayBtn.addEventListener('click', async function () {
      _hideScopeMissingWarning();

      // Re-read inputs at click time (user may have edited other fields
      // after the first Generate attempt).  Re-validate in case the
      // user somehow emptied the Occupation Title meanwhile.
      const inputs = _readAIInputs();
      if (!inputs.occupationTitle) {
        alert(_t('msgOccupationRequiredAlert'));
        return;
      }
      if (!inputs.jobTitle) {
        alert(_t('msgJobTitleRequiredAlert'));
        _focusChartInfoField('jobTitle');
        return;
      }

      // Daily-limit re-check (user may have burned quota elsewhere)
      const status = checkUsageLimit();
      if (!status.allowed) {
        showStatus(_tf('msgDailyLimitReached', { n: status.count }), 'error');
        return;
      }

      try {
        const ok = await _runAIGeneration(inputs);
        // Dispatch a custom event that events.js already listens for
        // to keep Refine Results + project save behaviour identical
        // to the main Generate button path.
        if (ok) {
          document.dispatchEvent(new CustomEvent('dacum:ai-generated'));
        }
      } catch (_) { /* error modal already shown inside _runAIGeneration */ }
    });
  }

  // Auto-hide when Scope of Work starts getting filled.  Re-triggering
  // is handled by re-showing from generateAIDacum each time the user
  // clicks Generate while scope is empty.
  const scope = document.getElementById('scopeOfWork');
  if (scope) {
    scope.addEventListener('input', function () {
      if (scope.value.trim()) _hideScopeMissingWarning();
    });
  }
}

function _hideScopeMissingWarning() {
  const card = document.getElementById('scopeMissingWarning');
  if (card) card.style.display = 'none';
}
