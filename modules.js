// ============================================================
// /modules.js
// Competency Clustering, Learning Outcomes, and Module Mapping
// ============================================================

import { appState } from './state.js';
import { showStatus, escapeHtml } from './renderer.js';
import { lwExtractDutiesAndTasks } from './workshop.js';
import { getTaskCode, getDutyLabel,
         CLUSTER_ADDED_TASK_PREFIX, isClusterAddedTaskId,
         getAddedTaskLabel } from './codes.js';
import { getTaskPerformanceCriteria, getTaskAnalysisRecord } from './task_analysis.js';
import { getSupplementaryVerificationData } from './supplementary_verification.js';
// Circular with module_curriculum.js (which imports from here); used only
// inside functions, after both modules have finished loading.
import { getCurriculumModel } from './module_curriculum.js';
import { registerHistoryScope, refreshHistoryButtons } from './history.js';

/* i18n access — resolved lazily; see duties.js for why. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);


// switchTab is exposed on window by app.js to avoid circular deps
function switchTab(tabId) { window.switchTab(tabId); }

// ── Helpers (getTaskCode now sourced from codes.js) ─────────
// The old local implementation parsed the immutable task ID
// (e.g. "duty_3_2" → "Task C2") which was *wrong* after a drag
// reorder.  The imported version reads the live position from
// appState.dutiesData and always returns the correct letter.

// Canonical short task reference used in every downstream display —
// "TASK B4" regardless of whatever casing/format getTaskCode() itself
// returns (some call sites previously built ids like "C1-TTask B3-PC1"
// by string-concatenating an already-prefixed code; this is the fix).
function _taskLabel(taskId) {
  // A task added during Competency Clustering has no DACUM code — it is
  // labelled as an added task instead (see codes.js getTaskCode).
  if (isClusterAddedTaskId(taskId)) return getAddedTaskLabel().toUpperCase();
  const raw = (getTaskCode(taskId) || '').replace(/^task\s*/i, '').trim();
  return `TASK ${raw}`;
}

// ── Task Analysis traceability for clusters ─────────────────────
// Performance Criteria entered in Task Analysis for a cluster's
// assigned tasks are surfaced here automatically — never copied INTO
// cluster.performanceCriteria, which remains exactly what it always
// was: free-text criteria the facilitator writes specifically for the
// CLUSTER as a whole, not for one task. This function recomputes the
// combined list fresh on every call, straight from cluster.tasks +
// appState.taskAnalysisData, so:
//   • removing a task from the cluster drops its criteria from this
//     list on the very next render, with no separate cleanup step;
//   • nothing here is ever written back into Task Analysis;
//   • an already-created Learning Outcome is unaffected, because
//     linkedCriteria stores a text snapshot at selection time (see
//     createLearningOutcome/reassignPCToLO below), not a live link.
// IDs are the simple "{clusterNumber}-{position}" scheme used
// throughout the UI (1-1, 1-2, …) — ONE flat sequence per cluster
// covering both Task-Analysis-sourced and manually-typed criteria, in
// that order, so the visible numbering always matches what the merged
// input card in renderClusters() shows. This replaces the old
// fragmented "C1-PC1" / "C1-Ttaskcode-PC1" schemes; see the note in
// renderPCSourceList() about what that means for pre-existing projects.
//
// Each item also carries a `key` that does NOT depend on position:
//   ta|<taskId>|<text>      — criterion from a task's Task Analysis
//   pc|<clusterId>|<text>   — criterion typed for the cluster itself
// The positional id renumbers whenever tasks are added, moved or
// removed; the key does not. Learning Outcomes store the key, which is
// how their links follow a criterion to its new number (see
// _reconcileLearningOutcomes below).
function _getClusterEffectiveCriteria(cluster, clusterNumber) {
  const items = [];
  cluster.tasks.forEach(task => {
    const taskId = task.id;
    getTaskPerformanceCriteria(taskId).forEach(text => {
      items.push({ text, taskId, source: 'ta', clusterId: cluster.id, key: `ta|${taskId}|${text}` });
    });
  });
  (cluster.performanceCriteria || []).forEach(text => {
    items.push({ text, taskId: null, source: 'manual', clusterId: cluster.id, key: `pc|${cluster.id}|${text}` });
  });
  return items.map((item, i) => ({
    ...item,
    id: `${clusterNumber}-${i + 1}`,
    clusterNumber
  }));
}

// Looks a single effective criterion up by its id across every
// cluster — used wherever a PC checkbox/dropdown only has the id to
// go on (createLearningOutcome, reassignPCToLO).
function _findEffectiveCriterionById(pcId) {
  const cd = appState.clusteringData;
  for (let i = 0; i < cd.clusters.length; i++) {
    const found = _getClusterEffectiveCriteria(cd.clusters[i], i + 1).find(c => c.id === pcId);
    if (found) return found;
  }
  return null;
}

/* Shared with learning_outcomes_ai.js so the AI generator works on
   exactly the list the user sees: same ids ("5-2"), same task-analysis
   criteria, same "already used" rule. Before this the generator built
   its own "C5-PC2" ids, which matched nothing in the current list. */
export function getLearningOutcomeCriteria() {
  const cd = appState.clusteringData || {};
  const all = [];
  (cd.clusters || []).forEach((cluster, i) => {
    _getClusterEffectiveCriteria(cluster, i + 1).forEach(c => {
      if (!c.text || !String(c.text).trim()) return;
      all.push({ ...c, text: String(c.text).trim(), clusterName: cluster.name || `#${i + 1}` });
    });
  });
  const usedIds = new Set(), usedKeys = new Set();
  ((appState.learningOutcomesData || {}).outcomes || []).forEach(o =>
    (o.linkedCriteria || []).forEach(pc => {
      if (pc.stale) return;
      usedIds.add(pc.id);
      if (pc.key) usedKeys.add(pc.key);
    }));
  return { all, usedIds, usedKeys };
}

/* Persist after an external module (the AI generator) changed outcomes. */
export function persistLearningOutcomes() {
  renumberLearningOutcomes();
  _persistClusters();
}

/* Local-string access for sibling modules (falls back like _tx/_txf). */
export function loText(key, vars) { return vars ? _txf(key, vars) : _tx(key); }

// ── Clustering ────────────────────────────────────────────────

// Records the "without verification" decision and syncs the three
// decision buttons in the Task Verification tab. Shared by the bypass
// button there and by the Task Analysis -> Clustering path, so the
// verification tab always reflects the decision however it was made.
function _markVerificationBypassed() {
  appState.verificationDecisionMade = true;
  appState.clusteringAllowed = true;
  const fin = document.getElementById('btnLWFinalize');
  const byp = document.getElementById('btnBypassToClustering');
  const rst = document.getElementById('btnResetDecision');
  if (fin) fin.disabled = true;
  if (byp) byp.disabled = true;
  if (rst) rst.style.display = 'inline-block';
}

// Seeds the clustering pool only when there is nothing there yet.
// initializeClusteringFromTasks() wipes existing clusters, so calling
// it unconditionally on every "Proceed" click destroyed the user's
// clustering work when they went back and then forward again.
function _ensureClusteringSeeded() {
  const cd = appState.clusteringData;
  const hasClusters = (cd?.clusters?.length || 0) > 0;
  const hasPool     = (cd?.availableTasks?.length || 0) > 0;
  if (!hasClusters && !hasPool) initializeClusteringFromTasks();
}

export function bypassToClusteringTab() {
  // This button rebuilds the clustering pool from scratch on purpose,
  // but it becomes clickable again after "Reset Decision" - at which
  // point the chart may already hold clusters the user worked on.
  // Ask before wiping them; Cancel leaves everything untouched,
  // including the decision buttons.
  const cd = appState.clusteringData;
  const clusterCount = cd?.clusters?.length || 0;
  if (clusterCount > 0) {
    const taskCount = cd.clusters.reduce((n, c) => n + (c.tasks?.length || 0), 0);
    if (!confirm(_tf('msgConfirmRebuildClusters', { n: clusterCount, t: taskCount }))) return;
  }

  _markVerificationBypassed();
  initializeClusteringFromTasks();
  switchTab('clustering-tab');
}

// "Proceed to Competency Clustering" at the bottom of Task Analysis.
// Task Analysis now sits between Task Verification and Clustering, but
// the generic clustering gate in switchTab() still assumed the old
// Verification -> Clustering order and answered this button with
// "Please choose an option in the Task Verification tab" - a message
// that belongs to a different tab. This path handles it locally:
//   - decision already made, or clusters already exist -> go straight on
//   - no decision yet -> ask here, in this tab's own words; OK records
//     "without verification" (same as the bypass button), Cancel stays.
export function proceedToClusteringFromTaskAnalysis() {
  const hasClusters = (appState.clusteringData?.clusters?.length || 0) > 0;
  const decided = appState.clusteringAllowed === true ||
                  appState.verificationDecisionMade === true ||
                  hasClusters;

  if (!decided) {
    if (!confirm(_t('msgTAProceedWithoutVerification'))) return;
    _markVerificationBypassed();
  }

  appState.clusteringAllowed = true;
  _ensureClusteringSeeded();
  switchTab('clustering-tab');
}

export function resetVerificationDecision() {
  appState.verificationDecisionMade = false;
  appState.clusteringAllowed = false;
  document.getElementById('btnLWFinalize').disabled = false;
  document.getElementById('btnBypassToClustering').disabled = false;
  document.getElementById('btnResetDecision').style.display = 'none';
}

export function initializeClusteringFromTasks() {
  const cd = appState.clusteringData;
  cd.availableTasks = [];
  cd.clusters = [];
  cd.clusterCounter = 0;

  if (appState.lwAggregatedResults && appState.lwAggregatedResults.taskResults) {
    const taskResults = appState.lwAggregatedResults.taskResults;
    const allTasks = [];
    Object.keys(taskResults).forEach(taskId => {
      const voteData = taskResults[taskId];
      allTasks.push({
        id: taskId,
        text: voteData.taskText,
        dutyTitle: voteData.dutyTitle,
        priorityIndex: voteData.priorityIndex || 0
      });
    });
    allTasks.sort((a, b) => b.priorityIndex - a.priorityIndex);
    cd.availableTasks = allTasks;
  } else {
    const duties = lwExtractDutiesAndTasks();
    const allTasks = [];
    Object.keys(duties).forEach(dutyId => {
      const duty = duties[dutyId];
      duty.tasks.forEach(task => {
        allTasks.push({ id: task.id, text: task.text, dutyTitle: duty.title, priorityIndex: null });
      });
    });
    cd.availableTasks = allTasks;
  }

  renderAvailableTasks();
  renderClusters();
}

export function renderAvailableTasks() {
  const cd = appState.clusteringData;
  const container = document.getElementById('availableTasksList');

  // Bring the pool in line with Duties & Tasks before drawing it — see
  // syncClusteringWithProfile(). Idempotent: a no-op when nothing changed.
  syncClusteringWithProfile();
  _renderSyncNotice(container);

  if (cd.availableTasks.length === 0) {
    container.innerHTML = `<div class="no-tasks-message">${_t('msgAllTasksAssigned')}</div>`;
    document.getElementById('btnCreateCluster').disabled = true;
    return;
  }

  let html = '';
  cd.availableTasks.forEach((task, index) => {
    let clusterOptions = `<option value="">${_t('optSelectCluster')}</option>`;
    cd.clusters.forEach((cluster, ci) => {
      clusterOptions += `<option value="${cluster.id}">C${ci + 1} — ${cluster.name}</option>`;
    });

    html += `
      <div class="task-checkbox-item">
        <input type="checkbox" id="task_${index}" data-action="update-cluster-button">
        <label for="task_${index}" class="task-checkbox-label">
          <strong>${_taskLabel(task.id)}:</strong> ${task.text}
          ${task.newFromProfile ? `<span class="cluster-new-badge" title="${_esc(_tx('ttNewTask'))}">${_esc(_tx('lblNewTask'))}</span>` : ''}
        </label>
        ${task.priorityIndex !== null ? `<span class="task-priority-badge">PI: ${task.priorityIndex.toFixed(2)}</span>` : ''}
        ${cd.clusters.length > 0 ? `
        <div class="task-dropdown-container">
          <span class="task-dropdown-label">${_t('lblAddTo')}</span>
          <select class="task-reassign-dropdown" data-action="add-task-to-cluster-dropdown" data-task-index="${index}">
            ${clusterOptions}
          </select>
        </div>` : ''}
      </div>`;
  });

  container.innerHTML = html;
  updateCreateClusterButton();
}

export function updateCreateClusterButton() {
  const checkboxes = document.querySelectorAll('#availableTasksList input[type="checkbox"]');
  const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
  document.getElementById('btnCreateCluster').disabled = !anyChecked;
}

export function createCluster() {
  const cd = appState.clusteringData;
  const checkboxes = document.querySelectorAll('#availableTasksList input[type="checkbox"]');
  const selectedIndices = [];
  checkboxes.forEach((cb, index) => { if (cb.checked) selectedIndices.push(index); });
  if (selectedIndices.length === 0) return;

  cd.clusterCounter++;
  const newCluster = {
    id: `cluster_${cd.clusterCounter}`,
    name: _tf('lblClusterN', { n: cd.clusterCounter }),
    tasks: [],
    range: '',
    performanceCriteria: []
  };

  selectedIndices.sort((a, b) => b - a);
  selectedIndices.forEach(index => {
    delete cd.availableTasks[index].newFromProfile;   // "New" badge ends once placed
    newCluster.tasks.push(cd.availableTasks[index]);
    cd.availableTasks.splice(index, 1);
  });

  cd.clusters.push(newCluster);
  renderAvailableTasks();
  renderClusters();
}

