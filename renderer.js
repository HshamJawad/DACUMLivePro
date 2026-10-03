// ============================================================
// /renderer.js
// Utility functions and Skills Level matrix renderer.
// Also: addCustomSection, toggleEditHeading, clearSection, formatList.
// ============================================================

import { appState, defaultSkillsLevelData, skillsLevelIsEmpty } from './state.js';
import { tableHeaderHex, contrastOn } from './export_settings.js';
import { getSkillLevelColumns, emptyLevels, usesDefaultSkillLevels, DEFAULT_LEVELS,
         MAX_LEVELS, MIN_LEVELS, renameSkillLevel, addSkillLevel, removeSkillLevel,
         countSkillLevelTicks, ticksLostOnRestore, restoreDefaultSkillLevels } from './skill_levels.js';

/* i18n access — resolved lazily, see duties.js for the reasoning. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);


// ── Status / Utility ──────────────────────────────────────────

export function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  if (!statusDiv) return;
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
  if (type === 'success') {
    setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
  }
}

export function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* toggleInfoBox() was removed in 3.20.1.

   It drove an info box that no longer exists: #infoBoxContent,
   .btn-toggle-info and #btnToggleInfoBox are all absent from
   index.html. The only reason it never threw is that _on() in
   events.js skips a missing element, so the click handler was never
   attached and the function was never reached.

   Had it ever been reached it would have thrown immediately on
   `infoBoxContent.style` — null. Translating its hard-coded 'Hide' /
   'Show' would have meant adding two i18n keys to keep unreachable
   code tidy; deleting it is the actual fix. */

/* ── Section action icons ─────────────────────────────────────
   Inline SVG rather than emoji: 🔢 and ✏️ render as a different
   picture on every platform, cannot take the button's colour, and
   sit on the text baseline instead of centring. These use
   fill="currentColor", so they follow the button through hover,
   focus and the pressed state for free.

   Declared here so the custom sections built by addCustomSection()
   are identical to the seven static ones in index.html. */
const _ICON_LINES =
  '<rect x="5.8" y="3.1" width="9.2" height="1.5" rx=".75"/>' +
  '<rect x="5.8" y="7.25" width="9.2" height="1.5" rx=".75"/>' +
  '<rect x="5.8" y="11.4" width="9.2" height="1.5" rx=".75"/>';

const ICON_BULLET =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">' +
  '<rect x="1" y="2.6" width="2.8" height="2.8" rx=".6"/>' +
  '<rect x="1" y="6.75" width="2.8" height="2.8" rx=".6"/>' +
  '<rect x="1" y="10.9" width="2.8" height="2.8" rx=".6"/>' + _ICON_LINES + '</svg>';

const ICON_NUMBER =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">' +
  '<text x="0.4" y="5.35" font-size="4.7" font-weight="700" font-family="sans-serif">1</text>' +
  '<text x="0.4" y="9.5" font-size="4.7" font-weight="700" font-family="sans-serif">2</text>' +
  '<text x="0.4" y="13.65" font-size="4.7" font-weight="700" font-family="sans-serif">3</text>' + _ICON_LINES + '</svg>';

/* An I-beam text cursor, not a pencil. A pencil reads as "edit the
   content"; this button edits the HEADING, and the I-beam is the
   established affordance for entering text-edit mode. */
const ICON_RENAME =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">' +
  '<rect x="7.1" y="2" width="1.8" height="12" rx=".4"/>' +
  '<rect x="4.2" y="1.6" width="7.6" height="1.7" rx=".6"/>' +
  '<rect x="4.2" y="12.7" width="7.6" height="1.7" rx=".6"/></svg>';

// ── Skills Level Matrix ───────────────────────────────────────

/* Checkbox labels come from skill_levels.js (3.40.0): the project's own
   levels, or the four defaults — whose labels reuse the SAME keys as the
   explanatory list in the info box above the matrix, so the legend and
   the checkboxes cannot drift apart in translation. */


export function toggleSkillsLevelSection() {
  const header  = document.querySelector('.skills-level-header');
  const content = document.getElementById('skillsLevelContent');
  header.classList.toggle('active');
  content.classList.toggle('active');
}

