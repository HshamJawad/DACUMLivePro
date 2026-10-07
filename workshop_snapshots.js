// ============================================================
// /workshop_snapshots.js
// Manual workshop checkpoints — save/restore full app state
// to localStorage, independently of the Undo/Redo system.
//
// localStorage key : 'dacum_snapshots'
// Max entries      : 30  (oldest removed when exceeded)
// ============================================================

import { appState, normalizeModuleCurriculumData } from './state.js';
import { mergeRestoredCL }           from './content_lang.js';
import { showStatus }                from './renderer.js';
import { renderDutiesFromState, syncAllFromDOM } from './duties.js';
import { renderSkillsLevel }         from './renderer.js';
import { renderLearningOutcomes, renderPCSourceList,
         renderModules, renderModuleLoList,
         renderClusters, renderAvailableTasks } from './modules.js';
import { resetHistoryToCurrentState } from './history.js';
import { renderModuleCurriculum }     from './module_curriculum.js';

/* i18n access — resolved lazily; see duties.js for why. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);


const LS_KEY    = 'dacum_snapshots';
const MAX_SNAPS = 30;
let   _counter  = 0;   // runtime counter for unique IDs within a session

// ── Public API ────────────────────────────────────────────────

/**
 * Capture the full application state and persist it.
 * @param {string} name  User-supplied label for this checkpoint.
 */
export function saveSnapshot(name) {
  if (!name || !name.trim()) return;

  const snaps = _load();

  _counter++;
  const snap = {
    id:        `snap_${Date.now()}_${_counter}`,
    name:      name.trim(),
    timestamp: Date.now(),
    state:     _captureFullState(),   // syncAllFromDOM is called inside
  };

  snaps.push(snap);

  // Cap at MAX_SNAPS — remove oldest (index 0)
  while (snaps.length > MAX_SNAPS) snaps.shift();

  _save(snaps);
  renderSnapshotPanel();
  showStatus('✅ ' + _tf('msgSnapshotSaved', { name: snap.name }), 'success');
}

/** Return all saved snapshots (newest first for display). */
export function getSnapshots() {
  return _load().slice().reverse();
}

/**
 * Restore full application state from a saved snapshot,
 * reset Undo/Redo, and re-render the entire UI.
 * @param {string} id  Snapshot ID.
 */
export function restoreSnapshot(id) {
  const snaps = _load();
  const snap  = snaps.find(s => s.id === id);
  if (!snap) { showStatus('❌ ' + _t('msgSnapshotNotFound'), 'error'); return; }

  if (!confirm(_tf('confirmRestoreSnapshot', { name: snap.name }))) return;

  _applyFullState(snap.state);
  renderAll();
  resetHistoryToCurrentState();
  renderSnapshotPanel();
  // Close modal after restore
  const m = document.getElementById('snapModal');
  if (m) m.style.display = 'none';
  showStatus('✅ ' + _tf('msgSnapshotRestored', { name: snap.name }), 'success');
}

/**
 * Delete a saved snapshot by ID.
 * @param {string} id  Snapshot ID.
 */
export function deleteSnapshot(id) {
  const snaps = _load().filter(s => s.id !== id);
  _save(snaps);
  renderSnapshotPanel();
  showStatus('🗑️ ' + _t('msgSnapshotDeleted'), 'success');
}

/** Render the snapshot list panel into #snapshotList. */
export function renderSnapshotPanel() {
  const list = document.getElementById('snapshotList');
  if (!list) return;

  const snaps = getSnapshots();   // newest first

  if (snaps.length === 0) {
    list.innerHTML = `<p class="snap-empty">No snapshots yet.<br>Click <strong>＋ Save Snapshot</strong> below.</p>`;
    return;
  }

  list.innerHTML = snaps.map(s => {
    const dt      = new Date(s.timestamp);
    const dateStr = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const duties  = (s.state?.dutiesData || []).length;
    return `
      <div class="snap-item">
        <div class="snap-meta">
          <span class="snap-name">${_esc(s.name)}</span>
          <span class="snap-date">${dateStr} ${timeStr} · ${duties} ${duties === 1 ? 'duty' : 'duties'}</span>
        </div>
        <div class="snap-actions">
          <button class="snap-btn snap-restore" data-action="restore-snapshot" data-snap-id="${s.id}">Restore</button>
          <button class="snap-btn snap-delete"  data-action="delete-snapshot"  data-snap-id="${s.id}">✕</button>
        </div>
      </div>`;
  }).join('');
}

// ── renderAll  (single call to rebuild the whole UI) ─────────

export function renderAll() {
  // Duties & Tasks
  renderDutiesFromState();

  // Chart Info DOM fields
  _restoreChartInfoDOM(appState._chartInfo || {});

  // Additional Info DOM fields
  _restoreAdditionalInfoDOM(appState._additionalInfo || {});

  // Complex UI sections
  renderSkillsLevel();
  renderLearningOutcomes();
  renderPCSourceList();
  renderClusters();
  renderAvailableTasks();
  renderModules();
  renderModuleLoList();
  renderModuleCurriculum();
}