export function renderClusters() {
  const cd = appState.clusteringData;
  const container = document.getElementById('clustersContainer');

  if (cd.clusters.length === 0) {
    container.innerHTML = `<div class="no-clusters-message">${_t('msgNoClusters')}</div>`;
    return;
  }

  let html = '';
  cd.clusters.forEach((cluster, clusterIndex) => {
    const clusterNumber = clusterIndex + 1;
    const taCriteria = _getClusterEffectiveCriteria(cluster, clusterNumber).filter(c => c.source === 'ta');
    let displayValue = '';
    if (cluster.performanceCriteria && cluster.performanceCriteria.length > 0) {
      displayValue = cluster.performanceCriteria
        .map((criterion, idx) => `${clusterNumber}-${taCriteria.length + idx + 1} ${criterion}`)
        .join('\n');
    }

    html += `
      <div class="cluster-item">
        <div class="cluster-header">
          <div class="cluster-title">C${clusterNumber} — ${cluster.name}</div>
          <div class="cluster-actions">
            <button class="btn-rename-cluster" data-action="regen-cluster-criteria" data-cluster-id="${cluster.id}"
                    title="${_t('ttRegenCriteria')}">🤖 ${_t('btnAICriteria')}</button>
            <button class="btn-rename-cluster" data-action="rename-cluster" data-cluster-id="${cluster.id}">✏️ ${_t('btnRename')}</button>
            <button class="btn-delete-cluster" data-action="delete-cluster" data-cluster-id="${cluster.id}">🗑️ ${_t('btnDelete')}</button>
          </div>
        </div>

        <div class="cluster-section">
          <h4>📋 ${_t('lblRelatedTasks')}</h4>
          <div class="related-tasks-list">
            ${cluster.tasks.map((task, taskIndex) =>
              _renderClusterTaskRow(cluster, task, taskIndex, cluster.tasks.length - 1)
            ).join('') || `<div style="color:#999;font-style:italic;">${_t('msgNoTasksAssigned')}</div>`}
          </div>
          ${_renderAddTaskControl(cluster)}
        </div>

        <div class="cluster-section">
          <div class="cluster-section-header">
            <h4>🎯 ${_t('lblRange')}</h4>
            <button type="button" class="tab-help-btn" data-action="show-pc-range-help" title="${_t('ttPCRangeHelp')}" aria-label="${_t('ttPCRangeHelp')}" aria-haspopup="dialog">?</button>
          </div>
          <div class="cluster-helper-text">${_t('hintRange')}</div>
          <textarea id="range_${cluster.id}" data-action="update-cluster-range" data-cluster-id="${cluster.id}">${cluster.range || ''}</textarea>
        </div>

        <div class="cluster-section">
          <div class="cluster-section-header">
            <h4>✅ ${_t('lblPerformanceCriteria')}</h4>
            <button type="button" class="tab-help-btn" data-action="show-pc-range-help" title="${_t('ttPCRangeHelp')}" aria-label="${_t('ttPCRangeHelp')}" aria-haspopup="dialog">?</button>
          </div>
          <div class="cluster-helper-text">${_t('hintCriteria')}</div>
          <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#fff;">
            ${taCriteria.length ? `
              <div style="padding:10px 14px 8px;border-bottom:1px solid #eef0f4;">
                ${taCriteria.map(c => `
                  <div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:0.92em;color:#334155;">
                    <span>${c.id} ${c.text} <span style="color:#94a3b8;">[${_taskLabel(c.taskId)}]</span></span>
                  </div>`).join('')}
              </div>` : ''}
            <textarea id="criteria_${cluster.id}"
              data-cluster-number="${clusterNumber}"
              data-cluster-id="${cluster.id}"
              data-ta-count="${taCriteria.length}"
              data-action-focus="init-criteria-number"
              data-action-keydown="handle-criteria-keydown"
              data-action-blur="update-cluster-criteria-numbered"
              placeholder="${_t('phFirstCriterion')}"
              style="min-height:100px;border:none;border-radius:0;box-shadow:none;display:block;width:100%;box-sizing:border-box;padding:10px 14px;">${displayValue}</textarea>
          </div>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

export function renameCluster(clusterId) {
  const cluster = appState.clusteringData.clusters.find(c => c.id === clusterId);
  if (!cluster) return;
  const newName = prompt(_t('promptRenameCluster'), cluster.name);
  if (newName && newName.trim()) {
    cluster.name = newName.trim();
    renderClusters();
  }
}

export function deleteCluster(clusterId) {
  const cd = appState.clusteringData;
  const idx = cd.clusters.findIndex(c => c.id === clusterId);
  if (idx === -1) return;
  const cluster = cd.clusters[idx];
  cd.availableTasks.push(...cluster.tasks);
  if (cd.availableTasks.length > 0 && cd.availableTasks[0].priorityIndex !== null) {
    cd.availableTasks.sort((a, b) => b.priorityIndex - a.priorityIndex);
  }
  cd.clusters.splice(idx, 1);
  renderAvailableTasks();
  renderClusters();
}

export function removeTaskFromCluster(clusterId, taskIndex) {
  const cd = appState.clusteringData;
  const cluster = cd.clusters.find(c => c.id === clusterId);
  if (!cluster) return;
  const task = cluster.tasks[taskIndex];
  if (!task) return;

  // A task the expert ADDED during clustering never came from the
  // Occupational Profile, so it has no place in the Available Tasks
  // pool. Deleting it removes it for good — after a confirmation,
  // because its wording exists nowhere else. Profile tasks keep the
  // original behaviour below, unchanged: they return to the pool.
  if (isClusterAddedTask(task)) {
    if (!confirm(_tx('confirmDeleteAddedTask'))) return;
    cluster.tasks.splice(taskIndex, 1);
    renderClusters();
    _persistClusters();
    return;
  }

  cluster.tasks.splice(taskIndex, 1);
  cd.availableTasks.push(task);
  if (cd.availableTasks.length > 0 && cd.availableTasks[0].priorityIndex !== null) {
    cd.availableTasks.sort((a, b) => b.priorityIndex - a.priorityIndex);
  }
  renderAvailableTasks();
  renderClusters();
}

export function addTaskToClusterFromDropdown(taskIndex, clusterId) {
  if (!clusterId) return;
  const cd = appState.clusteringData;
  const cluster = cd.clusters.find(c => c.id === clusterId);
  if (!cluster) return;
  const task = cd.availableTasks[taskIndex];
  if (!task) return;
  delete task.newFromProfile;   // "New" badge ends once placed
  cluster.tasks.push(task);
  cd.availableTasks.splice(taskIndex, 1);
  renderAvailableTasks();
  renderClusters();
}

// ══════════════════════════════════════════════════════════════
// TASK CONTROLS INSIDE A COMPETENCY CARD
// ──────────────────────────────────────────────────────────────
// Move Up / Move Down / Delete on each related task, and "+ Add Task"
// at the bottom of the card. An expert refinement layer ONLY:
//
//   • Moving a task reorders cluster.tasks — the array that already
//     holds this competency's tasks and is already saved with the
//     project. Nothing else is touched: task IDs, the DACUM codes
//     (computed live from appState.dutiesData by codes.js), the
//     Occupational Profile, Task Verification and Task Analysis all
//     stay exactly as they were.
//
//   • An added task lives ONLY inside this cluster's task list. It is
//     never written into appState.dutiesData, so the Occupational
//     Profile is never modified. It carries:
//         id      'cctask_…'   — can never collide with a profile ID
//         source  'competency-clustering'
//         sourceLabel 'Added during Competency Clustering'
//     Original tasks carry no source field; absence means "from the
//     Occupational Profile", which keeps every existing project valid
//     without a migration. getClusterTaskSource() reads it either way.
//
//   • The order of cluster.tasks IS the final task order within the
//     competency. Together with the source flag, that is everything
//     Module Builder will need later; no Module Builder code changes.
//
// Event wiring for these controls is self-contained below (same
// pattern as the language-change listener at the end of this file),
// so events.js did not need to change. The one control shared with
// events.js is Delete, which keeps its existing data-action and is
// still dispatched there to removeTaskFromCluster().
// ══════════════════════════════════════════════════════════════

export const CLUSTER_TASK_SOURCE_PROFILE = 'occupational-profile';
export const CLUSTER_TASK_SOURCE_ADDED   = 'competency-clustering';

export function isClusterAddedTask(task) {
  return !!task && (task.source === CLUSTER_TASK_SOURCE_ADDED || isClusterAddedTaskId(task.id));
}

/** 'occupational-profile' | 'competency-clustering' — for Module Builder. */
export function getClusterTaskSource(task) {
  return isClusterAddedTask(task) ? CLUSTER_TASK_SOURCE_ADDED : CLUSTER_TASK_SOURCE_PROFILE;
}

/* New interface strings. Read from translations.js when a key exists
   there; until then these built-in fallbacks are used, so the feature
   works in all three languages without editing the dictionary file. */
const _LOCAL_STRINGS = {
  en: {
    ttMoveTaskUp:             'Move Up',
    ttMoveTaskDown:           'Move Down',
    ttDeleteClusterTask:      'Delete Task',
    btnAddClusterTask:        'Add Task',
    phNewClusterTask:         'Enter the task statement — e.g. Calibrate a digital multimeter to manufacturer specifications',
    lblAddedDuringClustering: 'Added during Competency Clustering',
    msgEnterTaskStatement:    'Enter the task statement first.',
    msgClusterTaskAdded:      'Task added to this competency.',
    confirmDeleteAddedTask:   'Delete this task?\n\nIt was added during Competency Clustering and is not part of the Occupational Profile, so it will be removed permanently.',
    syncTitle:                'Duties & Tasks changed — clustering has been updated',
    syncAdded:                'New tasks added to Available Tasks: {n}',
    syncUpdated:              'Task statements updated to match Duties & Tasks: {n}',
    syncDropped:              'Deleted tasks removed from Available Tasks: {n}',
    syncOrphans:              'Tasks in competencies that no longer exist in Duties & Tasks: {n} — marked ⚠ below for your review',
    lblNewTask:               'New',
    ttNewTask:                'Added in Duties & Tasks after clustering began',
    lblRemovedFromProfile:    'Removed from Occupational Profile',
    ttDismissNotice:          'Dismiss',
    loSyncTitle:              'Competency Clusters changed — Learning Outcomes updated',
    loSyncRenumbered:         'Criteria renumbered to follow the new task order: {n}',
    loSyncRemoved:            'Criteria removed because their task is no longer in any competency: {n}',
    loSyncStale:              'Criteria reworded or deleted in Competency Clusters / Task Analysis: {n} — marked ⚠ for your review',
    lblStaleCriterion:        'Reworded or deleted at the source — review, then keep or remove (✕)',
    lblModuleLevel:           'Level',
    lblModuleTrack:           'Track / code prefix',
    phModuleTrack:            'Common to all',
    lblModuleCode:            'Code',
    lblModuleShort:           'Short name',
    lblCodeAuto:              'auto',
    ttCodeReset:              'Back to the automatic code',
    msgCodeDuplicate:         'Another module has the same code',
    lblLabelMode:             'Show modules as',
    optLabelCode:             'Code (CMT 1-1)',
    optLabelNumber:           'Number (M1)',
    optLabelBoth:             'Both (M1 · CMT 1-1)',
    optNoLevel:               '— not set —',
    lblLevelN:                'Level {n}',
    lblLevelShort:            'L{n}',
    lblNoLevelGroup:          'Level not set',
    lblLevelSummary:          '{m} module(s) · {lo} learning outcome(s)',
    lblLevelCount:            'Number of levels in the programme',
    covTitle:                 'Performance Criteria Coverage by Level',
    covHint:                  'Every performance criterion from the Competency Clusters, and the module and level where it is taught. A criterion with ✗ is not taught anywhere in the programme.',
    covGapsOnly:              'Show gaps only',
    covTotal:                 '{n} criteria',
    covCoveredN:              'Taught: {n} ({p}%)',
    covGapN:                  'Not taught: {n}',
    covLoOnlyN:               'In an outcome but no module: {n}',
    covMultiN:                'Taught in more than one module: {n}',
    covGap:                   'Not taught',
    covLoOnly:                'Only in {lo} — not in a module',
    covMulti:                 'In {n} modules',
    covColCriterion:          'Performance criterion',
    covColNoLevel:            'No level',
    covColStatus:             'Status',
    covNoGaps:                'No gaps — every criterion is taught in a module.',
    covEmpty:                 'No performance criteria yet — add them in the Competency Clusters tab.',
    covTaught:                'Taught',
    covCommon:                'Common',
    expLevelsTitle:           'Programme Structure by Level',
    expColModule:             'Module',
    expColLOs:                'Learning outcomes',
    expColCriteria:           'Performance criteria',
    expCovHint:               'Every performance criterion from the Competency Clusters, and the module and level where it is taught. A criterion marked “Not taught” appears in no module of the programme.',
    pcSelCount:               '{n} criteria selected',
    pcSelCreateOne:           'Create LO',
    pcSelCreateMerge:         'Create 1 LO from {n} criteria',
    pcSelClear:               'Clear',
    pcHideUsed:               'Hide used criteria',
    pcUnusedCount:            '{u} of {t} not yet used',
    pcLoCreated:              '{n} created',
    loNeedStatement:          'Statement needed',
    loSummaryMissing:         '{n} of {t} learning outcomes still need a statement',
    loSummaryDone:            'All {t} learning outcomes have a statement',
    loNextEmpty:              'Next empty',
    loUsePC:                  'Use criterion text',
    loInlinePh:               'Type the learning outcome statement here — saved automatically',
    loInlineHint:             'Type directly in each card. Changes save automatically; Enter moves to the next outcome.',
    loKeyNext:                'next outcome',
    loKeyNewLine:             'new line',
    loKeyHintFine:            'Press Enter: next outcome · Press Shift+Enter: new line',
    loKeyHintCoarse:          'Press Enter: next outcome',
    loKeySaved:               'saved automatically',
    loAiSkipped:              '{n} criteria left unlinked — still available in the list',
    loAiNot1to1:              'the one-to-one mapping was not exact — review the linked criteria',
    loAiNoIntegration:        'no criteria were integrated — this result is effectively Pattern A',
    loAiAllIntegrated:        'every outcome integrates several criteria — closer to Pattern B',
    loAiCrossComp:            '{n} outcome(s) combine criteria from different competencies — please review',
    mmOptKeep:                'Keep existing modules — only group outcomes not yet in a module',
    mmOptLevels:              'Suggest a level for each module — levels in the programme:',
    mmOptSingle:              '(single-level programme — no level to suggest)',
    covShow:                  'Show',
    covHide:                  'Hide',
    undoBtn:                  'Undo',
    redoBtn:                  'Redo',
    undoLast:                 'Last: {a}',
    undoDone:                 'Undone: {a}',
    redoDone:                 'Redone: {a}',
    undoDeleteModule:         'Deleted module {m} “{name}”',
    undoDeleteLO:             'Deleted {lo}',
    undoRemoveLO:             'Removed {lo} from {m}',
    undoUnlinkPC:             'Unlinked {pc} from {lo}',
    undoLaterChanges:         'Other changes were made after this step. Undoing it will also reverse those later changes. Continue?',
    mmHintNew:                '⚡ Instant and offline — one module per outcome. 🤖 Groups related outcomes, names and orders the modules, and can suggest a level for each. With “Keep existing modules” ticked, only outcomes not yet in a module are used; otherwise existing modules are replaced. Your Learning Outcomes are never changed.',
    mmNothingNew:             'Every learning outcome is already in a module.',
    mmAiOrphans:              '{n} outcome(s) placed in a review module',
    mmAiTrimmed:              '{n} oversized module(s) trimmed',
    mmAiLevelsNote:           'levels and specialisations are suggestions — review them on each module',
    mmAiReviewTitle:          'Additional Outcomes',
    mmAiReviewWhy:            'Outcomes not placed by the grouping — review and reassign as needed.'
  },
  fr: {
    ttMoveTaskUp:             'Monter',
    ttMoveTaskDown:           'Descendre',
    ttDeleteClusterTask:      'Supprimer la tâche',
    btnAddClusterTask:        'Ajouter une tâche',
    phNewClusterTask:         'Saisissez l’énoncé de la tâche — ex. Étalonner un multimètre numérique selon les spécifications du fabricant',
    lblAddedDuringClustering: 'Ajoutée lors du regroupement des compétences',
    msgEnterTaskStatement:    'Saisissez d’abord l’énoncé de la tâche.',
    msgClusterTaskAdded:      'Tâche ajoutée à cette compétence.',
    confirmDeleteAddedTask:   'Supprimer cette tâche ?\n\nElle a été ajoutée lors du regroupement des compétences et ne fait pas partie du profil professionnel : elle sera supprimée définitivement.',
    syncTitle:                'Les tâches et activités ont changé — le regroupement a été mis à jour',
    syncAdded:                'Nouvelles tâches ajoutées aux tâches disponibles : {n}',
    syncUpdated:              'Énoncés de tâches mis à jour selon les tâches et activités : {n}',
    syncDropped:              'Tâches supprimées retirées des tâches disponibles : {n}',
    syncOrphans:              'Tâches des compétences qui n’existent plus dans les tâches et activités : {n} — signalées ⚠ ci-dessous pour vérification',
    lblNewTask:               'Nouveau',
    ttNewTask:                'Ajoutée dans les tâches et activités après le début du regroupement',
    lblRemovedFromProfile:    'Retirée du profil professionnel',
    ttDismissNotice:          'Fermer',
    loSyncTitle:              'Les groupes de compétences ont changé — résultats d’apprentissage mis à jour',
    loSyncRenumbered:         'Critères renumérotés selon le nouvel ordre des tâches : {n}',
    loSyncRemoved:            'Critères retirés car leur tâche n’est plus dans aucune compétence : {n}',
    loSyncStale:              'Critères reformulés ou supprimés dans les groupes / l’analyse des tâches : {n} — signalés ⚠ pour vérification',
    lblStaleCriterion:        'Reformulé ou supprimé à la source — vérifiez, puis conservez ou retirez (✕)',
    lblModuleLevel:           'Niveau',
    lblModuleTrack:           'Filière / préfixe du code',
    phModuleTrack:            'Commun à tous',
    lblModuleCode:            'Code',
    lblModuleShort:           'Nom court',
    lblCodeAuto:              'auto',
    ttCodeReset:              'Revenir au code automatique',
    msgCodeDuplicate:         'Un autre module a le même code',
    lblLabelMode:             'Afficher les modules par',
    optLabelCode:             'Code (CMT 1-1)',
    optLabelNumber:           'Numéro (M1)',
    optLabelBoth:             'Les deux (M1 · CMT 1-1)',
    optNoLevel:               '— non défini —',
    lblLevelN:                'Niveau {n}',
    lblLevelShort:            'N{n}',
    lblNoLevelGroup:          'Niveau non défini',
    lblLevelSummary:          '{m} module(s) · {lo} résultat(s) d’apprentissage',
    lblLevelCount:            'Nombre de niveaux du programme',
    covTitle:                 'Couverture des critères de performance par niveau',
    covHint:                  'Chaque critère de performance des groupes de compétences, avec le module et le niveau où il est enseigné. Un critère marqué ✗ n’est enseigné nulle part dans le programme.',
    covGapsOnly:              'Afficher uniquement les lacunes',
    covTotal:                 '{n} critères',
    covCoveredN:              'Enseignés : {n} ({p} %)',
    covGapN:                  'Non enseignés : {n}',
    covLoOnlyN:               'Dans un résultat mais sans module : {n}',
    covMultiN:                'Enseignés dans plusieurs modules : {n}',
    covGap:                   'Non enseigné',
    covLoOnly:                'Seulement dans {lo} — sans module',
    covMulti:                 'Dans {n} modules',
    covColCriterion:          'Critère de performance',
    covColNoLevel:            'Sans niveau',
    covColStatus:             'État',
    covNoGaps:                'Aucune lacune — chaque critère est enseigné dans un module.',
    covEmpty:                 'Aucun critère de performance — ajoutez-les dans l’onglet Groupes de compétences.',
    covTaught:                'Enseigné',
    covCommon:                'Commun',
    expLevelsTitle:           'Structure du programme par niveau',
    expColModule:             'Module',
    expColLOs:                'Résultats d’apprentissage',
    expColCriteria:           'Critères de performance',
    expCovHint:               'Chaque critère de performance des groupes de compétences, avec le module et le niveau où il est enseigné. Un critère « Non enseigné » ne figure dans aucun module du programme.',
    pcSelCount:               '{n} critère(s) sélectionné(s)',
    pcSelCreateOne:           'Créer un RA',
    pcSelCreateMerge:         'Créer 1 RA à partir de {n} critères',
    pcSelClear:               'Effacer',
    pcHideUsed:               'Masquer les critères utilisés',
    pcUnusedCount:            '{u} sur {t} pas encore utilisés',
    pcLoCreated:              '{n} créé',
    loNeedStatement:          'Énoncé à saisir',
    loSummaryMissing:         '{n} sur {t} résultats d’apprentissage sans énoncé',
    loSummaryDone:            'Les {t} résultats d’apprentissage ont un énoncé',
    loNextEmpty:              'Suivant vide',
    loUsePC:                  'Reprendre le texte du critère',
    loInlinePh:               'Saisissez l’énoncé du résultat d’apprentissage ici — enregistré automatiquement',
    loInlineHint:             'Saisissez directement dans chaque carte. L’enregistrement est automatique ; Entrée passe au résultat suivant.',
    loKeyNext:                'résultat suivant',
    loKeyNewLine:             'nouvelle ligne',
    loKeyHintFine:            'Appuyez sur Entrée : résultat suivant · Appuyez sur Maj+Entrée : nouvelle ligne',
    loKeyHintCoarse:          'Appuyez sur Entrée : résultat suivant',
    loKeySaved:               'enregistrement automatique',
    loAiSkipped:              '{n} critère(s) non lié(s) — toujours disponibles dans la liste',
    loAiNot1to1:              'la correspondance un-à-un n’est pas exacte — vérifiez les critères liés',
    loAiNoIntegration:        'aucun critère intégré — ce résultat équivaut au modèle A',
    loAiAllIntegrated:        'chaque résultat intègre plusieurs critères — plus proche du modèle B',
    loAiCrossComp:            '{n} résultat(s) combinent des critères de compétences différentes — à vérifier',
    mmOptKeep:                'Conserver les modules existants — regrouper seulement les résultats sans module',
    mmOptLevels:              'Proposer un niveau pour chaque module — niveaux du programme :',
    mmOptSingle:              '(programme à un seul niveau — aucun niveau à proposer)',
    covShow:                  'Afficher',
    covHide:                  'Masquer',
    undoBtn:                  'Annuler',
    redoBtn:                  'Rétablir',
    undoLast:                 'Dernier : {a}',
    undoDone:                 'Annulé : {a}',
    redoDone:                 'Rétabli : {a}',
    undoDeleteModule:         'Module {m} « {name} » supprimé',
    undoDeleteLO:             '{lo} supprimé',
    undoRemoveLO:             '{lo} retiré de {m}',
    undoUnlinkPC:             '{pc} délié de {lo}',
    undoLaterChanges:         'D’autres modifications ont été faites après cette étape. L’annuler annulera aussi ces modifications. Continuer ?',
    mmHintNew:                '⚡ Instantané et hors ligne — un module par résultat. 🤖 Regroupe les résultats liés, nomme et ordonne les modules, et peut proposer un niveau pour chacun. Avec « Conserver les modules existants » coché, seuls les résultats sans module sont utilisés ; sinon les modules existants sont remplacés. Vos résultats d’apprentissage ne sont jamais modifiés.',
    mmNothingNew:             'Tous les résultats d’apprentissage sont déjà dans un module.',
    mmAiOrphans:              '{n} résultat(s) placé(s) dans un module à revoir',
    mmAiTrimmed:              '{n} module(s) trop volumineux réduit(s)',
    mmAiLevelsNote:           'les niveaux et spécialisations sont des propositions — vérifiez-les sur chaque module',
    mmAiReviewTitle:          'Résultats supplémentaires',
    mmAiReviewWhy:            'Résultats non placés par le regroupement — à vérifier et réaffecter.'
  },
  ar: {
    ttMoveTaskUp:             'نقل لأعلى',
    ttMoveTaskDown:           'نقل لأسفل',
    ttDeleteClusterTask:      'حذف المهمة',
    btnAddClusterTask:        'إضافة مهمة',
    phNewClusterTask:         'اكتب عبارة المهمة — مثال: معايرة مقياس متعدد رقمي وفق مواصفات الصانع',
    lblAddedDuringClustering: 'أُضيفت أثناء تجميع الكفاءات',
    msgEnterTaskStatement:    'اكتب عبارة المهمة أولاً.',
    msgClusterTaskAdded:      'تمت إضافة المهمة إلى هذه الكفاءة.',
    confirmDeleteAddedTask:   'حذف هذه المهمة؟\n\nأُضيفت أثناء تجميع الكفاءات وليست جزءاً من الملف المهني، لذا ستُحذف نهائياً.',
    syncTitle:                'تغيّرت الواجبات والمهام — جرى تحديث تجميع الكفاءات',
    syncAdded:                'مهام جديدة أُضيفت إلى المهام المتاحة: {n}',
    syncUpdated:              'عبارات مهام حُدّثت لتطابق الواجبات والمهام: {n}',
    syncDropped:              'مهام محذوفة أُزيلت من المهام المتاحة: {n}',
    syncOrphans:              'مهام داخل الكفاءات لم تعد موجودة في الواجبات والمهام: {n} — موسومة بـ ⚠ أدناه لمراجعتها',
    lblNewTask:               'جديدة',
    ttNewTask:                'أُضيفت في الواجبات والمهام بعد بدء التجميع',
    lblRemovedFromProfile:    'حُذفت من الملف المهني',
    ttDismissNotice:          'إغلاق',
    loSyncTitle:              'تغيّرت تجمعات الكفاءات — جرى تحديث محصلات التعلم',
    loSyncRenumbered:         'معايير أُعيد ترقيمها وفق الترتيب الجديد للمهام: {n}',
    loSyncRemoved:            'معايير أُزيلت لأن مهمتها لم تعد في أي كفاءة: {n}',
    loSyncStale:              'معايير عُدّلت صياغتها أو حُذفت في تجمعات الكفاءات / تحليل المهمة: {n} — موسومة بـ ⚠ لمراجعتها',
    lblStaleCriterion:        'عُدّلت أو حُذفت في المصدر — راجعها ثم أبقِها أو أزلها (✕)',
    lblModuleLevel:           'المستوى',
    lblModuleTrack:           'المسار / بادئة الرمز',
    phModuleTrack:            'مشتركة للجميع',
    lblModuleCode:            'الرمز',
    lblModuleShort:           'اسم مختصر',
    lblCodeAuto:              'تلقائي',
    ttCodeReset:              'العودة إلى الرمز التلقائي',
    msgCodeDuplicate:         'يوجد وحدة أخرى بالرمز نفسه',
    lblLabelMode:             'عرض الوحدات بـ',
    optLabelCode:             'الرمز (CMT 1-1)',
    optLabelNumber:           'الرقم (M1)',
    optLabelBoth:             'كلاهما (M1 · CMT 1-1)',
    optNoLevel:               '— غير محدد —',
    lblLevelN:                'المستوى {n}',
    lblLevelShort:            'م{n}',
    lblNoLevelGroup:          'مستوى غير محدد',
    lblLevelSummary:          '{m} وحدة · {lo} محصلة تعلم',
    lblLevelCount:            'عدد مستويات البرنامج',
    covTitle:                 'تغطية معايير الأداء حسب المستوى',
    covHint:                  'كل معيار أداء من تجمعات الكفاءات، والوحدة والمستوى اللذان يُدرَّس فيهما. المعيار الموسوم بـ ✗ لا يُدرَّس في أي مكان من البرنامج.',
    covGapsOnly:              'عرض الفجوات فقط',
    covTotal:                 '{n} معياراً',
    covCoveredN:              'مُدرَّسة: {n} ({p}%)',
    covGapN:                  'غير مُدرَّسة: {n}',
    covLoOnlyN:               'في محصلة تعلم دون وحدة: {n}',
    covMultiN:                'مُدرَّسة في أكثر من وحدة: {n}',
    covGap:                   'غير مُدرَّس',
    covLoOnly:                'في {lo} فقط — دون وحدة',
    covMulti:                 'في {n} وحدات',
    covColCriterion:          'معيار الأداء',
    covColNoLevel:            'دون مستوى',
    covColStatus:             'الحالة',
    covNoGaps:                'لا توجد فجوات — كل معيار مُدرَّس في وحدة.',
    covEmpty:                 'لا توجد معايير أداء بعد — أضفها في تبويب تجمعات الكفاءات.',
    covTaught:                'مُدرَّس',
    covCommon:                'مشتركة',
    expLevelsTitle:           'هيكل البرنامج حسب المستوى',
    expColModule:             'الوحدة',
    expColLOs:                'محصلات التعلم',
    expColCriteria:           'معايير الأداء',
    expCovHint:               'كل معيار أداء من تجمعات الكفاءات، والوحدة والمستوى اللذان يُدرَّس فيهما. المعيار الموسوم «غير مُدرَّس» لا يرد في أي وحدة من البرنامج.',
    pcSelCount:               'تم اختيار {n} من المعايير',
    pcSelCreateOne:           'إنشاء محصلة تعلم',
    pcSelCreateMerge:         'إنشاء محصلة واحدة من {n} معايير',
    pcSelClear:               'إلغاء الاختيار',
    pcHideUsed:               'إخفاء المعايير المستخدمة',
    pcUnusedCount:            '{u} من {t} غير مستخدمة بعد',
    pcLoCreated:              'تم إنشاء {n}',
    loNeedStatement:          'يحتاج إلى نص',
    loSummaryMissing:         '{n} من {t} محصلات تعلم ما زالت بلا نص',
    loSummaryDone:            'كل محصلات التعلم ({t}) لها نص',
    loNextEmpty:              'التالية الفارغة',
    loUsePC:                  'استخدام نص المعيار',
    loInlinePh:               'اكتب نص محصلة التعلم هنا — يُحفظ تلقائياً',
    loInlineHint:             'اكتب مباشرة في كل بطاقة. الحفظ تلقائي، وزر Enter ينقلك إلى المحصلة التالية.',
    loKeyNext:                'المحصلة التالية',
    loKeyNewLine:             'سطر جديد',
    loKeyHintFine:            'اضغط Enter: المحصلة التالية · اضغط Shift+Enter: سطر جديد',
    loKeyHintCoarse:          'اضغط Enter: المحصلة التالية',
    loKeySaved:               'حفظ تلقائي',
    loAiSkipped:              '{n} من المعايير بقيت دون ربط — ما زالت متاحة في القائمة',
    loAiNot1to1:              'التطابق واحد لواحد لم يكن تاماً — راجع المعايير المرتبطة',
    loAiNoIntegration:        'لم يُدمج أي معيار — النتيجة فعلياً هي النمط A',
    loAiAllIntegrated:        'كل المحصلات دمجت عدة معايير — النتيجة أقرب إلى النمط B',
    loAiCrossComp:            '{n} محصلة دمجت معايير من كفاءات مختلفة — يرجى مراجعتها',
    mmOptKeep:                'الإبقاء على الوحدات الحالية — تجميع المحصلات غير المُسندة فقط',
    mmOptLevels:              'اقتراح مستوى لكل وحدة — عدد مستويات البرنامج:',
    mmOptSingle:              '(برنامج بمستوى واحد — لا يوجد مستوى لاقتراحه)',
    covShow:                  'إظهار',
    covHide:                  'إخفاء',
    undoBtn:                  'تراجع',
    redoBtn:                  'إعادة',
    undoLast:                 'آخر إجراء: {a}',
    undoDone:                 'تم التراجع: {a}',
    redoDone:                 'تمت الإعادة: {a}',
    undoDeleteModule:         'حُذفت الوحدة {m} «{name}»',
    undoDeleteLO:             'حُذفت {lo}',
    undoRemoveLO:             'أُزيلت {lo} من {m}',
    undoUnlinkPC:             'فُصل المعيار {pc} عن {lo}',
    undoLaterChanges:         'أُجريت تغييرات أخرى بعد هذه الخطوة، والتراجع عنها سيلغي تلك التغييرات أيضاً. هل تريد المتابعة؟',
    mmHintNew:                '⚡ فوري وبلا إنترنت — وحدة لكل محصلة. 🤖 يجمع المحصلات المترابطة ويسمّي الوحدات ويرتّبها، ويمكنه اقتراح مستوى لكل وحدة. عند تفعيل «الإبقاء على الوحدات الحالية» تُستخدم المحصلات غير المُسندة فقط، وإلا تُستبدل الوحدات الحالية. محصلات التعلم نفسها لا تتغير أبداً.',
    mmNothingNew:             'كل محصلات التعلم موجودة في وحدات.',
    mmAiOrphans:              '{n} محصلة وُضعت في وحدة للمراجعة',
    mmAiTrimmed:              'تم تقليص {n} وحدة كبيرة الحجم',
    mmAiLevelsNote:           'المستويات والتخصصات مقترحة — راجعها في كل وحدة',
    mmAiReviewTitle:          'محصلات إضافية',
    mmAiReviewWhy:            'محصلات لم يضعها التجميع في وحدة — راجعها وأعد إسنادها.'
  }
};

function _tx(key) {
  const I = window.i18n;
  if (I && I.has && I.has(key)) return I.t(key);
  const lang = (I && I.getLang) ? I.getLang() : 'en';
  return (_LOCAL_STRINGS[lang] && _LOCAL_STRINGS[lang][key]) || _LOCAL_STRINGS.en[key] || key;
}

function _esc(s) {
  return typeof escapeHtml === 'function'
    ? escapeHtml(String(s == null ? '' : s))
    : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Inline SVG, centred by viewBox — the same approach the verification
// chart modal uses, because text glyphs (↑ ↓ 🗑) sit off-centre in a
// fixed-size button and render differently on every platform.
const _ICON_UP    = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 12.5l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const _ICON_DOWN  = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const _ICON_TRASH = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6M8.5 9v4.5M11.5 9v4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Which card has its Add Task field open, and what has been typed so
// far — kept here so a re-render (language switch, another card's
// action) does not lose half-typed text.
let _addTaskOpenFor = null;
let _addTaskDraft   = '';

function _renderClusterTaskRow(cluster, task, taskIndex, lastIndex) {
  const added   = isClusterAddedTask(task);
  // A profile task that has since been deleted from Duties & Tasks has
  // no live DACUM code. It is NOT removed automatically — the expert
  // decides — but it is flagged so it cannot pass unnoticed.
  const orphan  = !added && !getTaskCode(task.id);
  // Profile task text is rendered exactly as before. Added text is
  // typed straight into this form, so it is escaped.
  const text    = added ? _esc(task.text) : task.text;
  const cid     = _esc(cluster.id);
  const up      = _esc(_tx('ttMoveTaskUp'));
  const down    = _esc(_tx('ttMoveTaskDown'));
  const del     = _esc(_tx('ttDeleteClusterTask'));
  return `
    <div class="related-task-item cluster-task-row${added ? ' is-added' : ''}${orphan ? ' is-orphan' : ''}" data-task-id="${_esc(task.id)}">
      <div class="cluster-task-text">
        ${orphan
          ? `<strong class="cluster-orphan-label">⚠ ${_esc(_tx('lblRemovedFromProfile'))}:</strong>`
          : `<strong>${_esc(_taskLabel(task.id))}:</strong>`} ${text}
        ${added ? `<span class="cluster-task-source">${_esc(_tx('lblAddedDuringClustering'))}</span>` : ''}
      </div>
      <div class="cluster-task-actions">
        <button type="button" class="ctl-btn" data-action="move-cluster-task" data-dir="-1"
          data-cluster-id="${cid}" data-task-index="${taskIndex}"
          title="${up}" aria-label="${up}" ${taskIndex === 0 ? 'disabled' : ''}>${_ICON_UP}</button>
        <button type="button" class="ctl-btn" data-action="move-cluster-task" data-dir="1"
          data-cluster-id="${cid}" data-task-index="${taskIndex}"
          title="${down}" aria-label="${down}" ${taskIndex === lastIndex ? 'disabled' : ''}>${_ICON_DOWN}</button>
        <button type="button" class="btn-remove-task ctl-btn ctl-btn-delete" data-action="remove-task-from-cluster"
          data-cluster-id="${cid}" data-task-index="${taskIndex}"
          title="${del}" aria-label="${del}">${_ICON_TRASH}</button>
      </div>
    </div>`;
}

function _renderAddTaskControl(cluster) {
  const cid   = _esc(cluster.id);
  const label = _esc(_tx('btnAddClusterTask'));
  if (_addTaskOpenFor !== cluster.id) {
    return `
      <button type="button" class="ctl-add-btn" data-action="open-add-cluster-task" data-cluster-id="${cid}">
        <span aria-hidden="true">＋</span><span>${label}</span>
      </button>`;
  }
  const ph = _esc(_tx('phNewClusterTask'));
  return `
    <div class="ctl-add-form" data-cluster-id="${cid}">
      <textarea class="ctl-add-input" rows="2" data-cluster-id="${cid}"
        placeholder="${ph}" aria-label="${label}">${_esc(_addTaskDraft)}</textarea>
      <div class="ctl-add-form-actions">
        <button type="button" class="ctl-add-confirm" data-action="confirm-add-cluster-task" data-cluster-id="${cid}">${label}</button>
        <button type="button" class="ctl-add-cancel" data-action="cancel-add-cluster-task" data-cluster-id="${cid}">${_esc(_t('btnCancel'))}</button>
      </div>
    </div>`;
}

/**
 * Move one task up (delta -1) or down (delta +1) inside its OWN
 * competency. Swaps two neighbours in cluster.tasks; nothing else.
 */
export function moveClusterTask(clusterId, taskIndex, delta) {
  const cluster = appState.clusteringData.clusters.find(c => c.id === clusterId);
  if (!cluster || !Array.isArray(cluster.tasks)) return false;
  const tasks = cluster.tasks;
  const to = taskIndex + delta;
  if (!Number.isInteger(taskIndex) || (delta !== 1 && delta !== -1) ||
      taskIndex < 0 || taskIndex >= tasks.length || to < 0 || to >= tasks.length) return false;

  const moving = tasks[taskIndex];
  tasks[taskIndex] = tasks[to];
  tasks[to] = moving;

  renderClusters();
  _afterMove(clusterId, to, delta, moving.id);
  _persistClusters();
  return true;
}

/**
 * Add a new task to ONE competency. The Occupational Profile is not
 * touched — see the block comment above for the data model.
 */
export function addTaskToCluster(clusterId, rawText) {
  const cluster = appState.clusteringData.clusters.find(c => c.id === clusterId);
  if (!cluster) return null;

  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    showStatus(_tx('msgEnterTaskStatement'), 'error');
    _focusAddInput(clusterId);
    return null;
  }

  const task = {
    id:            _newClusterTaskId(),
    text,
    dutyTitle:     '',
    priorityIndex: null,           // never verified — keeps PI badges/sorting safe
    source:        CLUSTER_TASK_SOURCE_ADDED,
    sourceLabel:   'Added during Competency Clustering',
    addedToClusterId: cluster.id,
    addedAt:       new Date().toISOString()
  };
  if (!Array.isArray(cluster.tasks)) cluster.tasks = [];
  cluster.tasks.push(task);

  _addTaskOpenFor = null;
  _addTaskDraft   = '';
  renderClusters();
  _focusSel(`#clustersContainer [data-action="open-add-cluster-task"][data-cluster-id="${_attr(clusterId)}"]`);
  showStatus('✓ ' + _tx('msgClusterTaskAdded'), 'success');
  _persistClusters();
  return task;
}

export function openAddClusterTask(clusterId) {
  if (_addTaskOpenFor !== clusterId) _addTaskDraft = '';
  _addTaskOpenFor = clusterId;
  renderClusters();
  _focusAddInput(clusterId);
}

export function cancelAddClusterTask(clusterId) {
  _addTaskOpenFor = null;
  _addTaskDraft   = '';
  renderClusters();
  if (clusterId) {
    _focusSel(`#clustersContainer [data-action="open-add-cluster-task"][data-cluster-id="${_attr(clusterId)}"]`);
  }
}

// Unique across every task ID the project holds, profile and clusters
// alike — the prefix already rules out profile IDs, the loop rules out
// the (vanishingly unlikely) repeat among added ones.
function _newClusterTaskId() {
  const used = new Set();
  (appState.dutiesData || []).forEach(d => (d.tasks || []).forEach(t => {
    if (t && t.inputId) used.add(t.inputId);
    if (t && t.id) used.add(t.id);
  }));
  const cd = appState.clusteringData || {};
  (cd.availableTasks || []).forEach(t => t && used.add(t.id));
  (cd.clusters || []).forEach(c => (c.tasks || []).forEach(t => t && used.add(t.id)));

  let id;
  do {
    id = CLUSTER_ADDED_TASK_PREFIX + Date.now().toString(36) +
         Math.random().toString(36).slice(2, 7);
  } while (used.has(id));
  return id;
}

function _attr(v) {
  return String(v).replace(/["\\]/g, '\\$&');
}

function _focusSel(sel) {
  const el = document.querySelector(sel);
  if (el && typeof el.focus === 'function') el.focus();
  return el;
}

function _focusAddInput(clusterId) {
  const ta = _focusSel(`#clustersContainer .ctl-add-input[data-cluster-id="${_attr(clusterId)}"]`);
  if (ta && typeof ta.setSelectionRange === 'function') {
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
}

// After a move the whole list is re-rendered, which would drop keyboard
// focus. Put it back on the same control of the moved task — or on the
// other arrow if the task has just reached the top/bottom — and flash
// the row so the eye can follow it.
function _afterMove(clusterId, newIndex, delta, taskId) {
  const base = `#clustersContainer [data-action="move-cluster-task"][data-cluster-id="${_attr(clusterId)}"][data-task-index="${newIndex}"]`;
  const same  = document.querySelector(`${base}[data-dir="${delta}"]`);
  const other = document.querySelector(`${base}[data-dir="${-delta}"]`);
  const target = (same && !same.disabled) ? same : other;
  if (target && typeof target.focus === 'function') target.focus();

  const row = target && target.closest('.cluster-task-row');
  if (row && row.getAttribute('data-task-id') === taskId) {
    row.classList.add('ctl-moved');
    setTimeout(() => row.classList.remove('ctl-moved'), 900);
  }
}

// Saves through the existing project mechanism (saveCurrentProject →
// _captureState, which already serialises appState.clusteringData).
// Imported lazily: dacum_projects.js depends on this module's render
// functions, so a static import here would create a cycle.
function _persistClusters() {
  import('./dacum_projects.js')
    .then(m => { try { m.saveCurrentProject(); } catch (e) { console.warn('[clusters] save failed:', e); } })
    .catch(() => { /* project system unavailable — the exit handler will still save */ });
}

function _txf(key, vars) {
  let s = _tx(key);
  if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(String(vars[k])); });
  return s;
}

// ══════════════════════════════════════════════════════════════
// KEEPING CLUSTERING IN STEP WITH DUTIES & TASKS
// ──────────────────────────────────────────────────────────────
// The Available Tasks pool is seeded ONCE (initializeClusteringFromTasks)
// and then saved with the project. Before this, anything the expert
// changed later in Duties & Tasks never reached this tab: a new task or
// a whole new duty was silently missing from the chain that leads to
// Learning Outcomes and modules.
//
// On every draw of Available Tasks, the pool is compared with the live
// Occupational Profile (appState.dutiesData) and brought back in line:
//
//   new profile task, in no cluster and not in the pool
//       → appended to Available Tasks, marked "New"
//   profile task whose wording changed
//       → its text is updated wherever it sits (pool or competency)
//   pool task deleted from the profile
//       → dropped from the pool (it was never placed)
//   competency task deleted from the profile
//       → NOT removed; flagged ⚠ on its card for the expert to decide
//
// Nothing already placed in a competency is moved, and tasks added
// during clustering (cctask_…) are outside this comparison entirely.
// A notice summarises what changed until the expert dismisses it.
// ══════════════════════════════════════════════════════════════

let _syncNotice      = null;   // { added, updated, dropped, orphans }
let _lastOrphanCount = 0;

export function syncClusteringWithProfile() {
  const cd = appState.clusteringData;
  if (!cd || !Array.isArray(cd.clusters) || !Array.isArray(cd.availableTasks)) return null;
  // Clustering not started yet: the first visit seeds the pool in full.
  if (!cd.clusters.length && !cd.availableTasks.length) return null;

  const duties  = appState.dutiesData || [];
  const present = new Set();     // every profile task ID, even if blank right now
  const live    = new Map();     // ID → { text, dutyTitle } for tasks with wording
  duties.forEach(d => (d.tasks || []).forEach(t => {
    if (!t || !t.inputId) return;
    present.add(t.inputId);
    const text = (t.text || '').trim();
    if (text) live.set(t.inputId, { text, dutyTitle: (d.title || '').trim() });
  }));
  // An empty profile is a transient state (project switch, Clear All) —
  // never read it as "every task was deleted".
  if (!present.size) return null;

  let added = 0, updated = 0, dropped = 0, orphans = 0;
  const placed = new Set();

  const refresh = (t) => {
    const l = live.get(t.id);
    if (!l) return;
    if ((t.text || '').trim() !== l.text) { t.text = l.text; updated++; }
    if (l.dutyTitle && t.dutyTitle !== l.dutyTitle) t.dutyTitle = l.dutyTitle;
  };

  cd.clusters.forEach(c => (c.tasks || []).forEach(t => {
    if (!t || isClusterAddedTask(t)) return;
    placed.add(t.id);
    if (!present.has(t.id)) { orphans++; return; }
    refresh(t);
  }));

  cd.availableTasks = cd.availableTasks.filter(t => {
    if (!t) return false;
    if (isClusterAddedTask(t)) return true;
    if (!present.has(t.id)) { dropped++; return false; }
    placed.add(t.id);
    refresh(t);
    return true;
  });

  // Appended in DACUM order (duty by duty, task by task).
  duties.forEach(d => (d.tasks || []).forEach(t => {
    if (!t || !live.has(t.inputId) || placed.has(t.inputId)) return;
    const l = live.get(t.inputId);
    cd.availableTasks.push({
      id: t.inputId, text: l.text, dutyTitle: l.dutyTitle,
      priorityIndex: null, newFromProfile: true
    });
    placed.add(t.inputId);
    added++;
  }));

  if (added || updated || dropped || orphans > _lastOrphanCount) {
    const p = _syncNotice || { added: 0, updated: 0, dropped: 0 };
    _syncNotice = { added: p.added + added, updated: p.updated + updated,
                    dropped: p.dropped + dropped, orphans };
  } else if (_syncNotice) {
    _syncNotice.orphans = orphans;
  }
  _lastOrphanCount = orphans;

  if (added || updated || dropped) _persistClusters();
  return { added, updated, dropped, orphans };
}

function _renderSyncNotice(listEl) {
  if (!listEl || !listEl.parentNode) return;
  let box = document.getElementById('clusterSyncNotice');
  const n = _syncNotice;
  const lines = [];
  if (n) {
    if (n.added)   lines.push(_txf('syncAdded',   { n: n.added }));
    if (n.updated) lines.push(_txf('syncUpdated', { n: n.updated }));
    if (n.dropped) lines.push(_txf('syncDropped', { n: n.dropped }));
    if (n.orphans) lines.push(_txf('syncOrphans', { n: n.orphans }));
  }
  if (!lines.length) { if (box) box.remove(); return; }

  if (!box) {
    box = document.createElement('div');
    box.id = 'clusterSyncNotice';
    box.className = 'dacum-sync-notice';
    box.setAttribute('role', 'status');
    listEl.parentNode.insertBefore(box, listEl);
  }
  const close = _esc(_tx('ttDismissNotice'));
  box.innerHTML = `
    <div class="csn-head">
      <strong>🔄 ${_esc(_tx('syncTitle'))}</strong>
      <button type="button" class="csn-close" data-action="dismiss-cluster-sync"
        title="${close}" aria-label="${close}">✕</button>
    </div>
    <ul>${lines.map(l => `<li>${_esc(l)}</li>`).join('')}</ul>`;
}

export function dismissClusterSyncNotice() {
  _syncNotice = null;
  const box = document.getElementById('clusterSyncNotice');
  if (box) box.remove();
}

// ══════════════════════════════════════════════════════════════
// CARRYING CLUSTER CHANGES INTO LEARNING OUTCOMES
// ──────────────────────────────────────────────────────────────
// The Performance Criteria list in the Learning Outcomes tab is already
// rebuilt live from the clusters, so a task placed in a competency
// shows its criteria there straight away, numbered in task order. What
// did NOT follow were the outcomes created earlier: each stores a copy
// of its criteria under the positional number ("1-3") they had at the
// time. Adding, moving or removing a task shifts those numbers, and the
// stored links silently drifted out of step.
//
// Each link is now matched to its live criterion by `key` (see
// _getClusterEffectiveCriteria), falling back to task + wording for
// outcomes created before keys existed. Then:
//   found          → number, cluster and wording follow the criterion
//   its task is no longer in ANY competency (removed, or its
//   competency deleted)
//                  → the link is removed from the outcome
//   anything else  (criterion reworded or deleted in Task Analysis or
//                   in the cluster's own criteria)
//                  → kept and flagged ⚠ for the expert, never guessed at
// Module copies of each outcome are re-pointed at the live outcome, so
// Module Mapping and the Module Builder export carry the same numbers.
// With no clusters at all (tab cleared) nothing is touched: removing
// every link because the stage above was emptied would be data loss.
// ══════════════════════════════════════════════════════════════

let _loNotice = null;   // { renumbered, removed, stale }

function _matchLink(pc, byKey, all, consumed) {
  if (pc.key && byKey.has(pc.key)) {
    return byKey.get(pc.key).find(c => !consumed.has(c)) || null;
  }
  if (pc.taskId) {
    return all.find(c => !consumed.has(c) && c.source === 'ta' &&
                         c.taskId === pc.taskId && c.text === pc.text) || null;
  }
  const same = all.filter(c => !consumed.has(c) && c.source === 'manual' && c.text === pc.text);
  return same.find(c => c.clusterId && c.clusterId === pc.clusterId)
      || same.find(c => c.clusterNumber === pc.clusterNumber)
      || same[0] || null;
}

function _reconcileLearningOutcomes() {
  const cd = appState.clusteringData;
  const lo = appState.learningOutcomesData;
  if (!lo || !Array.isArray(lo.outcomes) || !lo.outcomes.length ||
      !cd || !Array.isArray(cd.clusters) || !cd.clusters.length) {
    _refreshModuleOutcomes();
    return null;
  }

  const all = [];
  cd.clusters.forEach((c, i) => all.push(..._getClusterEffectiveCriteria(c, i + 1)));
  const byKey = new Map();
  all.forEach(c => { if (!byKey.has(c.key)) byKey.set(c.key, []); byKey.get(c.key).push(c); });
  const placedTasks = new Set();
  cd.clusters.forEach(c => (c.tasks || []).forEach(t => { if (t) placedTasks.add(t.id); }));

  let renumbered = 0, removed = 0, newlyStale = 0, stale = 0;
  lo.outcomes.forEach(o => {
    if (!Array.isArray(o.linkedCriteria)) return;
    const consumed = new Set();
    o.linkedCriteria = o.linkedCriteria.filter(pc => {
      if (!pc) return false;
      const c = _matchLink(pc, byKey, all, consumed);
      if (c) {
        consumed.add(c);
        if (pc.id !== c.id) renumbered++;
        pc.id = c.id; pc.text = c.text; pc.clusterNumber = c.clusterNumber;
        pc.clusterId = c.clusterId; pc.key = c.key; pc.taskId = c.taskId || null;
        delete pc.stale;
        return true;
      }
      if (pc.taskId && !placedTasks.has(pc.taskId)) { removed++; return false; }
      if (!pc.stale) { pc.stale = true; newlyStale++; }
      stale++;
      return true;
    });
  });

  if (renumbered || removed || newlyStale) {
    const p = _loNotice || { renumbered: 0, removed: 0 };
    _loNotice = { renumbered: p.renumbered + renumbered, removed: p.removed + removed, stale };
    _persistClusters();
  } else if (_loNotice) {
    _loNotice.stale = stale;
  }
  _refreshModuleOutcomes();
  return { renumbered, removed, stale };
}

// Modules hold their outcomes by reference within a session, but a
// saved project reloads them as separate copies, which then never see
// later changes. Re-point each at the live outcome with the same id.
// An outcome that no longer exists keeps its copy, exactly as before.
/* LO numbers are DISPLAY numbers, taken from each outcome's position
   (LO1, LO2 …) — the same rule codes.js applies to duties and tasks.
   The id (lo_N) still comes from outcomeCounter and never changes, so
   module links and saved projects are unaffected. Before this, the
   number reused the counter, so deleting trial outcomes left the next
   one starting at e.g. LO8. Saved projects are corrected on open. */
export function renumberLearningOutcomes() {
  const lo = appState.learningOutcomesData;
  if (!lo || !Array.isArray(lo.outcomes)) return;
  lo.outcomes.forEach((o, i) => { if (o) o.number = `LO${i + 1}`; });
}

function _refreshModuleOutcomes() {
  renumberLearningOutcomes();
  const mm = appState.moduleMappingData;
  const lo = appState.learningOutcomesData;
  // The AI generator used to bake its position into the title
  // ("Module 3: Installing …"), which the cards then showed twice
  // ("M3 — Module 3: …") and which went wrong after any reorder or
  // delete. The number is display-only (M1, M2 … by position), so the
  // baked prefix is removed. A plain "Module 17" with no colon is a
  // name the user kept, and is left alone.
  if (mm && Array.isArray(mm.modules)) mm.modules.forEach(m => {
    if (m && typeof m.title === 'string') {
      const t = m.title.replace(/^\s*Module\s+\d+\s*:\s*/i, '');
      if (t && t !== m.title) m.title = t;
    }
  });
  if (!mm || !Array.isArray(mm.modules) || !lo || !Array.isArray(lo.outcomes)) return;
  const byId = new Map(lo.outcomes.map(o => [o.id, o]));
  mm.modules.forEach(m => {
    if (Array.isArray(m.learningOutcomes)) {
      m.learningOutcomes = m.learningOutcomes.map(o => (o && byId.get(o.id)) || o);
    }
  });
}

function _renderLoNotice(listEl) {
  if (!listEl || !listEl.parentNode) return;
  let box = document.getElementById('loSyncNotice');
  const n = _loNotice;
  const lines = [];
  if (n) {
    if (n.renumbered) lines.push(_txf('loSyncRenumbered', { n: n.renumbered }));
    if (n.removed)    lines.push(_txf('loSyncRemoved',    { n: n.removed }));
    if (n.stale)      lines.push(_txf('loSyncStale',      { n: n.stale }));
  }
  if (!lines.length) { if (box) box.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'loSyncNotice';
    box.className = 'dacum-sync-notice';
    box.setAttribute('role', 'status');
    listEl.parentNode.insertBefore(box, listEl);
  }
  const close = _esc(_tx('ttDismissNotice'));
  box.innerHTML = `
    <div class="csn-head">
      <strong>🔄 ${_esc(_tx('loSyncTitle'))}</strong>
      <button type="button" class="csn-close" data-action="dismiss-lo-sync"
        title="${close}" aria-label="${close}">✕</button>
    </div>
    <ul>${lines.map(l => `<li>${_esc(l)}</li>`).join('')}</ul>`;
}

function _injectClusterTaskStyles() {
  if (document.getElementById('clusterTaskControlsStyles')) return;
  const st = document.createElement('style');
  st.id = 'clusterTaskControlsStyles';
  st.textContent = `
    /* ── Competency card: task row ─────────────────────────────
       Text takes the free width; the three buttons keep their own.
       flex-wrap lets the buttons drop below the text on a narrow
       screen instead of squeezing it or pushing the card sideways. */
    .related-task-item.cluster-task-row {
      display: flex; flex-wrap: wrap; align-items: flex-start;
      column-gap: 10px; row-gap: 6px;
    }
    .cluster-task-row .cluster-task-text {
      flex: 1 1 220px; min-width: 0;
      overflow-wrap: anywhere; line-height: 1.5;
      padding-top: 5px;
    }
    .cluster-task-row.is-added {
      border-inline-start: 3px dashed #cbd5e1;
      padding-inline-start: 10px;
    }
    .cluster-task-source {
      display: block; margin-top: 2px;
      font-size: 0.78em; font-style: italic; color: #94a3b8;
    }
    .cluster-task-actions {
      flex: 0 0 auto; display: flex; gap: 6px;
      margin-inline-start: auto;
    }

    /* Every axis pinned: dacum-responsive.css gives every <button> a
       44px min-height on touch screens, which would stretch a square
       into an oval (see the touch-shape contract in
       dacum-components.css). */
    .ctl-btn {
      box-sizing: border-box; flex: 0 0 auto;
      width: 34px; height: 34px;
      min-width: 34px; max-width: 34px;
      min-height: 34px; max-height: 34px;
      padding: 0 !important; margin: 0;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 8px; border: 1px solid #cbd5e1;
      background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
      color: #475569; line-height: 0; cursor: pointer;
      -webkit-appearance: none; appearance: none;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .ctl-btn svg { display: block; width: 16px; height: 16px; }
    .ctl-btn:hover:not(:disabled) {
      background: #e2e8f0; border-color: #94a3b8; color: #1e293b;
    }
    .ctl-btn:focus-visible { outline: 2px solid #667eea; outline-offset: 2px; }
    .ctl-btn:disabled {
      opacity: 0.4; cursor: not-allowed;
      background: #f1f5f9; transform: none !important; box-shadow: none !important;
    }
    /* Delete keeps the existing red. */
    .ctl-btn.ctl-btn-delete {
      background: #ef4444; border-color: #ef4444; color: #ffffff;
    }
    .ctl-btn.ctl-btn-delete:hover:not(:disabled) {
      background: #dc2626; border-color: #dc2626; color: #ffffff;
    }
    /* dacum-rtl.css mirrors the old inline margin of the ✕ button;
       the buttons now sit in their own group, so no margin is needed. */
    html[dir="rtl"] .related-task-item .cluster-task-actions .btn-remove-task { margin-right: 0; }

    .cluster-task-row.ctl-moved {
      background: rgba(102, 126, 234, 0.10);
      transition: background 0.6s;
    }

    /* ── + Add Task ─────────────────────────────────────────── */
    .ctl-add-btn {
      display: inline-flex; align-items: center; gap: 6px;
      margin-top: 10px; min-height: 38px; padding: 7px 16px;
      border: 1.5px dashed #94a3b8; border-radius: 8px;
      background: #f8fafc; color: #475569;
      font-size: 0.9em; font-weight: 600; font-family: inherit;
      cursor: pointer; transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .ctl-add-btn:hover { background: #e2e8f0; border-color: #64748b; color: #1e293b; }
    .ctl-add-btn:focus-visible { outline: 2px solid #667eea; outline-offset: 2px; }

    .ctl-add-form {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start;
      margin-top: 10px; padding: 10px;
      background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px;
    }
    .cluster-section .ctl-add-form textarea.ctl-add-input {
      flex: 1 1 240px; min-width: 0; width: auto;
      min-height: 44px; padding: 8px 10px;
      font-size: 0.95em; resize: vertical; box-sizing: border-box;
    }
    .ctl-add-form-actions { display: flex; gap: 8px; flex: 0 0 auto; margin-inline-start: auto; }
    .ctl-add-confirm, .ctl-add-cancel {
      min-height: 38px; padding: 7px 16px !important;
      border-radius: 8px; font-size: 0.9em; font-weight: 600;
      font-family: inherit; cursor: pointer; white-space: nowrap;
    }
    .ctl-add-confirm { background: #475569; color: #ffffff; border: 1px solid #475569; }
    .ctl-add-confirm:hover { background: #334155; border-color: #334155; }
    .ctl-add-cancel  { background: #ffffff; color: #475569; border: 1px solid #cbd5e1; }
    .ctl-add-cancel:hover { background: #f1f5f9; }

    /* ── Sync with Duties & Tasks ──────────────────────────── */
    .dacum-sync-notice {
      margin: 0 0 12px; padding: 10px 14px;
      background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
      color: #1e3a8a; font-size: 0.9em; line-height: 1.55;
    }
    .dacum-sync-notice .csn-head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
    }
    .dacum-sync-notice ul { margin: 6px 0 0; padding-inline-start: 20px; }
    .dacum-sync-notice .csn-close {
      flex: 0 0 auto; box-sizing: border-box;
      width: 28px; height: 28px; min-width: 28px; max-width: 28px;
      min-height: 28px; max-height: 28px; padding: 0 !important;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 6px; border: 1px solid #bfdbfe; background: #ffffff;
      color: #1e3a8a; font-size: 13px; line-height: 1; cursor: pointer;
    }
    .dacum-sync-notice .csn-close:hover { background: #dbeafe; }
    .lo-linked-item.lo-link-stale { background: #fffbeb; }
    .lo-linked-item.lo-link-stale strong { color: #b45309; }
    .lo-stale-note {
      display: block; margin-top: 2px;
      font-size: 0.78em; font-style: italic; color: #b45309;
    }

    /* "Add to" / "Assign to LO" dropdowns (existing elements). A native
       <select> is as wide as its longest option — a long competency
       name pushed the row past a phone screen. Cap it; the open list
       still shows the full names. */
    .task-reassign-dropdown { max-width: min(320px, 100%); min-width: 0; text-overflow: ellipsis; }
    .task-dropdown-container { min-width: 0; max-width: 100%; }
    @media (max-width: 768px) {
      .task-checkbox-item, .pc-checkbox-item { flex-wrap: wrap; }
      .task-dropdown-container { flex: 1 1 100%; margin-inline-start: 0 !important; }
      .task-reassign-dropdown { flex: 1 1 auto; width: 100%; max-width: 100%; }
    }
    .cluster-new-badge {
      display: inline-block; margin-inline-start: 6px; padding: 1px 8px;
      border-radius: 999px; background: #dcfce7; color: #166534;
      border: 1px solid #86efac; font-size: 0.75em; font-weight: 700;
      vertical-align: middle; white-space: nowrap;
    }
    .cluster-task-row.is-orphan { background: #fffbeb; }
    .cluster-orphan-label { color: #b45309; }

    /* ── Module levels ─────────────────────────────────────── */
    .mod-level-chip, .mod-track-chip {
      display: inline-block; margin-inline-start: 6px; padding: 1px 9px;
      border-radius: 999px; font-size: 0.72em; font-weight: 700; vertical-align: middle;
    }
    .mod-level-chip { background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; }
    .mod-track-chip { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .mod-meta-row { display: flex; flex-wrap: wrap; gap: 10px 18px; margin: -4px 0 12px; }
    .mod-meta-field { display: inline-flex; align-items: center; gap: 8px; font-size: 0.86em; color: #475569; font-weight: 600; flex-wrap: wrap; }
    .mod-meta-field select, .mod-meta-field input {
      padding: 6px 10px; border: 1.5px solid #cbd5e1; border-radius: 6px;
      font-size: 0.95em; font-family: inherit; background: #fff; max-width: 100%;
    }
    .mod-track-input { width: 170px; }
    .cov-level-count { width: 70px; }
    .mod-level-group { margin-bottom: 18px; }
    .mod-level-head {
      display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap;
      margin: 6px 0 10px; padding: 8px 12px; border-radius: 8px;
      background: #eef2ff; color: #3730a3; font-weight: 800;
    }
    .mod-level-head span { font-weight: 600; font-size: 0.85em; color: #6366f1; }

    /* ── Coverage matrix ───────────────────────────────────── */
    #coverageMatrixSection .cov-hint { color: #64748b; font-size: 0.88em; margin: 0 0 12px; }
    .cov-controls { display: flex; flex-wrap: wrap; gap: 10px 20px; align-items: center; margin-bottom: 12px; }
    .cov-gaps-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 0.88em; color: #475569; cursor: pointer; }
    .cov-summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .cov-pill { padding: 4px 12px; border-radius: 999px; font-size: 0.82em; font-weight: 700; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
    .cov-pill.cov-ok, .cov-st.cov-ok { background: #dcfce7; color: #166534; border-color: #86efac; }
    .cov-pill.cov-gap, .cov-st.cov-gap { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
    .cov-pill.cov-lo,  .cov-st.cov-lo  { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .cov-pill.cov-multi, .cov-st.cov-multi { background: #e0f2fe; color: #075985; border-color: #7dd3fc; }
    .cov-table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px; -webkit-overflow-scrolling: touch; }
    .cov-table { width: 100%; border-collapse: collapse; font-size: 0.86em; min-width: 520px; }
    .cov-table th { background: #f8fafc; color: #334155; padding: 8px 10px; text-align: start; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
    .cov-table td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .cov-table .cov-group td { background: #f0f9ff; color: #0369a1; font-weight: 700; }
    .cov-table .cov-crit { min-width: 220px; line-height: 1.45; }
    .cov-table .cov-lvl { text-align: center; white-space: nowrap; }
    .cov-table .cov-status { white-space: nowrap; }
    .cov-table tr.cov-gap td.cov-crit { color: #991b1b; }
    .cov-task { color: #94a3b8; font-size: 0.9em; }
    .cov-chip { display: inline-block; margin: 1px 2px; padding: 1px 7px; border-radius: 6px; background: #e0e7ff; color: #3730a3; font-weight: 700; font-size: 0.92em; }
    .cov-chip small { font-weight: 600; color: #92400e; }
    .cov-st { display: inline-block; padding: 2px 8px; border-radius: 6px; border: 1px solid transparent; font-size: 0.9em; font-weight: 700; }
    .cov-empty { text-align: center; color: #64748b; padding: 16px; }
    @media (max-width: 600px) { .mod-track-input { width: 100%; } .mod-meta-field { width: 100%; } }

    /* Touch screens: full 44px targets, still square. */
    @media (hover: none) and (pointer: coarse) {
      .ctl-btn {
        width: 44px; height: 44px;
        min-width: 44px; max-width: 44px;
        min-height: 44px; max-height: 44px;
      }
      .ctl-add-btn, .ctl-add-confirm, .ctl-add-cancel { min-height: 44px; }
      .cluster-task-row .cluster-task-text { padding-top: 10px; }
    }

    /* Phones: the add form stacks, buttons share the width. */
    @media (max-width: 480px) {
      .ctl-add-form-actions { width: 100%; }
      .cluster-section .ctl-add-form textarea.ctl-add-input { flex-basis: 100%; min-height: 72px; }
      .ctl-add-confirm, .ctl-add-cancel { flex: 1 1 0; }
    }
  `;
  document.head.appendChild(st);
}

let _clusterTaskControlsWired = false;
function _wireClusterTaskControls() {
  if (_clusterTaskControlsWired || typeof document === 'undefined') return;
  _clusterTaskControlsWired = true;
  _injectClusterTaskStyles();

  // Delegated on document because #clustersContainer is rebuilt on
  // every render. Delete is deliberately NOT handled here — events.js
  // already dispatches it, unchanged.
  // A notice belongs to the project it was raised for.
  document.addEventListener('dacum:project-loaded', () => {
    _syncNotice = null; _lastOrphanCount = 0; _loNotice = null;
    _addTaskOpenFor = null; _addTaskDraft = '';
  });

  document.addEventListener('click', (e) => {
    const cr = e.target && e.target.closest && e.target.closest('#modulesContainer [data-mod-code-reset]');
    if (cr) { setModuleCode(cr.getAttribute('data-mod-code-reset'), ''); return; }
    if (e.target && e.target.closest && e.target.closest('#clusterSyncNotice [data-action="dismiss-cluster-sync"]')) {
      dismissClusterSyncNotice();
      return;
    }
    if (e.target && e.target.closest && e.target.closest('#loSyncNotice [data-action="dismiss-lo-sync"]')) {
      _loNotice = null;
      const b = document.getElementById('loSyncNotice'); if (b) b.remove();
      return;
    }
    const btn = e.target && e.target.closest && e.target.closest('#clustersContainer [data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const cid    = btn.getAttribute('data-cluster-id');
    if (action === 'move-cluster-task') {
      moveClusterTask(cid, parseInt(btn.getAttribute('data-task-index'), 10),
                           parseInt(btn.getAttribute('data-dir'), 10));
    } else if (action === 'open-add-cluster-task') {
      openAddClusterTask(cid);
    } else if (action === 'confirm-add-cluster-task') {
      const ta = document.querySelector(`#clustersContainer .ctl-add-input[data-cluster-id="${_attr(cid)}"]`);
      addTaskToCluster(cid, ta ? ta.value : '');
    } else if (action === 'cancel-add-cluster-task') {
      cancelAddClusterTask(cid);
    }
  });

  // Enter adds, Shift+Enter is ignored (a task statement is one line),
  // Escape cancels. isComposing guards Arabic/IME input.
  document.addEventListener('keydown', (e) => {
    const ta = e.target && e.target.closest && e.target.closest('#clustersContainer .ctl-add-input');
    if (!ta || e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.shiftKey) addTaskToCluster(ta.getAttribute('data-cluster-id'), ta.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelAddClusterTask(ta.getAttribute('data-cluster-id'));
    }
  });

  // Module level / specialisation, coverage controls.
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('#modulesContainer .mod-level-select'))     setModuleLevel(t.getAttribute('data-module-id'), t.value);
    else if (t.matches('#modulesContainer .mod-track-input')) setModuleTrack(t.getAttribute('data-module-id'), t.value);
    else if (t.matches('#modulesContainer .mod-code-input'))  setModuleCode(t.getAttribute('data-module-id'), t.value);
    else if (t.matches('#modulesContainer .mod-short-input')) setModuleShortName(t.getAttribute('data-module-id'), t.value);
    else if (t.matches('#modulesLabelMode'))                  setModuleLabelMode(t.value);
    else if (t.matches('#coverageMatrixSection .cov-level-count')) setModuleLevelCount(t.value);
    else if (t.matches('#coverageMatrixSection .cov-gaps-only')) { _covGapsOnly = t.checked; renderCoverageMatrix(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.matches && e.target.matches('#modulesContainer .mod-track-input, #modulesContainer .mod-code-input, #modulesContainer .mod-short-input')) {
      e.preventDefault(); e.target.blur();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target && e.target.matches && e.target.matches('#clustersContainer .ctl-add-input')) {
      _addTaskDraft = e.target.value;
    }
  });
}

export function updateClusterRange(clusterId, value) {
  const cluster = appState.clusteringData.clusters.find(c => c.id === clusterId);
  if (cluster) cluster.range = value;
}

export function updateClusterCriteria(clusterId, value) {
  const cluster = appState.clusteringData.clusters.find(c => c.id === clusterId);
  if (cluster) {
    cluster.performanceCriteria = value.split('\n').map(l => l.trim()).filter(l => l);
    renderClusters();
  }
}

export function updateClusterCriteriaFromNumbered(clusterId, value) {
  const cluster = appState.clusteringData.clusters.find(c => c.id === clusterId);
  if (!cluster) return;
  const lines = value.split('\n');
  const stripped = lines.map(line => {
    const match = line.match(/^\d+-\d+\s+(.*)$/);
    return match ? match[1].trim() : line.trim();
  }).filter(line => line);
  cluster.performanceCriteria = stripped;
}

export function handleCriteriaKeydown(event, clusterId) {
  if (event.key === 'Enter') {
    const textarea = event.target;
    const clusterNumber = textarea.getAttribute('data-cluster-number');
    const taCount = parseInt(textarea.getAttribute('data-ta-count') || '0', 10);
    const cursorPos = textarea.selectionStart;
    const value = textarea.value;
    const lines = value.substring(0, cursorPos).split('\n');
    const nextNumber = lines.length + 1 + taCount;
    event.preventDefault();
    const before = value.substring(0, cursorPos);
    const after = value.substring(cursorPos);
    const newText = before + '\n' + clusterNumber + '-' + nextNumber + ' ' + after;
    textarea.value = newText;
    const newCursorPos = cursorPos + 1 + clusterNumber.length + 1 + String(nextNumber).length + 1;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
  }
}

export function initCriteriaNumber(event, clusterId) {
  const textarea = event.target;
  const clusterNumber = textarea.getAttribute('data-cluster-number');
  const taCount = parseInt(textarea.getAttribute('data-ta-count') || '0', 10);
  if (!textarea.value.trim()) {
    textarea.value = clusterNumber + '-' + (taCount + 1) + ' ';
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }
}

export function proceedToClusteringFromVerification() {
  if (appState.clusteringAllowed !== true && appState.verificationDecisionMade !== true) {
    alert(_t('msgChooseVerificationAbove'));
    return;
  }
  appState.clusteringAllowed = true;
  _ensureClusteringSeeded();
  switchTab('clustering-tab');
}

// ── Learning Outcomes ─────────────────────────────────────────

export function renderPCSourceList() {
  const container = document.getElementById('pcSourceList');
  if (!container) return;
  // The list scrolls on its own now (see _enhancePCSource); keep the
  // reader's place across the re-render that follows every action.
  const _keepScroll = container.scrollTop;
  _ensureGuideButtons();

  // Pick up any Duties & Tasks change first (also when the user jumps
  // here without passing through Competency Clusters), then bring the
  // existing Learning Outcomes in line with the clusters.
  syncClusteringWithProfile();
  _reconcileLearningOutcomes();
  _renderLoNotice(container);

  const cd = appState.clusteringData;
  if (!cd.clusters || cd.clusters.length === 0) {
    container.innerHTML = `<div class="no-tasks-message">${_t('msgNoPCAvailable')}</div>`;
    _enhancePCSource(container);
    updateCreateLOButton();
    return;
  }

  const lo = appState.learningOutcomesData;
  const usedPCIds = new Set();
  lo.outcomes.forEach(outcome => {
    // A ⚠ link no longer points at a live criterion; its old number may
    // now belong to a different one, so it must not mark that one used.
    if (outcome.linkedCriteria) outcome.linkedCriteria.forEach(pc => { if (!pc.stale) usedPCIds.add(pc.id); });
  });
  // Note on legacy projects: a Learning Outcome created before this
  // "{clusterNumber}-{position}" id scheme was introduced stored its
  // criteria under the older "C1-PC1" / "C1-Ttaskcode-PC1" ids. Those
  // links still display correctly forever (linkedCriteria keeps its
  // own text snapshot — see createLearningOutcome), and nothing about
  // them is deleted or broken; the only effect is that this "already
  // used" check may not recognize a since-renumbered criterion as
  // used, so it could in principle be selected into a second Learning
  // Outcome. That is a minor, non-destructive edge case confined to
  // projects that existed before this change, not a data-loss risk.

  // Levels at which each criterion is already taught (via its LO's
  // module), shown on the "Used" badge — e.g. "Used · L1".
  const _usedLevels = new Map();
  (appState.moduleMappingData.modules || []).forEach(m => {
    const l = _moduleLevel(m);
    if (!l) return;
    (m.learningOutcomes || []).forEach(o => (o.linkedCriteria || []).forEach(pc => {
      if (pc.stale || !pc.key) return;
      const tag = _txf('lblLevelShort', { n: l });
      const cur = _usedLevels.get(pc.key);
      if (!cur) _usedLevels.set(pc.key, tag);
      else if (!cur.split(', ').includes(tag)) _usedLevels.set(pc.key, cur + ', ' + tag);
    }));
  });

  let html = '';
  let hasAnyCriteria = false;

  cd.clusters.forEach((cluster, clusterIndex) => {
    const clusterNumber = clusterIndex + 1;
    const effectiveCriteria = _getClusterEffectiveCriteria(cluster, clusterNumber);
    if (!effectiveCriteria.length) return;

    hasAnyCriteria = true;
    html += `<div class="pc-cluster-group"><h4>${cluster.name}</h4>`;

    effectiveCriteria.forEach(c => {
      if (!c.text || !c.text.trim()) return;
      const pcId = c.id;
      const isUsed = usedPCIds.has(pcId);

      let loOptions = `<option value="">${_t('optAssignToLO')}</option>`;
      lo.outcomes.forEach(outcome => {
        loOptions += `<option value="${outcome.id}">${outcome.number}</option>`;
      });

      html += `
        <div class="pc-checkbox-item ${isUsed ? 'used' : ''}" id="pc_${pcId}">
          <input type="checkbox" id="cb_${pcId}"
            data-pc-id="${pcId}"
            ${isUsed ? 'disabled' : ''} data-action="update-lo-button">
          <label for="cb_${pcId}" class="pc-label">
            <span class="pc-number">${pcId}:</span> ${c.text}
            ${c.source === 'ta' ? `<span style="color:#94a3b8;font-size:0.9em;margin-inline-start:6px;">[${_taskLabel(c.taskId)}]</span>` : ''}
          </label>
          ${isUsed ? `<span class="pc-used-badge">${_t('lblUsed')}${_usedLevels.has(c.key) ? ' · ' + _usedLevels.get(c.key) : ''}</span>` : ''}
          ${lo.outcomes.length > 0 ? `
          <div class="task-dropdown-container" style="margin-left:10px;">
            <select class="task-reassign-dropdown"
              data-action="reassign-pc-to-lo"
              data-pc-id="${pcId}">
              ${loOptions}
            </select>
          </div>` : ''}
        </div>`;
    });

    html += '</div>';
  });

  if (!hasAnyCriteria || !html) {
    container.innerHTML = `<div class="no-tasks-message">${_t('msgNoPCForModules')}</div>`;
  } else {
    container.innerHTML = html;
  }

  _enhancePCSource(container);
  container.scrollTop = _keepScroll;
  updateCreateLOButton();
}

export function updateCreateLOButton() {
  const checkboxes = document.querySelectorAll('#pcSourceList input[type="checkbox"]:not([disabled])');
  const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
  document.getElementById('btnCreateLO').disabled = !anyChecked;
  _updatePCSelectionBar();
}

/* ── Performance Criteria (Source): long-list helpers ───────────────
   Additive only. The list gets its own vertical scroll, a small
   toolbar (hide used criteria + count), and a selection bar that sticks
   to the bottom of the screen while criteria are ticked. The bar's
   Create button simply clicks the original #btnCreateLO, so both run
   exactly the same code; the original button stays where it was. */
let _pcHideUsed = false;

function _injectPCSourceStyles() {
  if (document.getElementById('pcSourceEnhanceStyles')) return;
  const st = document.createElement('style');
  st.id = 'pcSourceEnhanceStyles';
  st.textContent = `
    #pcSourceList.pc-scroll {
      max-height: min(62vh, 640px); overflow-y: auto; overscroll-behavior: auto;
      padding-top: 0; scrollbar-width: thin; scrollbar-color: #a5b4fc transparent;
    }
    #pcSourceList.pc-scroll::-webkit-scrollbar { width: 8px; }
    #pcSourceList.pc-scroll::-webkit-scrollbar-thumb { background: #a5b4fc; border-radius: 8px; }
    #pcSourceList.pc-scroll .pc-cluster-group > h4 {
      position: sticky; top: 0; z-index: 2; margin: 0 -8px 8px;
      background: #eef2ff; padding: 10px 12px; border-radius: 0 0 8px 8px;
      box-shadow: 0 1px 0 #c7d2fe;
    }
    #pcSourceList.pc-hide-used .pc-checkbox-item.used,
    #pcSourceList.pc-hide-used .pc-cluster-group.pc-all-used { display: none; }
    .pc-src-toolbar {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 8px 16px; margin: 0 0 10px; font-size: 0.92em; color: #475569;
    }
    .pc-src-toolbar label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .pc-src-count { font-weight: 600; color: #4338ca; }
    #pcSelectionBar {
      position: sticky; bottom: 12px; z-index: 30; margin-top: 12px;
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
      padding: 10px 14px; border-radius: 12px; color: #fff;
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      box-shadow: 0 8px 24px rgba(79,70,229,.35);
      padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    }
    #pcSelectionBar[hidden] { display: none; }
    #pcSelectionBar .pc-sel-info { flex: 1 1 200px; min-width: 0; }
    #pcSelectionBar .pc-sel-count { font-weight: 700; }
    #pcSelectionBar .pc-sel-ids { display: block; font-size: .85em; opacity: .9;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: start; }
    #pcSelectionBar button { border: none; border-radius: 8px; cursor: pointer; font-weight: 700;
      padding: 9px 14px; font-size: .95em; min-height: 40px; }
    #pcSelectionBar .pc-sel-clear { background: rgba(255,255,255,.18); color: #fff; border: 1px solid rgba(255,255,255,.5); }
    #pcSelectionBar .pc-sel-create { background: #fff; color: #4338ca; }
    #pcSelectionBar .pc-sel-create:hover { background: #eef2ff; }
    #pcSelectionBar.pc-sel-flash { background: linear-gradient(135deg, #059669, #10b981); }
    @media (max-width: 600px) {
      #pcSourceList.pc-scroll { max-height: 58vh; }
      #pcSelectionBar { bottom: 8px; }
      #pcSelectionBar .pc-sel-info { flex-basis: 100%; }
      #pcSelectionBar button { flex: 1 1 auto; }
    }
  `;
  document.head.appendChild(st);
}

function _enhancePCSource(container) {
  _injectPCSourceStyles();
  const items = container.querySelectorAll('.pc-checkbox-item');
  container.classList.toggle('pc-scroll', items.length > 0);
  container.classList.toggle('pc-hide-used', _pcHideUsed);
  container.querySelectorAll('.pc-cluster-group').forEach(g => {
    const all = g.querySelectorAll('.pc-checkbox-item').length;
    const used = g.querySelectorAll('.pc-checkbox-item.used').length;
    g.classList.toggle('pc-all-used', all > 0 && used === all);
  });

  // Toolbar above the list.
  let bar = document.getElementById('pcSourceToolbar');
  if (!items.length) { if (bar) bar.remove(); }
  else {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pcSourceToolbar';
      bar.className = 'pc-src-toolbar';
      container.parentNode.insertBefore(bar, container);
      bar.addEventListener('change', e => {
        if (!e.target.matches('#pcHideUsedToggle')) return;
        _pcHideUsed = e.target.checked;
        container.classList.toggle('pc-hide-used', _pcHideUsed);
      });
    }
    const total = items.length;
    const unused = total - container.querySelectorAll('.pc-checkbox-item.used').length;
    bar.innerHTML = `
      <label><input type="checkbox" id="pcHideUsedToggle" ${_pcHideUsed ? 'checked' : ''}> ${_esc(_tx('pcHideUsed'))}</label>
      <span class="pc-src-count">${_esc(_txf('pcUnusedCount', { u: unused, t: total }))}</span>`;
  }

  // Selection bar after the list (sticky to the bottom of the screen).
  let sel = document.getElementById('pcSelectionBar');
  if (!sel) {
    sel = document.createElement('div');
    sel.id = 'pcSelectionBar';
    sel.setAttribute('role', 'region');
    sel.setAttribute('aria-live', 'polite');
    sel.hidden = true;
    container.parentNode.insertBefore(sel, container.nextSibling);
    sel.addEventListener('click', e => {
      if (e.target.closest('.pc-sel-clear')) {
        document.querySelectorAll('#pcSourceList input[type="checkbox"]:checked').forEach(cb => { cb.checked = false; });
        updateCreateLOButton();
      } else if (e.target.closest('.pc-sel-create')) {
        const btn = document.getElementById('btnCreateLO');
        if (!btn || btn.disabled) return;
        const before = (appState.learningOutcomesData.outcomes || []).length;
        btn.click();
        const outs = appState.learningOutcomesData.outcomes || [];
        if (outs.length > before) _flashPCSelectionBar(_txf('pcLoCreated', { n: outs[outs.length - 1].number }));
      }
    });
  }
}

let _pcFlashTimer = null;
function _flashPCSelectionBar(msg) {
  const sel = document.getElementById('pcSelectionBar');
  if (!sel) return;
  clearTimeout(_pcFlashTimer);
  sel.hidden = false;
  sel.classList.add('pc-sel-flash');
  sel.innerHTML = `<div class="pc-sel-info"><span class="pc-sel-count">✓ ${_esc(msg)}</span></div>`;
  _pcFlashTimer = setTimeout(() => { sel.classList.remove('pc-sel-flash'); _pcFlashTimer = null; _updatePCSelectionBar(); }, 1800);
}

function _updatePCSelectionBar() {
  const sel = document.getElementById('pcSelectionBar');
  if (!sel || _pcFlashTimer) return;
  const ids = Array.from(document.querySelectorAll('#pcSourceList input[type="checkbox"]:checked:not([disabled])'))
    .map(cb => cb.getAttribute('data-pc-id'));
  if (!ids.length) { sel.hidden = true; sel.innerHTML = ''; return; }
  sel.hidden = false;
  const label = ids.length === 1 ? _tx('pcSelCreateOne') : _txf('pcSelCreateMerge', { n: ids.length });
  sel.innerHTML = `
    <div class="pc-sel-info">
      <span class="pc-sel-count">${_esc(_txf('pcSelCount', { n: ids.length }))}</span>
      <span class="pc-sel-ids">${ids.map(id => `<bdi>${_esc(id)}</bdi>`).join(' · ')}</span>
    </div>
    <button type="button" class="pc-sel-clear">${_esc(_tx('pcSelClear'))}</button>
    <button type="button" class="pc-sel-create">✨ ${_esc(label)}</button>`;
}

export function createLearningOutcome() {
  const checkboxes = document.querySelectorAll('#pcSourceList input[type="checkbox"]:checked');
  if (checkboxes.length === 0) return;

  const linkedCriteria = [];
  checkboxes.forEach(cb => {
    const pcId = cb.getAttribute('data-pc-id');
    const found = _findEffectiveCriterionById(pcId);
    if (!found) return;
    linkedCriteria.push({
      id: found.id, text: found.text, clusterNumber: found.clusterNumber,
      taskId: found.taskId || null, clusterId: found.clusterId, key: found.key
    });
  });

  const lo = appState.learningOutcomesData;
  lo.outcomeCounter++;
  lo.outcomes.push({
    id: `lo_${lo.outcomeCounter}`,
    number: `LO${lo.outcomes.length + 1}`,
    statement: '',
    linkedCriteria
  });

  renderPCSourceList();
  renderLearningOutcomes();
}

export function renderLearningOutcomes() {
  const container = document.getElementById('loBlocksContainer');
  _renderUndoBars();
  _reconcileLearningOutcomes();   // idempotent — no-op when nothing changed
  const lo = appState.learningOutcomesData;

  if (lo.outcomes.length === 0) {
    container.innerHTML = `<div class="no-clusters-message">${_t('msgNoLOs')}</div>`;
    _renderLOStatementSummary(container);
    return;
  }

  let html = '';
  lo.outcomes.forEach(outcome => {
    html += `
      <div class="lo-block" id="${outcome.id}">
        <div class="lo-block-header">
          <div class="lo-number">${outcome.number}<span class="lo-need-badge"${(outcome.statement || '').trim() ? ' hidden' : ''}>✎ ${_esc(_tx('loNeedStatement'))}</span></div>
          <div class="lo-actions">
            <button class="btn-delete-lo" data-action="delete-lo" data-lo-id="${outcome.id}">❌ ${_t('btnDelete')}</button>
          </div>
        </div>
        <div class="lo-statement lo-statement-inline" id="statement_${outcome.id}">
          <textarea id="textarea_${outcome.id}" class="lo-inline-input" rows="1"
            data-action-blur="save-lo-statement" data-lo-id="${outcome.id}"
            placeholder="${_esc(_tx('loInlinePh'))}" aria-label="${_esc(outcome.number)}">${_esc(outcome.statement || '')}</textarea>
          <div class="lo-inline-foot">
            ${(outcome.statement || '').trim() || !outcome.linkedCriteria.some(pc => !pc.stale) ? '' :
              `<button type="button" class="lo-use-pc" data-lo-id="${outcome.id}">↳ ${_esc(_tx('loUsePC'))}</button>`}
            <span class="lo-key-hint">${_loKeyHintHtml()}</span>
          </div>
        </div>
        <div class="lo-linked-criteria">
          <h5>📎 ${_t('lblMappedPC')}</h5>
          ${outcome.linkedCriteria.map((pc, pcIndex) => `
            <div class="lo-linked-item${pc.stale ? ' lo-link-stale' : ''}">
              <div style="flex:1"><strong>${pc.stale ? '⚠ ' : ''}${pc.id}:</strong> ${pc.text}${pc.taskId ? ` <span style="color:#94a3b8;font-size:0.85em;">[${_taskLabel(pc.taskId)}]</span>` : ''}${pc.stale ? `<span class="lo-stale-note">${_esc(_tx('lblStaleCriterion'))}</span>` : ''}</div>
              <button class="btn-remove-task" data-action="unassign-pc-from-lo"
                data-lo-id="${outcome.id}" data-pc-id="#idx:${pcIndex}" style="margin-left:10px;">✕</button>
            </div>`).join('')}
        </div>
      </div>`;
  });

  container.innerHTML = html;
  _wireInlineLOEditing(container);
  container.querySelectorAll('textarea.lo-inline-input').forEach(_autoGrow);
  _renderLOStatementSummary(container);
}

/* ── Inline Learning Outcome statements ─────────────────────────────
   The statement is always an editable field: type, and it is saved —
   no Edit → type → Save round trip per card. Empty statements are
   flagged on the card and counted above the list, with a "Next empty"
   jump. Enter moves to the next card (Shift+Enter = new line). The
   Edit button is kept and now simply puts the cursor in the field. */
function _injectLOInlineStyles() {
  if (document.getElementById('loInlineStyles')) return;
  const st = document.createElement('style');
  st.id = 'loInlineStyles';
  st.textContent = `
    .lo-statement-inline { padding: 0 !important; background: transparent !important; }
    textarea.lo-inline-input {
      display: block; width: 100%; box-sizing: border-box; resize: none; overflow: hidden;
      min-height: 48px; padding: 14px 16px; margin: 0;
      font: inherit; font-size: 1em; line-height: 1.55; color: #1f2937;
      background: #fff; border: 2px solid transparent; border-radius: 10px;
      unicode-bidi: plaintext; text-align: start;
      transition: border-color .15s, box-shadow .15s, background .15s;
    }
    textarea.lo-inline-input:hover { border-color: #fcd34d; }
    textarea.lo-inline-input:focus { outline: none; border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,.25); }
    textarea.lo-inline-input:placeholder-shown { background: #fffbeb; border: 2px dashed #f59e0b; }
    textarea.lo-inline-input::placeholder { color: #b45309; opacity: .85; font-style: italic; }
    html[dir="rtl"] .lo-statement textarea.lo-inline-input { direction: rtl; unicode-bidi: plaintext; text-align: start; }
    .lo-inline-foot {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 4px 12px; margin-top: 6px; min-height: 22px;
    }
    .lo-key-hint { margin-inline-start: auto; font-size: .8em; color: #92400e; opacity: .7; font-style: italic; cursor: default; user-select: none; }
    .lo-key-hint kbd {
      display: inline-block; font: inherit; font-size: .95em; font-weight: 700; line-height: 1.3;
      padding: 0 5px; border: 1px solid #f59e0b; border-bottom-width: 2px; border-radius: 4px;
      background: #fffbeb; color: #92400e; direction: ltr; unicode-bidi: isolate;
    }
    .lo-block:focus-within .lo-key-hint { opacity: 1; }
    .lo-hint-coarse { display: none; }
    @media (hover: none) and (pointer: coarse) {
      .lo-hint-fine { display: none; }
      .lo-hint-coarse { display: inline; }
    }
    .lo-use-pc {
      margin-top: 0; background: transparent !important; color: #92400e !important;
      border: none; padding: 4px 6px !important; font-size: .88em; font-weight: 600;
      cursor: pointer; min-height: 0 !important; box-shadow: none !important;
    }
    .lo-use-pc:hover { text-decoration: underline; }
    .lo-need-badge {
      display: inline-block; margin-inline-start: 10px; vertical-align: middle;
      background: #fef3c7; color: #b45309; border: 1px solid #f59e0b;
      border-radius: 999px; padding: 2px 10px; font-size: .62em; font-weight: 700;
    }
    .lo-need-badge[hidden] { display: none; }
    .lo-block.lo-saved textarea.lo-inline-input { border-color: #10b981; }
    #loStatementSummary {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 8px 14px; margin: 0 0 14px; padding: 10px 14px; border-radius: 10px;
      background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; font-weight: 600;
    }
    #loStatementSummary.lo-sum-done { background: #ecfdf5; border-color: #6ee7b7; color: #065f46; }
    #loStatementSummary .lo-sum-hint { flex-basis: 100%; font-weight: 400; font-size: .86em; opacity: .9; }
    #loStatementSummary button {
      background: #f59e0b; color: #fff; border: none; border-radius: 8px;
      padding: 7px 14px !important; font-weight: 700; cursor: pointer; font-size: .9em;
    }
  `;
  document.head.appendChild(st);
}

/* Plain text on purpose: key caps drawn as little boxes looked like
   buttons and invited a click. */
function _loKeyHintHtml() {
  return `<span class="lo-hint-fine">${_esc(_tx('loKeyHintFine'))}</span>`
       + `<span class="lo-hint-coarse">${_esc(_tx('loKeyHintCoarse'))}</span>`;
}

function _autoGrow(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight + 4) + 'px';
}

