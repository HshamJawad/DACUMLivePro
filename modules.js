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
    lblStaleCriterion:        'Reworded or deleted at the source — review, then keep or remove (✕)'
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
    lblStaleCriterion:        'Reformulé ou supprimé à la source — vérifiez, puis conservez ou retirez (✕)'
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
    lblStaleCriterion:        'عُدّلت أو حُذفت في المصدر — راجعها ثم أبقِها أو أزلها (✕)'
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
function _refreshModuleOutcomes() {
  const mm = appState.moduleMappingData;
  const lo = appState.learningOutcomesData;
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

  // Pick up any Duties & Tasks change first (also when the user jumps
  // here without passing through Competency Clusters), then bring the
  // existing Learning Outcomes in line with the clusters.
  syncClusteringWithProfile();
  _reconcileLearningOutcomes();
  _renderLoNotice(container);

  const cd = appState.clusteringData;
  if (!cd.clusters || cd.clusters.length === 0) {
    container.innerHTML = `<div class="no-tasks-message">${_t('msgNoPCAvailable')}</div>`;
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
          ${isUsed ? `<span class="pc-used-badge">${_t('lblUsed')}</span>` : ''}
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

  updateCreateLOButton();
}

export function updateCreateLOButton() {
  const checkboxes = document.querySelectorAll('#pcSourceList input[type="checkbox"]:not([disabled])');
  const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
  document.getElementById('btnCreateLO').disabled = !anyChecked;
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
    number: `LO${lo.outcomeCounter}`,
    statement: '',
    linkedCriteria
  });

  renderPCSourceList();
  renderLearningOutcomes();
}

export function renderLearningOutcomes() {
  const container = document.getElementById('loBlocksContainer');
  _reconcileLearningOutcomes();   // idempotent — no-op when nothing changed
  const lo = appState.learningOutcomesData;

  if (lo.outcomes.length === 0) {
    container.innerHTML = `<div class="no-clusters-message">${_t('msgNoLOs')}</div>`;
    return;
  }

  let html = '';
  lo.outcomes.forEach(outcome => {
    const isEditing = outcome.editing || false;
    html += `
      <div class="lo-block" id="${outcome.id}">
        <div class="lo-block-header">
          <div class="lo-number">${outcome.number}</div>
          <div class="lo-actions">
            <button class="btn-edit-lo" data-action="toggle-edit-lo" data-lo-id="${outcome.id}">
              ${isEditing ? '💾 ' + _t('btnSave') : '✏️ ' + _t('btnEdit')}
            </button>
            <button class="btn-delete-lo" data-action="delete-lo" data-lo-id="${outcome.id}">❌ ${_t('btnDelete')}</button>
          </div>
        </div>
        <div class="lo-statement" id="statement_${outcome.id}">
          ${isEditing
            ? `<textarea id="textarea_${outcome.id}" data-action-blur="save-lo-statement" data-lo-id="${outcome.id}">${outcome.statement}</textarea>`
            : `${outcome.statement || `<em style="color:#999;">${_t('phLOStatement')}</em>`}`
          }
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
}

export function toggleEditLO(loId) {
  const lo = appState.learningOutcomesData.outcomes.find(o => o.id === loId);
  if (!lo) return;
  if (lo.editing) {
    saveLOStatement(loId);
    lo.editing = false;
  } else {
    lo.editing = true;
  }
  renderLearningOutcomes();
  if (lo.editing) {
    setTimeout(() => {
      const ta = document.getElementById(`textarea_${loId}`);
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }, 50);
  }
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
  if (idx !== -1) data.outcomes.splice(idx, 1);
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
  if (idx >= 0 && idx < lo.linkedCriteria.length) lo.linkedCriteria.splice(idx, 1);
  _persistClusters();
  renderPCSourceList();
  renderLearningOutcomes();
}

// ── Module Mapping ────────────────────────────────────────────

export function renderModuleLoList() {
  const container = document.getElementById('moduleLoList');
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
    mm.modules.forEach((m, mi) => { moduleOptions += `<option value="${m.id}">M${mi + 1} — ${m.title}</option>`; });

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

export function renderModules() {
  const container = document.getElementById('modulesContainer');
  _refreshModuleOutcomes();
  const mm = appState.moduleMappingData;

  if (mm.modules.length === 0) {
    container.innerHTML = `<div class="no-clusters-message">${_t('msgNoModules')}</div>`;
    return;
  }

  let html = '';
  mm.modules.forEach((module, moduleIndex) => {
    const { sourceTaskIds } = _collectModuleTaskAnalysis(module);
    html += `
      <div class="module-item">
        <div class="module-header">
          <div class="module-title">M${moduleIndex + 1} — ${module.title}</div>
          <div class="module-actions">
            <button class="btn-rename-module" data-action="build-module-in-builder" data-module-id="${module.id}"
                    title="${_t('ttBuildThisModule')}">🚀 ${_t('btnBuildThisModule')}</button>
            <button class="btn-rename-module" data-action="rename-module" data-module-id="${module.id}">✏️ ${_t('btnRename')}</button>
            <button class="btn-delete-module" data-action="delete-module" data-module-id="${module.id}">🗑️ ${_t('btnDeleteModule')}</button>
          </div>
        </div>
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
  });

  container.innerHTML = html;
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
  mm.modules.splice(idx, 1);
  renderModuleLoList();
  renderModules();
}

export function removeLoFromModule(moduleId, loId) {
  const module = appState.moduleMappingData.modules.find(m => m.id === moduleId);
  if (!module) return;
  const idx = module.learningOutcomes.findIndex(o => o.id === loId);
  if (idx !== -1) module.learningOutcomes.splice(idx, 1);
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
  const taskIds = new Set();
  module.learningOutcomes.forEach(o =>
    o.linkedCriteria.forEach(pc => { if (pc.taskId) taskIds.add(pc.taskId); })
  );
  const taskAnalysis = {};
  taskIds.forEach(taskId => {
    const record = getTaskAnalysisRecord(taskId);
    if (record) taskAnalysis[taskId] = { taskCode: _taskLabel(taskId), ...record };
  });
  return { sourceTaskIds: [...taskIds], taskAnalysis };
}

function _buildModuleExport(module, moduleNumber) {
  const { sourceTaskIds, taskAnalysis } = _collectModuleTaskAnalysis(module);
  return {
    moduleId: module.id,
    moduleNumber: `M${moduleNumber}`,
    moduleTitle: module.title,
    learningOutcomes: module.learningOutcomes.map(o => ({
      number: o.number,
      statement: o.statement,
      performanceCriteria: o.linkedCriteria.map(pc => ({ id: pc.id, text: pc.text, taskId: pc.taskId || null }))
    })),
    // Raw task IDs (for Module Builder's own lookups) — the matching
    // display-ready "TASK B4" label is already on each entry in
    // taskAnalysis[id].taskCode below.
    sourceTaskIds,
    // Present even when empty, so Module Builder can tell "no Task
    // Analysis available for this module" apart from "field missing" —
    // relevant for projects created before Task Analysis existed.
    taskAnalysis
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