// ── Full state capture / apply ────────────────────────────────

function _captureFullState() {
  // Flush all live DOM input values into appState.dutiesData first
  syncAllFromDOM();

  // Chart Info fields (read from DOM — source of truth)
  const chartInfo = {
    dacumDate:       _val('dacumDate'),
    venue:           _val('venue'),
    producedFor:     _val('producedFor'),
    producedBy:      _val('producedBy'),
    occupationTitle: _val('occupationTitle'),
    jobTitle:        _val('jobTitle'),
    sector:          _val('sector'),
    context:         _val('context'),
    facilitators:    _val('facilitators'),
    observers:       _val('observers'),
    panelMembers:    _val('panelMembers'),
  };

  // Additional Info fields
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
    // appState slices
    dutiesData:              appState.dutiesData              || [],
    dutyCount:               appState.dutyCount,
    taskCounts:              appState.taskCounts              || {},
    producedForImage:        appState.producedForImage,
    producedByImage:         appState.producedByImage,
    customSectionCounter:    appState.customSectionCounter,
    skillsLevelData:         appState.skillsLevelData,
    skillsLevelColumns:      appState.skillsLevelColumns      || null,
    verificationRatings:     appState.verificationRatings     || {},
    taskMetadata:            appState.taskMetadata            || {},
    collectionMode:          appState.collectionMode,
    workflowMode:            appState.workflowMode,
    workshopParticipants:    appState.workshopParticipants,
    priorityFormula:         appState.priorityFormula,
    workshopCounts:          appState.workshopCounts          || {},
    workshopResults:         appState.workshopResults         || {},
    tvExportMode:            appState.tvExportMode,
    trainingLoadMethod:      appState.trainingLoadMethod,
    clusteringData:          appState.clusteringData,
    learningOutcomesData:    appState.learningOutcomesData,
    moduleMappingData:       appState.moduleMappingData,
    moduleCurriculumData:    appState.moduleCurriculumData    || null,
    contentLanguages:        appState.contentLanguages        || null,
    verificationDecisionMade: appState.verificationDecisionMade,
    clusteringAllowed:       appState.clusteringAllowed,
    // DOM-sourced slices
    _chartInfo:      chartInfo,
    _additionalInfo: additionalInfo,
  }));
}

function _applyFullState(s) {
  // appState slices
  appState.dutiesData              = s.dutiesData              || [];
  appState.dutyCount               = s.dutyCount               || 0;
  appState.taskCounts              = s.taskCounts              || {};
  appState.producedForImage        = s.producedForImage        || null;
  appState.producedByImage         = s.producedByImage         || null;
  appState.customSectionCounter    = s.customSectionCounter    || 0;
  appState.skillsLevelData         = Array.isArray(s.skillsLevelData) ? s.skillsLevelData : [];
  appState.skillsLevelColumns      = s.skillsLevelColumns      || null;
  appState.verificationRatings     = s.verificationRatings     || {};
  appState.taskMetadata            = s.taskMetadata            || {};
  appState.collectionMode          = s.collectionMode          || 'workshop';
  appState.workflowMode            = s.workflowMode            || 'standard';
  appState.workshopParticipants    = s.workshopParticipants    || 10;
  appState.priorityFormula         = s.priorityFormula         || 'if';
  appState.workshopCounts          = s.workshopCounts          || {};
  appState.workshopResults         = s.workshopResults         || {};
  appState.tvExportMode            = s.tvExportMode            || 'appendix';
  appState.trainingLoadMethod      = s.trainingLoadMethod      || 'advanced';
  appState.clusteringData          = s.clusteringData          || { clusters: [], availableTasks: [], clusterCounter: 0 };
  appState.learningOutcomesData    = s.learningOutcomesData    || { outcomes: [], outcomeCounter: 0 };
  appState.moduleMappingData       = s.moduleMappingData       || { modules: [], moduleCounter: 0 };
  // Snapshots taken before 3.33.0 have no curriculum — default then.
  appState.moduleCurriculumData    = normalizeModuleCurriculumData(s.moduleCurriculumData);
  appState.verificationDecisionMade = s.verificationDecisionMade || false;
  appState.clusteringAllowed       = s.clusteringAllowed       || false;
  // 3.79.0: a snapshot carries the content-language view it was taken
  // in (one taken before 3.79.0 holds original-language text); the
  // translations made since it was taken are kept — mergeRestoredCL().
  appState.contentLanguages = mergeRestoredCL(s.contentLanguages, appState.contentLanguages);
  try { document.dispatchEvent(new CustomEvent('dacum:content-languages-changed')); } catch (e) {}

  // Cache the DOM-sourced slices so renderAll() can use them
  appState._chartInfo      = s._chartInfo      || {};
  appState._additionalInfo = s._additionalInfo || {};
}

// ── DOM helpers ───────────────────────────────────────────────

