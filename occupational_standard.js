// ============================================================
// /occupational_standard.js
// "Occupational Standard" tab (after Competency Clusters), 3.39.0.
//
// A VIEW of the Occupational Profile & Standard document — the same
// model the Word exporter prints (os_model.js), so what is shown here is
// exactly what the file contains. Nothing is edited or stored here: each
// section links to the tab its content comes from. The export button
// calls the same exporter as the toolbar's "Standard" menu.
//
// Rendered on entry to the tab, on a language change and on a project
// switch while the tab is open.
// ============================================================

import { getOccupationalStandardModel, getOccupationalStandardChecklist,
         OS_SOURCE_TAB } from './os_model.js';
import { exportOccupationalStandardWord } from './exports_os_docx.js';
import { escapeHtml } from './renderer.js';

const TAB_ID = 'occupational-standard-tab';
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
const _esc = (s) => escapeHtml(String(s == null ? '' : s));

const TAB_LABEL_KEY = {
  'info-tab':            'tabChartInfo',
  'duties-tab':          'tabDuties',
  'additional-info-tab': 'tabAdditionalInfo',
  'clustering-tab':      'tabClustering',
};

const CHECK_LABEL = {
  occupation:    'osMissOccupation',
  scope:         'osMissScope',
  sector:        'osMissSector',
  producedBy:    'osMissProducedBy',
  panel:         'osMissPanel',
  venueDate:     'osMissVenueDate',
  duties:        'osMissDuties',
  narrative:     'osMissNarrative',
  employability: 'osMissEmployability',
  competencies:  'osMissCompetencies',
  tools:         'osMissTools',
  compRange:     'osMissCompRange',
  compCriteria:  'osMissCompCriteria',
};

let _missingOpen = false;

// ── Styles (scoped to the tab) ───────────────────────────────

