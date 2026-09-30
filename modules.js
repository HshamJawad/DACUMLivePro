// ============================================================
// /modules.js
// Competency Clustering, Learning Outcomes, and Module Mapping
// ============================================================

import { appState } from './state.js';
import { showStatus } from './renderer.js';
import { lwExtractDutiesAndTasks } from './workshop.js';
import { getTaskCode, getDutyLabel } from './codes.js';
import { getTaskPerformanceCriteria, getTaskAnalysisRecord } from './task_analysis.js';

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
function _getClusterEffectiveCriteria(cluster, clusterNumber) {
  const items = [];
  cluster.tasks.forEach(task => {
    const taskId = task.id;
    getTaskPerformanceCriteria(taskId).forEach(text => {
      items.push({ text, taskId, source: 'ta' });
    });
  });
  (cluster.performanceCriteria || []).forEach(text => {
    items.push({ text, taskId: null, source: 'manual' });
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
            ${cluster.tasks.map((task, taskIndex) => {
              return `
                <div class="related-task-item" style="display:flex;justify-content:space-between;align-items:center;">
                  <div style="flex:1"><strong>${_taskLabel(task.id)}:</strong> ${task.text}</div>
                  <button class="btn-remove-task" data-action="remove-task-from-cluster"
                    data-cluster-id="${cluster.id}" data-task-index="${taskIndex}" style="margin-left:10px;">✕</button>
                </div>`;
            }).join('') || `<div style="color:#999;font-style:italic;">${_t('msgNoTasksAssigned')}</div>`}
          </div>
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
  cluster.tasks.push(task);
  cd.availableTasks.splice(taskIndex, 1);
  renderAvailableTasks();
  renderClusters();
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

  const cd = appState.clusteringData;
  if (!cd.clusters || cd.clusters.length === 0) {
    container.innerHTML = `<div class="no-tasks-message">${_t('msgNoPCAvailable')}</div>`;
    return;
  }

  const lo = appState.learningOutcomesData;
  const usedPCIds = new Set();
  lo.outcomes.forEach(outcome => {
    if (outcome.linkedCriteria) outcome.linkedCriteria.forEach(pc => usedPCIds.add(pc.id));
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
      taskId: found.taskId || null
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
          ${outcome.linkedCriteria.map(pc => `
            <div class="lo-linked-item">
              <div style="flex:1"><strong>${pc.id}:</strong> ${pc.text}${pc.taskId ? ` <span style="color:#94a3b8;font-size:0.85em;">[${_taskLabel(pc.taskId)}]</span>` : ''}</div>
              <button class="btn-remove-task" data-action="unassign-pc-from-lo"
                data-lo-id="${outcome.id}" data-pc-id="${pc.id}" style="margin-left:10px;">✕</button>
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

  const alreadyInTarget = targetLO.linkedCriteria.some(pc => pc.id === pcId);
  if (!alreadyInTarget) {
    lo.outcomes.forEach(outcome => {
      const idx = outcome.linkedCriteria.findIndex(pc => pc.id === pcId);
      if (idx !== -1) outcome.linkedCriteria.splice(idx, 1);
    });
    const found = _findEffectiveCriterionById(pcId);
    if (found) {
      targetLO.linkedCriteria.push({
        id: found.id, text: found.text, clusterNumber: found.clusterNumber,
        taskId: found.taskId || null
      });
    }
  }

  renderPCSourceList();
  renderLearningOutcomes();
}

export function unassignPCFromLO(loId, pcId) {
  const lo = appState.learningOutcomesData.outcomes.find(o => o.id === loId);
  if (!lo) return;
  const idx = lo.linkedCriteria.findIndex(pc => pc.id === pcId);
  if (idx !== -1) lo.linkedCriteria.splice(idx, 1);
  renderPCSourceList();
  renderLearningOutcomes();
}

// ── Module Mapping ────────────────────────────────────────────

export function renderModuleLoList() {
  const container = document.getElementById('moduleLoList');
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
  const mm = appState.moduleMappingData;

  const modulesToSend = moduleId
    ? mm.modules.filter(m => m.id === moduleId)
    : mm.modules;

  if (moduleId && modulesToSend.length === 0) return;

  const exportObject = {
    source: 'DACUM Live Pro v1.0',
    exportDate: new Date().toISOString(),
    occupation,
    modules: modulesToSend.map(m => _buildModuleExport(m, mm.modules.indexOf(m) + 1))
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
        payload = { ...existing, exportDate: exportObject.exportDate, occupation, modules: [...others, ...exportObject.modules] };
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