let _loPersistTimer = null;
function _schedulePersistLO() {
  clearTimeout(_loPersistTimer);
  _loPersistTimer = setTimeout(() => { _loPersistTimer = null; _persistClusters(); }, 700);
}

function _loFromTextarea(ta) {
  const id = ta && ta.getAttribute('data-lo-id');
  return id ? appState.learningOutcomesData.outcomes.find(o => o.id === id) : null;
}

function _refreshLOCardState(ta) {
  const lo = _loFromTextarea(ta);
  const block = ta.closest('.lo-block');
  if (!lo || !block) return;
  const has = !!(lo.statement || '').trim();
  const badge = block.querySelector('.lo-need-badge');
  if (badge) badge.hidden = has;
  const use = block.querySelector('.lo-use-pc');
  if (use) use.hidden = has;
}

function _focusLOTextarea(ta) {
  if (!ta) return;
  ta.focus();
  try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (_) {}
  ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function _wireInlineLOEditing(container) {
  _injectLOInlineStyles();
  if (container.__loInlineWired) return;
  container.__loInlineWired = true;

  container.addEventListener('input', e => {
    const ta = e.target.closest('textarea.lo-inline-input');
    if (!ta) return;
    const lo = _loFromTextarea(ta);
    if (!lo) return;
    lo.statement = ta.value;
    _autoGrow(ta);
    _refreshLOCardState(ta);
    _renderLOStatementSummary(container);
    _schedulePersistLO();
  });

  container.addEventListener('focusout', e => {
    const ta = e.target.closest('textarea.lo-inline-input');
    if (!ta) return;
    const lo = _loFromTextarea(ta);
    if (!lo) return;
    const clean = ta.value.replace(/\s+\n/g, '\n').trim();
    if (clean !== ta.value) { ta.value = clean; _autoGrow(ta); }
    lo.statement = clean;
    delete lo.editing;
    _refreshLOCardState(ta);
    _renderLOStatementSummary(container);
    clearTimeout(_loPersistTimer); _loPersistTimer = null;
    _persistClusters();
    const block = ta.closest('.lo-block');
    if (block && clean) { block.classList.add('lo-saved'); setTimeout(() => block.classList.remove('lo-saved'), 700); }
  });

  container.addEventListener('keydown', e => {
    const ta = e.target.closest('textarea.lo-inline-input');
    if (!ta || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    const all = Array.from(container.querySelectorAll('textarea.lo-inline-input'));
    const next = all[all.indexOf(ta) + 1];
    if (next) _focusLOTextarea(next); else ta.blur();
  });

  container.addEventListener('click', e => {
    const btn = e.target.closest('.lo-use-pc');
    if (!btn) return;
    const lo = appState.learningOutcomesData.outcomes.find(o => o.id === btn.getAttribute('data-lo-id'));
    const ta = document.getElementById(`textarea_${btn.getAttribute('data-lo-id')}`);
    if (!lo || !ta) return;
    ta.value = lo.linkedCriteria.filter(pc => !pc.stale).map(pc => (pc.text || '').trim()).filter(Boolean).join(' ');
    lo.statement = ta.value;
    _autoGrow(ta);
    _refreshLOCardState(ta);
    _renderLOStatementSummary(container);
    _schedulePersistLO();
    _focusLOTextarea(ta);
  });
}

function _renderLOStatementSummary(container) {
  if (!container || !container.parentNode) return;
  let box = document.getElementById('loStatementSummary');
  const outs = appState.learningOutcomesData.outcomes || [];
  if (!outs.length) { if (box) box.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'loStatementSummary';
    box.setAttribute('aria-live', 'polite');
    container.parentNode.insertBefore(box, container);
    box.addEventListener('click', e => {
      if (!e.target.closest('.lo-sum-next')) return;
      const empty = Array.from(document.querySelectorAll('#loBlocksContainer textarea.lo-inline-input'))
        .find(t => !t.value.trim() && t !== document.activeElement)
        || Array.from(document.querySelectorAll('#loBlocksContainer textarea.lo-inline-input')).find(t => !t.value.trim());
      _focusLOTextarea(empty);
    });
  }
  const missing = outs.filter(o => !(o.statement || '').trim()).length;
  box.classList.toggle('lo-sum-done', missing === 0);
  box.innerHTML = missing
    ? `<span>✎ ${_esc(_txf('loSummaryMissing', { n: missing, t: outs.length }))}</span>
       <button type="button" class="lo-sum-next">${_esc(_tx('loNextEmpty'))} ${(window.i18n && window.i18n.isRTL && window.i18n.isRTL()) ? '◂' : '▸'}</button>`
    : `<span>✓ ${_esc(_txf('loSummaryDone', { t: outs.length }))}</span>`;
}

export function toggleEditLO(loId) {
  // Statements are edited inline now; Edit just puts the cursor there.
  const lo = appState.learningOutcomesData.outcomes.find(o => o.id === loId);
  if (!lo) return;
  delete lo.editing;
  let ta = document.getElementById(`textarea_${loId}`);
  if (!ta) { renderLearningOutcomes(); ta = document.getElementById(`textarea_${loId}`); }
  _focusLOTextarea(ta);
}

export function saveLOStatement(loId) {
  const ta = document.getElementById(`textarea_${loId}`);
  if (!ta) return;
  const lo = appState.learningOutcomesData.outcomes.find(o => o.id === loId);
  if (lo) lo.statement = ta.value.trim();
}

export function deleteLearningOutcome(loId) {
  if (!confirm(_t('confirmDeleteLO'))) return;
  const data = appState.learningOutcomesData;
  const idx = data.outcomes.findIndex(o => o.id === loId);
  const before = _undoSnap();
  const label = idx !== -1 ? _txf('undoDeleteLO', { lo: data.outcomes[idx].number }) : '';
  if (idx !== -1) data.outcomes.splice(idx, 1);
  if (idx !== -1) _undoRecord(label, before);
  renumberLearningOutcomes();
  _persistClusters();
  renderPCSourceList();
  renderLearningOutcomes();
}

export function reassignPCToLO(pcId, clusterNumber, criterionIndex, targetLoId) {
  if (!targetLoId) return;
  const lo = appState.learningOutcomesData;
  const targetLO = lo.outcomes.find(o => o.id === targetLoId);
  if (!targetLO) return;

  const alreadyInTarget = targetLO.linkedCriteria.some(pc => pc.id === pcId && !pc.stale);
  if (!alreadyInTarget) {
    lo.outcomes.forEach(outcome => {
      const idx = outcome.linkedCriteria.findIndex(pc => pc.id === pcId && !pc.stale);
      if (idx !== -1) outcome.linkedCriteria.splice(idx, 1);
    });
    const found = _findEffectiveCriterionById(pcId);
    if (found) {
      targetLO.linkedCriteria.push({
        id: found.id, text: found.text, clusterNumber: found.clusterNumber,
        taskId: found.taskId || null, clusterId: found.clusterId, key: found.key
      });
    }
  }

  renderPCSourceList();
  renderLearningOutcomes();
}

export function unassignPCFromLO(loId, pcId) {
  const lo = appState.learningOutcomesData.outcomes.find(o => o.id === loId);
  if (!lo) return;
  // The ✕ now sends the link's POSITION ("#idx:n"): after renumbering, a
  // ⚠ link can share its old number with a live one, and removing "by
  // number" could take out the wrong criterion. A plain id still works.
  const m = /^#idx:(\d+)$/.exec(String(pcId));
  const idx = m ? parseInt(m[1], 10) : lo.linkedCriteria.findIndex(pc => pc.id === pcId);
  if (idx >= 0 && idx < lo.linkedCriteria.length) {
    const before = _undoSnap();
    const label = _txf('undoUnlinkPC', { pc: lo.linkedCriteria[idx].id, lo: lo.number });
    lo.linkedCriteria.splice(idx, 1);
    _undoRecord(label, before);
  }
  _persistClusters();
  renderPCSourceList();
  renderLearningOutcomes();
}

// ── Module Mapping ────────────────────────────────────────────

export function renderModuleLoList() {
  const container = document.getElementById('moduleLoList');
  _ensureModuleGenOptions();
  _reconcileLearningOutcomes();   // also re-links module copies to live outcomes
  const lo = appState.learningOutcomesData;
  const mm = appState.moduleMappingData;

  if (!lo.outcomes || lo.outcomes.length === 0) {
    container.innerHTML = `<div class="no-tasks-message">${_t('msgNoLOsAvailable')}</div>`;
    document.getElementById('btnCreateModule').disabled = true;
    return;
  }

  const assignedLoIds = new Set();
  mm.modules.forEach(module => module.learningOutcomes.forEach(o => assignedLoIds.add(o.id)));
  const availableLos = lo.outcomes.filter(o => !assignedLoIds.has(o.id));

  if (availableLos.length === 0) {
    container.innerHTML = `<div class="no-tasks-message">${_t('msgAllLOsAssigned')}</div>`;
    document.getElementById('btnCreateModule').disabled = true;
    return;
  }

  let html = '';
  availableLos.forEach(outcome => {
    const criteriaText = outcome.linkedCriteria.map(pc => pc.id).join(', ');
    let moduleOptions = `<option value="">${_t('optSelectModule')}</option>`;
    mm.modules.forEach((m, mi) => { const l = _moduleLevel(m); const tr = m.track && !_refShowsTrack(m) ? ' ' + m.track : ''; moduleOptions += `<option value="${m.id}">${moduleRef(m) || `M${mi + 1}`}${l && getModuleLabelMode() === 'number' ? ` (${_txf('lblLevelShort', { n: l })}${tr})` : ''} — ${m.title}</option>`; });

    html += `
      <div class="module-lo-item">
        <input type="checkbox" id="mlo_${outcome.id}" data-lo-id="${outcome.id}" data-action="update-module-button">
        <div class="module-lo-content">
          <div class="module-lo-number">${outcome.number}</div>
          <div class="module-lo-statement">${outcome.statement || `<em>${_t('msgNoStatementProvided')}</em>`}</div>
          <div class="module-lo-criteria">${_t('lblMappedPCInline')} ${criteriaText}</div>
        </div>
        ${mm.modules.length > 0 ? `
        <div class="task-dropdown-container">
          <span class="task-dropdown-label">${_t('lblAddTo')}</span>
          <select class="task-reassign-dropdown" data-action="add-lo-to-module-dropdown" data-lo-id="${outcome.id}">
            ${moduleOptions}
          </select>
        </div>` : ''}
      </div>`;
  });

  container.innerHTML = html;
  updateCreateModuleButton();
}

export function updateCreateModuleButton() {
  const checkboxes = document.querySelectorAll('#moduleLoList input[type="checkbox"]');
  const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
  document.getElementById('btnCreateModule').disabled = !anyChecked;
}

export function createModule() {
  const mm = appState.moduleMappingData;
  const lo = appState.learningOutcomesData;
  const checkboxes = document.querySelectorAll('#moduleLoList input[type="checkbox"]');
  const selectedLoIds = [];
  checkboxes.forEach(cb => { if (cb.checked) selectedLoIds.push(cb.getAttribute('data-lo-id')); });
  if (selectedLoIds.length === 0) return;

  mm.moduleCounter++;
  const newModule = { id: `module_${mm.moduleCounter}`, title: _tf('lblModuleN', { n: mm.moduleCounter }), learningOutcomes: [] };
  selectedLoIds.forEach(loId => {
    const outcome = lo.outcomes.find(o => o.id === loId);
    if (outcome) newModule.learningOutcomes.push(outcome);
  });
  mm.modules.push(newModule);

  renderModuleLoList();
  renderModules();
}

/* ── Automatic Module Generation: options ───────────────────────────
   Two choices shown inside the existing AI card, read by
   module_mapping_ai.js through getModuleGenOptions():
     • keep existing modules — only outcomes not yet in a module are
       grouped, so hand-built modules are never wiped (default ON as
       soon as any module exists);
     • suggest a level (and specialisation) for each module. */
const _mmGenOpts = { keepExisting: null, assignLevels: true };

export function getModuleGenOptions() {
  const mm = appState.moduleMappingData || {};
  const hasModules = (mm.modules || []).length > 0;
  return {
    keepExisting: _mmGenOpts.keepExisting === null ? hasModules : !!_mmGenOpts.keepExisting,
    // A single-level programme has nothing to distribute.
    assignLevels: !!_mmGenOpts.assignLevels && getModuleLevelCount() > 1,
    levelCount:   getModuleLevelCount(),
  };
}

export function persistModuleMapping() { _persistClusters(); }
/* Persist after the clustering AI changed clusters / criteria. */
export function persistClustering() { _persistClusters(); }

function _ensureModuleGenOptions() {
  const aiBtn = document.getElementById('mmGenAIBtn');
  if (!aiBtn || !aiBtn.parentElement) return;
  const row = aiBtn.parentElement;
  if (!document.getElementById('mmGenOptStyles')) {
    const st = document.createElement('style');
    st.id = 'mmGenOptStyles';
    st.textContent = `
      #mmGenOptions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px;
        margin: 14px auto 0; max-width: 760px; color: #fff; font-size: .9em; }
      #mmGenOptions label { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; text-align: start; }
      #mmGenOptions label, #mmGenOptions label span { color: #fff !important; font-weight: 600; }
      #mmGenOptions input[type=checkbox] { width: 18px; height: 18px; flex-shrink: 0; accent-color: #fff; cursor: pointer; }
      #mmGenOptions .mm-opt-levels { flex-wrap: nowrap; }
      #mmGenOptions .mm-opt-levels-txt { flex: 0 1 auto; min-width: 0; }
      #mmGenOptions input[type=number] { flex: 0 0 auto; }
      #mmGenOptions .mm-opt-note:empty { display: none; }
      #mmGenOptions .mm-opt-levels.mm-disabled { flex-wrap: wrap; }
      #mmGenOptions .mm-opt-levels.mm-disabled .mm-opt-note { flex-basis: 100%; }
      #mmGenOptions input[type=number] { width: 58px; min-height: 0; padding: 4px 6px; border-radius: 6px;
        border: 1px solid rgba(255,255,255,.7); background: rgba(255,255,255,.95); color: #4338ca;
        font-weight: 700; font-size: 1em; text-align: center; }
      #mmGenOptions .mm-opt-note { font-size: .88em; opacity: .85; font-style: italic; }
      #mmGenOptions label.mm-disabled > span:first-of-type { opacity: .6; }
      .mod-rationale { font-size: .86em; color: #6b21a8; font-style: italic; margin: -4px 0 10px; unicode-bidi: plaintext; text-align: start;
        background: rgba(255,255,255,.55); border-radius: 6px; padding: 6px 10px; }
      @media (max-width: 600px) { #mmGenOptions { justify-content: flex-start; } }
    `;
    document.head.appendChild(st);
  }
  let box = document.getElementById('mmGenOptions');
  if (!box) {
    box = document.createElement('div');
    box.id = 'mmGenOptions';
    row.parentNode.insertBefore(box, row.nextSibling);
    box.addEventListener('change', e => {
      if (e.target.id === 'mmOptKeep')   _mmGenOpts.keepExisting = e.target.checked;
      if (e.target.id === 'mmOptLevels') _mmGenOpts.assignLevels = e.target.checked;
      // Same setting as "Number of levels in the programme" above the
      // coverage matrix — one value, two places to change it.
      if (e.target.id === 'mmOptLevelCount') setModuleLevelCount(e.target.value);
    });
    box.innerHTML = `
      <label><input type="checkbox" id="mmOptKeep"> <span class="mm-opt-keep-txt"></span></label>
      <label class="mm-opt-levels"><input type="checkbox" id="mmOptLevels">
        <span class="mm-opt-levels-txt"></span>
        <input type="number" id="mmOptLevelCount" min="1" max="${MAX_LEVELS}" step="1" inputmode="numeric">
        <span class="mm-opt-note"></span></label>`;
  }
  // Updated in place (not rebuilt) so the number field keeps focus
  // while the user steps it up or down.
  const o = getModuleGenOptions();
  const mm = appState.moduleMappingData || {};
  const minLevels = Math.max(1, ...(mm.modules || []).map(m => _moduleLevel(m) || 0));
  const single = o.levelCount <= 1;
  const keep = box.querySelector('#mmOptKeep');
  const lv   = box.querySelector('#mmOptLevels');
  const cnt  = box.querySelector('#mmOptLevelCount');
  keep.checked = o.keepExisting;
  lv.checked = o.assignLevels;
  lv.disabled = single;
  box.querySelector('.mm-opt-levels').classList.toggle('mm-disabled', single);
  if (document.activeElement !== cnt) cnt.value = o.levelCount;
  cnt.min = minLevels;
  box.querySelector('.mm-opt-keep-txt').textContent = _tx('mmOptKeep');
  box.querySelector('.mm-opt-levels-txt').textContent = _tx('mmOptLevels');
  box.querySelector('.mm-opt-note').textContent = single ? _tx('mmOptSingle') : '';
  cnt.title = _tx('covLevelsLabel') !== 'covLevelsLabel' ? _tx('covLevelsLabel') : '';
  // The card's own hint said "Both replace existing modules", which is
  // no longer always true. Taken over here so it follows the options.
  const hint = row.parentNode.querySelector('[data-i18n="aiMMHint"], [data-mm-hint]');
  if (hint) {
    hint.removeAttribute('data-i18n');
    hint.setAttribute('data-mm-hint', '1');
    hint.textContent = _tx('mmHintNew');
  }
}

/* ── Undo / Redo for Learning Outcomes and Module Mapping ───────────
   The toolbar Undo/Redo belongs to the Duties & Tasks history
   (history.js) and does not cover these two tabs. This is a separate,
   self-contained history for the destructive actions here: delete a
   module, delete a learning outcome, remove an outcome from a module,
   unlink a criterion from an outcome. Each step stores the two data
   blocks before and after (JSON), so an undone module returns to its
   place with its level, track and outcomes.

   Safety rules:
   • The history is dropped when the project changes, or when the data
     is replaced from elsewhere (project load, Clear This Tab, import),
     so an undo can never write one project's data into another.
   • If something else changed after the step (e.g. AI generation or
     typing a statement), undo asks first, because going back also
     reverses those later changes. */
const _UNDO_MAX = 30;
const _hist = { undo: [], redo: [], project: null, loRef: null, mmRef: null };

function _activeProjectId() {
  try { return localStorage.getItem('dacum_active_project'); } catch (_) { return null; }
}
function _undoSnap() {
  return JSON.stringify({ lo: appState.learningOutcomesData, mm: appState.moduleMappingData });
}
function _undoValid() {
  if (_hist.project !== _activeProjectId() ||
      _hist.loRef !== appState.learningOutcomesData ||
      _hist.mmRef !== appState.moduleMappingData) {
    _hist.undo = []; _hist.redo = [];
    _hist.project = _activeProjectId();
    _hist.loRef = appState.learningOutcomesData;
    _hist.mmRef = appState.moduleMappingData;
    return false;
  }
  return true;
}
/* Called by the Full Draft run after it rebuilds outcomes or modules.
   The data is replaced in place (same objects), so the reference check
   in _undoValid() would not notice — and undoing a pre-draft step would
   silently rewind the whole draft. Same rule as a project load. */
export function dropLearningHistory() {
  _hist.undo = []; _hist.redo = [];
  _hist.project = _activeProjectId();
  _hist.loRef = appState.learningOutcomesData;
  _hist.mmRef = appState.moduleMappingData;
  try { _hideUndoToast(); } catch (_) {}
  try { _renderUndoBars(); } catch (_) {}
}

function _undoRecord(label, before) {
  _undoValid();
  _hist.undo.push({ label, before, after: _undoSnap() });
  if (_hist.undo.length > _UNDO_MAX) _hist.undo.shift();
  _hist.redo = [];
  _renderUndoBars();
  _showUndoToast(label);
}
function _undoApply(json) {
  const d = JSON.parse(json);
  appState.learningOutcomesData = d.lo;
  appState.moduleMappingData = d.mm;
  _hist.loRef = appState.learningOutcomesData;
  _hist.mmRef = appState.moduleMappingData;
  _persistClusters();
  renderPCSourceList(); renderLearningOutcomes();
  renderModuleLoList(); renderModules();
}
export function undoLearningStep() {
  if (!_undoValid() || !_hist.undo.length) { _renderUndoBars(); return false; }
  const step = _hist.undo[_hist.undo.length - 1];
  if (_undoSnap() !== step.after && !confirm(_tx('undoLaterChanges'))) return false;
  _hist.undo.pop();
  _hist.redo.push({ ...step, after: _undoSnap() });
  _undoApply(step.before);
  _hideUndoToast();
  _renderUndoBars();
  showStatus('↶ ' + _txf('undoDone', { a: step.label }), 'success');
  return true;
}
export function redoLearningStep() {
  if (!_undoValid() || !_hist.redo.length) { _renderUndoBars(); return false; }
  const step = _hist.redo.pop();
  _hist.undo.push({ label: step.label, before: _undoSnap(), after: step.after });
  _undoApply(step.after);
  _renderUndoBars();
  showStatus('↷ ' + _txf('redoDone', { a: step.label }), 'success');
  return true;
}

function _injectUndoStyles() {
  if (document.getElementById('lommUndoStyles')) return;
  const st = document.createElement('style');
  st.id = 'lommUndoStyles';
  st.textContent = `
    .lomm-undo-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 14px; }
    .lomm-undo-bar button {
      display: inline-flex; align-items: center; gap: 6px; min-height: 34px;
      padding: 6px 14px !important; border-radius: 8px; font-size: .88em; font-weight: 600;
      background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; cursor: pointer;
    }
    .lomm-undo-bar button:hover:not(:disabled) { background: #eef2ff; border-color: #a5b4fc; color: #4338ca; }
    .lomm-undo-bar button:disabled { opacity: .45; cursor: not-allowed; }
    .lomm-undo-bar .lomm-undo-last { font-size: .82em; color: #64748b; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    #lommUndoToast {
      position: fixed; z-index: 100001; left: 50%; bottom: 20px; transform: translateX(-50%);
      display: flex; align-items: center; gap: 14px; max-width: calc(100vw - 32px);
      background: #1e293b; color: #fff; padding: 10px 12px 10px 16px; border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,.3); font-size: .92em;
      padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    }
    #lommUndoToast[hidden] { display: none; }
    #lommUndoToast .lomm-toast-msg { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #lommUndoToast button {
      flex-shrink: 0; background: #fbbf24 !important; color: #1e293b !important; border: none;
      border-radius: 7px; padding: 6px 14px !important; font-weight: 800; cursor: pointer; min-height: 0;
    }
  `;
  document.head.appendChild(st);
}

/* The toolbar Undo / Redo buttons are lent to this history while the
   Learning Outcomes or Module Mapping tab is on screen (history.js
   registerHistoryScope). Registered lazily, on first render, so module
   load order can never matter. */
let _scopeRegistered = false;
function _lommTabActive() {
  return ['learning-outcomes-tab', 'module-mapping-tab']
    .some(id => document.getElementById(id)?.classList.contains('active'));
}
function _renderUndoBars() {
  _injectUndoStyles();
  if (!_scopeRegistered) {
    _scopeRegistered = true;
    try {
      registerHistoryScope({
        isActive:  _lommTabActive,
        canUndo:   () => { _undoValid(); return _hist.undo.length > 0; },
        canRedo:   () => { _undoValid(); return _hist.redo.length > 0; },
        undoLabel: () => (_hist.undo[_hist.undo.length - 1] || {}).label || '',
        redoLabel: () => (_hist.redo[_hist.redo.length - 1] || {}).label || '',
        undo:      () => undoLearningStep(),
        redo:      () => redoLearningStep(),
      });
    } catch (e) { console.warn('[modules] undo scope not registered:', e); }
  }
  // Older builds drew an Undo/Redo bar inside the two tabs; the toolbar
  // buttons do that job now.
  document.querySelectorAll('.lomm-undo-bar').forEach(b => b.remove());
  try { refreshHistoryButtons(); } catch (_) {}
}

let _toastTimer = null;
function _showUndoToast(label) {
  _injectUndoStyles();
  let t = document.getElementById('lommUndoToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'lommUndoToast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
    t.addEventListener('click', e => { if (e.target.closest('button')) undoLearningStep(); });
  }
  t.innerHTML = `<span class="lomm-toast-msg">${_esc(label)}</span><button type="button">↶ ${_esc(_tx('undoBtn'))}</button>`;
  t.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(_hideUndoToast, 7000);
}
function _hideUndoToast() {
  clearTimeout(_toastTimer);
  const t = document.getElementById('lommUndoToast');
  if (t) t.hidden = true;
}

/* Module cards — lighter violet look (scoped to the modules list). */
function _injectModuleCardStyles() {
  if (document.getElementById('moduleCardStyles')) return;
  const st = document.createElement('style');
  st.id = 'moduleCardStyles';
  st.textContent = `
    #modulesContainer .module-item {
      background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
      border: 2px solid #c4b5fd; border-radius: 14px; padding: 18px;
      box-shadow: 0 2px 10px rgba(124,58,237,.06);
    }
    #modulesContainer .module-header {
      border-bottom: none; padding-bottom: 0; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;
    }
    #modulesContainer .module-title { color: #6d28d9; font-weight: 700; font-size: 1.15em; }
    #modulesContainer .module-actions { flex-wrap: wrap; gap: 8px; }
    #modulesContainer .btn-rename-module { background: #8b5cf6; padding: 7px 14px; font-size: .88em; }
    #modulesContainer .btn-delete-module { background: #ef4444; padding: 7px 14px; font-size: .88em; }
    #modulesContainer .module-lo-assigned {
      background: #fff; border: 1px solid #ede9fe; border-radius: 8px; align-items: center; gap: 10px;
    }
    #modulesContainer .module-lo-assigned-number { color: #6d28d9; }
    #modulesContainer .btn-remove-lo {
      background: #fee2e2; color: #991b1b; border-radius: 8px; padding: 6px 12px; flex-shrink: 0;
    }
    #modulesContainer .btn-remove-lo:hover { background: #fecaca; }
    #modulesContainer .mod-level-select, #modulesContainer .mod-track-input { border-color: #ddd6fe; }
    /* Label and field on ONE line. The app's base style gives every text
       input width:100%, which pushed "Specialisation" above its field. */
    #modulesContainer .mod-meta-field { flex-wrap: nowrap; }
    #modulesContainer .mod-meta-field > span { white-space: nowrap; flex-shrink: 0; }
    #modulesContainer .mod-meta-field .mod-track-input {
      width: 110px !important; max-width: 100%; min-width: 0; flex: 0 1 110px;
      display: inline-block !important; margin: 0 !important;
    }
    #modulesContainer .mod-meta-field .mod-code-input, #modulesContainer .mod-meta-field .mod-short-input {
      width: 110px !important; max-width: 100%; min-width: 0; flex: 0 1 110px;
      display: inline-block !important; margin: 0 !important; border-color: #ddd6fe;
    }
    /* 3.34.1: level, track, code and short name on ONE line on desktop. */
    #modulesContainer .mod-meta-row { gap: 8px 14px; }
    #modulesContainer .mod-meta-field { gap: 6px; }
    #modulesContainer .mod-meta-field input, #modulesContainer .mod-meta-field select { padding: 6px 8px; }
    #modulesContainer .mod-level-select { width: auto !important; max-width: 120px; }
    #modulesContainer .mod-code-input { font-weight: 700; color: #4338ca; }
    #modulesContainer .mod-auto-chip { font-style: normal; font-size: .78em; font-weight: 700; padding: 1px 7px;
      border-radius: 999px; background: #e0e7ff; color: #3730a3; margin-inline-start: 4px; }
    #modulesContainer .mod-code-reset {
      box-sizing: border-box; flex: 0 0 auto; width: 30px; height: 30px; min-width: 30px; max-width: 30px;
      min-height: 30px; max-height: 30px; padding: 0 !important; margin: 0; border-radius: 8px;
      border: 1px solid #ddd6fe; background: #fff; color: #6d28d9; cursor: pointer; font-size: 15px; line-height: 1;
      display: inline-flex; align-items: center; justify-content: center;
    }
    #modulesContainer .mod-ref { color: #4338ca; }
    #modulesContainer .mod-code-dup { margin: -6px 0 10px; font-size: .85em; font-weight: 600; color: #b45309; }
    @media (max-width: 600px) {
      #modulesContainer .mod-meta-field .mod-track-input,
      #modulesContainer .mod-meta-field .mod-code-input,
      #modulesContainer .mod-meta-field .mod-short-input { width: auto !important; flex: 1 1 auto; }
    }
  `;
  document.head.appendChild(st);
}


/* ── Design guidelines: grouping criteria into outcomes, and levels ──
   Two "?" buttons, each at the far end of a section heading (the same
   .tab-help-btn used by the tab titles):
     • Learning Outcomes → "Performance Criteria (Source)": how to turn
       performance criteria into learning outcomes;
     • Module Mapping → "Modules": how to build modules and place them
       on levels.
   Content is local (en / fr / ar) and rebuilt on every open, so it
   always follows the interface language. Guidance, not rules the tool
   enforces — the designer decides. */
const _GUIDE = {
  en: {
    loTip: 'Guidelines: grouping performance criteria into learning outcomes',
    mmTip: 'Guidelines: building modules and assigning levels',
    close: 'Got it',
    lo: {
      title: 'Grouping performance criteria into learning outcomes',
      intro: 'A learning outcome states what the learner will be able to do. It links one or more performance criteria. Both one-to-one and grouping are valid — a simple test decides which.',
      sections: [
        { h: '✅ Keep a criterion as its own outcome when…', items: [
          'it is a complete performance that can be taught and assessed on its own, with its own practical task — e.g. "Use hand tools according to manufacturer’s specifications".' ] },
        { h: '🔗 Group 2–3 criteria into one outcome when any of these is true', items: [
          '<strong>Consecutive steps of one performance</strong> — the second does not happen without the first (diagnose a fault, then rectify it).',
          '<strong>Assessed in one practical task</strong> — the learner performs them together in one situation (calculating costs includes the measurements and calculations).',
          '<strong>One is too small to stand alone</strong> — it does not fill enough learning time, so it joins the nearest related criterion.' ] },
        { h: '📏 Limits', items: [
          'Usually 2–3 criteria per outcome; 4–5 only when they are genuinely performed and assessed together. Above 5, an outcome is too broad to assess as one capability.',
          'A module usually holds 2–4 outcomes (see the Module Mapping guidelines).',
          'Do not group criteria that belong to different levels of the programme.' ] },
        { h: '🧩 Grouping across competencies', items: [
          'Allowed — not forbidden — when the criteria form one real, integrated performance assessed in a single task (e.g. installing wiring together with applying safe working practices). This is <em>integrated assessment</em>, used by several frameworks.',
          'Be cautious where certification or recognition of prior learning (RPL) is granted per competency: grouping makes each competency harder to trace and assess separately.',
          'It is a design decision that depends on the national accreditation system and the designer’s experience.' ] },
        { h: '⚖️ Choosing the approach', items: [
          '<strong>One-to-one</strong> suits standards whose criteria are already broad (each one close to a complete performance): clear traceability and consistency with the source curriculum. Its weakness: the outcome becomes a rewording of the criterion, and many small outcomes make thin modules.',
          '<strong>Mixed (generally the best)</strong>: keep large stand-alone criteria as their own outcomes; group small or consecutive ones (2–3); the grouped criteria then serve as the assessment criteria under the outcome.' ] },
        { h: '✍️ Writing the statement', items: [
          'Start with one observable action verb: Install, Use, Diagnose, Calculate, Apply…',
          'Avoid verbs that cannot be assessed: understand, know, be aware of.',
          'Keep the standard or condition that makes it assessable ("according to manufacturer’s specifications").' ] },
        { h: '🖱️ In this tab', items: [
          'Tick one criterion and press Create LO for a one-to-one outcome; tick several to group them into one.',
          '"Hide used criteria" shortens the list as you work; in the outcome cards, Enter moves to the next outcome.' ] }
      ]
    },
    mm: {
      title: 'Building modules and assigning levels',
      intro: 'A module groups the learning outcomes that are taught and assessed together. It has a level and, where the programme specialises, a specialisation.',
      sections: [
        { h: '📦 Module size', items: [
          'Usually 2–4 learning outcomes per module.',
          'A single-outcome module is acceptable only when that outcome is a large, stand-alone capability.' ] },
        { h: '🪜 Rules for placing a module on a level', items: [
          '<strong>Prerequisite first</strong> — what other modules build on goes at a lower level (hand tools at Level 1 → power tools at Level 2).',
          '<strong>Complexity, autonomy and responsibility</strong> — routine work under supervision belongs lower; diagnosis, planning, decision-making, financial responsibility and supervising others belong higher.',
          '<strong>Perform → check → diagnose</strong> — carrying out a task comes before testing and documenting it, which comes before diagnosing and rectifying faults.',
          '<strong>Specialisation at the top</strong> — lower levels are common to all learners; the programme splits into tracks only at the highest level(s).',
          '<strong>Spiral is allowed</strong> — the same theme (hardware, safety, finance…) may recur at several levels with increasing difficulty.',
          '<strong>Balance</strong> — every level should receive modules.' ] },
        { h: '🤔 When two modules seem to fit the same level', items: [
          'Ask: does it need another module before it? Is it done under supervision, or decided by the worker?',
          'Evidence from Task Verification helps: easier, more frequent tasks lower; harder, rarer ones higher.',
          'If it is still unclear, it is the expert’s judgement — confirmed by the review panel.' ] },
        { h: '📚 Reference', items: [
          'The level descriptors of the national qualifications framework (knowledge, skills, autonomy and responsibility) are the authority.',
          'The number of levels comes from that framework, not from the content — set it in the module-generation card or above the coverage matrix.' ] },
        { h: '🏷️ Specialisation field', items: [
          'Use a short code: e.g. the programme code for modules common to all tracks (CMCN), and a track code at the top level (CM, CN).',
          'Leave it empty for a programme with a single track.' ] },
        { h: '📊 Check the result', items: [
          'Open the coverage matrix at the end of the tab: "Not taught" criteria are gaps; a criterion "In N modules" is taught at several levels — informative, not an error.' ] }
      ]
    }
  },
  fr: {
    loTip: 'Recommandations : regrouper les critères de performance en résultats d’apprentissage',
    mmTip: 'Recommandations : construire les modules et attribuer les niveaux',
    close: 'Compris',
    lo: {
      title: 'Regrouper les critères de performance en résultats d’apprentissage',
      intro: 'Un résultat d’apprentissage énonce ce que l’apprenant sera capable de faire. Il est lié à un ou plusieurs critères de performance. La correspondance un-à-un et le regroupement sont tous deux valables — un test simple permet de choisir.',
      sections: [
        { h: '✅ Garder un critère comme résultat à part entière quand…', items: [
          'il s’agit d’une performance complète, enseignable et évaluable seule, avec sa propre tâche pratique — p. ex. « Utiliser les outils à main selon les spécifications du fabricant ».' ] },
        { h: '🔗 Regrouper 2 à 3 critères en un seul résultat si l’une de ces conditions est remplie', items: [
          '<strong>Étapes successives d’une même performance</strong> — la seconde n’a pas lieu sans la première (diagnostiquer une panne, puis la réparer).',
          '<strong>Évalués dans une seule tâche pratique</strong> — l’apprenant les réalise ensemble dans une même situation (le calcul des coûts inclut les mesures et calculs).',
          '<strong>L’un est trop petit pour tenir seul</strong> — il ne remplit pas assez de temps d’apprentissage et rejoint le critère le plus proche.' ] },
        { h: '📏 Limites', items: [
          'En général 2 à 3 critères par résultat ; 4 à 5 seulement s’ils sont réellement réalisés et évalués ensemble. Au-delà de 5, le résultat est trop large pour être évalué comme une seule capacité.',
          'Un module compte en général 2 à 4 résultats (voir les recommandations de Module Mapping).',
          'Ne pas regrouper des critères relevant de niveaux différents du programme.' ] },
        { h: '🧩 Regroupement entre compétences', items: [
          'Permis — et non interdit — lorsque les critères forment une performance intégrée réelle, évaluée dans une seule tâche (p. ex. poser un câblage en appliquant les pratiques de travail sûres). C’est l’<em>évaluation intégrée</em>, utilisée par plusieurs cadres.',
          'Prudence là où la certification ou la reconnaissance des acquis (RPL) se fait par compétence : le regroupement rend chaque compétence plus difficile à suivre et à évaluer séparément.',
          'C’est un choix de conception qui dépend du système national d’accréditation et de l’expérience du concepteur.' ] },
        { h: '⚖️ Choisir l’approche', items: [
          '<strong>Un-à-un</strong> convient aux référentiels dont les critères sont déjà larges (chacun proche d’une performance complète) : traçabilité claire et cohérence avec le programme source. Sa faiblesse : le résultat reformule le critère, et de nombreux petits résultats donnent des modules minces.',
          '<strong>Mixte (en général le meilleur)</strong> : garder seuls les grands critères autonomes ; regrouper les petits ou successifs (2 à 3) ; les critères regroupés deviennent alors les critères d’évaluation du résultat.' ] },
        { h: '✍️ Rédiger l’énoncé', items: [
          'Commencer par un verbe d’action observable : Installer, Utiliser, Diagnostiquer, Calculer, Appliquer…',
          'Éviter les verbes non évaluables : comprendre, connaître, être conscient de.',
          'Conserver la norme ou la condition qui le rend évaluable (« selon les spécifications du fabricant »).' ] },
        { h: '🖱️ Dans cet onglet', items: [
          'Cochez un critère puis « Create LO » pour un résultat un-à-un ; cochez-en plusieurs pour les regrouper.',
          '« Masquer les critères utilisés » raccourcit la liste ; dans les cartes, Entrée passe au résultat suivant.' ] }
      ]
    },
    mm: {
      title: 'Construire les modules et attribuer les niveaux',
      intro: 'Un module regroupe les résultats d’apprentissage enseignés et évalués ensemble. Il a un niveau et, si le programme se spécialise, une spécialisation.',
      sections: [
        { h: '📦 Taille du module', items: [
          'En général 2 à 4 résultats par module.',
          'Un module à un seul résultat n’est acceptable que si ce résultat est une capacité large et autonome.' ] },
        { h: '🪜 Règles pour placer un module sur un niveau', items: [
          '<strong>Le prérequis d’abord</strong> — ce sur quoi d’autres modules s’appuient va à un niveau inférieur (outils à main au niveau 1 → outils électriques au niveau 2).',
          '<strong>Complexité, autonomie et responsabilité</strong> — le travail routinier sous supervision va plus bas ; diagnostic, planification, décision, responsabilité financière et encadrement vont plus haut.',
          '<strong>Exécuter → vérifier → diagnostiquer</strong> — réaliser une tâche précède sa vérification et sa documentation, qui précèdent le diagnostic et la réparation des pannes.',
          '<strong>La spécialisation en haut</strong> — les niveaux inférieurs sont communs ; le programme se divise en filières seulement au(x) niveau(x) le(s) plus élevé(s).',
          '<strong>La spirale est permise</strong> — un même thème (matériel, sécurité, finances…) peut revenir à plusieurs niveaux avec une difficulté croissante.',
          '<strong>Équilibre</strong> — chaque niveau doit recevoir des modules.' ] },
        { h: '🤔 Quand deux modules semblent aller au même niveau', items: [
          'Se demander : a-t-il besoin d’un autre module avant lui ? Est-il réalisé sous supervision, ou décidé par le travailleur ?',
          'Les données de la vérification des tâches aident : tâches plus faciles et fréquentes plus bas ; plus difficiles et rares plus haut.',
          'Si le doute subsiste, c’est le jugement de l’expert — confirmé par le comité de validation.' ] },
        { h: '📚 Référence', items: [
          'Les descripteurs de niveaux du cadre national des certifications (savoirs, aptitudes, autonomie et responsabilité) font autorité.',
          'Le nombre de niveaux vient de ce cadre, pas du contenu — réglez-le dans la carte de génération des modules ou au-dessus de la matrice de couverture.' ] },
        { h: '🏷️ Champ Spécialisation', items: [
          'Utiliser un code court : p. ex. le code du programme pour les modules communs (CMCN), et un code de filière au niveau supérieur (CM, CN).',
          'Le laisser vide pour un programme à filière unique.' ] },
        { h: '📊 Vérifier le résultat', items: [
          'Ouvrez la matrice de couverture en bas de l’onglet : les critères « Non enseigné » sont des lacunes ; un critère « dans N modules » est enseigné à plusieurs niveaux — information, pas une erreur.' ] }
      ]
    }
  },
  ar: {
    loTip: 'إرشادات: تجميع معايير الأداء في محصلات تعلم',
    mmTip: 'إرشادات: بناء الوحدات وتحديد المستويات',
    close: 'فهمت',
    lo: {
      title: 'تجميع معايير الأداء في محصلات تعلم',
      intro: 'محصلة التعلم تصف ما سيستطيع المتدرب فعله، وترتبط بمعيار أداء واحد أو أكثر. جعل كل معيار محصلة، ودمج المعايير، كلاهما صحيح، والقرار يرجع لاختبار بسيط.',
      sections: [
        { h: '✅ يبقى المعيار محصلة مستقلة إذا…', items: [
          'كان أداءً كاملاً يمكن تدريسه وتقييمه وحده بمهمة عملية خاصة به، مثل: «استخدام العدد اليدوية حسب مواصفات المصنّع».' ] },
        { h: '🔗 يُدمج معياران أو ثلاثة في محصلة واحدة إذا تحقق أحد هذه الشروط', items: [
          '<strong>خطوتان من أداء واحد:</strong> الثانية لا تحدث دون الأولى، مثل تشخيص العطل ثم إصلاحه.',
          '<strong>يُقيَّمان في مهمة عملية واحدة:</strong> يؤديهما المتدرب معاً في موقف واحد، مثل حساب التكاليف الذي يتضمن القياسات والحسابات.',
          '<strong>أحدهما صغير لا يكفي وحده:</strong> لا يملأ وقت تعلّم كافياً، فيُضم إلى أقرب معيار له.' ] },
        { h: '📏 الحدود', items: [
          'المعتاد معياران أو ثلاثة في المحصلة، ويمكن الوصول إلى 4 أو 5 إذا كانت تُؤدّى وتُقيَّم معاً فعلاً. فوق 5 معايير تصبح المحصلة أوسع من أن تُقيَّم كقدرة واحدة.',
          'تضم الوحدة عادةً من محصلتين إلى أربع (انظر إرشادات تبويب Module Mapping).',
          'لا تُدمج معايير مكانها في مستويين مختلفين من البرنامج.' ] },
        { h: '🧩 الدمج بين كفاءتين مختلفتين', items: [
          'جائز وليس محظوراً، حين تشكّل المعايير أداءً واحداً متكاملاً حقيقياً يُقيَّم بمهمة واحدة، مثل «تركيب الأسلاك» مع «تطبيق ممارسات العمل الآمن». وهذا ما يُسمّى <em>التقييم المتكامل</em>، وتعتمده عدة أطر.',
          'الحذر واجب حيث تُمنح الشهادة أو الاعتراف بالتعلم السابق (RPL) لكل كفاءة على حدة، لأن الدمج يصعّب تتبّع كل كفاءة وتقييمها منفصلة.',
          'هو قرار تصميم يعتمد على نظام الاعتماد في البلد وعلى خبرة المصمم.' ] },
        { h: '⚖️ اختيار الأسلوب', items: [
          '<strong>محصلة لكل معيار:</strong> يناسب المعايير المهنية التي معاييرها واسعة أصلاً، أي كل معيار قريب من أداء كامل. ميزته وضوح التتبّع والاتساق مع المنهج المرجعي. وضعفه أن المحصلة تصير إعادة صياغة للمعيار، وأن كثرة المحصلات الصغيرة تُضعف بنية الوحدات.',
          '<strong>المزج (الأفضل عموماً):</strong> يبقى المعيار الكبير المستقل محصلة وحده، وتُدمج المعايير الصغيرة أو المتتابعة (2–3)، وتصير المعايير المدموجة معايير تقييم تحت المحصلة.' ] },
        { h: '✍️ كتابة نص المحصلة', items: [
          'ابدأ بفعل أداء واحد قابل للملاحظة: ركّب، استخدم، شخّص، احسب، طبّق…',
          'تجنّب أفعالاً لا تُقيَّم: يفهم، يعرف، يدرك.',
          'أبقِ المعيار أو الشرط الذي يجعلها قابلة للتقييم، مثل «حسب مواصفات المصنّع».' ] },
        { h: '🖱️ في هذا التبويب', items: [
          'ضع علامة على معيار واحد ثم اضغط Create LO لمحصلة مستقلة، أو على عدة معايير لدمجها في محصلة واحدة.',
          'خيار «إخفاء المعايير المستخدمة» يقصّر القائمة أثناء العمل، وفي بطاقات المحصلات ينقلك Enter إلى المحصلة التالية.' ] }
      ]
    },
    mm: {
      title: 'بناء الوحدات وتحديد المستويات',
      intro: 'الوحدة تجمع محصلات التعلم التي تُدرَّس وتُقيَّم معاً، ولها مستوى، وتخصص إذا كان البرنامج يتفرّع.',
      sections: [
        { h: '📦 حجم الوحدة', items: [
          'المعتاد من محصلتين إلى أربع في الوحدة.',
          'الوحدة ذات المحصلة الواحدة مقبولة فقط إذا كانت المحصلة قدرة كبيرة مستقلة.' ] },
        { h: '🪜 قواعد وضع الوحدة في مستوى', items: [
          '<strong>المتطلب السابق أولاً:</strong> ما تُبنى عليه وحدات أخرى يوضع في مستوى أدنى، مثل العدد اليدوية في المستوى 1 ثم الكهربائية في المستوى 2.',
          '<strong>التعقيد والاستقلالية والمسؤولية:</strong> العمل الروتيني تحت الإشراف في المستويات الأدنى، والتشخيص والتخطيط واتخاذ القرار والمسؤولية المالية والإشراف على الآخرين في المستويات الأعلى.',
          '<strong>التنفيذ ثم التحقق ثم التشخيص:</strong> أداء المهمة يسبق فحصها وتوثيقها، وهذا يسبق تشخيص الأعطال وإصلاحها.',
          '<strong>التخصص في المستوى الأعلى:</strong> المستويات الأدنى مشتركة لكل المتدربين، ويتفرّع البرنامج إلى مسارات في المستوى أو المستويات العليا فقط.',
          '<strong>التكرار المتدرّج مسموح:</strong> يمكن أن يتكرر المحور نفسه (العتاد، السلامة، المالية…) في عدة مستويات بصعوبة متزايدة.',
          '<strong>التوازن:</strong> ينبغي أن يحصل كل مستوى على وحدات.' ] },
        { h: '🤔 حين تبدو وحدتان مناسبتين للمستوى نفسه', items: [
          'اسأل: هل تحتاج وحدة أخرى قبلها؟ وهل يُنفَّذ العمل تحت إشراف، أم يقرّره العامل بنفسه؟',
          'بيانات التحقق من المهام تساعد: المهام الأسهل والأكثر تكراراً في المستويات الأدنى، والأصعب والأقل تكراراً في الأعلى.',
          'إن بقي التردد، فالحسم لاجتهاد الخبير، وتصادق عليه لجنة المراجعة.' ] },
        { h: '📚 المرجع', items: [
          'واصفات المستويات في الإطار الوطني للمؤهلات (المعرفة، المهارة، الاستقلالية والمسؤولية) هي المرجع.',
          'عدد المستويات يحدده ذلك الإطار لا المحتوى، ويُضبط من بطاقة توليد الوحدات أو أعلى مصفوفة التغطية.' ] },
        { h: '🏷️ خانة التخصص', items: [
          'استخدم رمزاً قصيراً: رمز البرنامج للوحدات المشتركة بين المسارات (مثل CMCN)، ورمز المسار في المستوى الأعلى (مثل CM أو CN).',
          'اتركها فارغة إذا كان البرنامج مساراً واحداً.' ] },
        { h: '📊 تحقّق من النتيجة', items: [
          'افتح مصفوفة التغطية في آخر التبويب: المعايير «غير المُدرَّسة» فجوات، والمعيار «في N وحدات» يُدرَّس في عدة مستويات، وهذه معلومة لا خطأ.' ] }
      ]
    }
  }
};

function _guideText() {
  const lang = (window.i18n && window.i18n.getLang) ? window.i18n.getLang() : 'en';
  return _GUIDE[lang] || _GUIDE.en;
}

function _showGuideModal(kind) {
  const id = 'lommGuideModal';
  const existing = document.getElementById(id);
  if (existing) { existing.remove(); return; }
  const G = _guideText();
  const g = G[kind];
  if (!g) return;
  const rtl = !!(window.i18n && ((window.i18n.isRTL && window.i18n.isRTL()) ||
                 (window.i18n.getLang && window.i18n.getLang() === 'ar')));
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', g.title);
  overlay.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);';
  // Content is our own constant HTML (strong/em only) — no user text.
  const sections = g.sections.map(sec => `
    <div style="margin:0 0 14px;">
      <p style="margin:0 0 6px;font-size:.9em;font-weight:800;color:#1e293b;">${sec.h}</p>
      <ul style="margin:0;padding-inline-start:20px;">
        ${sec.items.map(it => `<li style="font-size:.86em;line-height:1.65;color:#334155;margin-bottom:4px;">${it}</li>`).join('')}
      </ul>
    </div>`).join('');
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;max-width:620px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.35);font-family:inherit;text-align:start;">
      <div style="padding:18px 22px 14px;display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#eef2ff,#e0e7ff);border-bottom:1px solid #c7d2fe;flex-shrink:0;">
        <span style="font-size:1.6em;line-height:1;">${kind === 'lo' ? '🎯' : '🪜'}</span>
        <p style="margin:0;font-size:1em;font-weight:800;color:#3730a3;">${_esc(g.title)}</p>
      </div>
      <div style="padding:16px 22px 18px;overflow-y:auto;">
        <p style="margin:0 0 14px;font-size:.88em;line-height:1.65;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">${_esc(g.intro)}</p>
        ${sections}
        <div style="display:flex;justify-content:flex-end;margin-top:6px;">
          <button type="button" data-guide-close style="padding:9px 22px !important;background:#667eea;color:#fff;border:none;border-radius:8px;font-size:.9em;font-weight:700;cursor:pointer;">${_esc(G.close)}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-guide-close]')) close(); });
  const btn = overlay.querySelector('[data-guide-close]');
  if (btn) btn.focus({ preventScroll: true });
}