function _injectStyles() {
  if (document.getElementById('osTabStyles')) return;
  const st = document.createElement('style');
  st.id = 'osTabStyles';
  st.textContent = `
#${TAB_ID} { --os-ink:#1e293b; --os-muted:#64748b; --os-line:#e2e8f0; --os-violet:#6d28d9; --os-violet-line:#ddd6fe; }
#${TAB_ID} .os-intro { margin: 0 0 14px; color: var(--os-muted); font-size: .9em; line-height: 1.6; }
#${TAB_ID} .os-topbar {
  position: sticky; top: 64px; z-index: 20;
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px;
  padding: 12px 14px; margin: 0 0 14px;
  background: #ffffffee; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  border: 1px solid var(--os-violet-line); border-radius: 12px;
  box-shadow: 0 4px 14px rgba(109,40,217,.08);
}
#${TAB_ID} .os-topbar-title { flex: 1 1 220px; min-width: 0; font-weight: 700; color: var(--os-violet);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${TAB_ID} .os-topbar-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
#${TAB_ID} .os-progress {
  margin: 0; padding: 5px 12px !important; border-radius: 999px; font: inherit; font-size: .82em; font-weight: 700;
  white-space: nowrap; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; cursor: pointer;
}
#${TAB_ID} .os-progress.is-done { background: #dcfce7; color: #166534; border-color: #86efac; cursor: default; }
#${TAB_ID} .os-export-btn {
  margin: 0; padding: 8px 14px !important; border-radius: 8px; border: none; cursor: pointer;
  font: inherit; font-size: .88em; font-weight: 700; color: #fff; white-space: nowrap;
  background: linear-gradient(135deg, #0f766e, #0d9488);
}
#${TAB_ID} .os-export-btn:hover { filter: brightness(1.08); }
#${TAB_ID} .os-missing { margin: 0 0 16px; padding: 12px 14px; border: 1px solid #fde68a; background: #fffbeb; border-radius: 12px; }
#${TAB_ID} .os-missing h4 { margin: 0 0 8px; color: #92400e; font-size: .92em; }
#${TAB_ID} .os-missing ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
#${TAB_ID} .os-missing li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px;
  font-size: .86em; color: #78350f; }
#${TAB_ID} .os-part { background: #fff; border: 1px solid var(--os-line); border-radius: 14px; margin: 0 0 18px; overflow: hidden; }
#${TAB_ID} .os-part-head { padding: 16px 18px 12px; text-align: center; background: linear-gradient(135deg,#f5f3ff,#eef2ff);
  border-bottom: 1px solid var(--os-violet-line); }
#${TAB_ID} .os-part-head h3 { margin: 0; color: #312e81; font-size: 1.15em; text-align: center !important; }
#${TAB_ID} .os-part-head p { margin: 4px 0 0; color: #4338ca; font-weight: 700; overflow-wrap: anywhere; text-align: center !important; }
#${TAB_ID} .os-sec { padding: 14px 18px 16px; border-top: 1px solid var(--os-line); }
#${TAB_ID} .os-part-head + .os-sec { border-top: none; }
#${TAB_ID} .os-sec-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; margin: 0 0 10px; }
#${TAB_ID} .os-sec-head h4 { margin: 0; color: var(--os-ink); font-size: 1em; }
#${TAB_ID} .os-edit {
  margin: 0; padding: 4px 10px !important; border-radius: 999px; border: 1px solid var(--os-violet-line);
  background: #faf5ff; color: var(--os-violet); font: inherit; font-size: .78em; font-weight: 600; cursor: pointer; white-space: nowrap;
}
#${TAB_ID} .os-edit:hover { background: #f3e8ff; }
#${TAB_ID} .os-kv { display: grid; grid-template-columns: minmax(120px, 32%) minmax(0, 1fr); border: 1px solid var(--os-line); border-radius: 10px; overflow: hidden; }
#${TAB_ID} .os-kv > div { padding: 8px 10px; border-top: 1px solid var(--os-line); font-size: .88em; min-width: 0; overflow-wrap: anywhere; }
#${TAB_ID} .os-kv > div:nth-child(-n+2) { border-top: none; }
#${TAB_ID} .os-kv .os-k { background: #f8fafc; font-weight: 700; color: #334155; }
#${TAB_ID} .os-kv .os-v { color: var(--os-ink); }
#${TAB_ID} .os-kv .os-v ul { margin: 0; padding-inline-start: 18px; }
#${TAB_ID} .os-blank { color: #94a3b8; font-style: italic; }
#${TAB_ID} .os-inst { color: #7c3aed; font-style: italic; font-size: .92em; }
#${TAB_ID} .os-none { color: #94a3b8; font-style: italic; font-size: .88em; margin: 0; }
#${TAB_ID} .os-duty { margin: 0 0 12px; border: 1px solid var(--os-line); border-radius: 10px; overflow: hidden; }
#${TAB_ID} .os-duty-bar { padding: 8px 12px; background: #ede9fe; color: #3b0764; font-weight: 700; font-size: .9em; overflow-wrap: anywhere; }
#${TAB_ID} .os-tasks { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0; }
#${TAB_ID} .os-task { padding: 8px 12px; border-top: 1px solid var(--os-line); font-size: .86em; min-width: 0; overflow-wrap: anywhere; }
#${TAB_ID} .os-code { font-weight: 700; color: var(--os-violet); margin-inline-end: 4px; }
#${TAB_ID} .os-block { margin: 0 0 12px; border: 1px solid var(--os-line); border-radius: 10px; overflow: hidden; }
#${TAB_ID} .os-block-head { padding: 7px 12px; background: #f1f5f9; font-weight: 700; font-size: .88em; color: #334155; overflow-wrap: anywhere; }
#${TAB_ID} .os-block ul { margin: 0; padding: 8px 12px 10px; padding-inline-start: 30px; font-size: .88em; color: var(--os-ink); }
#${TAB_ID} .os-block li { margin: 2px 0; overflow-wrap: anywhere; }
#${TAB_ID} .os-table-wrap { overflow-x: auto; border: 1px solid var(--os-line); border-radius: 10px; }
#${TAB_ID} table.os-emp { width: 100%; border-collapse: collapse; font-size: .85em; min-width: 460px; }
#${TAB_ID} table.os-emp th, #${TAB_ID} table.os-emp td { padding: 7px 8px; border-top: 1px solid var(--os-line); text-align: start; }
#${TAB_ID} table.os-emp thead th { background: #f1f5f9; border-top: none; color: #334155; }
#${TAB_ID} table.os-emp th.os-lv, #${TAB_ID} table.os-emp td.os-lv { text-align: center; width: 13%; }
#${TAB_ID} table.os-emp tr.os-cat td { background: #f8fafc; font-weight: 700; color: #334155; }
#${TAB_ID} .os-tick { color: #059669; font-weight: 800; }
#${TAB_ID} .os-comp { margin: 0 0 14px; }
#${TAB_ID} .os-comp h5 { margin: 0 0 8px; font-size: .95em; color: #312e81; overflow-wrap: anywhere; }
@media (max-width: 520px) {
  #${TAB_ID} .os-kv { grid-template-columns: minmax(0, 1fr); }
  #${TAB_ID} .os-kv .os-k { border-top: 1px solid var(--os-line); }
  #${TAB_ID} .os-kv > div:first-child { border-top: none; }
  #${TAB_ID} .os-kv .os-v { border-top: none; }
  #${TAB_ID} .os-topbar { top: 56px; }
  #${TAB_ID} .os-sec { padding: 12px 12px 14px; }
}`;
  document.head.appendChild(st);
}

