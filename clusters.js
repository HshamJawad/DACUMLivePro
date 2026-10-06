// ============================================================
// /clusters.js  (3.76.0 — split out of modules.js, code unchanged)
// Competency Clustering: the clusters tab, task controls inside a
// competency card, keeping clustering in step with Duties & Tasks,
// carrying cluster changes into Learning Outcomes, Range and criteria
// editing, criteria from two sources.
//
// Other files import these through modules.js, which re-exports
// every curriculum file; nothing outside needs to know the split.
// ============================================================

import { appState } from './state.js';
import { showStatus } from './renderer.js';
import { lwExtractDutiesAndTasks } from './workshop.js';
import { getTaskCode, CLUSTER_ADDED_TASK_PREFIX } from './codes.js';
import { clearAIDraft, restoreAIDraft, isAIDraft, canRestoreAI, aiMarkHTML, removeAIMark } from './ai_draft.js';
import { CLUSTER_TASK_SOURCE_ADDED, _esc, _getClusterEffectiveCriteria, _persistClusters, _t, _taskLabel, _tf, _tx, _txf, isClusterAddedTask, switchTab } from './modules_shared.js';
import { renderCoverageMatrix, renderModuleLoList, setCoverageGapsOnly, setModuleCode, setModuleLabelMode, setModuleLevel, setModuleLevelCount, setModuleShortName, setModuleTrack } from './module_mapping.js';
import { renderLearningOutcomes, renderModules, renderPCSourceList } from './learning_outcomes.js';

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
    _trackTaCriteriaCount(cluster, clusterNumber, taCriteria.length);
    let displayValue = '';
    if (cluster.performanceCriteria && cluster.performanceCriteria.length > 0) {
      displayValue = cluster.performanceCriteria
        .map((criterion, idx) => `${clusterNumber}-${taCriteria.length + idx + 1} ${criterion}`)
        .join('\n');
    }

    html += `
      <div class="cluster-item">
        <div class="cluster-header">
          <div class="cluster-title"><bdi>C${clusterNumber}</bdi> — <span dir="auto">${_esc(cluster.name)}</span></div>
          <div class="cluster-actions">
            <button type="button" class="btn-ai-cluster" data-action="regen-cluster-criteria" data-cluster-id="${cluster.id}"
                    title="${_esc(_t('ttRegenCriteria'))}">✨ ${_t('btnAICriteria')}</button>
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
            <h4>🎯 ${_t('lblRange')}${_clAiBadge(cluster, 'range')}</h4>
            <button type="button" class="tab-help-btn" data-action="show-pc-range-help" title="${_t('ttPCRangeHelp')}" aria-label="${_t('ttPCRangeHelp')}" aria-haspopup="dialog">?</button>
          </div>
          <div class="cluster-helper-text">${_t('hintRange')}</div>
          <textarea id="range_${cluster.id}" data-action="update-cluster-range" data-cluster-id="${cluster.id}" dir="auto">${_esc(cluster.range || '')}</textarea>
        </div>

        <div class="cluster-section">
          <div class="cluster-section-header">
            <h4>✅ ${_t('lblPerformanceCriteria')}${_clAiBadge(cluster, 'criteria')}</h4>
            <button type="button" class="tab-help-btn" data-action="show-pc-range-help" title="${_t('ttPCRangeHelp')}" aria-label="${_t('ttPCRangeHelp')}" aria-haspopup="dialog">?</button>
          </div>
          <div class="cluster-helper-text">${_t('hintCriteria')}</div>
          ${_renderCritRenumberNote(cluster)}
          <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#fff;">
            ${taCriteria.length ? `
              <div class="crit-ta-block">
                <div class="crit-ta-title">🔬 ${_esc(_t('lblFromTaskAnalysis'))}</div>
                ${taCriteria.map(c => `
                  <div class="crit-ta-row" dir="auto">
                    <span><bdi>${c.id}</bdi> ${_esc(c.text)} <span class="crit-ta-code">[${_esc(_taskLabel(c.taskId))}]</span></span>
                  </div>`).join('')}
              </div>` : ''}
            <div class="crit-guide">${_esc(_tx(taCriteria.length ? 'critHintWithTA' : 'critHintNoTA'))}</div>
            <textarea id="criteria_${cluster.id}"
              data-cluster-number="${clusterNumber}"
              data-cluster-id="${cluster.id}"
              data-ta-count="${taCriteria.length}"
              data-action-focus="init-criteria-number"
              data-action-keydown="handle-criteria-keydown"
              data-action-blur="update-cluster-criteria-numbered"
              placeholder="${_t('phFirstCriterion')}"
              style="min-height:100px;border:none;border-radius:0;box-shadow:none;display:block;width:100%;box-sizing:border-box;padding:10px 14px;">${_esc(displayValue)}</textarea>
          </div>
          ${_renderCritDupNote(cluster, clusterNumber, taCriteria)}
        </div>
      </div>`;
  });

  container.innerHTML = html;
  if (_taCountDirty) { _taCountDirty = false; _persistClusters(); }
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

