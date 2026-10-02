// ============================================================
// /tabs.js
// Tab click setup (non-switchTab tabs, i.e. all except the
// ones gated by clusteringAllowed which go via switchTab).
// ============================================================

import { appState } from './state.js';
import { addDuty } from './duties.js';
import { initializeClusteringFromTasks } from './modules.js';
import { syncVerificationTab } from './tasks.js';
import { renderPCSourceList, renderLearningOutcomes,
  renderModuleLoList, renderModules,
  renderAvailableTasks, renderClusters } from './modules.js';
import { syncTaskAnalysisTab } from './task_analysis.js';
import { renderModuleCurriculum } from './module_curriculum.js';

export function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function () {
      const tabId = this.getAttribute('data-tab');

      // clustering-tab is guarded by switchTab() – do not wire it here directly
      // (The HTML button for clustering tab should call window.switchTab)
      if (tabId === 'clustering-tab') return;

      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      this.classList.add('active');
      const content = document.getElementById(tabId);
      if (content) content.classList.add('active');

      // Side-effects per tab
      if (tabId === 'duties-tab') {
        const dutiesContainer = document.getElementById('dutiesContainer');
        if (dutiesContainer && dutiesContainer.children.length === 0) {
          addDuty();   // seeds its own first task — see duties.js
        }
      }

      // Same re-render-on-entry rule as switchTab() in projects.js —
      // both entry points must behave identically or the tab's freshness
      // would depend on which one the user happened to use.
      if (tabId === 'clustering-tab') {
        renderAvailableTasks();
        renderClusters();
      }

      // Task Verification was the one tab missing from this
      // re-render-on-entry list, which is why its duties only appeared
      // after a manual Refresh. syncVerificationTab() is conditional —
      // it rebuilds only when the duty/task set actually changed.
      if (tabId === 'verification-tab') {
        syncVerificationTab();
      }

      // Same "rebuild only if the duty/task set changed" rule as
      // Task Verification above — see syncTaskAnalysisTab().
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
    });
  });
}