// ── Pieces ───────────────────────────────────────────────────

function _tabName(tabId) { return _t(TAB_LABEL_KEY[tabId] || tabId); }

function _editBtn(tabId) {
  return `<button type="button" class="os-edit" data-os-goto="${tabId}">✏️ ${_esc(_tf('osEditIn', { tab: _tabName(tabId) }))}</button>`;
}

function _value(v, institutional) {
  if (institutional) return `<span class="os-inst">${_esc(_t('osInstitutional'))}</span>`;
  if (Array.isArray(v)) {
    if (!v.length) return `<span class="os-blank">—</span>`;
    if (v.length === 1) return _esc(v[0]);
    return `<ul>${v.map(x => `<li>${_esc(x)}</li>`).join('')}</ul>`;
  }
  return String(v || '').trim() ? _esc(v) : `<span class="os-blank">—</span>`;
}

function _kv(rows) {
  return `<div class="os-kv">${rows.map(r =>
    `<div class="os-k">${_esc(r.label)}</div><div class="os-v">${_value(r.value, r.institutional)}</div>`).join('')}</div>`;
}

function _section(title, tabId, inner) {
  return `<section class="os-sec">
    <div class="os-sec-head"><h4>${_esc(title)}</h4>${tabId ? _editBtn(tabId) : ''}</div>
    ${inner}
  </section>`;
}

const _none = () => `<p class="os-none">${_esc(_t('osEmptySection'))}</p>`;

function _renderDuties(duties) {
  if (!duties.length) return _none();
  return duties.map(d => `
    <div class="os-duty">
      <div class="os-duty-bar"><bdi>${_esc(_tf('lblDuty', { code: d.letter }))}</bdi>: ${_esc(d.duty)}</div>
      ${d.tasks.length ? `<div class="os-tasks">${d.tasks.map((t, i) =>
        `<div class="os-task"><bdi class="os-code">${_esc(d.taskCodes[i])}</bdi>${_esc(t)}</div>`).join('')}</div>` : ''}
    </div>`).join('');
}

function _renderBlocks(blocks) {
  if (!blocks.length) return _none();
  return blocks.map(b => `
    <div class="os-block">
      <div class="os-block-head">${_esc(b.head)}</div>
      <ul>${b.lines.map(l => `<li>${_esc(l)}</li>`).join('')}</ul>
    </div>`).join('');
}

function _renderEmployability(emp) {
  if (!emp) return _none();
  return `<div class="os-table-wrap"><table class="os-emp">
    <thead><tr><th>${_esc(_t('osColCompetency'))}</th>${emp.levelLabels.map(l => `<th class="os-lv">${_esc(l)}</th>`).join('')}</tr></thead>
    <tbody>${emp.categories.map(cat => `
      <tr class="os-cat"><td colspan="${emp.levelLabels.length + 1}">${_esc(cat.name)}</td></tr>
      ${cat.competencies.map(c => `<tr><td>${_esc(c.text)}</td>${c.levels.map(on =>
        `<td class="os-lv">${on ? `<span class="os-tick" aria-label="✓">✓</span>` : ''}</td>`).join('')}</tr>`).join('')}`).join('')}
    </tbody></table></div>`;
}

function _renderCompetencies(comps) {
  if (!comps.length) return _none();
  return comps.map(c => {
    const rows = [];
    rows.push({ label: _t('expRangeLabel'), value: c.range });
    if (c.tasks.length) rows.push({ label: _t('osRelatedTasksFromProfile'), value: c.tasks });
    rows.push({ label: _t('expPCLabel'), value: c.criteria });
    return `<div class="os-comp"><h5>${_esc(c.title)}</h5>${_kv(rows)}</div>`;
  }).join('');
}