export function _reconcileLearningOutcomes() {
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

export function _refreshModuleOutcomes() {
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

export function _renderLoNotice(listEl) {
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
    else if (t.matches('#coverageMatrixSection .cov-gaps-only')) { setCoverageGapsOnly(t.checked); renderCoverageMatrix(); }
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
  if (!cluster) return;
  if (value !== (cluster.range || '')) _clearClusterAiPart(cluster, 'range');
  cluster.range = value;
}

// ── AI draft marks on a cluster (3.71.0) ─────────────────────────
// clustering_ai.js sets cluster._aiDraft[part] = true for a generated
// Range ('range') or criteria set ('criteria'), and keeps what it
// replaced in cluster._aiPrev[part]. The mark and the kept value go on
// the user's first real edit of that part, or on restore.
function _clAiBadge(cluster, part) {
  if (!isAIDraft(cluster, part)) return '';
  return aiMarkHTML({ markId: 'cl|' + cluster.id + '|' + part, restore: canRestoreAI(cluster, part),
                      action: 'restore-cluster-ai', data: { 'cluster-id': cluster.id, part } });
}

function _clearClusterAiPart(cluster, part) {
  if (clearAIDraft(cluster, part)) removeAIMark('cl|' + cluster.id + '|' + part);
}

/** "↶ Restore previous" on a cluster's Range or criteria. */
export function restoreClusterAI(clusterId, part) {
  const cluster = (appState.clusteringData?.clusters || []).find(c => c.id === clusterId);
  if (!cluster) return false;
  const ok = restoreAIDraft(cluster, part, (k, v) => {
    if (k === 'range') cluster.range = v;
    else cluster.performanceCriteria = Array.isArray(v) ? v : [];
  });
  if (!ok) return false;
  renderClusters();
  _persistClusters();
  showStatus(_t('taAiRestored') + ' ✓', 'success');
  return true;
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
  // A blur without a change must not drop the AI mark (3.71.0).
  const before = (cluster.performanceCriteria || []).map(x => String(x || '').trim()).filter(Boolean);
  if (JSON.stringify(before) !== JSON.stringify(stripped)) _clearClusterAiPart(cluster, 'criteria');
  cluster.performanceCriteria = stripped;
  _refreshCritDupNote(cluster);
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

// ── Criteria from two sources (3.52.0) ─────────────────────────
// A competency shows its Task Analysis criteria first (read-only,
// numbered N-1…) and the criteria typed in its box after them. These
// helpers warn about a typed criterion that repeats a Task Analysis one
// (it would be counted twice) and explain the renumbering of the typed
// criteria when the Task Analysis criteria of the competency change.

/* Same normalisation as clustering_ai.js: case, spaces, end punctuation. */
function _critNorm(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').replace(/[\s.。;؛,،!?؟:]+$/u, '').trim();
}

function _critDuplicates(cluster, clusterNumber, taCriteria) {
  if (!taCriteria.length) return [];
  const byText = new Map();
  taCriteria.forEach(c => { const k = _critNorm(c.text); if (k && !byText.has(k)) byText.set(k, c); });
  const out = [];
  (cluster.performanceCriteria || []).forEach((text, i) => {
    const hit = byText.get(_critNorm(text));
    if (hit) out.push({ id: `${clusterNumber}-${taCriteria.length + i + 1}`, src: hit });
  });
  return out;
}

function _renderCritDupNote(cluster, clusterNumber, taCriteria) {
  const dups = _critDuplicates(cluster, clusterNumber, taCriteria);
  const body = dups.map(d => `<div>⚠ ${_esc(_txf('critDupNote', {
      n: d.id, src: `${d.src.id} · ${_taskLabel(d.src.taskId)}` }))}</div>`).join('');
  return `<div class="crit-dup-note" id="critdup_${_esc(cluster.id)}" role="status"${dups.length ? '' : ' hidden'}>${body}</div>`;
}

function _refreshCritDupNote(cluster) {
  const el = typeof document !== 'undefined' && document.getElementById('critdup_' + cluster.id);
  if (!el) return;
  const cd = appState.clusteringData;
  const idx = (cd.clusters || []).indexOf(cluster);
  if (idx < 0) return;
  const ta = _getClusterEffectiveCriteria(cluster, idx + 1).filter(c => c.source === 'ta');
  el.outerHTML = _renderCritDupNote(cluster, idx + 1, ta);
}

/* cluster.taCriteriaCount remembers how many Task Analysis criteria the
   competency had when it was last drawn, so a change made in the Task
   Analysis tab can be explained here. Absent (older projects) = record
   silently, no notice. Notices last until dismissed or page reload. */
const _critRenumber = new Map();
let _taCountDirty = false;

function _trackTaCriteriaCount(cluster, clusterNumber, count) {
  const prev = cluster.taCriteriaCount;
  if (prev === count) return;
  cluster.taCriteriaCount = count;
  /* First record on an older project: no save of its own — it rides
     along with the next save. A real change is saved at once. */
  if (typeof prev === 'number') _taCountDirty = true;
  const typed = (cluster.performanceCriteria || []).length;
  if (typeof prev !== 'number' || !typed) { _critRenumber.delete(cluster.id); return; }
  const first = _critRenumber.get(cluster.id);
  _critRenumber.set(cluster.id, {
    from: first ? first.from : prev, to: count,
    firstNo: `${clusterNumber}-${count + 1}`, lastNo: `${clusterNumber}-${count + typed}`
  });
  if (first && first.from === count) _critRenumber.delete(cluster.id);   // back where it was
}

function _renderCritRenumberNote(cluster) {
  const n = _critRenumber.get(cluster.id);
  if (!n) return '';
  return `<div class="crit-renumber-note" role="status">
      <span>ℹ️ ${_esc(_txf('critRenumberNote', { from: n.from, to: n.to, first: n.firstNo, last: n.lastNo }))}</span>
      <button type="button" class="crit-renumber-ok" data-action="dismiss-crit-renumber" data-cluster-id="${_esc(cluster.id)}">${_esc(_tx('critRenumberDismiss'))}</button>
    </div>`;
}

export function dismissCriteriaRenumberNote(clusterId) {
  _critRenumber.delete(clusterId);
  renderClusters();
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
