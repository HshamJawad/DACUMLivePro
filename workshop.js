// ============================================================
// /workshop.js
// Live Workshop Module — session creation, voting, results
// ============================================================

import { appState } from './state.js';
import { showStatus } from './renderer.js';
import { getSupplementaryItemsForLiveSession,
         applyLiveSupplementaryResults } from './supplementary_verification.js';


/* 3.79.0: the document is written in the project's CONTENT language
   (Settings → Languages) — labels, direction, plural forms — which may
   differ from the interface language. Only the synchronous build runs
   under it; see withLang() in translations.js. */
const _inContentLang = (fn) =>
  (window.i18n && window.i18n.withContentLang) ? window.i18n.withContentLang(fn) : fn();

/* i18n access — resolved lazily; see duties.js for why. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);


export const LW_API_BASE = 'https://live-session-backend-production.up.railway.app/api';

// ── Helpers ──────────────────────────────────────────────────

export function lwGenerateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function lwEscapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function lwEscapeCSV(text) {
  return text.replace(/"/g, '""');
}

// ── Extract duties/tasks from DOM ─────────────────────────────

export function lwExtractDutiesAndTasks() {
  // ── State-first: read from appState.dutiesData (always in sync) ──
  // This works correctly in both Table View and Card View.
  const stateData = (appState && appState.dutiesData) ? appState.dutiesData : [];

  if (stateData.length > 0) {
    const duties = {};
    stateData.forEach(duty => {
      const title = (duty.title || '').trim();
      if (!title) return;
      const tasks = (duty.tasks || [])
        .filter(t => (t.text || '').trim())
        .map(t => ({ id: t.inputId, text: t.text.trim() }));
      if (tasks.length > 0) {
        duties[duty.id] = { title, tasks };
      }
    });
    return duties;
  }

  // ── DOM fallback: handles both input (table) and textarea (card) ──
  const duties = {};
  const dutyContainers = document.querySelectorAll('.duty-row');

  dutyContainers.forEach(dutyContainer => {
    const dutyId = dutyContainer.id;
    // Match both <input> and <textarea> with data-duty-id
    const dutyInput = dutyContainer.querySelector(`[data-duty-id="${dutyId}"]`);
    const dutyTitle = dutyInput ? dutyInput.value.trim() : '';
    if (!dutyTitle) return;

    const tasks = [];
    // Match both <input> and <textarea> with data-task-id
    const taskInputs = dutyContainer.querySelectorAll(`[data-task-id^="${dutyId}_"]`);
    taskInputs.forEach(taskInput => {
      const taskText = taskInput.value.trim();
      if (taskText) tasks.push({ id: taskInput.getAttribute('data-task-id'), text: taskText });
    });

    if (tasks.length > 0) {
      duties[dutyId] = { title: dutyTitle, tasks };
    }
  });

  return duties;
}

// ── Section visibility ────────────────────────────────────────

export function lwCheckAndShowSection() {
  const collectionMode = document.querySelector('input[name="collectionMode"]:checked')?.value;
  const lwSection = document.getElementById('liveWorkshopSection');
  if (lwSection) {
    lwSection.style.display = collectionMode === 'workshop' ? 'block' : 'none';
  }
}

// ── Phase 1: Finalize & Create Session ───────────────────────

export async function lwFinalizeAndCreateSession() {
  const occupationField = document.getElementById('occupationTitleInput') || document.getElementById('occupationTitle');
  const jobTitleField   = document.getElementById('jobTitleInput') || document.getElementById('jobTitle');
  const occupation = occupationField?.value.trim() || '';
  const jobTitle   = jobTitleField?.value.trim() || '';

  if (!occupation || !jobTitle) {
    showStatus(_t('lwNeedTitles'), 'error');
    return;
  }

  const duties = lwExtractDutiesAndTasks();
  if (Object.keys(duties).length === 0) {
    showStatus(_t('lwNeedDuties'), 'error');
    return;
  }

  let valid = true;
  Object.keys(duties).forEach(dutyId => {
    const duty = duties[dutyId];
    if (!duty.title.trim()) { showStatus(_tf('lwDutyNeedsTitle', { id: dutyId }), 'error'); valid = false; }
    if (duty.tasks.length === 0) { showStatus(_tf('lwDutyNeedsTask', { title: duty.title }), 'error'); valid = false; }
    duty.tasks.forEach(task => {
      if (!task.text.trim()) { showStatus(_t('lwFillTaskDesc'), 'error'); valid = false; }
    });
  });
  if (!valid) return;

  const selectedFormula = document.querySelector('input[name="priorityFormula"]:checked')?.value || 'if';

  appState.lwFinalizedData = {
    occupation, jobTitle,
    priorityFormula: selectedFormula,
    duties: JSON.parse(JSON.stringify(duties))
  };

  /* Supplementary Occupational Verification — only when the optional
     feature is enabled AND has items. Otherwise the key is absent and
     the participant form shows tasks only, exactly as before. */
  const _supp = getSupplementaryItemsForLiveSession();
  if (_supp) appState.lwFinalizedData.supplementary = _supp;

  appState.lwIsFinalized = true;
  document.getElementById('btnLWFinalize').disabled = true;
  appState.lwSessionId = lwGenerateId();

  try {
    const response = await fetch(`${LW_API_BASE}/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: appState.lwSessionId, data: appState.lwFinalizedData })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();

    if (result.success) {
      showStatus('✅ ' + _t('lwSessionCreated'), 'success');

      appState.verificationDecisionMade = true;
      appState.clusteringAllowed = true;
      document.getElementById('btnBypassToClustering').disabled = true;
      document.getElementById('btnResetDecision').style.display = 'inline-block';

      document.getElementById('lwStep1-finalize').style.display = 'none';
      document.getElementById('lwStep2-session').style.display = 'block';
      document.getElementById('lwSessionId').textContent = appState.lwSessionId;

      const currentPath = window.location.pathname;
      const directory = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
      const participantFileUrl = window.location.origin + directory + 'DACUM_LiveWorkshop_Participant.html';
      /* The participant page is opened on someone else's phone, where
         nothing about this workshop is known — no stored preference, no
         shared localStorage. Carrying the language in the link means a
         participant scans the QR code and simply gets the workshop's
         language, with no setup and no instructions from the floor.
         They can still override it with the switcher on that page. */
      const lang = (window.i18n ? window.i18n.getLang() : 'en');
      const participantUrl = `${participantFileUrl}?lwsession=${appState.lwSessionId}&lang=${lang}`;
      const shortLink = `DACUM_LiveWorkshop_Participant.html?lwsession=${appState.lwSessionId}&lang=${lang}`;
      const linkElement = document.getElementById('lwParticipantLink');
      linkElement.textContent = shortLink;
      linkElement.setAttribute('data-full-url', participantUrl);
    } else {
      throw new Error(result.error || 'Failed to create session');
    }
  } catch (error) {
    console.error('Error creating session:', error);
    showStatus(_tf('lwSessionError', { msg: error.message }), 'error');
    appState.lwIsFinalized = false;
    appState.lwSessionId = null;
    document.getElementById('btnLWFinalize').disabled = false;
  }
}

// ── Copy link ─────────────────────────────────────────────────

export function lwCopyLink() {
  const linkElement = document.getElementById('lwParticipantLink');
  const fullUrl = linkElement.getAttribute('data-full-url');
  const feedback = document.getElementById('lwCopyFeedback');

  navigator.clipboard.writeText(fullUrl).then(() => {
    feedback.style.display = 'inline';
    setTimeout(() => { feedback.style.display = 'none'; }, 2000);
    showStatus('✅ ' + _t('lwLinkCopied'), 'success');
  }).catch(() => { showStatus(_t('lwCopyFailed'), 'error'); });
}

// ── QR Code ───────────────────────────────────────────────────

let lwQRInstance = null;

export function lwShowQRCode() {
  const linkElement = document.getElementById('lwParticipantLink');
  if (!linkElement) { showStatus(_t('lwNoLinkElement'), 'error'); return; }
  const fullUrl = linkElement.getAttribute('data-full-url');
  if (!fullUrl) { showStatus(_t('lwNoLink'), 'error'); return; }
  if (typeof QRCode === 'undefined') { showStatus(_t('lwQRLibMissing'), 'error'); return; }

  const modal = document.getElementById('lwQRModal');
  if (modal) modal.style.display = 'block';

  const container = document.getElementById('qrCodeContainer');
  if (!container) { showStatus(_t('lwQRContainerMissing'), 'error'); return; }

  container.innerHTML = '';
  lwQRInstance = null;

  lwQRInstance = new QRCode(container, {
    text: fullUrl, width: 340, height: 340,
    colorDark: '#000000', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

  container.style.padding = '20px';
  container.style.background = '#ffffff';
}

export function lwCloseQRModal() {
  const modal = document.getElementById('lwQRModal');
  if (modal) modal.style.display = 'none';
}

export function lwDownloadQRPNG() {
  const container = document.getElementById('qrCodeContainer');
  if (!container) return;

  const qrImg = container.querySelector('img');
  const qrCanvas = container.querySelector('canvas');
  let sourceCanvas;

  if (qrCanvas) {
    sourceCanvas = qrCanvas;
  } else if (qrImg) {
    sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = qrImg.naturalWidth;
    sourceCanvas.height = qrImg.naturalHeight;
    sourceCanvas.getContext('2d').drawImage(qrImg, 0, 0);
  } else { alert(_t('msgQRNotFound')); return; }

  const border = 24;
  const exportSize = sourceCanvas.width + border * 2;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = exportSize;
  exportCanvas.height = exportSize;

  const ctx = exportCanvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, exportSize, exportSize);
  ctx.drawImage(sourceCanvas, border, border);

  const link = document.createElement('a');
  link.href = exportCanvas.toDataURL('image/png');
  link.download = 'dacum-liveworkshop-qr.png';
  link.click();
}

// ── Apply voting results to data model ───────────────────────

export function lwApplyVotingResultsToDataModel() {
  if (!appState.lwFinalizedData || !appState.lwAggregatedResults) return;
  const { taskResults } = appState.lwAggregatedResults;
  const formula = appState.lwFinalizedData.priorityFormula || 'if';

  const allTasksWithResults = [];
  Object.keys(taskResults).forEach(taskId => {
    const voteData = taskResults[taskId];
    const priorityIndex = formula === 'ifd'
      ? voteData.avgImportance * voteData.avgFrequency * voteData.avgDifficulty
      : voteData.avgImportance * voteData.avgFrequency;
    allTasksWithResults.push({ taskId, ...voteData, priorityIndex });
  });

  allTasksWithResults.sort((a, b) => b.priorityIndex - a.priorityIndex);
  const taskRanks = {};
  allTasksWithResults.forEach((task, index) => { taskRanks[task.taskId] = index + 1; });

  // Reset workshopResults + workshopCounts so refreshDashboard() can display data
  if (!appState.workshopResults) appState.workshopResults = {};
  if (!appState.workshopCounts)  appState.workshopCounts  = {};

  Object.keys(appState.lwFinalizedData.duties).forEach(dutyId => {
    const duty = appState.lwFinalizedData.duties[dutyId];
    duty.tasks.forEach(task => {
      const voteData = taskResults[task.id];
      if (voteData) {
        const priorityIndex = formula === 'ifd'
          ? voteData.avgImportance * voteData.avgFrequency * voteData.avgDifficulty
          : voteData.avgImportance * voteData.avgFrequency;
        task.meanImportance = voteData.avgImportance;
        task.meanFrequency  = voteData.avgFrequency;
        task.meanDifficulty = voteData.avgDifficulty;
        task.priorityIndex  = priorityIndex;
        task.rank = taskRanks[task.id];

        // ── Sync into appState.workshopResults for refreshDashboard() ──
        // Key format used by tasks.js: "dutyId_task_taskInputId"
        const wsKey = `${dutyId}_task_${task.id}`;
        const voteCount = voteData.voteCount || appState.lwAggregatedResults.totalVotes || 0;

        // Reconstruct workshopCounts from vote averages × participant count
        appState.workshopCounts[wsKey] = {
          importance: Math.round(voteData.avgImportance * voteCount),
          frequency:  Math.round(voteData.avgFrequency  * voteCount),
          difficulty: Math.round(voteData.avgDifficulty * voteCount),
          count: voteCount
        };

        appState.workshopResults[wsKey] = {
          valid:           true,
          dutyId:          dutyId,
          dutyTitle:       duty.title,
          taskTitle:       task.text,
          meanImportance:  voteData.avgImportance,
          meanFrequency:   voteData.avgFrequency,
          meanDifficulty:  voteData.avgDifficulty,
          priorityIndex:   priorityIndex,
          participantCount: voteCount
        };
      }
    });
    duty.tasks.sort((a, b) => (b.priorityIndex || 0) - (a.priorityIndex || 0));
  });

  lwUpdateDOMWithReorderedTasks();
  // 3.86.3: same announcement as tasks.js notifyRatingsChanged().
  try { document.dispatchEvent(new CustomEvent('dacum:ratings-changed')); } catch (_) {}
}

export function lwUpdateDOMWithReorderedTasks() {
  Object.keys(appState.lwFinalizedData.duties).forEach(dutyId => {
    const duty = appState.lwFinalizedData.duties[dutyId];
    const dutyContainer = document.getElementById(dutyId);
    if (!dutyContainer) return;
    const taskListContainer = dutyContainer.querySelector('.task-list');
    if (!taskListContainer) return;

    taskListContainer.innerHTML = '';
    duty.tasks.forEach(task => {
      const taskDiv = document.createElement('div');
      taskDiv.className = 'task-item';
      taskDiv.innerHTML = `
        <input type="text" data-task-id="${task.id}"
          value="${task.text.replace(/"/g, '&quot;')}"
          placeholder="Enter task description" disabled>`;
      taskListContainer.appendChild(taskDiv);
    });
  });
}

// ── Fetch results ─────────────────────────────────────────────

export async function lwFetchResults() {
  if (!appState.lwSessionId) { showStatus(_t('lwNoSession'), 'error'); return; }

  try {
    const response = await fetch(`${LW_API_BASE}/get-results/${appState.lwSessionId}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();

    if (result.success) {
      appState.lwAggregatedResults = result.data;
      lwApplyVotingResultsToDataModel();  // also populates workshopResults

      // Supplementary items travel separately and never touch task
      // results or the Priority Index.
      if (result.data && result.data.supplementaryResults) {
        applyLiveSupplementaryResults(result.data.supplementaryResults);
      }
      lwDisplayResults();

      // ── Trigger dashboard refresh via registered callback ──
      if (typeof appState._onResultsRefreshed === 'function') {
        appState._onResultsRefreshed();
      }

      showStatus('✅ ' + _t('lwResultsRefreshed'), 'success');
      const exportBtns = document.getElementById('lwExportButtons');
      if (exportBtns) exportBtns.style.display = 'block';
    } else {
      throw new Error(result.error || 'Failed to fetch results');
    }
  } catch (error) {
    console.error('Error fetching results:', error);
    showStatus(_tf('lwFetchError', { msg: error.message }), 'error');
  }
}

