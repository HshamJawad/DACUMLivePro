// ============================================================
// /snapshots.js
// Save / Load entire application state as a JSON file.
// ============================================================

import { appState, normalizeModuleCurriculumData } from './state.js';
import { showStatus } from './renderer.js';
import { addDuty, addTask, syncAllFromDOM, renderDutiesFromState } from './duties.js';
import { renderSkillsLevel } from './renderer.js';
import { renderLearningOutcomes, renderPCSourceList } from './modules.js';
import { renderModules, renderModuleLoList } from './modules.js';
import { loadDutiesForVerification } from './tasks.js';
import { importProjectFromData, loadProject, renderProjectsSidebar } from './dacum_projects.js';
import { reportError } from './error-handler.js';
import { readProjects } from './project_store.js';

/* i18n access — resolved lazily; see duties.js for why. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);


// ── DACUM file validator ─────────────────────────────────────
// Returns true only when the parsed object looks like a file that
// was exported by DACUM Live Pro.  Rejects random JSON files
// before they can corrupt the sidebar.
function _isValidDacumFile(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const hasDuties    = Array.isArray(data.duties) || Array.isArray(data.dutiesData);
  const hasChartInfo = data.chartInfo && typeof data.chartInfo === 'object';
  return hasDuties || hasChartInfo;
}

// ── Save ──────────────────────────────────────────────────────

export function saveToJSON() {
  try {
    const data = {
      version: '1.0',
      savedDate: new Date().toISOString(),
      chartInfo: {
        dacumDate: document.getElementById('dacumDate').value,
        dacumDateEnd: document.getElementById('dacumDateEnd')?.value || '',
        venue: document.getElementById('venue').value,
        workshopFormat: document.getElementById('workshopFormat')?.value || 'inperson',
        producedFor: document.getElementById('producedFor').value,
        producedBy: document.getElementById('producedBy').value,
        occupationTitle: document.getElementById('occupationTitle').value,
        scopeOfWork: document.getElementById('scopeOfWork')?.value || '',
        jobTitle: document.getElementById('jobTitle').value,
        sector: document.getElementById('sector').value,
        context: document.getElementById('context').value,
        producedForImage: appState.producedForImage,
        producedByImage: appState.producedByImage,
        facilitators: (document.getElementById('facilitators')?.value || '').split('\n').map(s => s.trim()).filter(s => s),
        observers: (document.getElementById('observers')?.value || '').split('\n').map(s => s.trim()).filter(s => s),
        panelMembers: (document.getElementById('panelMembers')?.value || '').split('\n').map(s => s.trim()).filter(s => s)
      },
      duties: [],
      additionalInfo: {
        headings: {
          knowledge: document.getElementById('knowledgeHeading').textContent,
          skills: document.getElementById('skillsHeading').textContent,
          behaviors: document.getElementById('behaviorsHeading').textContent,
          tools: document.getElementById('toolsHeading').textContent,
          trends: document.getElementById('trendsHeading').textContent,
          acronyms: document.getElementById('acronymsHeading').textContent,
          careerPath: document.getElementById('careerPathHeading').textContent
        },
        content: {
          knowledge: document.getElementById('knowledgeInput').value,
          skills: document.getElementById('skillsInput').value,
          behaviors: document.getElementById('behaviorsInput').value,
          tools: document.getElementById('toolsInput').value,
          trends: document.getElementById('trendsInput').value,
          acronyms: document.getElementById('acronymsInput').value,
          careerPath: document.getElementById('careerPathInput').value
        },
        customSections: []
      }
    };

    // ── Collect duties from appState (works in both Table View & Card View) ──
    syncAllFromDOM();   // flush any unsaved textarea/input edits into state first
    (appState.dutiesData || []).forEach(duty => {
      const tasks = (duty.tasks || [])
        .map(t => (t.text || '').trim())
        .filter(t => t);
      data.duties.push({ duty: (duty.title || '').trim(), tasks });
    });
    // Also persist dutiesData directly so import can use richer format
    data.dutiesData = JSON.parse(JSON.stringify(appState.dutiesData || []));

    // Collect custom sections
    document.querySelectorAll('#customSectionsContainer .section-container').forEach(sectionDiv => {
      const headingElement = sectionDiv.querySelector('h3');
      const textareaElement = sectionDiv.querySelector('textarea');
      if (headingElement && textareaElement) {
        data.additionalInfo.customSections.push({
          heading: headingElement.textContent,
          content: textareaElement.value
        });
      }
    });

    // Verification data
    data.verification = {
      collectionMode: appState.collectionMode,
      workflowMode: appState.workflowMode,
      ratings: appState.verificationRatings,
      taskMetadata: appState.taskMetadata,
      workshopParticipants: appState.workshopParticipants,
      priorityFormula: appState.priorityFormula,
      trainingLoadMethod: appState.trainingLoadMethod,
      workshopCounts: appState.workshopCounts,
      workshopResults: appState.workshopResults
    };

    // Clustering
    data.competencyClusters = {
      clusters: appState.clusteringData.clusters || [],
      availableTasks: appState.clusteringData.availableTasks || [],
      clusterCounter: appState.clusteringData.clusterCounter || 0
    };

    // Learning Outcomes
    data.learningOutcomes = {
      outcomes: appState.learningOutcomesData.outcomes || [],
      outcomeCounter: appState.learningOutcomesData.outcomeCounter || 0
    };

    // Module Mapping
    data.moduleMapping = {
      modules: appState.moduleMappingData.modules || [],
      moduleCounter: appState.moduleMappingData.moduleCounter || 0
    };
    // Programme level count (was dropped on export before 3.33.0).
    if (appState.moduleMappingData.levelCount) {
      data.moduleMapping.levelCount = appState.moduleMappingData.levelCount;
    }
    // How modules are labelled (code / number / both) — 3.34.0.
    if (appState.moduleMappingData.labelMode) {
      data.moduleMapping.labelMode = appState.moduleMappingData.labelMode;
    }

    // Module Curriculum (3.33.0) — its own top-level key. Read back by
    // importProjectFromData(); older files simply lack it.
    if (appState.moduleCurriculumData) {
      data.moduleCurriculum = appState.moduleCurriculumData;
    }

    // Skills Level Matrix
    data.skillsLevelMatrix = appState.skillsLevelData;
    // Matrix columns (3.40.0). Written only when they differ from the four
    // defaults, so files of projects that keep the defaults are unchanged.
    if (Array.isArray(appState.skillsLevelColumns) && appState.skillsLevelColumns.length) {
      data.skillsLevelColumns = appState.skillsLevelColumns;
    }

    // Task Analysis — keyed the same way appState stores it (by task
    // inputId). importProjectFromData() in dacum_projects.js reads this
    // back as s.taskAnalysis; absent entirely in files saved before this
    // feature existed, which is what makes old exports import cleanly.
    data.taskAnalysis = appState.taskAnalysisData || {};
    data.taskAnalysisPriority = appState.taskAnalysisPriority || {};
    // 3.46.0: written only when the user added sections, so files of
    // projects without them are unchanged.
    if (Array.isArray(appState.taskAnalysisCustomSections) && appState.taskAnalysisCustomSections.length) {
      data.taskAnalysisCustomSections = appState.taskAnalysisCustomSections;
    }

    // Supplementary Occupational Verification — its own top-level key,
    // separate from data.verification so task results stay untouched.
    // Read back by importProjectFromData(); older files simply lack it.
    if (appState.supplementaryVerification) {
      data.supplementaryVerification = appState.supplementaryVerification;
    }

    // Download
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
    // Priority: active project name (sidebar) > occupationTitle > jobTitle > default
    let projectName = '';
    try {
      const activeId = localStorage.getItem('dacum_active_project') || '';
      const projects = readProjects();
      const activeProj = projects.find(p => p.id === activeId);
      if (activeProj && activeProj.name && activeProj.name !== 'Untitled DACUM Project') {
        projectName = activeProj.name.trim();
      }
    } catch(e) {}
    if (!projectName) {
      projectName = (data.chartInfo.occupationTitle || data.chartInfo.jobTitle || 'DACUM_Chart').trim();
    }
    const safeProjectName = projectName.replace(/[^a-z0-9؀-ۿ\s]/gi, '_').trim().replace(/\s+/g, '_');
    link.download = `${safeProjectName}_${dateStr}_${timeStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showStatus(_t('msgDataSaved') + ' ✓', 'success');
  } catch (error) {
    console.error('Error saving data:', error);
    showStatus(_tf('msgSaveError', { msg: error.message }), 'error');
    reportError(error, 'snapshots.js → saveToJSON');
  }
}

// ── Load ──────────────────────────────────────────────────────

export function loadFromJSON(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  // Reset input so same file(s) can be re-imported
  event.target.value = '';

  if (files.length > 1) {
    // ── Multi-file import: each file → new project in sidebar ──
    let imported = 0, failed = 0;
    const promises = files.map(file => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const data = JSON.parse(e.target.result);
          if (!_isValidDacumFile(data)) {
            const err = new Error('Not a valid DACUM project file: ' + file.name);
            err.name = 'InvalidDacumFile';
            throw err;
          }
          const { id, label } = importProjectFromData(data, file.name);
          imported++;
          resolve({ id, label });
        } catch(err) {
          console.error('Import error:', file.name, err);
          failed++;
          reportError(err, 'snapshots.js → loadFromJSON multi-file: ' + file.name);
          resolve(null);
        }
      };
      reader.readAsText(file);
    }));

    Promise.all(promises).then(results => {
      renderProjectsSidebar();
      const valid = results.filter(Boolean);
      // Load the last successfully imported project
      if (valid.length > 0) {
        loadProject(valid[valid.length - 1].id);
      }
      const msg = failed > 0
        ? `✅ Imported ${imported} project(s). ❌ ${failed} failed.`
        : `✅ ${imported} project(s) imported to sidebar.`;
      showStatus(msg, imported > 0 ? 'success' : 'error');
    });
    return;
  }

  // ── Single file import ──
  const file = files[0];

  try {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);

        // ── Validate structure before touching the sidebar ──
        if (!_isValidDacumFile(data)) {
          const err = new Error(
            'This file is not a valid DACUM project file.\n\n' +
            'Expected a .json file exported from DACUM Live Pro.\n' +
            'The selected file does not contain duties, tasks, or chart info.'
          );
          err.name = 'InvalidDacumFile';
          throw err;
        }

        // Create a new project from the imported file
        let id, label;
        try {
          const result = importProjectFromData(data, file.name);
          id    = result.id;
          label = result.label;
        } catch (importErr) {
          throw importErr;  // re-throw so outer catch handles it
        }

        renderProjectsSidebar();

        // Load the newly created project (applies state + renders UI)
        loadProject(id);
        showStatus('✅ ' + _tf('msgImportedAsNew', { name: label }), 'success');

      } catch (parseErr) {
        console.error('Import error:', parseErr);
        showStatus('❌ ' + _tf('msgInvalidJSONFile', { msg: parseErr.message }), 'error');
        reportError(parseErr, 'snapshots.js → loadFromJSON (single file)');
      }
    };
    reader.readAsText(file);
  } catch(err) {
    showStatus('❌ ' + _tf('msgFileReadError', { msg: err.message }), 'error');
    reportError(err, 'snapshots.js → loadFromJSON (file read)');
  }
}

// ── Legacy single-file load (kept for internal use) ──────────
export function loadFromJSONLegacy(event) {
  try {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);

        // Chart Info
        if (data.chartInfo) {
          const ci = data.chartInfo;
          document.getElementById('dacumDate').value = ci.dacumDate || '';
          const _end = document.getElementById('dacumDateEnd');
          if (_end) _end.value = ci.dacumDateEnd || '';
          const _fmt = document.getElementById('workshopFormat');
          if (_fmt) _fmt.value = ci.workshopFormat || 'inperson';
          document.getElementById('venue').value = ci.venue || '';
          document.getElementById('producedFor').value = ci.producedFor || '';
          document.getElementById('producedBy').value = ci.producedBy || '';
          document.getElementById('occupationTitle').value = ci.occupationTitle || '';
          const scopeEl = document.getElementById('scopeOfWork');
          if (scopeEl) scopeEl.value = ci.scopeOfWork || '';
          document.getElementById('jobTitle').value = ci.jobTitle || '';
          document.getElementById('sector').value = ci.sector || '';
          document.getElementById('context').value = ci.context || '';
          document.getElementById('facilitators').value = Array.isArray(ci.facilitators) ? ci.facilitators.join('\n') : '';
          document.getElementById('observers').value = Array.isArray(ci.observers) ? ci.observers.join('\n') : '';
          document.getElementById('panelMembers').value = Array.isArray(ci.panelMembers) ? ci.panelMembers.join('\n') : '';

          if (ci.producedForImage) {
            appState.producedForImage = ci.producedForImage;
            document.getElementById('producedForImagePreview').innerHTML = `<img src="${ci.producedForImage}" alt="Produced For logo">`;
            document.getElementById('producedForImagePreview').classList.add('has-image');
            document.getElementById('removeProducedForImage').style.display = 'inline-block';
          }
          if (ci.producedByImage) {
            appState.producedByImage = ci.producedByImage;
            document.getElementById('producedByImagePreview').innerHTML = `<img src="${ci.producedByImage}" alt="Produced By logo">`;
            document.getElementById('producedByImagePreview').classList.add('has-image');
            document.getElementById('removeProducedByImage').style.display = 'inline-block';
          }
        }

        // Duties & Tasks
        document.getElementById('dutiesContainer').innerHTML = '';
        appState.dutyCount = 0;
        appState.taskCounts = {};

        if (data.duties && data.duties.length > 0) {
          data.duties.forEach(dutyData => {
            addDuty();
            const currentDutyId = `duty_${appState.dutyCount}`;
            const dutyInput = document.querySelector(`[data-duty-id="${currentDutyId}"]`);
            if (dutyInput) dutyInput.value = dutyData.duty || '';
            if (dutyData.tasks && Array.isArray(dutyData.tasks)) {
              dutyData.tasks.forEach(taskText => {
                addTask(currentDutyId);
                const taskInputs = document.querySelectorAll(`[data-task-id^="${currentDutyId}_"]`);
                const lastTaskInput = taskInputs[taskInputs.length - 1];
                if (lastTaskInput) lastTaskInput.value = taskText;
              });
            }
          });
        } else {
          addDuty();
          addTask(`duty_${appState.dutyCount}`);
        }

        // Sync DOM values → appState.dutiesData (titles and task texts)
        syncAllFromDOM();

        // Additional Info
        if (data.additionalInfo) {
          const ai = data.additionalInfo;
          if (ai.headings) {
            document.getElementById('knowledgeHeading').textContent = ai.headings.knowledge || 'Knowledge Requirements';
            document.getElementById('skillsHeading').textContent = ai.headings.skills || 'Skills Requirements';
            document.getElementById('behaviorsHeading').textContent = ai.headings.behaviors || 'Worker Behaviors/Traits';
            document.getElementById('toolsHeading').textContent = ai.headings.tools || 'Tools, Equipment, Supplies and Materials';
            document.getElementById('trendsHeading').textContent = ai.headings.trends || 'Future Trends and Concerns';
            document.getElementById('acronymsHeading').textContent = ai.headings.acronyms || 'Acronyms';
            document.getElementById('careerPathHeading').textContent = ai.headings.careerPath || 'Career Path';
          }
          if (ai.content) {
            document.getElementById('knowledgeInput').value = ai.content.knowledge || '';
            document.getElementById('skillsInput').value = ai.content.skills || '';
            document.getElementById('behaviorsInput').value = ai.content.behaviors || '';
            document.getElementById('toolsInput').value = ai.content.tools || '';
            document.getElementById('trendsInput').value = ai.content.trends || '';
            document.getElementById('acronymsInput').value = ai.content.acronyms || '';
            document.getElementById('careerPathInput').value = ai.content.careerPath || '';
          }
          // Custom sections
          document.getElementById('customSectionsContainer').innerHTML = '';
          appState.customSectionCounter = 0;
          if (ai.customSections && Array.isArray(ai.customSections)) {
            ai.customSections.forEach(section => {
              appState.customSectionCounter++;
              const sectionId = `customSection${appState.customSectionCounter}`;
              const headingId = `${sectionId}Heading`;
              const inputId = `${sectionId}Input`;
              const container = document.getElementById('customSectionsContainer');
              const sectionDiv = document.createElement('div');
              sectionDiv.className = 'section-container';
              sectionDiv.id = sectionId;
              sectionDiv.innerHTML = `
                <div class="section-header-editable">
                  <h3 id="${headingId}" contenteditable="false">${section.heading || `Custom Section ${appState.customSectionCounter}`}</h3>
                  <div style="display:flex;gap:10px;">
                    <button class="btn-rename" data-action="toggle-heading" data-heading-id="${headingId}">✏️ Rename</button>
                    <button class="btn-clear-section" data-action="clear-section" data-input-id="${inputId}" data-heading-id="${headingId}" data-default="Custom Section ${appState.customSectionCounter}">🗑️ Clear</button>
                    <button class="btn-remove-section" data-action="remove-custom-section" data-section-id="${sectionId}" style="background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);color:white;padding:8px 16px;font-size:0.95em;border:none;border-radius:8px;cursor:pointer;">❌ Remove</button>
                  </div>
                </div>
                <textarea id="${inputId}" placeholder="Enter information for this custom section on separate lines">${section.content || ''}</textarea>
              `;
              container.appendChild(sectionDiv);
            });
          }
        }

        // Verification data
        if (data.verification) {
          const v = data.verification;
          appState.collectionMode = v.collectionMode || 'workshop';
          appState.workflowMode = v.workflowMode || 'standard';
          appState.verificationRatings = v.ratings || {};
          appState.taskMetadata = v.taskMetadata || {};
          appState.workshopParticipants = v.workshopParticipants || 10;
          appState.priorityFormula = v.priorityFormula || 'if';
          appState.trainingLoadMethod = v.trainingLoadMethod || 'advanced';
          appState.workshopCounts = v.workshopCounts || {};
          appState.workshopResults = v.workshopResults || {};

          const modeWorkshop = document.getElementById('mode-workshop');
          const modeSurvey = document.getElementById('mode-survey');
          if (modeWorkshop && modeSurvey) {
            modeWorkshop.checked = appState.collectionMode === 'workshop';
            modeSurvey.checked = appState.collectionMode === 'survey';
          }
          const wfStandard = document.getElementById('workflow-standard');
          const wfExtended = document.getElementById('workflow-extended');
          if (wfStandard && wfExtended) {
            wfStandard.checked = appState.workflowMode === 'standard';
            wfExtended.checked = appState.workflowMode === 'extended';
          }
          const wpInput = document.getElementById('workshopParticipants');
          if (wpInput) wpInput.value = appState.workshopParticipants;

          loadDutiesForVerification();
        }

        // Competency Clusters
        if (data.competencyClusters) {
          appState.clusteringData.clusters = data.competencyClusters.clusters || [];
          appState.clusteringData.availableTasks = data.competencyClusters.availableTasks || [];
          appState.clusteringData.clusterCounter = data.competencyClusters.clusterCounter || 0;
        } else {
          appState.clusteringData.clusters = [];
          appState.clusteringData.availableTasks = [];
          appState.clusteringData.clusterCounter = 0;
        }

        // Learning Outcomes
        if (data.learningOutcomes) {
          appState.learningOutcomesData.outcomes = data.learningOutcomes.outcomes || [];
          appState.learningOutcomesData.outcomeCounter = data.learningOutcomes.outcomeCounter || 0;
        } else {
          appState.learningOutcomesData.outcomes = [];
          appState.learningOutcomesData.outcomeCounter = 0;
        }
        renderLearningOutcomes();
        renderPCSourceList();

        // Module Mapping
        if (data.moduleMapping) {
          appState.moduleMappingData.modules = data.moduleMapping.modules || [];
          appState.moduleMappingData.moduleCounter = data.moduleMapping.moduleCounter || 0;
          if (data.moduleMapping.levelCount) appState.moduleMappingData.levelCount = data.moduleMapping.levelCount;
          if (data.moduleMapping.labelMode) appState.moduleMappingData.labelMode = data.moduleMapping.labelMode;
        } else {
          appState.moduleMappingData.modules = [];
          appState.moduleMappingData.moduleCounter = 0;
        }
        renderModules();
        renderModuleLoList();

        // Module Curriculum (absent in files saved before 3.33.0)
        appState.moduleCurriculumData = normalizeModuleCurriculumData(data.moduleCurriculum);

        // Skills Level Matrix
        appState.skillsLevelColumns = Array.isArray(data.skillsLevelColumns) && data.skillsLevelColumns.length
          ? data.skillsLevelColumns : null;
        if (Array.isArray(data.skillsLevelMatrix)) {
          appState.skillsLevelData = data.skillsLevelMatrix;
          renderSkillsLevel();
        }

        // Reset decision safety
        appState.verificationDecisionMade = false;
        appState.clusteringAllowed = false;
        document.getElementById('btnLWFinalize').disabled = false;
        document.getElementById('btnBypassToClustering').disabled = false;
        document.getElementById('btnResetDecision').style.display = 'none';

        // Switch to Chart Info tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-tab="info-tab"]').classList.add('active');
        document.getElementById('info-tab').classList.add('active');

        showStatus(_t('msgDataLoaded') + ' ✓', 'success');
        event.target.value = '';
      } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
        showStatus(_t('msgInvalidJSON'), 'error');
        reportError(parseError, 'snapshots.js → loadFromJSONLegacy');
      }
    };
    reader.readAsText(file);
  } catch (error) {
    console.error('Error loading file:', error);
    showStatus(_tf('msgLoadFileError', { msg: error.message }), 'error');
    reportError(error, 'snapshots.js → loadFromJSONLegacy (file read)');
  }
}
