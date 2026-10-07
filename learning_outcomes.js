// ============================================================
// /learning_outcomes.js  (3.76.0 — split out of modules.js, code unchanged)
// Learning Outcomes: the performance-criteria source list, outcome
// statements, and the design guidelines / levels bar.
//
// Other files import these through modules.js, which re-exports
// every curriculum file; nothing outside needs to know the split.
// ============================================================

import { appState } from './state.js';
import { _reconcileLearningOutcomes, _refreshModuleOutcomes, _renderLoNotice, renumberLearningOutcomes, syncClusteringWithProfile } from './clusters.js';
import { _esc, _findEffectiveCriterionById, _getClusterEffectiveCriteria, _injectModuleCardStyles, _persistClusters, _renderUndoBars, _t, _taskLabel, _tx, _txf, _undoRecord, _undoSnap } from './modules_shared.js';
import { getNqfSettings, getModuleNqfLevel, MAX_LEVELS, _collectModuleTaskAnalysis, _ensureModuleGenOptions, _moduleLevel, _refShowsTrack, getModuleCode, getModuleCodePrefix, getModuleLabelMode, getModuleLevelCount, isModuleCodeDuplicate, isModuleCodeManual, moduleRef, renderCoverageMatrix, setModuleLevelCount, suggestModuleShortName } from './module_mapping.js';

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
        { h: '🔁 Can a task be taught in more than one module?', items: [
          'Yes. Competencies and modules are not one-to-one: one competency may be split over several modules, and a cross-cutting task (safety, documentation, communication) may recur — the spiral rule above.',
          'Conditions: every criterion is taught at least once (the coverage matrix shows "Not taught"); a repetition is deliberate, at a higher level of difficulty or autonomy; and each criterion is formally assessed in one designated module, the others practise it.',
          'A task follows the modules of its competency: Task Analysis → "Used in modules" lists them, and Module Builder receives the task’s analysis with each of them.' ] },
        { h: '🎯 Task criteria or competency criteria?', items: [
          '<strong>Per-task criteria</strong> (Task Analysis) describe one task precisely, so tracing is exact: a module that uses the criterion uses that task only. Writing them early, as a draft, is recommended — they become the raw material for the competency criteria.',
          '<strong>Competency criteria</strong> (Competency Clusters) describe integrated performance across the tasks of the competency. Each one traces to all tasks of its competency.',
          '<strong>Numbering</strong>: in each competency the Task Analysis criteria come first (read-only), then the criteria typed in the box. Adding Task Analysis criteria later renumbers the typed ones; learning outcomes follow automatically. Do not type the same criterion in both places — it would be counted twice.' ] },
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
        { h: '🔁 Une tâche peut-elle être enseignée dans plusieurs modules ?', items: [
          'Oui. Compétences et modules ne sont pas en correspondance un-à-un : une compétence peut être répartie sur plusieurs modules, et une tâche transversale (sécurité, documentation, communication) peut revenir — c’est la règle de la spirale ci-dessus.',
          'Conditions : chaque critère est enseigné au moins une fois (la matrice de couverture signale « Non enseigné ») ; une répétition est voulue, à un niveau plus élevé de difficulté ou d’autonomie ; et chaque critère est évalué formellement dans un seul module désigné, les autres l’exercent.',
          'Une tâche suit les modules de sa compétence : Analyse des tâches → « Utilisée dans les modules » les énumère, et Module Builder reçoit l’analyse de la tâche avec chacun d’eux.' ] },
        { h: '🎯 Critères de tâche ou critères de compétence ?', items: [
          '<strong>Critères par tâche</strong> (Analyse des tâches) : ils décrivent une tâche précisément, la traçabilité est donc exacte : un module qui utilise le critère n’utilise que cette tâche. Il est recommandé de les rédiger tôt, en brouillon — ils servent de matière première aux critères de compétence.',
          '<strong>Critères de compétence</strong> (Regroupements de compétences) : ils décrivent une performance intégrée sur l’ensemble des tâches de la compétence. Chacun renvoie à toutes les tâches de sa compétence.',
          '<strong>Numérotation</strong> : dans chaque compétence, les critères de l’analyse des tâches viennent d’abord (lecture seule), puis ceux saisis dans la zone. Ajouter plus tard des critères dans l’analyse des tâches renumérote ceux saisis ; les résultats d’apprentissage suivent automatiquement. Ne saisissez pas le même critère aux deux endroits — il serait compté deux fois.' ] },
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
        { h: '🔁 هل يمكن تدريس المهمة في أكثر من وحدة؟', items: [
          'نعم. العلاقة بين الكفاءات والوحدات ليست واحداً لواحد: قد تتوزع الكفاءة الواحدة على عدة وحدات، وقد تتكرر المهمة المشتركة (السلامة، التوثيق، التواصل) — وهي قاعدة التدرّج الحلزوني أعلاه.',
          'الشروط: أن يُدرَّس كل معيار مرة واحدة على الأقل (تُظهر مصفوفة التغطية «غير مُدرَّس»)؛ وأن يكون التكرار مقصوداً بمستوى أعلى من الصعوبة أو الاستقلالية؛ وأن يُقيَّم كل معيار رسمياً في وحدة واحدة محددة، وتكتفي الوحدات الأخرى بالتمرين عليه.',
          'المهمة تتبع وحدات كفاءتها: يعرضها تحليل المهمة في سطر «تُستخدم في الوحدات»، ويستقبل Module Builder تحليل المهمة مع كل واحدة منها.' ] },
        { h: '🎯 معايير المهمة أم معايير الكفاءة؟', items: [
          '<strong>معايير المهمة</strong> (تحليل المهمة) تصف مهمة واحدة بدقة، فيكون التتبع دقيقاً: الوحدة التي تستخدم المعيار تستخدم تلك المهمة وحدها. ويُنصح بكتابتها مبكراً كمسودة، فهي المادة الخام لمعايير الكفاءة.',
          '<strong>معايير الكفاءة</strong> (تجمعات الكفاءات) تصف الأداء المتكامل عبر مهام الكفاءة كلها. وكل معيار منها يرتبط بجميع مهام كفاءته.',
          '<strong>الترقيم</strong>: في كل كفاءة تأتي معايير تحليل المهمة أولاً (للقراءة فقط)، ثم المعايير المكتوبة في المربع. وإضافة معايير في تحليل المهمة لاحقاً تغيّر ترقيم المكتوبة، والمحصلات تتبعها تلقائياً. لا تكتب المعيار نفسه في الموضعين، وإلا احتُسب مرتين.' ] },
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