/* Wrap a section heading in .section-header-row (title at one end, the
   button at the other — the existing component class), once. */
function _ensureGuideButton(h3, kind) {
  if (!h3) return;
  const G = _guideText();
  let btn = h3.parentNode && h3.parentNode.querySelector(`:scope > .lomm-guide-btn[data-guide="${kind}"]`);
  if (!btn) {
    const row = document.createElement('div');
    row.className = 'section-header-row lomm-guide-row';
    h3.parentNode.insertBefore(row, h3);
    row.appendChild(h3);
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-help-btn lomm-guide-btn';
    btn.setAttribute('data-guide', kind);
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.textContent = '?';
    row.appendChild(btn);
  }
  const tip = kind === 'lo' ? G.loTip : G.mmTip;
  btn.title = tip;
  btn.setAttribute('aria-label', tip);
}

function _ensureGuideButtons() {
  const pcHead = document.querySelector('#learning-outcomes-tab h3 [data-i18n="lblPCSource"]')
              || document.querySelector('h3 [data-i18n="lblPCSource"]');
  _ensureGuideButton(pcHead && pcHead.closest('h3'), 'lo');
  const modCont = document.getElementById('modulesContainer');
  const modSec = modCont && modCont.closest('.clustering-section');
  const modHead = modSec && modSec.querySelector(':scope > h3, :scope > .lomm-guide-row > h3');
  _ensureGuideButton(modHead, 'mm');
  if (!document.__lommGuideWired) {
    document.__lommGuideWired = true;
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('.lomm-guide-btn');
      if (b) _showGuideModal(b.getAttribute('data-guide'));
    });
  }
}