export function addSkillsCategory() {
  const newId = appState.skillsLevelData.length + 1;
  appState.skillsLevelData.push({
    id: newId, category: '',
    competencies: [
      { id: `${newId}.1`, text: '', levels: emptyLevels() }
    ]
  });
  renderSkillsLevel();
}

export function removeSkillsCategory(categoryIndex) {
  if (appState.skillsLevelData.length <= 1) {
    alert(_t('msgMinOneCategory'));
    return;
  }
  if (confirm(_t('confirmRemoveCategory'))) {
    appState.skillsLevelData.splice(categoryIndex, 1);
    renderSkillsLevel();
  }
}

export function updateSkillsCategoryName(categoryIndex, name) {
  appState.skillsLevelData[categoryIndex].category = name;
}

export function addSkillsCompetency(categoryIndex) {
  const category    = appState.skillsLevelData[categoryIndex];
  const categoryId  = category.id;
  const newNum      = category.competencies.length + 1;
  category.competencies.push({
    id: `${categoryId}.${newNum}`, text: '',
    levels: emptyLevels()
  });
  renderSkillsLevel();
}

export function removeSkillsCompetency(categoryIndex, competencyIndex) {
  const category = appState.skillsLevelData[categoryIndex];
  if (category.competencies.length <= 1) {
    alert(_t('msgMinOneCompetency'));
    return;
  }
  category.competencies.splice(competencyIndex, 1);
  category.competencies.forEach((comp, index) => {
    comp.id = `${category.id}.${index + 1}`;
  });
  renderSkillsLevel();
}

export function updateSkillsCompetencyText(categoryIndex, competencyIndex, text) {
  appState.skillsLevelData[categoryIndex].competencies[competencyIndex].text = text;
}

export function handleSkillsLevelChange(categoryIndex, competencyIndex, level, isChecked) {
  const comp = appState.skillsLevelData[categoryIndex].competencies[competencyIndex];
  if (!comp.levels) comp.levels = {};
  comp.levels[level] = isChecked;
}

// ── Matrix levels (columns) editor — 3.40.0 ───────────────────
// One row above the matrix: rename, add (up to 6) or remove (down to 1)
// the occupational levels. The data rules live in skill_levels.js.

function _saveProject() {
  import('./dacum_projects.js')
    .then(m => { try { m.saveCurrentProject(); } catch (_) {} })
    .catch(() => {});
}