// ── Display results ───────────────────────────────────────────

export function lwDisplayResults() {
  const container = document.getElementById('lwResultsContainer');
  if (!appState.lwAggregatedResults) {
    container.innerHTML = '<p style="color:#999;font-style:italic;text-align:center;padding:30px;">No votes received yet.</p>';
    return;
  }

  const { totalVotes } = appState.lwAggregatedResults;
  if (totalVotes === 0) {
    container.innerHTML = '<p style="color:#999;font-style:italic;text-align:center;padding:30px;">No votes received yet. Share the participant link to start collecting votes.</p>';
    return;
  }

  const allTasks = [];
  Object.keys(appState.lwFinalizedData.duties).forEach(dutyId => {
    const duty = appState.lwFinalizedData.duties[dutyId];
    duty.tasks.forEach(task => {
      if (task.priorityIndex !== undefined) {
        allTasks.push({ dutyTitle: duty.title, taskText: task.text,
          avgImportance: task.meanImportance, avgFrequency: task.meanFrequency,
          avgDifficulty: task.meanDifficulty, priorityIndex: task.priorityIndex, rank: task.rank });
      }
    });
  });
  allTasks.sort((a, b) => a.rank - b.rank);

  const formula = appState.lwFinalizedData.priorityFormula || 'if';
  const formulaText = formula === 'ifd'
    ? 'Average Importance × Average Frequency × Average Difficulty'
    : 'Average Importance × Average Frequency';

  let html = `
    <div style="background:white;padding:25px;border-radius:12px;border:2px solid #0284c7;">
      <h3 style="color:#0284c7;margin:0 0 20px 0;text-align:center;">📊 Voting Results Summary</h3>
      <div style="text-align:center;margin-bottom:25px;">
        <div style="display:inline-block;background:linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);color:white;padding:15px 30px;border-radius:12px;">
          <div style="font-size:0.9em;opacity:0.9;margin-bottom:5px;">Total Participants</div>
          <div style="font-size:2.5em;font-weight:700;">${totalVotes}</div>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;margin-top:20px;">
          <thead>
            <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
              <th style="padding:12px;text-align:left;font-weight:600;color:#0284c7;">Rank</th>
              <th style="padding:12px;text-align:left;font-weight:600;color:#0284c7;">Duty</th>
              <th style="padding:12px;text-align:left;font-weight:600;color:#0284c7;">Task</th>
              <th style="padding:12px;text-align:center;font-weight:600;color:#0284c7;">Avg<br>Importance</th>
              <th style="padding:12px;text-align:center;font-weight:600;color:#0284c7;">Avg<br>Frequency</th>
              <th style="padding:12px;text-align:center;font-weight:600;color:#0284c7;">Avg<br>Difficulty</th>
              <th style="padding:12px;text-align:center;font-weight:600;color:#0284c7;">Priority<br>Index</th>
            </tr>
          </thead>
          <tbody>`;

  allTasks.forEach((task, index) => {
    const rankColor = index < 3 ? '#10b981' : '#64748b';
    const rankBg    = index < 3 ? '#d1fae5' : '#f1f5f9';
    html += `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:12px;">
          <span style="background:${rankBg};color:${rankColor};padding:6px 12px;border-radius:20px;font-weight:700;font-size:0.95em;">#${task.rank}</span>
        </td>
        <td style="padding:12px;color:#334155;font-weight:500;">${lwEscapeHtml(task.dutyTitle)}</td>
        <td style="padding:12px;color:#475569;">${lwEscapeHtml(task.taskText)}</td>
        <td style="padding:12px;text-align:center;font-weight:600;color:#0284c7;">${task.avgImportance.toFixed(2)}</td>
        <td style="padding:12px;text-align:center;font-weight:600;color:#0284c7;">${task.avgFrequency.toFixed(2)}</td>
        <td style="padding:12px;text-align:center;font-weight:600;color:#0284c7;">${task.avgDifficulty.toFixed(2)}</td>
        <td style="padding:12px;text-align:center;font-weight:700;font-size:1.1em;color:#10b981;">${task.priorityIndex.toFixed(2)}</td>
      </tr>`;
  });

  html += `
          </tbody>
        </table>
      </div>
      <div style="margin-top:25px;padding:15px;background:#f0f7ff;border-radius:8px;border-left:4px solid #0284c7;">
        <p style="margin:0;color:#334155;font-size:0.9em;line-height:1.6;">
          <strong>Priority Index</strong> = ${formulaText}<br>
          <strong>Higher values</strong> indicate greater training priority and importance for the occupation.
        </p>
      </div>
    </div>`;

  container.innerHTML = html;
}