/* "Number of levels in the programme" at the top of the Modules section,
   centred — the same setting as the field above the coverage matrix and
   the one in the AI card (all three call setModuleLevelCount, which
   re-renders the others). Here so a designer who builds modules by hand
   never has to scroll to the matrix to set it. Updated in place so the
   field keeps focus while stepping the number. */
function _ensureModulesLevelBar() {
  const cont = document.getElementById('modulesContainer');
  if (!cont || !cont.parentNode) return;
  let bar = document.getElementById('modulesLevelBar');
  if (!bar) {
    if (!document.getElementById('modulesLevelBarStyles')) {
      const st = document.createElement('style');
      st.id = 'modulesLevelBarStyles';
      st.textContent = `
        #modulesLevelBar { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 0 0 16px; }
        #modulesLevelBar select {
          margin: 0 !important; width: auto !important; max-width: 100%; min-width: 0; padding: 6px 8px;
          border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; font: inherit; font-weight: 700; color: #4338ca;
        }
        /* Inside the "Modules" heading row: title | field | ?  on ONE line,
           the field centred between them. */
        .lomm-guide-row.mlb-row {
          display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
        }
        .lomm-guide-row.mlb-row > h3 { justify-self: start; }
        .lomm-guide-row.mlb-row > .lomm-guide-btn { justify-self: end; }
        .lomm-guide-row.mlb-row > #modulesLevelBar { margin: 0; }
        #modulesLevelBar label {
          display: inline-flex; align-items: center; gap: 10px; flex-wrap: nowrap;
          padding: 4px 6px 4px 14px; border-radius: 10px; background: #f5f3ff; border: 1px solid #ddd6fe;
          font-size: .88em; font-weight: 600; color: #475569; cursor: default;
        }
        html[dir="rtl"] #modulesLevelBar label { padding: 4px 14px 4px 6px; }
        #modulesLevelBar label > span { white-space: nowrap; }
        #modulesLevelBar input[type=number] {
          width: 64px !important; min-width: 0; margin: 0 !important; display: inline-block !important;
          padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;
          font: inherit; font-weight: 700; color: #4338ca; text-align: center;
        }
        /* Phones: no room for three on a line — title and ? stay together,
           the field takes the full width just under them. */
        @media (max-width: 600px) {
          .lomm-guide-row.mlb-row { grid-template-columns: 1fr auto; row-gap: 10px; }
          .lomm-guide-row.mlb-row > #modulesLevelBar { grid-column: 1 / -1; grid-row: 2; }
          #modulesLevelBar label { width: 100%; justify-content: space-between; }
          #modulesLevelBar label > span { white-space: normal; }
        }`;
      document.head.appendChild(st);
    }
    bar = document.createElement('div');
    bar.id = 'modulesLevelBar';
    bar.innerHTML = '<label><span class="mlb-text"></span><input type="number" id="modulesLevelCount" step="1" inputmode="numeric"></label>'
      + '<label><span class="mlb-mode-text"></span><select id="modulesLabelMode"></select></label>';
    bar.addEventListener('change', e => {
      if (e.target.id === 'modulesLevelCount') {
        const v = setModuleLevelCount(e.target.value);
        e.target.value = v;   // clamped (never below the highest level in use)
      }
    });
  }
  // Place it in the heading row, between "Modules" and its "?" button;
  // fall back to just above the list if that row is not there.
  const guideBtn = document.querySelector('.lomm-guide-btn[data-guide="mm"]');
  const row = guideBtn && guideBtn.parentNode;
  if (row && row.classList.contains('lomm-guide-row')) {
    row.classList.add('mlb-row');
    if (bar.nextSibling !== guideBtn || bar.parentNode !== row) row.insertBefore(bar, guideBtn);
  } else if (bar.parentNode !== cont.parentNode) {
    cont.parentNode.insertBefore(bar, cont);
  }
  const mm = appState.moduleMappingData || {};
  const minLevels = Math.max(1, ...(mm.modules || []).map(m => _moduleLevel(m) || 0));
  const input = bar.querySelector('#modulesLevelCount');
  input.min = minLevels;
  input.max = MAX_LEVELS;
  if (document.activeElement !== input) input.value = getModuleLevelCount();
  bar.querySelector('.mlb-text').textContent = _tx('lblLevelCount');
  input.setAttribute('aria-label', _tx('lblLevelCount'));
  const modeSel = bar.querySelector('#modulesLabelMode');
  if (modeSel) {
    const mode = getModuleLabelMode();
    modeSel.innerHTML = [['code', 'optLabelCode'], ['number', 'optLabelNumber'], ['both', 'optLabelBoth']]
      .map(([v, k]) => `<option value="${v}" ${v === mode ? 'selected' : ''}>${_esc(_tx(k))}</option>`).join('');
    bar.querySelector('.mlb-mode-text').textContent = _tx('lblLabelMode');
    modeSel.setAttribute('aria-label', _tx('lblLabelMode'));
  }
}