function _injectMatrixStyles() {
  if (document.getElementById('mxMatrixStyles')) return;
  const st = document.createElement('style');
  st.id = 'mxMatrixStyles';
  st.textContent = `
    #skillsLevelContainer { --mx-head: #DCDCDC; --mx-head-ink: #000; --mx-line: #d6d9de; }
    #skillsLevelContainer .mx-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,.04); margin: 0 0 14px; }
    #skillsLevelContainer .mx-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 8px 12px; padding: 10px 14px; border-bottom: 1px solid #eef0f4; }
    #skillsLevelContainer .mx-hint { font-size: .8em; color: #6b7280; min-width: 0; }
    #skillsLevelContainer .mx-top-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    #skillsLevelContainer .mx-btn { margin: 0; padding: 6px 12px !important; border-radius: 8px; border: 1px solid #d1d5db;
      background: #fff; color: #374151; font: inherit; font-size: .82em; font-weight: 600; cursor: pointer; white-space: nowrap; }
    #skillsLevelContainer .mx-btn-red { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
    #skillsLevelContainer .mx-wrap { overflow-x: auto; }
    #skillsLevelContainer table.mx-table { border-collapse: collapse; width: 100%; min-width: 560px; font-size: .9em; margin: 0; }
    #skillsLevelContainer .mx-table th, #skillsLevelContainer .mx-table td { border: 1px solid var(--mx-line); padding: 0; vertical-align: middle; }
    #skillsLevelContainer .mx-table thead th { background: var(--mx-head); color: var(--mx-head-ink); font-weight: 700;
      text-align: center; padding: 6px; }
    #skillsLevelContainer .mx-table thead th.mx-c-comp { text-align: start; padding-inline-start: 12px; }
    #skillsLevelContainer .mx-table th.mx-c-lv { width: 120px; min-width: 96px; }
    #skillsLevelContainer .mx-lv-name { display: block; width: 100%; box-sizing: border-box; margin: 0 !important;
      padding: 3px 4px !important; border: 1px dashed transparent !important; border-bottom-color: currentColor !important;
      background: transparent !important; color: inherit !important; font: inherit; font-weight: 700; text-align: center;
      box-shadow: none !important; border-radius: 4px; resize: none; overflow: hidden; line-height: 1.25;
      white-space: normal; overflow-wrap: break-word; min-height: 24px; }
    #skillsLevelContainer .mx-lv-name:focus { outline: none; border-style: solid !important; border-color: currentColor !important;
      background: rgba(255,255,255,.18) !important; }
    #skillsLevelContainer .mx-lv-x { margin: 3px auto 0; display: block; width: 22px; height: 22px; min-width: 0; padding: 0 !important;
      border: none; border-radius: 50%; background: rgba(127,127,127,.22); color: inherit; font-size: 14px; line-height: 22px; cursor: pointer; }
    #skillsLevelContainer .mx-lv-x:hover:not(:disabled) { background: #dc2626; color: #fff; }
    #skillsLevelContainer .mx-lv-x:disabled { opacity: .3; cursor: not-allowed; }
    #skillsLevelContainer .mx-table th.mx-c-act, #skillsLevelContainer .mx-table td.mx-c-act { width: 64px; min-width: 52px; text-align: center; }
    #skillsLevelContainer .mx-lv-add { margin: 0; padding: 4px 6px !important; border: 1px dashed currentColor; border-radius: 6px;
      background: transparent; color: inherit; font: inherit; font-size: .78em; font-weight: 700; cursor: pointer; white-space: nowrap; }
    #skillsLevelContainer .mx-lv-add:disabled { opacity: .4; cursor: not-allowed; }
    #skillsLevelContainer tr.mx-cat td { background: #f2f2f2; }
    #skillsLevelContainer .mx-cat-cell { display: flex; align-items: center; gap: 8px; padding: 5px 8px; }
    #skillsLevelContainer .mx-cat-name { flex: 1 1 auto; min-width: 0; margin: 0 !important; padding: 5px 6px !important;
      border: 1px solid transparent !important; background: transparent !important; border-radius: 6px; box-shadow: none !important;
      font: inherit; font-weight: 700; color: #111827; }
    #skillsLevelContainer .mx-cat-name:hover, #skillsLevelContainer .mx-cat-name:focus { border-color: #d1d5db !important;
      background: #fff !important; outline: none; }
    #skillsLevelContainer .mx-mini { margin: 0; padding: 4px 10px !important; border-radius: 6px; border: 1px solid #a7f3d0;
      background: #ecfdf5; color: #047857; font: inherit; font-size: .78em; font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
    #skillsLevelContainer .mx-mini.mx-del { border-color: #fecaca; background: #fff; color: #b91c1c; padding: 4px 9px !important; }
    #skillsLevelContainer .mx-comp-cell { display: flex; align-items: flex-start; }
    #skillsLevelContainer .mx-num { color: #6366f1; font-weight: 700; font-size: .85em; padding: 9px 4px 0 10px; min-width: 30px; flex-shrink: 0; }
    #skillsLevelContainer .mx-comp-text { flex: 1 1 auto; min-width: 0; margin: 0 !important; padding: 6px 6px !important;
      border: 1px solid transparent !important; border-radius: 6px; background: transparent !important; box-shadow: none !important;
      font: inherit; line-height: 1.35; resize: none; overflow: hidden; min-height: 30px; color: #111827; }
    #skillsLevelContainer .mx-comp-text:hover, #skillsLevelContainer .mx-comp-text:focus { border-color: #c7d2fe !important;
      background: #f8faff !important; outline: none; }
    #skillsLevelContainer td.mx-c-lv { text-align: center; }
    #skillsLevelContainer td.mx-c-lv input { width: 19px; height: 19px; margin: 6px; cursor: pointer; accent-color: #2563eb; }
    #skillsLevelContainer .mx-row-x { margin: 0; padding: 4px 8px !important; border: none; background: transparent; color: #ef4444;
      font-size: 15px; cursor: pointer; border-radius: 6px; min-width: 0; }
    #skillsLevelContainer .mx-row-x:hover { background: #fef2f2; }
    /* The competency column stays in view while the level columns scroll. */
    #skillsLevelContainer .mx-table td.mx-c-comp { position: sticky; inset-inline-start: 0; background: #fff; z-index: 1; }
    #skillsLevelContainer .mx-table thead th.mx-c-comp { position: sticky; inset-inline-start: 0; z-index: 2; }
    @media (max-width: 600px) {
      #skillsLevelContainer table.mx-table { min-width: 0; width: max-content; font-size: .85em; }
      #skillsLevelContainer .mx-table td.mx-c-comp, #skillsLevelContainer .mx-table thead th.mx-c-comp { width: 150px; min-width: 150px; max-width: 150px; }
      #skillsLevelContainer .mx-table th.mx-c-lv { width: 78px; min-width: 78px; }
      #skillsLevelContainer .mx-cat-cell { position: sticky; inset-inline-start: 0; width: calc(100vw - 110px); box-sizing: border-box; }
      #skillsLevelContainer .mx-top { padding: 10px 12px; }
    }`;
  document.head.appendChild(st);
}