/* TVQF / NQF option (3.85.0): one line above the module list — a tick
   box and, once ticked, the framework's name. Off by default; see
   module_mapping.js getNqfSettings(). */
function _ensureNqfBar() {
  const cont = document.getElementById('modulesContainer');
  if (!cont || !cont.parentNode) return;
  let bar = document.getElementById('mmNqfBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'mmNqfBar';
    bar.innerHTML = `
      <label class="mm-nqf-toggle"><input type="checkbox" id="mmNqfEnable"> <span class="mm-nqf-enable-txt"></span></label>
      <input type="text" id="mmNqfFramework" maxlength="120" dir="auto">
      <p class="mm-nqf-hint"></p>`;
  }
  if (bar.nextSibling !== cont) cont.parentNode.insertBefore(bar, cont);
  const n = getNqfSettings();
  const cb = bar.querySelector('#mmNqfEnable');
  const fw = bar.querySelector('#mmNqfFramework');
  cb.checked = n.enabled;
  fw.hidden = !n.enabled;
  if (document.activeElement !== fw) fw.value = n.framework;
  fw.placeholder = _tx('phNqfFramework');
  fw.setAttribute('aria-label', _tx('phNqfFramework'));
  bar.querySelector('.mm-nqf-enable-txt').textContent = _tx('lblNqfEnable');
  bar.querySelector('.mm-nqf-hint').textContent = _tx('hintNqf');
}

export function renderModules() {
  const container = document.getElementById('modulesContainer');
  _refreshModuleOutcomes();
  _ensureModuleGenOptions();
  _injectModuleCardStyles();
  _renderUndoBars();
  _ensureGuideButtons();
  _ensureModulesLevelBar();
  _ensureNqfBar();
  const mm = appState.moduleMappingData;

  if (mm.modules.length === 0) {
    container.innerHTML = `<div class="no-clusters-message">${_t('msgNoModules')}</div>`;
    renderCoverageMatrix();
    return;
  }

  const levelCount = getModuleLevelCount();
  const nqf = getNqfSettings();
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
            ${getModuleNqfLevel(module) ? `<span class="mod-nqf-chip">${_esc(_tx('lblNqfChip'))}: <bdi>${_esc(getModuleNqfLevel(module))}</bdi></span>` : ''}
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
        ${nqf.enabled ? `
        <div class="mod-meta-row mod-nqf-row">
          <label class="mod-meta-field"><span>${_esc(_tx('lblNqfLevel'))}</span>
            <input type="text" class="mod-nqf-input" data-module-id="${_esc(module.id)}"
              value="${_esc(module.nqfLevel || '')}" maxlength="60" placeholder="${_esc(_tx('phNqfLevel'))}">
          </label>
          <details class="mod-nqf-desc-box"${module.nqfDescriptor ? ' open' : ''}>
            <summary>${_esc(_tx('lblNqfDescriptor'))}</summary>
            <textarea class="mod-nqf-desc" data-module-id="${_esc(module.id)}" dir="auto" rows="3"
              placeholder="${_esc(_tx('phNqfDescriptor'))}">${_esc(module.nqfDescriptor || '')}</textarea>
          </details>
        </div>` : ''}
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