export function renderModules() {
  const container = document.getElementById('modulesContainer');
  _refreshModuleOutcomes();
  _ensureModuleGenOptions();
  _injectModuleCardStyles();
  _renderUndoBars();
  _ensureGuideButtons();
  _ensureModulesLevelBar();
  const mm = appState.moduleMappingData;

  if (mm.modules.length === 0) {
    container.innerHTML = `<div class="no-clusters-message">${_t('msgNoModules')}</div>`;
    renderCoverageMatrix();
    return;
  }

  const levelCount = getModuleLevelCount();
  const card = (module, moduleIndex) => {
    const { sourceTaskIds } = _collectModuleTaskAnalysis(module);
    const lvl = _moduleLevel(module);
    const levelOpts = [`<option value="">${_esc(_tx('optNoLevel'))}</option>`]
      .concat(Array.from({ length: levelCount }, (_, i) =>
        `<option value="${i + 1}" ${lvl === i + 1 ? 'selected' : ''}>${_esc(_txf('lblLevelN', { n: i + 1 }))}</option>`))
      .join('');
    return `
      <div class="module-item">
        <div class="module-header">
          <div class="module-title"><bdi class="mod-ref">${_esc(moduleRef(module) || `M${moduleIndex + 1}`)}</bdi> — ${module.title}
            ${lvl ? `<span class="mod-level-chip">${_esc(_txf('lblLevelShort', { n: lvl }))}</span>` : ''}
            ${module.track && !_refShowsTrack(module) ? `<span class="mod-track-chip">${_esc(module.track)}</span>` : ''}
          </div>
          <div class="module-actions">
            <button class="btn-rename-module" data-action="build-module-in-builder" data-module-id="${module.id}"
                    title="${_t('ttBuildThisModule')}">🚀 ${_t('btnBuildThisModule')}</button>
            <button class="btn-rename-module" data-action="rename-module" data-module-id="${module.id}">✏️ ${_t('btnRename')}</button>
            <button class="btn-delete-module" data-action="delete-module" data-module-id="${module.id}">🗑️ ${_t('btnDeleteModule')}</button>
          </div>
        </div>
        ${module.rationale ? `<div class="mod-rationale">💡 ${_esc(module.rationale)}</div>` : ''}
        <div class="mod-meta-row">
          <label class="mod-meta-field"><span>${_esc(_tx('lblModuleLevel'))}</span>
            <select class="mod-level-select" data-module-id="${_esc(module.id)}">${levelOpts}</select>
          </label>
          <label class="mod-meta-field"><span>${_esc(_tx('lblModuleTrack'))}</span>
            <input type="text" class="mod-track-input" data-module-id="${_esc(module.id)}"
              value="${_esc(module.track || '')}" maxlength="40" placeholder="${_esc(getModuleCodePrefix({}))}">
          </label>
          <label class="mod-meta-field mod-code-field"><span>${_esc(_tx('lblModuleCode'))}${isModuleCodeManual(module) ? '' : ` <em class="mod-auto-chip">${_esc(_tx('lblCodeAuto'))}</em>`}</span>
            <input type="text" dir="ltr" class="mod-code-input" data-module-id="${_esc(module.id)}"
              value="${_esc(getModuleCode(module))}" maxlength="40">
            ${isModuleCodeManual(module) ? `<button type="button" class="mod-code-reset" data-mod-code-reset="${_esc(module.id)}"
              title="${_esc(_tx('ttCodeReset'))}" aria-label="${_esc(_tx('ttCodeReset'))}">↺</button>` : ''}
          </label>
          <label class="mod-meta-field"><span>${_esc(_tx('lblModuleShort'))}</span>
            <input type="text" class="mod-short-input" data-module-id="${_esc(module.id)}"
              value="${_esc(module.shortName || '')}" maxlength="30" placeholder="${_esc(suggestModuleShortName(module))}">
          </label>
        </div>
        ${isModuleCodeDuplicate(module) ? `<div class="mod-code-dup">⚠ ${_esc(_tx('msgCodeDuplicate'))}</div>` : ''}
        ${sourceTaskIds.length ? `
        <div style="font-size:0.85em;color:#64748b;margin:-4px 0 10px;">
          ${_t('lblRelatedTasks')}: ${sourceTaskIds.map(id => _taskLabel(id)).join(', ')}
        </div>` : ''}
        <div class="module-los-list">
          ${module.learningOutcomes.map(outcome => {
            const criteriaText = outcome.linkedCriteria.map(pc =>
              `${pc.id}${pc.taskId ? ` [${_taskLabel(pc.taskId)}]` : ''}: ${pc.text}`
            ).join(' • ');
            return `
              <div class="module-lo-assigned">
                <div class="module-lo-assigned-content">
                  <div class="module-lo-assigned-number">${outcome.number}</div>
                  <div class="module-lo-assigned-statement">${outcome.statement || `<em>${_t('msgNoStatement')}</em>`}</div>
                  <div class="module-lo-assigned-criteria">${_t('lblMappedPCInline')} ${criteriaText}</div>
                </div>
                <button class="btn-remove-lo" data-action="remove-lo-from-module"
                  data-module-id="${module.id}" data-lo-id="${outcome.id}">✕ ${_t('btnRemove2')}</button>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  };

  // Grouped by level when levels are in use. The M-number stays the
  // module's position in the full list, so exports and links are
  // unaffected by the grouping — it is display only.
  const anyLevel = mm.modules.some(m => _moduleLevel(m));
  let html = '';
  if (!anyLevel) {
    html = mm.modules.map(card).join('');
  } else {
    const groups = [];
    for (let l = 1; l <= levelCount; l++) groups.push({ level: l, items: [] });
    const none = { level: null, items: [] };
    mm.modules.forEach((m, i) => {
      const l = _moduleLevel(m);
      (l ? groups[l - 1] : none).items.push([m, i]);
    });
    [...groups, none].forEach(g => {
      if (!g.items.length) return;
      const lo = g.items.reduce((n, [m]) => n + m.learningOutcomes.length, 0);
      html += `<div class="mod-level-group">
        <div class="mod-level-head">${_esc(g.level ? _txf('lblLevelN', { n: g.level }) : _tx('lblNoLevelGroup'))}
          <span>${_esc(_txf('lblLevelSummary', { m: g.items.length, lo }))}</span></div>
        ${g.items.map(([m, i]) => card(m, i)).join('')}
      </div>`;
    });
  }

  container.innerHTML = html;
  renderCoverageMatrix();
}