let _mxWired = false;
function _wireMatrix(container) {
  if (_mxWired) return;
  _mxWired = true;
  container.addEventListener('input', e => {
    if (e.target.classList && (e.target.classList.contains('mx-comp-text') || e.target.classList.contains('mx-lv-name'))) _mxAutoGrow(e.target);
  });
  container.addEventListener('change', e => {
    const input = e.target.closest('.sl-name');
    if (!input) return;
    renameSkillLevel(input.getAttribute('data-sl-id'), input.value);
    renderSkillsLevel();
    _saveProject();
  });
  container.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('.sl-name')) { e.preventDefault(); e.target.blur(); }
  });
  container.addEventListener('click', e => {
    const del = e.target.closest('[data-sl-del]');
    if (del) {
      const id = del.getAttribute('data-sl-del');
      const col = getSkillLevelColumns().find(c => c.id === id);
      const n = countSkillLevelTicks(id);
      if (n && !confirm(_tf('slConfirmRemove', { name: col ? col.uiLabel : id, n }))) return;
      if (!removeSkillLevel(id)) { alert(_t('slMinLevels')); return; }
      renderSkillsLevel();
      _saveProject();
      return;
    }
    if (e.target.closest('[data-sl-add]')) {
      const id = addSkillLevel();
      if (!id) { alert(_tf('slMaxLevels', { max: MAX_LEVELS })); return; }
      renderSkillsLevel();
      _saveProject();
      const input = container.querySelector(`.sl-name[data-sl-id="${id}"]`);
      if (input) { input.focus(); input.select(); }
      return;
    }
    if (e.target.closest('[data-sl-restore]')) {
      if (!confirm(_tf('slConfirmRestore', { n: ticksLostOnRestore() }))) return;
      restoreDefaultSkillLevels();
      renderSkillsLevel();
      _saveProject();
      return;
    }
    if (e.target.closest('[data-mx-reset]')) {
      resetSkillsLevel();
      _saveProject();
    }
  });
}

/* The info box explains the four DEFAULT levels. Each explanation stays
   only while its level is present under its default name. */
function _syncLevelLegend(cols) {
  const items = document.querySelectorAll('.skills-level-info-box ul > li');
  if (items.length !== DEFAULT_LEVELS.length) return;
  let shown = 0;
  DEFAULT_LEVELS.forEach((d, i) => {
    const c = cols.find(x => x.id === d.id);
    const show = !!c && !c.custom;
    items[i].style.display = show ? '' : 'none';
    if (show) shown++;
  });
  items[0].parentElement.style.display = shown ? '' : 'none';
}

// Labels of the default levels follow the interface language; the
// header colour follows Export Settings.
window.addEventListener('dacum:langchange', () => {
  if (document.getElementById('skillsLevelContainer')) renderSkillsLevel();
});
window.addEventListener('dacum:export-settings-changed', () => {
  if (document.getElementById('skillsLevelContainer')) renderSkillsLevel();
});