function _restoreChartInfoDOM(ci) {
  _setVal('dacumDate',       ci.dacumDate);
  _setVal('venue',           ci.venue);
  _setVal('producedFor',     ci.producedFor);
  _setVal('producedBy',      ci.producedBy);
  _setVal('occupationTitle', ci.occupationTitle);
  _setVal('jobTitle',        ci.jobTitle);
  _setVal('sector',          ci.sector);
  _setVal('context',         ci.context);
  _setVal('facilitators',    ci.facilitators);
  _setVal('observers',       ci.observers);
  _setVal('panelMembers',    ci.panelMembers);

  // Images
  _restoreImage('producedFor', appState.producedForImage);
  _restoreImage('producedBy',  appState.producedByImage);
}

function _restoreAdditionalInfoDOM(ai) {
  if (ai.headings) {
    _setText('knowledgeHeading',  ai.headings.knowledge  || 'Knowledge Requirements');
    _setText('skillsHeading',     ai.headings.skills     || 'Skills Requirements');
    _setText('behaviorsHeading',  ai.headings.behaviors  || 'Worker Behaviors/Traits');
    _setText('toolsHeading',      ai.headings.tools      || 'Tools, Equipment, Supplies and Materials');
    _setText('trendsHeading',     ai.headings.trends     || 'Future Trends and Concerns');
    _setText('acronymsHeading',   ai.headings.acronyms   || 'Acronyms');
    _setText('careerPathHeading', ai.headings.careerPath || 'Career Path');
  }
  if (ai.content) {
    _setVal('knowledgeInput',  ai.content.knowledge);
    _setVal('skillsInput',     ai.content.skills);
    _setVal('behaviorsInput',  ai.content.behaviors);
    _setVal('toolsInput',      ai.content.tools);
    _setVal('trendsInput',     ai.content.trends);
    _setVal('acronymsInput',   ai.content.acronyms);
    _setVal('careerPathInput', ai.content.careerPath);
  }
  if (Array.isArray(ai.customSections)) {
    _restoreCustomSections(ai.customSections);
  }
}

function _captureCustomSections() {
  const sections = [];
  document.querySelectorAll('#customSectionsContainer .section-container').forEach(div => {
    const heading  = div.querySelector('h3');
    const textarea = div.querySelector('textarea');
    if (heading && textarea) {
      sections.push({ heading: heading.textContent, content: textarea.value });
    }
  });
  return sections;
}

function _restoreCustomSections(sections) {
  const container = document.getElementById('customSectionsContainer');
  if (!container) return;
  container.innerHTML = '';
  appState.customSectionCounter = 0;

  sections.forEach(sec => {
    appState.customSectionCounter++;
    const n   = appState.customSectionCounter;
    const sid = `customSection${n}`;
    const hid = `${sid}Heading`;
    const iid = `${sid}Input`;
    const div = document.createElement('div');
    div.className = 'section-container';
    div.id = sid;
    div.innerHTML = `
      <div class="section-header-editable">
        <h3 id="${hid}" contenteditable="false">${_esc(sec.heading || `Custom Section ${n}`)}</h3>
        <div style="display:flex;gap:10px;">
          <button class="btn-rename"  data-action="toggle-heading"      data-heading-id="${hid}">✏️ Rename</button>
          <button class="btn-clear-section" data-action="clear-section" data-input-id="${iid}" data-heading-id="${hid}" data-default="Custom Section ${n}">🗑️ Clear</button>
          <button class="btn-remove-section" data-action="remove-custom-section" data-section-id="${sid}" style="background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);color:white;padding:8px 16px;font-size:0.95em;border:none;border-radius:8px;cursor:pointer;">❌ Remove</button>
        </div>
      </div>
      <textarea id="${iid}" placeholder="Enter information for this custom section on separate lines">${_esc(sec.content || '')}</textarea>
    `;
    container.appendChild(div);
  });
}

function _restoreImage(key, dataUrl) {
  const preview   = document.getElementById(`${key}ImagePreview`);
  const removeBtn = document.getElementById(`remove${_cap(key)}Image`);
  if (!preview) return;
  if (dataUrl) {
    preview.innerHTML = `<img src="${dataUrl}" alt="${key} logo">`;
    preview.classList.add('has-image');
    if (removeBtn) removeBtn.style.display = 'inline-block';
  } else {
    preview.innerHTML = '';
    preview.classList.remove('has-image');
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

// ── localStorage helpers ──────────────────────────────────────

function _load() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch { return []; }
}

function _save(snaps) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snaps));
  } catch (e) {
    showStatus('⚠️ ' + _t('msgStorageFullSnapshots'), 'error');
    // Emergency: drop half and retry
    const trimmed = snaps.slice(Math.floor(snaps.length / 2));
    try { localStorage.setItem(LS_KEY, JSON.stringify(trimmed)); } catch {}
  }
}

// ── Tiny DOM utilities ────────────────────────────────────────

function _val(id)        { const el = document.getElementById(id); return el ? el.value : ''; }
function _text(id)       { const el = document.getElementById(id); return el ? el.textContent : ''; }
function _setVal(id, v)  { const el = document.getElementById(id); if (el) el.value = v || ''; }
function _setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v || ''; }
function _cap(s)         { return s.charAt(0).toUpperCase() + s.slice(1); }
function _esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