// ── Close voting ──────────────────────────────────────────────

export function lwCloseVoting() {
  if (!appState.lwSessionId) { showStatus(_t('lwNoSessionFound'), 'error'); return; }
  if (!confirm(_t('lwConfirmClose'))) return;
  localStorage.setItem('dacumVotingClosed_' + appState.lwSessionId, 'true');
  showStatus('✅ ' + _t('lwClosed'), 'success');
}

// ── Export JSON ───────────────────────────────────────────────

export function lwExportJSON() {
  if (!appState.lwFinalizedData || !appState.lwAggregatedResults) {
    showStatus(_t('lwNoResultsExport'), 'error'); return;
  }

  const exportData = {
    version: '1.0', savedDate: new Date().toISOString(),
    liveWorkshopSession: { sessionId: appState.lwSessionId,
      totalParticipants: appState.lwAggregatedResults.totalVotes, exportDate: new Date().toISOString() },
    chartInfo: {
      dacumDate: document.getElementById('dacumDate')?.value || '',
      producedFor: document.getElementById('producedFor')?.value || '',
      producedBy: document.getElementById('producedBy')?.value || '',
      occupationTitle: appState.lwFinalizedData.occupation,
      jobTitle: appState.lwFinalizedData.jobTitle,
      sector: document.getElementById('sector')?.value || '',
      context: document.getElementById('context')?.value || '',
      producedForImage: null, producedByImage: null
    },
    duties: [],
    additionalInfo: {
      headings: {
        knowledge: document.getElementById('knowledgeHeading')?.textContent || 'Knowledge & Subject Matter',
        skills: document.getElementById('skillsHeading')?.textContent || 'Skills',
        behaviors: document.getElementById('behaviorsHeading')?.textContent || 'Behaviors & Attitudes',
        tools: document.getElementById('toolsHeading')?.textContent || 'Tools & Equipment',
        trends: document.getElementById('trendsHeading')?.textContent || 'Future Trends & Technology',
        acronyms: document.getElementById('acronymsHeading')?.textContent || 'Acronyms',
        careerPath: document.getElementById('careerPathHeading')?.textContent || 'Career Path'
      },
      knowledge: document.getElementById('knowledgeInput')?.value || '',
      skills: document.getElementById('skillsInput')?.value || '',
      behaviors: document.getElementById('behaviorsInput')?.value || '',
      tools: document.getElementById('toolsInput')?.value || '',
      trends: document.getElementById('trendsInput')?.value || '',
      acronyms: document.getElementById('acronymsInput')?.value || '',
      careerPath: document.getElementById('careerPathInput')?.value || ''
    },
    customSections: [],
    verification: {
      collectionMode: 'workshop', workflowMode: 'standard',
      ratings: {}, taskMetadata: {},
      workshopParticipants: appState.lwAggregatedResults.totalVotes,
      priorityFormula: appState.lwFinalizedData.priorityFormula || 'if',
      trainingLoadMethod: 'advanced', workshopCounts: {}, workshopResults: {}
    }
  };

  Object.keys(appState.lwFinalizedData.duties).forEach(dutyId => {
    const duty = appState.lwFinalizedData.duties[dutyId];
    exportData.duties.push({ duty: duty.title, tasks: duty.tasks.map(t => t.text) });
    duty.tasks.forEach(task => {
      if (task.meanImportance !== undefined) {
        exportData.verification.workshopResults[task.id] = {
          valid: true, dutyId, dutyTitle: duty.title, taskText: task.text,
          meanImportance: task.meanImportance, meanFrequency: task.meanFrequency,
          meanDifficulty: task.meanDifficulty, priorityIndex: task.priorityIndex, rank: task.rank,
          totalResponses: appState.lwAggregatedResults.totalVotes
        };
      }
    });
  });

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${appState.lwFinalizedData.occupation}_${appState.lwFinalizedData.jobTitle}_LiveWorkshop_Results.json`.replace(/[^a-z0-9_]/gi, '_');
  a.click();
  URL.revokeObjectURL(url);
  showStatus('✅ ' + _t('lwJSONExported'), 'success');
}

// ── Export CSV ────────────────────────────────────────────────

export function lwExportCSV() {
  if (!appState.lwAggregatedResults) { showStatus(_t('lwNoResultsExport'), 'error'); return; }
  const { taskResults } = appState.lwAggregatedResults;
  const sortedTasks = Object.keys(taskResults)
    .map(k => taskResults[k])
    .sort((a, b) => b.priorityIndex - a.priorityIndex);

  let csv = 'Rank,Duty,Task,Avg Importance,Avg Frequency,Avg Difficulty,Priority Index\n';
  sortedTasks.forEach((task, index) => {
    csv += `${index + 1},"${lwEscapeCSV(task.dutyTitle)}","${lwEscapeCSV(task.taskText)}",${task.avgImportance.toFixed(2)},${task.avgFrequency.toFixed(2)},${task.avgDifficulty.toFixed(2)},${task.priorityIndex.toFixed(2)}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${appState.lwFinalizedData.occupation}_${appState.lwFinalizedData.jobTitle}_LiveWorkshop_Results.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus('✅ ' + _t('lwCSVExported'), 'success');
}