function _renderChecklist(check) {
  const missing = check.items.filter(i => !i.ok);
  if (!missing.length || !_missingOpen) return '';
  return `<div class="os-missing" id="osMissing">
    <h4>${_esc(_tf('osMissingTitle', { n: missing.length }))}</h4>
    <ul>${missing.map(i => `<li><span>${_esc(_tf(CHECK_LABEL[i.key], { n: i.n, name: i.name }))}</span>${_editBtn(i.tab)}</li>`).join('')}</ul>
  </div>`;
}

// ── Render ───────────────────────────────────────────────────

export function renderOccupationalStandard() {
  const root = document.getElementById('osRoot');
  if (!root) return;
  _injectStyles();
  _wire(root);

  const M = getOccupationalStandardModel();
  const check = getOccupationalStandardChecklist(M);
  const done = check.done === check.total;
  const p1 = M.part1, p2 = M.part2;

  root.innerHTML = `
    <p class="os-intro">${_esc(_t('osTabIntro'))}</p>
    <div class="os-topbar">
      <div class="os-topbar-title" title="${_esc(M.subtitle)}">${_esc(M.subtitle || _t('tabOccStandard'))}</div>
      <div class="os-topbar-actions">
        <button type="button" class="os-progress${done ? ' is-done' : ''}" data-os-action="toggle-missing"
                aria-expanded="${!done && _missingOpen}" ${done ? 'disabled' : ''}
                title="${_esc(done ? _t('osAllDone') : _tf('osMissingTitle', { n: check.total - check.done }))}">${
          _esc(_tf('osProgress', { n: check.percent }))}</button>
        <button type="button" class="os-export-btn" data-os-action="export">⬇ ${_esc(_t('osExportBtn'))}</button>
      </div>
    </div>
    ${_renderChecklist(check)}

    <div class="os-part">
      <div class="os-part-head"><h3>${_esc(p1.title)}</h3>${M.subtitle ? `<p>${_esc(M.subtitle)}</p>` : ''}</div>
      ${_section(_t('osPanelHeading'), OS_SOURCE_TAB.panel, _kv(p1.panel))}
      ${_section(_t('osDutiesTasks'), OS_SOURCE_TAB.duties, _renderDuties(p1.duties))}
      ${_section(_t('expAdditionalInfo'), OS_SOURCE_TAB.narrative,
        _renderBlocks(p1.narrative.map(n => ({ head: n.head, lines: n.body.split('\n').map(l => l.trim()).filter(Boolean) }))))}
    </div>

    <div class="os-part">
      <div class="os-part-head"><h3>${_esc(p2.title)}</h3>${M.subtitle ? `<p>${_esc(M.subtitle)}</p>` : ''}</div>
      ${_section(_t('osHeaderHeading'), OS_SOURCE_TAB.header, _kv(p2.header))}
      ${_section(_t('expEmployability'), OS_SOURCE_TAB.employability, _renderEmployability(p2.employability))}
      ${_section(_t('osCompetenciesHeading'), OS_SOURCE_TAB.competencies, _renderCompetencies(p2.competencies))}
      ${_section(_t('osToolsEquipment'), OS_SOURCE_TAB.tools, p2.tools ? _renderBlocks([p2.tools]) : _none())}
    </div>`;
}

// ── Events ───────────────────────────────────────────────────

let _wired = false;
function _wire(root) {
  if (_wired) return;
  _wired = true;
  root.addEventListener('click', e => {
    const go = e.target.closest('[data-os-goto]');
    if (go) {
      const tab = go.getAttribute('data-os-goto');
      if (typeof window.switchTab === 'function') window.switchTab(tab);
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {}
      return;
    }
    const act = e.target.closest('[data-os-action]');
    if (!act) return;
    const what = act.getAttribute('data-os-action');
    if (what === 'export') exportOccupationalStandardWord();
    if (what === 'toggle-missing') { _missingOpen = !_missingOpen; renderOccupationalStandard(); }
  });
}

const _isActive = () => !!document.getElementById(TAB_ID)?.classList.contains('active');

window.addEventListener('dacum:langchange', () => { if (_isActive()) renderOccupationalStandard(); });
document.addEventListener('dacum:project-loaded', () => { if (_isActive()) setTimeout(renderOccupationalStandard, 80); });