export function resetSkillsLevel(withConfirm = true) {
  // "Already at defaults" means no tick anywhere and no user-added rows.
  // Resetting that changes nothing, so it needs no warning.
  if (withConfirm) {
    const untouched = !(appState.skillsLevelData || []).some(cat =>
      (cat.competencies || []).some(c => Object.values(c.levels || {}).some(Boolean))
    );
    if (untouched) {
      showStatus(_t('msgSkillsAtDefaults'), 'success');
      return;
    }
    if (!confirm(_t('confirmResetSkills'))) return;
  }

  /* The 33 default strings used to be repeated here as English
     literals, duplicating state.js. They now come from one generator,
     which also means Reset regenerates the matrix in whatever language
     the interface is in RIGHT NOW — the one moment where re-resolving
     the wording is what the user actually asked for. */
  appState.skillsLevelData.length = 0;
  defaultSkillsLevelData().forEach(cat => appState.skillsLevelData.push(cat));
  renderSkillsLevel();
}

export function renderSkillsLevel() {
  const container = document.getElementById('skillsLevelContainer');
  if (!container) return;

  /* Seed on first render rather than at module load. state.js is
     evaluated as part of app.js's module graph, and although
     translations.js is a classic script that runs before it, seeding
     here keeps the matrix independent of that ordering AND lets
     storage.js load a saved project first without being overwritten.
     An empty array means a genuinely new matrix. */
  if (skillsLevelIsEmpty()) {
    defaultSkillsLevelData().forEach(cat => appState.skillsLevelData.push(cat));
  }

  /* 3.41.0 — ONE table card, laid out like the exported table: a header
     row of levels (rename in place, × to remove, ＋ to add — up to six),
     a shaded row per category, a row per competency with a checkbox in
     each level cell. Same data and the same data-action hooks as before
     (events.js), so saving, JSON and exports are untouched. */
  const cols = getSkillLevelColumns();
  _injectMatrixStyles();
  _wireMatrix(container);
  _syncLevelLegend(cols);

  // The separate "Edit competencies / Reset" row and the 3.40 levels
  // editor are folded into the card.
  const oldRow = container.previousElementSibling;
  if (oldRow && oldRow.querySelector && oldRow.querySelector('#btnResetSkillsLevel')) oldRow.style.display = 'none';
  document.getElementById('skillLevelsEditor')?.remove();

  // Header colour = Export Settings' table header colour (and its text
  // colour), so the editor looks like the document it produces.
  const fill = tableHeaderHex();
  container.style.setProperty('--mx-head', '#' + fill);
  container.style.setProperty('--mx-head-ink', '#' + contrastOn(fill));

  const atMin = cols.length <= MIN_LEVELS, atMax = cols.length >= MAX_LEVELS;
  const span = cols.length + 2;
  const e = escapeHtml;

  const head = `
    <tr>
      <th class="mx-c-comp" scope="col">${e(_t('expCompetency'))}</th>
      ${cols.map(c => `
        <th class="mx-c-lv" scope="col">
          <textarea rows="1" class="sl-name mx-lv-name" maxlength="60" data-sl-id="${e(c.id)}"
                    title="${e(_t('slRenameHint'))}" aria-label="${e(_t('slLevelName'))}">${e(c.uiLabel).replace(/\//g, '/\u200B')}</textarea>
          <button type="button" class="mx-lv-x" data-sl-del="${e(c.id)}" ${atMin ? 'disabled' : ''}
                  title="${e(_t('slRemoveLevel'))}" aria-label="${e(_t('slRemoveLevel'))}: ${e(c.uiLabel)}">×</button>
        </th>`).join('')}
      <th class="mx-c-act" scope="col">
        <button type="button" class="mx-lv-add" data-sl-add ${atMax ? 'disabled' : ''}
                title="${e(atMax ? _tf('slMaxLevels', { max: MAX_LEVELS }) : _t('slAddLevel'))}">＋ ${e(_t('slAddLevelShort'))}</button>
      </th>
    </tr>`;

  let body = '';
  appState.skillsLevelData.forEach((category, categoryIndex) => {
    body += `
      <tr class="mx-cat">
        <td colspan="${span}">
          <div class="mx-cat-cell">
            <input type="text" class="mx-cat-name" value="${e(category.category)}"
                   placeholder="${e(_tf('expCategoryN', { n: category.id }))}"
                   aria-label="${e(_t('phCategoryName'))}"
                   data-action="update-skills-category-name" data-cat-index="${categoryIndex}">
            <button type="button" class="mx-mini mx-add-comp" data-action="add-skills-competency"
                    data-cat-index="${categoryIndex}">＋ ${e(_t('mxAddCompetency'))}</button>
            <button type="button" class="mx-mini mx-del" data-action="remove-skills-category"
                    data-cat-index="${categoryIndex}" title="${e(_t('btnRemoveCategory'))}"
                    aria-label="${e(_t('btnRemoveCategory'))}">✕</button>
          </div>
        </td>
      </tr>`;
    category.competencies.forEach((competency, competencyIndex) => {
      body += `
      <tr class="mx-row">
        <td class="mx-c-comp">
          <div class="mx-comp-cell">
            <span class="mx-num">${e(competency.id)}</span>
            <textarea rows="1" class="mx-comp-text" placeholder="${e(_t('phCompetencyText'))}"
                      aria-label="${e(_t('phCompetencyText'))}"
                      data-action="update-skills-competency-text"
                      data-cat-index="${categoryIndex}" data-comp-index="${competencyIndex}">${e(competency.text)}</textarea>
          </div>
        </td>
        ${cols.map(c => `
        <td class="mx-c-lv">
          <input type="checkbox" ${(competency.levels || {})[c.id] ? 'checked' : ''}
                 aria-label="${e(c.uiLabel)}"
                 data-action="handle-skills-level-change"
                 data-cat-index="${categoryIndex}" data-comp-index="${competencyIndex}"
                 data-level="${e(c.id)}">
        </td>`).join('')}
        <td class="mx-c-act">
          <button type="button" class="mx-row-x" data-action="remove-skills-competency"
                  data-cat-index="${categoryIndex}" data-comp-index="${competencyIndex}"
                  title="${e(_t('ttRemoveCompetency'))}" aria-label="${e(_t('ttRemoveCompetency'))}">✕</button>
        </td>
      </tr>`;
    });
  });

  container.innerHTML = `
    <div class="mx-card">
      <div class="mx-top">
        <span class="mx-hint">${e(_tf('slTableHint', { max: MAX_LEVELS }))}</span>
        <div class="mx-top-actions">
          ${usesDefaultSkillLevels() ? '' : `<button type="button" class="mx-btn" data-sl-restore>↺ ${e(_t('slRestoreDefaults'))}</button>`}
          <button type="button" class="mx-btn mx-btn-red" data-mx-reset>🗑️ ${e(_t('btnResetSelections'))}</button>
        </div>
      </div>
      <div class="mx-wrap">
        <table class="mx-table">
          <thead>${head}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>`;

  container.querySelectorAll('textarea.mx-comp-text, textarea.mx-lv-name').forEach(_mxAutoGrow);
}

function _mxAutoGrow(ta) {
  ta.style.height = 'auto';
  const min = ta.classList.contains('mx-lv-name') ? 24 : 30;
  ta.style.height = Math.max(ta.scrollHeight, min) + 'px';
}

// ── Additional Info Helpers ────────────────────────────────────

export function toggleEditHeading(headingId) {
  const heading = document.getElementById(headingId);
  const isEditable = heading.getAttribute('contenteditable') === 'true';

  /* The rename button is a TOGGLE, and it is now icon-only — there is
     no text left to change, so the state has to be carried by
     aria-pressed. That drives the pressed styling in CSS and is also
     what a screen reader announces, which is the whole reason the
     button can afford to lose its label. */
  const btn = document.querySelector(
    `[data-action="toggle-edit-heading"][data-heading-id="${headingId}"]`
  );
  if (btn) btn.setAttribute('aria-pressed', isEditable ? 'false' : 'true');

  if (isEditable) {
    heading.setAttribute('contenteditable', 'false');
    heading.style.cursor = '';
    showStatus(_t('msgHeadingUpdated'), 'success');
  } else {
    heading.setAttribute('contenteditable', 'true');
    heading.focus();
    const range = document.createRange();
    range.selectNodeContents(heading);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

export function clearSection(inputId, headingId, defaultHeading, headingKey) {
  /* headingKey is optional: markup added it as data-default-heading-key.
     When present the reset restores the heading in the CURRENT language;
     the English attribute remains the fallback for custom sections and
     for any caller that does not pass a key. */
  if (headingKey && window.i18n && window.i18n.has(headingKey)) {
    defaultHeading = _t(headingKey);
  }
  const current = (document.getElementById(inputId)?.value || '').trim();
  const heading = document.getElementById(headingId)?.textContent?.trim();
  const isDefaultHeading = !heading || heading === defaultHeading ||
    (headingKey && window.i18n && window.i18n.has(headingKey) &&
     heading === window.i18n.t(headingKey));
  if (!current && isDefaultHeading) {
    showStatus(_t('msgSectionAlreadyEmpty'), 'success');
    return;
  }
  if (confirm(_t('confirmClearSection'))) {
    document.getElementById(inputId).value = '';
    document.getElementById(headingId).textContent = defaultHeading;
    document.getElementById(headingId).setAttribute('contenteditable', 'false');
    showStatus(_t('msgSectionCleared') + ' ✓', 'success');
  }
}

export function formatList(inputId, formatType) {
  const textarea = document.getElementById(inputId);
  const text = textarea.value.trim();
  if (!text) { showStatus(_t('msgNothingToFormat'), 'error'); return; }

  let lines = text.split('\n').filter(l => l.trim());
  lines = lines.map(line => {
    line = line.replace(/^[\s]*[•\-\*○●]\s*/, '');
    line = line.replace(/^[\s]*\d+[\.\)]\s*/, '');
    return line.trim();
  });

  let formatted = [];
  if (formatType === 'number') {
    lines.forEach((line, i) => formatted.push(`${i + 1}. ${line}`));
  } else if (formatType === 'bullet') {
    lines.forEach(line => formatted.push(`• ${line}`));
  }

  textarea.value = formatted.join('\n');
  showStatus(_t(formatType === 'number' ? 'msgFormattedNumbering' : 'msgFormattedBullets'), 'success');
}

export function addCustomSection() {
  appState.customSectionCounter++;
  const sectionId = `customSection${appState.customSectionCounter}`;
  const headingId = `${sectionId}Heading`;
  const inputId   = `${sectionId}Input`;

  const container = document.getElementById('customSectionsContainer');
  const sectionDiv = document.createElement('div');
  sectionDiv.className = 'section-container';
  sectionDiv.id = sectionId;
  sectionDiv.innerHTML = `
    <div class="section-header-editable">
      <h3 id="${headingId}" contenteditable="false">${_tf('lblCustomSection', { n: appState.customSectionCounter })}</h3>
      <div style="display:flex;gap:10px;align-items:center;">
        <button class="btn-rename btn-icon" data-action="toggle-edit-heading"
          data-heading-id="${headingId}" aria-pressed="false"
          title="${escapeHtml(_t('ttRenameHeading'))}"
          aria-label="${escapeHtml(_t('ttRenameHeading'))}">${ICON_RENAME}</button>
        <button class="btn-clear-section" data-action="clear-section"
          data-input-id="${inputId}" data-heading-id="${headingId}"
          data-default-heading="${_tf('lblCustomSection', { n: appState.customSectionCounter })}">🗑️ ${_t('btnClear')}</button>
        <button class="btn-remove-section" data-action="remove-custom-section" data-section-id="${sectionId}">
          ❌ ${_t('btnRemove')}
        </button>
      </div>
    </div>
    <textarea id="${inputId}" placeholder="${_t('phCustomSection')}"></textarea>`;

  container.appendChild(sectionDiv);
  showStatus(_t('msgCustomSectionAdded') + ' ✓', 'success');
}

export function removeCustomSection(sectionId) {
  if (confirm(_t('confirmRemoveSection'))) {
    const section = document.getElementById(sectionId);
    if (section) { section.remove(); showStatus(_t('msgSectionRemoved'), 'success'); }
  }
}


/* ── Re-render on language change ────────────────────────────────────
   Custom sections added by the facilitator are generated here as
   innerHTML, so their Rename/Clear/Remove buttons and placeholder are
   outside applyTranslations()' reach — the same gap that froze the
   Add Duty button and the verification accordion.

   renderSkillsLevel() is the safe re-entry point: it rebuilds from
   appState, so selections are preserved. Custom SECTION headings are
   not rebuilt on purpose — they may carry a name the user typed, and
   their default text is handled by data-i18n-once in the markup. */
window.addEventListener('dacum:langchange', () => {
  if (document.getElementById('skillsLevelContainer')) renderSkillsLevel();
});