// ── Export Snapshot (pre-voting) ──────────────────────────────

export function lwExportSnapshot() {
  if (!appState.lwFinalizedData) { showStatus(_t('lwNoSnapshotExport'), 'error'); return; }

  const snapshotData = {
    version: '1.0', savedDate: new Date().toISOString(),
    liveWorkshopSession: { sessionId: appState.lwSessionId, type: 'PRE-VOTING SNAPSHOT', snapshotDate: new Date().toISOString() },
    chartInfo: {
      dacumDate: document.getElementById('dacumDate')?.value || '',
      producedFor: document.getElementById('producedFor')?.value || '',
      producedBy: document.getElementById('producedBy')?.value || '',
      occupationTitle: appState.lwFinalizedData.occupation,
      jobTitle: appState.lwFinalizedData.jobTitle,
      sector: document.getElementById('sector')?.value || '',
      context: document.getElementById('context')?.value || '',
      producedForImage: null, producedByImage: null
    },
    duties: [],
    additionalInfo: {
      headings: {
        knowledge: document.getElementById('knowledgeHeading')?.textContent || 'Knowledge & Subject Matter',
        skills: document.getElementById('skillsHeading')?.textContent || 'Skills',
        behaviors: document.getElementById('behaviorsHeading')?.textContent || 'Behaviors & Attitudes',
        tools: document.getElementById('toolsHeading')?.textContent || 'Tools & Equipment',
        trends: document.getElementById('trendsHeading')?.textContent || 'Future Trends & Technology',
        acronyms: document.getElementById('acronymsHeading')?.textContent || 'Acronyms',
        careerPath: document.getElementById('careerPathHeading')?.textContent || 'Career Path'
      },
      knowledge: document.getElementById('knowledgeInput')?.value || '',
      skills: document.getElementById('skillsInput')?.value || '',
      behaviors: document.getElementById('behaviorsInput')?.value || '',
      tools: document.getElementById('toolsInput')?.value || '',
      trends: document.getElementById('trendsInput')?.value || '',
      acronyms: document.getElementById('acronymsInput')?.value || '',
      careerPath: document.getElementById('careerPathInput')?.value || ''
    },
    customSections: [],
    skillsLevelMatrix: appState.skillsLevelData
  };

  Object.keys(appState.lwFinalizedData.duties).forEach(dutyId => {
    const duty = appState.lwFinalizedData.duties[dutyId];
    snapshotData.duties.push({ duty: duty.title, tasks: duty.tasks.map(t => t.text) });
  });

  const blob = new Blob([JSON.stringify(snapshotData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${appState.lwFinalizedData.occupation}_${appState.lwFinalizedData.jobTitle}_PreVoting_Snapshot.json`.replace(/[^a-z0-9_]/gi, '_');
  a.click();
  URL.revokeObjectURL(url);
  showStatus('✅ ' + _t('lwSnapshotDownloaded'), 'success');
}

// ── Export Verified PDF ───────────────────────────────────────

export function lwExportVerifiedPDF() { return _inContentLang(() => _lwExportVerifiedPDFImpl()); }
async function _lwExportVerifiedPDFImpl() {
  if (!appState.lwFinalizedData || !appState.lwAggregatedResults) {
    showStatus(_t('lwNoVerified'), 'error'); return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;

  const checkPageBreak = (space) => {
    if (yPos + space > pageHeight - margin) { doc.addPage(); yPos = margin; return true; }
    return false;
  };

  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('DACUM Live Pro', pageWidth / 2, yPos, { align: 'center' }); yPos += 8;
  doc.setFontSize(14);
  doc.text('Verified (Post-Vote) Results', pageWidth / 2, yPos, { align: 'center' }); yPos += 10;

  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Occupation: ${appState.lwFinalizedData.occupation}`, margin, yPos); yPos += 6;
  doc.text(`Job Title: ${appState.lwFinalizedData.jobTitle}`, margin, yPos); yPos += 6;
  doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPos); yPos += 6;
  const formula = appState.lwFinalizedData.priorityFormula || 'if';
  doc.text(`Priority Formula: ${formula === 'ifd' ? 'IF × D' : 'I × F'}`, margin, yPos); yPos += 6;
  doc.text(`Total Participants: ${appState.lwAggregatedResults.totalVotes}`, margin, yPos); yPos += 10;

  const allTasks = [];
  Object.keys(appState.lwFinalizedData.duties).forEach(dutyId => {
    const duty = appState.lwFinalizedData.duties[dutyId];
    duty.tasks.forEach(task => {
      if (task.priorityIndex !== undefined) {
        allTasks.push({ dutyTitle: duty.title, taskText: task.text,
          meanImportance: task.meanImportance, meanFrequency: task.meanFrequency,
          meanDifficulty: task.meanDifficulty, priorityIndex: task.priorityIndex, rank: task.rank });
      }
    });
  });
  allTasks.sort((a, b) => a.rank - b.rank);

  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('Rank', margin, yPos); doc.text('Duty', margin + 15, yPos);
  doc.text('Task', margin + 60, yPos); doc.text('I', margin + 140, yPos);
  doc.text('F', margin + 150, yPos); doc.text('D', margin + 160, yPos);
  doc.text('PI', margin + 170, yPos); yPos += 5;
  doc.line(margin, yPos, pageWidth - margin, yPos); yPos += 3;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  allTasks.forEach(task => {
    checkPageBreak(8);
    doc.text(String(task.rank), margin, yPos);
    doc.text((doc.splitTextToSize(task.dutyTitle, 40))[0] || '', margin + 15, yPos);
    doc.text((doc.splitTextToSize(task.taskText, 75))[0] || '', margin + 60, yPos);
    doc.text(task.meanImportance.toFixed(2), margin + 140, yPos);
    doc.text(task.meanFrequency.toFixed(2), margin + 150, yPos);
    doc.text(task.meanDifficulty.toFixed(2), margin + 160, yPos);
    doc.text(task.priorityIndex.toFixed(2), margin + 170, yPos);
    yPos += 6;
  });

  doc.save(`${appState.lwFinalizedData.occupation}_${appState.lwFinalizedData.jobTitle}_Verified_Results.pdf`.replace(/[^a-z0-9_]/gi, '_'));
  showStatus('✅ ' + _t('lwPDFExported'), 'success');
}

// ── Export Verified DOCX ──────────────────────────────────────

export function lwExportVerifiedDOCX() { return _inContentLang(() => _lwExportVerifiedDOCXImpl()); }
async function _lwExportVerifiedDOCXImpl() {
  if (!appState.lwFinalizedData || !appState.lwAggregatedResults) {
    showStatus(_t('lwNoVerified'), 'error'); return;
  }

  const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType } = docx;

  const allTasks = [];
  Object.keys(appState.lwFinalizedData.duties).forEach(dutyId => {
    const duty = appState.lwFinalizedData.duties[dutyId];
    duty.tasks.forEach(task => {
      if (task.priorityIndex !== undefined) {
        allTasks.push({ dutyTitle: duty.title, taskText: task.text,
          meanImportance: task.meanImportance, meanFrequency: task.meanFrequency,
          meanDifficulty: task.meanDifficulty, priorityIndex: task.priorityIndex, rank: task.rank });
      }
    });
  });
  allTasks.sort((a, b) => a.rank - b.rank);

  const formula = appState.lwFinalizedData.priorityFormula || 'if';
  const formulaText = formula === 'ifd' ? 'I × F × D' : 'I × F';

  const tableRows = [
    new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ text: 'Rank', bold: true })], width: { size: 8, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ text: 'Duty', bold: true })], width: { size: 22, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ text: 'Task', bold: true })], width: { size: 35, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ text: 'I', bold: true })], width: { size: 8, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ text: 'F', bold: true })], width: { size: 8, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ text: 'D', bold: true })], width: { size: 8, type: WidthType.PERCENTAGE } }),
      new TableCell({ children: [new Paragraph({ text: 'PI', bold: true })], width: { size: 11, type: WidthType.PERCENTAGE } })
    ]})
  ];

  allTasks.forEach(task => {
    tableRows.push(new TableRow({ children: [
      new TableCell({ children: [new Paragraph(String(task.rank))] }),
      new TableCell({ children: [new Paragraph(task.dutyTitle)] }),
      new TableCell({ children: [new Paragraph(task.taskText)] }),
      new TableCell({ children: [new Paragraph(task.meanImportance.toFixed(2))] }),
      new TableCell({ children: [new Paragraph(task.meanFrequency.toFixed(2))] }),
      new TableCell({ children: [new Paragraph(task.meanDifficulty.toFixed(2))] }),
      new TableCell({ children: [new Paragraph(task.priorityIndex.toFixed(2))] })
    ]}));
  });

  /* Named `doc`, not `document`.
     This was `const document = new Document(...)`, which shadowed the
     global `document` for the rest of the function — so the download
     step below called `createElement` on a docx Document object and
     threw a TypeError before the file could be saved. The export has
     never completed. Renaming the local is the whole fix; the document
     itself is unchanged. */
  const doc = new Document({
    sections: [{ children: [
      new Paragraph({ text: 'DACUM Live Pro', heading: 'Heading1', alignment: AlignmentType.CENTER }),
      new Paragraph({ text: 'Verified (Post-Vote) Results', heading: 'Heading2', alignment: AlignmentType.CENTER }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: `Occupation: ${appState.lwFinalizedData.occupation}` }),
      new Paragraph({ text: `Job Title: ${appState.lwFinalizedData.jobTitle}` }),
      new Paragraph({ text: `Date: ${new Date().toLocaleDateString()}` }),
      new Paragraph({ text: `Priority Formula: ${formulaText}` }),
      new Paragraph({ text: `Total Participants: ${appState.lwAggregatedResults.totalVotes}` }),
      new Paragraph({ text: '' }),
      new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } })
    ]}]
  });

  Packer.toBlob(doc).then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appState.lwFinalizedData.occupation}_${appState.lwFinalizedData.jobTitle}_Verified_Results.docx`.replace(/[^a-z0-9_]/gi, '_');
    a.click();
    URL.revokeObjectURL(url);
    showStatus('✅ ' + _t('lwDOCXExported'), 'success');
  });
}