// ══════════════════════════════════════════════════════════════
// LEVELS AND COVERAGE
// ──────────────────────────────────────────────────────────────
// A multi-level programme (e.g. TVQF levels 1–3) is built from ONE
// occupational standard: each performance criterion is taught in the
// level where it belongs, and a level may split into specialisations
// (tracks) — the CMCN pattern, where level 3 divides into Computer
// Maintenance and Computer Networks while other modules stay common.
//
//   module.level   1..N, or absent for "not assigned yet"
//   module.track   free text; empty = common to all tracks
//   moduleMappingData.levelCount   how many levels the programme has
//
// The coverage matrix answers the question the source documents could
// not: which criteria of the standard are taught at which level, which
// are taught nowhere, and which are taught more than once.
// ══════════════════════════════════════════════════════════════

const MAX_LEVELS = 8;

// ══════════════════════════════════════════════════════════════
// MODULE IDENTITY — code, short name, display label (3.34.0)
// ──────────────────────────────────────────────────────────────
//   module.code       optional manual code ("CMCN 1-1"); absent = auto
//   module.shortName  optional short name for file names ("Hardware")
//   moduleMappingData.labelMode  'code' | 'number' | 'both'
//
// Auto code = prefix + level + position of the module within its level
// ("CMCN 1-1"). The prefix is the module's track (now labelled "Track /
// code prefix"); with no track, the initials of the Job Title (falling
// back to the Occupation Title). A code the user typed is kept as is.
// The label mode decides how a module is referred to everywhere — cards,
// lists, coverage matrix, the curriculum tab and the Word/PDF exports.
// Codes and short names entered in the Module Curriculum tab in 3.33.x
// were stored there; they are adopted onto the module on first read.
// ══════════════════════════════════════════════════════════════
const _ID_STOP = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'to', 'a', 'an', '&', 'et', 'de', 'des', 'du',
  'la', 'le', 'les', 'en', 'pour', 'و', 'في', 'من', 'على', 'إلى', 'الى']);
function _idInitials(text) {
  const words = String(text || '').replace(/[^\p{L}\p{N}\s&-]/gu, ' ').split(/[\s-]+/).filter(Boolean);
  const keep = words.filter(w => !_ID_STOP.has(w.toLowerCase()));
  return (keep.length ? keep : words).map(w => w.charAt(0).toUpperCase()).join('').slice(0, 6);
}
function _idDom(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function _idModules() { return ((appState.moduleMappingData || {}).modules) || []; }

function _adoptLegacyIdentity() {
  const bm = appState.moduleCurriculumData && appState.moduleCurriculumData.byModule;
  if (!bm) return;
  _idModules().forEach(m => {
    const r = m && bm[m.id];
    if (!r) return;
    ['code', 'shortName'].forEach(k => {
      if (typeof r[k] !== 'string') return;
      const v = r[k].trim();
      if (v && (m[k] === undefined || m[k] === '')) m[k] = v;
      delete r[k];
    });
  });
}

/** Prefix of the auto code: the track, else Job Title initials. */
export function getModuleCodePrefix(module) {
  const t = String((module && module.track) || '').trim();
  if (t) return t;
  return _idInitials(_idDom('jobTitle')) || _idInitials(_idDom('occupationTitle')) || 'MOD';
}
export function suggestModuleCode(module) {
  const mods = _idModules();
  const lvl = _moduleLevel(module);
  const prefix = getModuleCodePrefix(module);
  if (lvl) return `${prefix} ${lvl}-${mods.filter(m => _moduleLevel(m) === lvl).indexOf(module) + 1}`;
  return `${prefix} ${mods.indexOf(module) + 1}`;
}
export function isModuleCodeManual(module) {
  _adoptLegacyIdentity();
  return !!(module && typeof module.code === 'string' && module.code.trim());
}
export function getModuleCode(module) {
  if (!module) return '';
  return isModuleCodeManual(module) ? module.code.trim() : suggestModuleCode(module);
}
export function suggestModuleShortName(module) {
  const words = String((module && module.title) || '').split(/\s+/).filter(Boolean);
  const pick = words.find((w, i) => !_ID_STOP.has(w.toLowerCase()) && !(i === 0 && /ing$/i.test(w) && words.length > 1));
  const w = (pick || words[0] || 'Module').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 24) || 'Module';
  return w.charAt(0).toUpperCase() + w.slice(1);
}
export function getModuleShortName(module) {
  _adoptLegacyIdentity();
  const s = module && typeof module.shortName === 'string' ? module.shortName.trim() : '';
  return s || suggestModuleShortName(module);
}
/** Writes the code / short name WITHOUT re-rendering (for other tabs).
 *  An empty value, or one equal to the suggestion, means "automatic". */
export function assignModuleCode(module, value) {
  if (!module) return;
  const v = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!v || v === suggestModuleCode(module)) delete module.code; else module.code = v;
}
export function assignModuleShortName(module, value) {
  if (!module) return;
  const v = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!v) delete module.shortName; else module.shortName = v;
}
export function setModuleCode(moduleId, value) {
  const m = _idModules().find(x => x.id === moduleId);
  if (!m) return;
  assignModuleCode(m, value);
  renderModules(); renderModuleLoList(); _persistClusters();
}
export function setModuleShortName(moduleId, value) {
  const m = _idModules().find(x => x.id === moduleId);
  if (!m) return;
  assignModuleShortName(m, value);
  _persistClusters();
}
export function isModuleCodeDuplicate(module) {
  const c = getModuleCode(module).toLowerCase();
  return !!c && _idModules().some(m => m !== module && getModuleCode(m).toLowerCase() === c);
}
export function getModuleLabelMode() {
  const v = (appState.moduleMappingData || {}).labelMode;
  return v === 'number' || v === 'both' ? v : 'code';
}
export function setModuleLabelMode(v) {
  appState.moduleMappingData.labelMode = (v === 'number' || v === 'both') ? v : 'code';
  renderModules(); renderModuleLoList(); _persistClusters();
  try { document.dispatchEvent(new CustomEvent('dacum:module-labels-changed')); } catch (_) {}
}
/** Short reference to a module, following the label mode:
 *  "CMCN 1-1" | "M1" | "M1 · CMCN 1-1". */
export function moduleRef(module) {
  const i = _idModules().indexOf(module);
  const num = i >= 0 ? `M${i + 1}` : '';
  const mode = getModuleLabelMode();
  if (mode === 'number' || !module) return num;
  const code = getModuleCode(module);
  return mode === 'both' && num ? `${num} · ${code}` : code;
}
/** True when the reference already carries the track (so a separate
 *  track chip/tag would only repeat it). */
function _refShowsTrack(module) {
  return getModuleLabelMode() !== 'number' && !!(module && module.track) &&
         getModuleCode(module).indexOf(module.track) !== -1;
}

function _moduleLevel(m) {
  const n = parseInt(m && m.level, 10);
  return Number.isInteger(n) && n >= 1 && n <= MAX_LEVELS ? n : null;
}

export function getModuleLevelCount() {
  const mm = appState.moduleMappingData || {};
  const stored = parseInt(mm.levelCount, 10);
  const used = Math.max(0, ...(mm.modules || []).map(m => _moduleLevel(m) || 0));
  return Math.min(MAX_LEVELS, Math.max(Number.isInteger(stored) && stored > 0 ? stored : 3, used));
}

export function setModuleLevelCount(n) {
  const mm = appState.moduleMappingData;
  const used = Math.max(0, ...(mm.modules || []).map(m => _moduleLevel(m) || 0));
  const v = Math.max(1, used, Math.min(MAX_LEVELS, parseInt(n, 10) || 3));
  mm.levelCount = v;
  renderModules(); renderModuleLoList();
  _persistClusters();
  return v;
}

export function setModuleLevel(moduleId, level) {
  const m = appState.moduleMappingData.modules.find(x => x.id === moduleId);
  if (!m) return;
  const n = parseInt(level, 10);
  if (Number.isInteger(n) && n >= 1 && n <= MAX_LEVELS) m.level = n; else delete m.level;
  renderModules(); renderModuleLoList();
  _persistClusters();
}

export function setModuleTrack(moduleId, track) {
  const m = appState.moduleMappingData.modules.find(x => x.id === moduleId);
  if (!m) return;
  const t = String(track || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (t) m.track = t; else delete m.track;
  renderModules(); renderModuleLoList();
  _persistClusters();
}

/** Per-criterion coverage: which modules (with level/track) teach it. */
export function computeCoverage() {
  _reconcileLearningOutcomes();
  const cd = appState.clusteringData || { clusters: [] };
  const mm = appState.moduleMappingData || { modules: [] };
  const lo = appState.learningOutcomesData || { outcomes: [] };

  const rows = [];
  const byKey = new Map();
  (cd.clusters || []).forEach((c, ci) => {
    _getClusterEffectiveCriteria(c, ci + 1).forEach(cr => {
      if (!cr.text || !cr.text.trim()) return;
      const row = { key: cr.key, id: cr.id, text: cr.text, taskId: cr.taskId,
                    clusterNumber: ci + 1, clusterName: c.name, modules: [], los: [] };
      rows.push(row);
      if (!byKey.has(cr.key)) byKey.set(cr.key, row);
    });
  });

  const inModule = new Set();
  mm.modules.forEach((m, mi) => {
    (m.learningOutcomes || []).forEach(o => {
      inModule.add(o.id);
      (o.linkedCriteria || []).forEach(pc => {
        const row = !pc.stale && pc.key && byKey.get(pc.key);
        if (row && !row.modules.some(x => x.id === m.id)) {
          row.modules.push({ id: m.id, number: moduleRef(m), showTrack: !_refShowsTrack(m), title: m.title,
                             level: _moduleLevel(m), track: m.track || '' });
        }
      });
    });
  });
  lo.outcomes.forEach(o => (o.linkedCriteria || []).forEach(pc => {
    const row = !pc.stale && pc.key && byKey.get(pc.key);
    if (row && !row.los.includes(o.number)) row.los.push(o.number);
  }));

  rows.forEach(r => {
    r.status = r.modules.length > 1 ? 'multi'
             : r.modules.length === 1 ? 'covered'
             : r.los.length ? 'lo-only' : 'gap';
  });
  const count = st => rows.filter(r => r.status === st).length;
  return { rows, levelCount: getModuleLevelCount(),
           summary: { total: rows.length, covered: count('covered') + count('multi'),
                      multi: count('multi'), loOnly: count('lo-only'), gap: count('gap') } };
}

// ── Export helpers (used by exports_docx.js / exports_pdf.js) ──────────
// Kept here, next to the data they describe, so the two exporters only
// need a one-line call each and no new file has to be registered with
// the service worker.

/** "M3 — Title (Level 3 · CN)" — module heading for exported documents. */
export function moduleTitleWithLevel(module) {
  const mm = appState.moduleMappingData || { modules: [] };
  const i = (mm.modules || []).indexOf(module);
  const n = i >= 0 ? `${moduleRef(module)} — ` : '';
  const l = _moduleLevel(module);
  const tags = [l ? _txf('lblLevelN', { n: l }) : '', module && module.track && !_refShowsTrack(module) ? module.track : '']
    .filter(Boolean).join(' · ');
  return `${n}${module ? module.title : ''}${tags ? ` (${tags})` : ''}`;
}

function _statusWord(r) {
  if (r.status === 'gap')     return _tx('covGap');
  if (r.status === 'lo-only') return _txf('covLoOnly', { lo: r.los.join(', ') });
  if (r.status === 'multi')   return _txf('covMulti', { n: r.modules.length });
  return _tx('covTaught');
}

function _levelsExportData() {
  renumberLearningOutcomes();
  const mm = appState.moduleMappingData || { modules: [] };
  if (!(mm.modules || []).length) return null;
  const cov = computeCoverage();
  if (!cov.rows.length) return null;
  const levelCount = cov.levelCount;
  const anyLevel = mm.modules.some(m => _moduleLevel(m));
  const usesNoLevel = cov.rows.some(r => r.modules.some(m => !m.level));
  const cols = Array.from({ length: levelCount }, (_, i) => i + 1);
  if (usesNoLevel) cols.push(null);

  // Programme structure: one row per module, ordered by level.
  const structure = mm.modules
    .map((m, i) => ({ m, i, l: _moduleLevel(m) }))
    .sort((a, b) => (a.l || 99) - (b.l || 99) || a.i - b.i)
    .map(({ m, i, l }) => {
      const crit = [];
      (m.learningOutcomes || []).forEach(o => (o.linkedCriteria || []).forEach(pc => {
        if (!pc.stale && !crit.includes(pc.id)) crit.push(pc.id);
      }));
      return { level: l ? _txf('lblLevelN', { n: l }) : _tx('lblNoLevelGroup'),
               module: `${moduleRef(m)} — ${m.title}`, track: m.track || _tx('covCommon'),
               los: String((m.learningOutcomes || []).length), criteria: crit.join(', ') };
    });

  const cellText = (r, level) => r.modules
    .filter(m => (m.level || null) === level)
    .map(m => m.number + (m.track && m.showTrack !== false ? ` ${m.track}` : '')).join(', ');

  const s = cov.summary;
  const pct = s.total ? Math.round(s.covered / s.total * 100) : 0;
  const summary = [
    _txf('covTotal', { n: s.total }),
    _txf('covCoveredN', { n: s.covered, p: pct }),
    _txf('covGapN', { n: s.gap }),
    s.loOnly ? _txf('covLoOnlyN', { n: s.loOnly }) : '',
    s.multi ? _txf('covMultiN', { n: s.multi }) : '',
  ].filter(Boolean).join('  ·  ');

  const head = [_tx('covColCriterion'),
    ...cols.map(l => l ? _txf('lblLevelShort', { n: l }) : _tx('covColNoLevel')),
    _tx('covColStatus')];
  const body = [];
  let last = null;
  cov.rows.forEach(r => {
    if (r.clusterNumber !== last) {
      last = r.clusterNumber;
      body.push({ group: `C${r.clusterNumber} — ${r.clusterName}` });
    }
    body.push({ status: r.status,
      cells: [`${r.id}  ${r.text}`, ...cols.map(l => cellText(r, l)), _statusWord(r)] });
  });
  return { anyLevel, structure, summary, head, body, levelColumns: cols.length };
}

/**
 * Word: returns the paragraphs/tables for "Programme Structure by Level"
 * and the coverage matrix, or [] when there are no modules. `lib` is the
 * exporter's own (wrapped) docx classes plus { fill, rtl }.
 */
export function buildLevelsDocxBlock(lib) {
  const d = _levelsExportData();
  if (!d) return [];
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
          AlignmentType, ShadingType, PageBreak } = lib;
  const rtl = !!lib.rtl, fill = lib.fill || 'DCDCDC';
  const out = [];
  const TOTAL = 9071;

  const para = (text, o = {}) => new Paragraph({
    children: [new TextRun({ text, size: o.size || 20, bold: !!o.bold, italics: !!o.italics,
                             color: o.color, __shaded: !!o.shaded })],
    ...(o.center ? { alignment: AlignmentType.CENTER } : {}),
    spacing: o.spacing || { after: 0 },
    bidirectional: rtl,
  });
  const cell = (text, w, o = {}) => new TableCell({
    children: [para(text, o)],
    width: { size: w, type: WidthType.DXA },
    ...(o.fillCell ? { shading: { fill: o.fillCell, type: ShadingType.CLEAR, color: 'auto' } } : {}),
    ...(o.span ? { columnSpan: o.span } : {}),
  });
  const table = (rows, widths) => new Table({
    visuallyRightToLeft: rtl, width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: widths, layout: 'fixed', rows,
  });

  out.push(new Paragraph({ children: [new PageBreak()], bidirectional: rtl }));

  // 1. Programme structure — only meaningful once levels are in use.
  if (d.anyLevel) {
    out.push(para(_tx('expLevelsTitle'), { size: 32, bold: true, center: true, spacing: { before: 200, after: 300 } }));
    const w = [1100, 3571, 1400, 1200, 1800];
    const rows = [new TableRow({ tableHeader: true, children:
      [_tx('lblModuleLevel'), _tx('expColModule'), _tx('lblModuleTrack'), _tx('expColLOs'), _tx('expColCriteria')]
        .map((h, i) => cell(h, w[i], { bold: true, shaded: true, fillCell: fill, center: i !== 1 })) })];
    d.structure.forEach(r => rows.push(new TableRow({ children: [
      cell(r.level, w[0], { center: true }), cell(r.module, w[1]), cell(r.track, w[2], { center: true }),
      cell(r.los, w[3], { center: true }), cell(r.criteria, w[4], { size: 18 }),
    ] })));
    out.push(table(rows, w));
    out.push(para('', { spacing: { after: 300 } }));
  }

  // 2. Coverage matrix.
  out.push(para(_tx('covTitle'), { size: 28, bold: true, spacing: { before: 200, after: 120 } }));
  out.push(para(_tx('expCovHint'), { size: 18, italics: true, spacing: { after: 80 } }));
  out.push(para(d.summary, { size: 20, bold: true, spacing: { after: 160 } }));

  const statusW = 1700;
  const lvlW = Math.max(560, Math.min(900, Math.floor((TOTAL - statusW - 3200) / d.levelColumns)));
  const critW = TOTAL - statusW - lvlW * d.levelColumns;
  const w = [critW, ...Array(d.levelColumns).fill(lvlW), statusW];
  const STATUS_COLOR = { gap: 'B91C1C', 'lo-only': '92400E', multi: '075985', covered: '166534' };
  const rows = [new TableRow({ tableHeader: true,
    children: d.head.map((h, i) => cell(h, w[i], { bold: true, shaded: true, fillCell: fill, size: 18, center: i !== 0 })) })];
  d.body.forEach(r => {
    if (r.group) {
      rows.push(new TableRow({ children: [cell(r.group, TOTAL, { bold: true, size: 18, span: w.length, fillCell: 'EFF6FF' })] }));
      return;
    }
    rows.push(new TableRow({ children: r.cells.map((t, i) => {
      const last = i === r.cells.length - 1;
      return cell(t, w[i], { size: 18, center: i !== 0,
        bold: last, color: last ? STATUS_COLOR[r.status] : (i === 0 && r.status === 'gap' ? 'B91C1C' : undefined) });
    }) }));
  });
  out.push(table(rows, w));
  return out;
}

/**
 * PDF: draws the same two sections on new pages and returns the y
 * position after them (unchanged when there is nothing to draw).
 * Uses plain text, lines and rectangles only — all of which
 * pdf_arabic.js mirrors for Arabic — and words instead of ✓/✗, which
 * the embedded fonts do not carry.
 */
export function writeLevelsPdf(pdf, ctx) {
  const d = _levelsExportData();
  if (!d) return ctx.yPos;
  const { margin, pageWidth, pageHeight } = ctx;
  const W = pageWidth - 2 * margin;
  let y;
  const newPage = () => { pdf.addPage(); y = margin + 5; };
  const ensure = (h, redraw) => { if (y + h > pageHeight - margin) { newPage(); if (redraw) redraw(); } };
  const setFill = hex => pdf.setFillColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
  const setColor = hex => pdf.setTextColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));

  // Generic row-based table: column x offsets + widths, wrapped cells.
  const drawTable = (widths, header, rows, fs) => {
    const xs = []; widths.reduce((x, w) => (xs.push(x), x + w), margin);
    const line = fs * 0.42;
    const head = () => {
      pdf.setFontSize(fs); pdf.setFont(undefined, 'bold');
      const lines = header.map((h, i) => pdf.splitTextToSize(h, widths[i] - 3));
      const h = Math.max(...lines.map(l => l.length)) * line + 3;
      setFill('DCDCDC'); pdf.rect(margin, y, W, h, 'F'); setColor('000000');
      lines.forEach((l, i) => pdf.text(l, xs[i] + 1.5, y + line + 0.5));
      y += h; pdf.setFont(undefined, 'normal');
    };
    head();
    rows.forEach(r => {
      pdf.setFontSize(fs);
      if (r.group) {
        const h = line + 3;
        ensure(h + line * 2, head);
        setFill('EFF6FF'); pdf.rect(margin, y, W, h, 'F');
        pdf.setFont(undefined, 'bold'); setColor('075985');
        pdf.text(pdf.splitTextToSize(r.group, W - 3)[0], margin + 1.5, y + line + 0.5);
        pdf.setFont(undefined, 'normal'); setColor('000000');
        y += h; return;
      }
      const lines = r.cells.map((c, i) => pdf.splitTextToSize(String(c || ''), widths[i] - 3));
      const h = Math.max(...lines.map(l => l.length), 1) * line + 3;
      ensure(h, head);
      lines.forEach((l, i) => {
        if (r.colors && r.colors[i]) setColor(r.colors[i]);
        if (r.boldCol === i) pdf.setFont(undefined, 'bold');
        pdf.text(l, xs[i] + 1.5, y + line + 0.5);
        if (r.boldCol === i) pdf.setFont(undefined, 'normal');
        setColor('000000');
      });
      y += h;
      pdf.setDrawColor(226, 232, 240); pdf.line(margin, y, margin + W, y);
    });
  };

  newPage();
  if (d.anyLevel) {
    pdf.setFontSize(16); pdf.setFont(undefined, 'bold');
    pdf.text(_tx('expLevelsTitle'), pageWidth / 2, y, { align: 'center' });
    y += 9;
    const f = [0.14, 0.40, 0.14, 0.10, 0.22].map(x => x * W);
    drawTable(f, [_tx('lblModuleLevel'), _tx('expColModule'), _tx('lblModuleTrack'), _tx('expColLOs'), _tx('expColCriteria')],
      d.structure.map(r => ({ cells: [r.level, r.module, r.track, r.los, r.criteria] })), 9);
    y += 10;
    ensure(30);
  }

  pdf.setFontSize(14); pdf.setFont(undefined, 'bold');
  pdf.text(_tx('covTitle'), margin, y); y += 6;
  pdf.setFontSize(9); pdf.setFont(undefined, 'normal');
  pdf.splitTextToSize(_tx('expCovHint'), W).forEach(l => { pdf.text(l, margin, y); y += 4; });
  pdf.setFont(undefined, 'bold');
  pdf.splitTextToSize(d.summary, W).forEach(l => { pdf.text(l, margin, y); y += 4.5; });
  pdf.setFont(undefined, 'normal');
  y += 3;

  const statusW = Math.min(45, W * 0.2);
  const lvlW = Math.max(12, Math.min(22, (W - statusW - 90) / d.levelColumns));
  const widths = [W - statusW - lvlW * d.levelColumns, ...Array(d.levelColumns).fill(lvlW), statusW];
  const COLORS = { gap: 'B91C1C', 'lo-only': '92400E', multi: '075985', covered: '166534' };
  drawTable(widths, d.head, d.body.map(r => r.group ? r : ({
    cells: r.cells, boldCol: r.cells.length - 1,
    colors: { 0: r.status === 'gap' ? 'B91C1C' : null, [r.cells.length - 1]: COLORS[r.status] },
  })), 8);
  return y + 5;
}

let _covGapsOnly = false;

export function renderCoverageMatrix() {
  const modCont = document.getElementById('modulesContainer');
  if (!modCont) return;
  const anchor = modCont.closest('.clustering-section') || modCont;
  let sec = document.getElementById('coverageMatrixSection');
  // No modules → nothing has been mapped yet, so there is no coverage
  // to report. The section is removed (this is also what makes "Clear
  // This Tab" and deleting the last module empty it).
  if (!((appState.moduleMappingData || {}).modules || []).length) {
    if (sec) sec.remove();
    return;
  }
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'coverageMatrixSection';
    sec.className = 'clustering-section';
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
  }

  const cov = computeCoverage();
  const { rows, levelCount, summary } = cov;
  const usesNoLevel = rows.some(r => r.modules.some(m => !m.level));
  const levels = Array.from({ length: levelCount }, (_, i) => i + 1);

  const cell = (r, level) => r.modules
    .filter(m => (m.level || null) === level)
    .map(m => `<span class="cov-chip" title="${_esc(m.title)}"><bdi>${_esc(m.number)}</bdi>${m.track && m.showTrack !== false ? ` <small>${_esc(m.track)}</small>` : ''}</span>`)
    .join('');

  const statusCell = r => {
    if (r.status === 'gap')     return `<span class="cov-st cov-gap">✗ ${_esc(_tx('covGap'))}</span>`;
    if (r.status === 'lo-only') return `<span class="cov-st cov-lo">◐ ${_esc(_txf('covLoOnly', { lo: r.los.join(', ') }))}</span>`;
    if (r.status === 'multi')   return `<span class="cov-st cov-multi">⚠ ${_esc(_txf('covMulti', { n: r.modules.length }))}</span>`;
    return `<span class="cov-st cov-ok">✓</span>`;
  };

  let body = '';
  let lastCluster = null;
  const shown = rows.filter(r => !_covGapsOnly || r.status === 'gap' || r.status === 'lo-only');
  shown.forEach(r => {
    if (r.clusterNumber !== lastCluster) {
      lastCluster = r.clusterNumber;
      body += `<tr class="cov-group"><td colspan="${levels.length + (usesNoLevel ? 3 : 2)}">C${r.clusterNumber} — ${_esc(r.clusterName)}</td></tr>`;
    }
    body += `<tr class="cov-row cov-${r.status}">
      <td class="cov-crit"><strong>${_esc(r.id)}</strong> ${_esc(r.text)}${r.taskId ? ` <span class="cov-task">[${_esc(_taskLabel(r.taskId))}]</span>` : ''}</td>
      ${levels.map(l => `<td class="cov-lvl">${cell(r, l)}</td>`).join('')}
      ${usesNoLevel ? `<td class="cov-lvl">${cell(r, null)}</td>` : ''}
      <td class="cov-status">${statusCell(r)}</td>
    </tr>`;
  });

  const pct = summary.total ? Math.round(summary.covered / summary.total * 100) : 0;
  _injectCovFoldStyles();
  // Collapsible: the matrix lists every criterion and makes the tab very
  // long. Closed, the bar still shows the two numbers that matter.
  sec.innerHTML = `
   <details class="cov-fold" ${_covOpen ? 'open' : ''}>
    <summary class="cov-fold-head">
      <span class="cov-fold-title">📊 ${_esc(_tx('covTitle'))}</span>
      ${summary.total ? `<span class="cov-fold-mini">
        <span class="cov-pill cov-ok">✓ ${_esc(_txf('covCoveredN', { n: summary.covered, p: pct }))}</span>
        <span class="cov-pill cov-gap">✗ ${_esc(_txf('covGapN', { n: summary.gap }))}</span>
      </span>` : ''}
      <span class="cov-fold-toggle">${_esc(_tx(_covOpen ? 'covHide' : 'covShow'))}</span>
    </summary>
    <div class="cov-fold-body">
    <p class="cov-hint">${_esc(_tx('covHint'))}</p>
    <div class="cov-controls">
      <label class="mod-meta-field"><span>${_esc(_tx('lblLevelCount'))}</span>
        <input type="number" class="cov-level-count" min="1" max="${MAX_LEVELS}" value="${levelCount}">
      </label>
      <label class="cov-gaps-toggle"><input type="checkbox" class="cov-gaps-only" ${_covGapsOnly ? 'checked' : ''}>
        ${_esc(_tx('covGapsOnly'))}</label>
    </div>
    ${summary.total ? `
    <div class="cov-summary">
      <span class="cov-pill">${_esc(_txf('covTotal', { n: summary.total }))}</span>
      <span class="cov-pill cov-ok">✓ ${_esc(_txf('covCoveredN', { n: summary.covered, p: pct }))}</span>
      <span class="cov-pill cov-gap">✗ ${_esc(_txf('covGapN', { n: summary.gap }))}</span>
      ${summary.loOnly ? `<span class="cov-pill cov-lo">◐ ${_esc(_txf('covLoOnlyN', { n: summary.loOnly }))}</span>` : ''}
      ${summary.multi ? `<span class="cov-pill cov-multi">⚠ ${_esc(_txf('covMultiN', { n: summary.multi }))}</span>` : ''}
    </div>
    <div class="cov-table-wrap">
      <table class="cov-table">
        <thead><tr>
          <th>${_esc(_tx('covColCriterion'))}</th>
          ${levels.map(l => `<th>${_esc(_txf('lblLevelShort', { n: l }))}</th>`).join('')}
          ${usesNoLevel ? `<th>${_esc(_tx('covColNoLevel'))}</th>` : ''}
          <th>${_esc(_tx('covColStatus'))}</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="${levels.length + 3}" class="cov-empty">${_esc(_tx('covNoGaps'))}</td></tr>`}</tbody>
      </table>
    </div>` : `<div class="no-clusters-message">${_esc(_tx('covEmpty'))}</div>`}
    </div>
   </details>`;
  const det = sec.querySelector('details.cov-fold');
  det.addEventListener('toggle', () => {
    _covOpen = det.open;
    try { localStorage.setItem('dacum_cov_open', _covOpen ? '1' : '0'); } catch (_) {}
    const t = det.querySelector('.cov-fold-toggle');
    if (t) t.textContent = _tx(_covOpen ? 'covHide' : 'covShow');
  });
}

let _covOpen = (() => { try { return localStorage.getItem('dacum_cov_open') === '1'; } catch (_) { return false; } })();

function _injectCovFoldStyles() {
  if (document.getElementById('covFoldStyles')) return;
  const st = document.createElement('style');
  st.id = 'covFoldStyles';
  st.textContent = `
    .cov-fold > summary { list-style: none; }
    .cov-fold > summary::-webkit-details-marker { display: none; }
    .cov-fold-head {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; cursor: pointer;
      padding: 12px 14px; border-radius: 10px; background: #eef2ff; border: 1px solid #c7d2fe;
      user-select: none;
    }
    .cov-fold-head:hover { background: #e0e7ff; }
    .cov-fold-title { font-weight: 700; font-size: 1.12em; color: #4338ca; }
    .cov-fold-mini { display: inline-flex; flex-wrap: wrap; gap: 6px; }
    .cov-fold-mini .cov-pill { font-size: .85em; }
    .cov-fold-toggle {
      margin-inline-start: auto; font-size: .88em; font-weight: 700; color: #4338ca;
      white-space: nowrap;
    }
    .cov-fold-toggle::after { content: ' ▾'; }
    .cov-fold[open] .cov-fold-toggle::after { content: ' ▴'; }
    .cov-fold[open] > .cov-fold-head { border-radius: 10px 10px 0 0; }
    .cov-fold-body { padding-top: 12px; }
  `;
  document.head.appendChild(st);
}

export function renameModule(moduleId) {
  const module = appState.moduleMappingData.modules.find(m => m.id === moduleId);
  if (!module) return;
  const newTitle = prompt(_t('promptRenameModule'), module.title);
  if (newTitle && newTitle.trim()) {
    module.title = newTitle.trim();
    renderModules();
  }
}

export function deleteModule(moduleId) {
  const mm = appState.moduleMappingData;
  const idx = mm.modules.findIndex(m => m.id === moduleId);
  if (idx === -1) return;
  if (!confirm(_t('confirmDeleteModule'))) return;
  const before = _undoSnap();
  const label = _txf('undoDeleteModule', { m: moduleRef(mm.modules[idx]), name: mm.modules[idx].title || '' });
  mm.modules.splice(idx, 1);
  _undoRecord(label, before);
  _persistClusters();
  renderModuleLoList();
  renderModules();
}

export function removeLoFromModule(moduleId, loId) {
  const module = appState.moduleMappingData.modules.find(m => m.id === moduleId);
  if (!module) return;
  const idx = module.learningOutcomes.findIndex(o => o.id === loId);
  if (idx !== -1) {
    const before = _undoSnap();
    const mi = appState.moduleMappingData.modules.indexOf(module);
    const label = _txf('undoRemoveLO', { lo: module.learningOutcomes[idx].number, m: moduleRef(module) || `M${mi + 1}` });
    module.learningOutcomes.splice(idx, 1);
    _undoRecord(label, before);
    _persistClusters();
  }
  renderModuleLoList();
  renderModules();
}

export function addLoToModuleFromDropdown(loId, moduleId) {
  if (!moduleId) return;
  const mm = appState.moduleMappingData;
  const lo = appState.learningOutcomesData;
  const module = mm.modules.find(m => m.id === moduleId);
  if (!module) return;
  const outcome = lo.outcomes.find(o => o.id === loId);
  if (!outcome) return;
  module.learningOutcomes.push(outcome);
  renderModuleLoList();
  renderModules();
}

// Collects the distinct source task IDs referenced by a module's
// Learning Outcomes, then the Task Analysis record for each — this is
// what makes the "relevant Task Analysis information" available to
// Module Builder without duplicating the entire project into the
// handoff. Tasks with no analysis content are simply absent from the
// returned dictionary (getTaskAnalysisRecord already returns null for
// those), so an old project with no Task Analysis data at all still
// produces a valid, empty-but-harmless taskAnalysis: {}.
function _collectModuleTaskAnalysis(module) {
  /* 3.44.0: a criterion written in Competency Clusters carries no taskId
     (only Task Analysis criteria do), so this used to find no source task
     at all for most modules — Module Builder received empty
     sourceTaskIds / taskAnalysis and its Training Structure Mapping had
     nothing to offer. A cluster criterion now traces to the tasks of its
     competency; a Task Analysis criterion still traces to its own task. */
  const taskIds = new Set();
  module.learningOutcomes.forEach(o =>
    o.linkedCriteria.forEach(pc => _criterionTaskIds(pc).forEach(id => taskIds.add(id)))
  );
  const taskAnalysis = {};
  taskIds.forEach(taskId => {
    const record = getTaskAnalysisRecord(taskId);
    if (record) taskAnalysis[taskId] = { taskCode: _taskLabel(taskId), ...record };
  });
  /* Code and statement of every source task, analysed or not — so Module
     Builder can label a task that has no Task Analysis yet instead of
     showing its raw id. */
  const sourceTasks = [...taskIds].map(id => {
    const t = _clusterTask(id);
    return { id, code: _taskLabel(id), text: (t && t.text) || '', dutyTitle: (t && t.dutyTitle) || '' };
  });
  return { sourceTaskIds: [...taskIds], taskAnalysis, sourceTasks };
}

/* The tasks a linked criterion traces back to: its own task for a Task
   Analysis criterion, the tasks of its competency for a cluster one. */
function _criterionTaskIds(pc) {
  if (pc.taskId) return [pc.taskId];
  const cluster = (appState.clusteringData.clusters || []).find(c => c.id === pc.clusterId);
  return cluster ? (cluster.tasks || []).map(t => t.id).filter(Boolean) : [];
}

function _clusterTask(taskId) {
  for (const c of (appState.clusteringData.clusters || [])) {
    const t = (c.tasks || []).find(x => x.id === taskId);
    if (t) return t;
  }
  return null;
}

/* Module Curriculum summary for the handoff (3.44.0) — only what Module
   Builder can use: credits, hours, purpose, prerequisites and outcome
   hours. null when nothing was entered for the module. */
function _curriculumSummary(module) {
  let model = null;
  try { model = getCurriculumModel(module.id); } catch (_) { model = null; }
  if (!model) return null;
  const h = model.hours;
  const loHours = {};
  (model.los || []).forEach((lo, i) => {
    const o = module.learningOutcomes[i];
    if (o && lo.hours !== '' && lo.hours != null) loHours[o.number] = Number(lo.hours);
  });
  const out = {
    credits: model.credits === '' ? null : Number(model.credits),
    totalHours: h ? h.total : null,
    hours: h ? { theory: h.parts.theory, practical: h.parts.practical, formative: h.parts.formative,
                 industryPractice: h.parts.practice, summative: h.parts.summative,
                 institutional: h.institutional, industry: h.industry } : null,
    purpose: model.purpose || '',
    prerequisites: model.prerequisites || [],
    loHours,
    programme: model.programme || '',
  };
  const empty = out.credits == null && !out.purpose && !out.prerequisites.length && !Object.keys(loHours).length;
  return empty ? null : out;
}

function _buildModuleExport(module, moduleNumber) {
  _refreshModuleOutcomes();
  const { sourceTaskIds, taskAnalysis, sourceTasks } = _collectModuleTaskAnalysis(module);
  return {
    moduleId: module.id,
    moduleNumber: `M${moduleNumber}`,
    // 3.34.0: module identity, also carried to Module Builder.
    moduleCode: getModuleCode(module),
    shortName: getModuleShortName(module),
    moduleTitle: module.title,
    // Programme level (1..N) and specialisation; null / '' when unset.
    level: _moduleLevel(module),
    track: module.track || '',
    learningOutcomes: module.learningOutcomes.map(o => ({
      // 3.44.0: DACUM's own outcome id, so Module Builder can update an
      // outcome it already holds instead of matching by position.
      loId: o.id,
      number: o.number,
      statement: o.statement,
      performanceCriteria: o.linkedCriteria.map(pc => ({
        id: pc.id, text: pc.text, taskId: pc.taskId || null,
        // 3.44.0: the tasks the criterion traces to (see _criterionTaskIds).
        sourceTaskIds: _criterionTaskIds(pc)
      }))
    })),
    // Raw task IDs (for Module Builder's own lookups) — the matching
    // display-ready "TASK B4" label is already on each entry in
    // taskAnalysis[id].taskCode below.
    sourceTaskIds,
    // Present even when empty, so Module Builder can tell "no Task
    // Analysis available for this module" apart from "field missing" —
    // relevant for projects created before Task Analysis existed.
    taskAnalysis,
    // 3.44.0: code + statement of each source task (analysed or not).
    sourceTasks,
    // 3.44.0: Module Curriculum summary, or null.
    curriculum: _curriculumSummary(module)
  };
}

/**
 * Hands off to Module Builder. With no argument, transfers every
 * module (the original, unchanged behaviour, still wired to the
 * existing "Proceed to Module Builder" banner button). Pass a
 * moduleId to transfer just that one module instead — used by the
 * per-module "Build in Module Builder" buttons in renderModules().
 * Either way the payload now also carries each module's traceable
 * source tasks and their Task Analysis content (see _buildModuleExport),
 * not just Learning Outcomes and Performance Criteria text.
 */
export function openModuleBuilderFromMapping(moduleId = null) {
  const occupationTitle = document.getElementById('occupationTitle')?.value || '';
  const jobTitle = document.getElementById('jobTitle')?.value || '';
  const occupation = occupationTitle || jobTitle || 'Unknown Occupation';
  _reconcileLearningOutcomes();
  const mm = appState.moduleMappingData;

  const modulesToSend = moduleId
    ? mm.modules.filter(m => m.id === moduleId)
    : mm.modules;

  if (moduleId && modulesToSend.length === 0) return;

  const exportObject = {
    source: 'DACUM Live Pro v1.0',
    exportDate: new Date().toISOString(),
    occupation,
    // 3.44.0: the remaining Chart Info fields Module Builder's cover has
    // a row for, and how modules are labelled here (code / number / both).
    occupationTitle,
    jobTitle,
    sector: document.getElementById('sector')?.value || '',
    labelMode: getModuleLabelMode(),
    modules: modulesToSend.map(m => _buildModuleExport(m, mm.modules.indexOf(m) + 1)),
    // Occupation-level Verified Occupational Reference Data. Always
    // present; { available:false } when the optional feature is off or
    // empty. Reference evidence only — Module Builder must not turn it
    // into learning outcomes automatically.
    occupationalReference: getSupplementaryVerificationData()
  };

  try {
    // Keyed by module so transferring the same module again updates its
    // entry instead of appending an uncontrolled duplicate — the most
    // this side of the handoff can do about de-duplication, since the
    // actual de-dup/merge behaviour on arrival is Module Builder's own.
    const STORAGE_KEY = 'dacum_modules_export';
    let payload = exportObject;
    if (moduleId) {
      let existing = null;
      try { existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { existing = null; }
      if (existing && Array.isArray(existing.modules)) {
        const others = existing.modules.filter(m => m.moduleId !== moduleId);
        payload = { ...existing, exportDate: exportObject.exportDate, occupation,
                    occupationTitle, jobTitle, sector: exportObject.sector, labelMode: exportObject.labelMode,
                    occupationalReference: exportObject.occupationalReference,
                    modules: [...others, ...exportObject.modules] };
      }
    }
    // Diagnostic only — confirms exactly what left this tab, so a report
    // of "N modules went in, fewer came out the other side" can be
    // checked against this line instead of guessed at. Safe to remove
    // once transfer reliability is fully confirmed.
    console.log('[DACUM→ModuleBuilder] writing', payload.modules.length, 'module(s):',
      payload.modules.map(m => m.moduleId));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    // Module Builder is a separate tool/repository, not a file shipped
    // alongside this one — the relative filename this used to open only
    // ever worked if it happened to sit next to index.html on the same
    // host. Pointing at the live tool directly is what actually works
    // regardless of where DACUM Live Pro itself is hosted.
    window.open('https://hshamjawad.github.io/Module-Builder/', '_blank');
    showStatus(_t('msgMBExported'), 'success');
  } catch (error) {
    console.error('Error exporting to Module Builder:', error);
    showStatus(_tf('msgMBExportError', { msg: error.message }), 'error');
  }
}

export function exportModuleMappingJSON() {
  _reconcileLearningOutcomes();
  const mm = appState.moduleMappingData;
  if (!mm.modules || mm.modules.length === 0) {
    showStatus(_t('msgNoModulesToExport'), 'error');
    return;
  }

  const occupationTitle = document.getElementById('occupationTitle')?.value || '';
  const jobTitle = document.getElementById('jobTitle')?.value || '';
  const occupation = occupationTitle || jobTitle || 'Unknown Occupation';

  const exportData = {
    metadata: {
      toolName: 'DACUM Live Pro', toolVersion: '1.0',
      exportDate: new Date().toISOString(), exportType: 'Module Mapping', occupation
    },
    // Same shape _buildModuleExport() uses for the Module Builder handoff
    // (see openModuleBuilderFromMapping below) — this download used to use
    // a different, older schema (pc.description instead of pc.text, a
    // flat duplicated sourceTaskIds with no taskAnalysis at all), which
    // made this file look inconsistent with what Module Builder actually
    // received even when nothing was actually lost in the transfer.
    modules: mm.modules.map((module, i) => _buildModuleExport(module, i + 1)),
    occupationalReference: getSupplementaryVerificationData(),
    levelCount: getModuleLevelCount(),
    coverage: (() => { const c = computeCoverage(); return {
      summary: c.summary,
      criteria: c.rows.map(r => ({ id: r.id, text: r.text, taskId: r.taskId || null,
        competency: r.clusterNumber, status: r.status,
        modules: r.modules.map(m => ({ module: m.number, level: m.level, track: m.track })) })) }; })(),
    summary: {
      totalModules: mm.modules.length,
      totalLearningOutcomes: mm.modules.reduce((s, m) => s + m.learningOutcomes.length, 0),
      totalPerformanceCriteria: mm.modules.reduce((s, m) =>
        s + m.learningOutcomes.reduce((ls, o) => ls + o.linkedCriteria.length, 0), 0)
    }
  };

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `module-mapping-export_${dateStr}.json`;

  try {
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showStatus(_tf('msgMMExported', { file: filename }), 'success');
  } catch (error) {
    console.error('Error exporting module mapping:', error);
    showStatus(_tf('msgMMExportError', { msg: error.message }), 'error');
  }
}


/* ── Re-render on language change ────────────────────────────────────
   Both lists are innerHTML-generated and survive tab switches, so they
   are outside applyTranslations()' reach. Rendering is pure from
   appState — no user input is held in the DOM alone — so a rebuild is
   lossless. Guarded on the containers existing so a language switch
   never constructs a tab the user has not opened. */
window.addEventListener('dacum:langchange', () => {
  if (document.getElementById('availableTasksList')) renderAvailableTasks();
  if (document.getElementById('clustersContainer'))  renderClusters();
  if (document.getElementById('pcSourceList'))       renderPCSourceList();

  /* An outcome being edited holds its text in an unsaved <textarea>.
     Clicking the language button blurs it first, which fires the blur
     handler and commits the text — so the rebuild below is safe. Doing
     it in the other order would silently discard whatever the user had
     just typed. */
  if (document.getElementById('loBlocksContainer'))  renderLearningOutcomes();
  if (document.getElementById('moduleLoList'))      renderModuleLoList();
  if (document.getElementById('modulesContainer'))  renderModules();
});

/* Competency-card task controls (Move Up / Move Down / Add Task). */
_wireClusterTaskControls();
