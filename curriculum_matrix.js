// ============================================================
// curriculum_matrix.js — the curriculum matrix: depth of treatment (3.119.0)
//
// Rows: the tasks the modules cover. Columns: the modules, in their
// order. Each cell says HOW the module treats the task:
//   ○  introduced  — first contact: what it is, why it matters
//   ◐  practised   — trained and applied
//   ●  assessed    — mastered and assessed against its criteria
// Symbols, not letters, so the chart reads the same in every language.
//
// Suggested from the data: of the modules whose criteria reach a task,
// the LAST one (in module order) assesses it (●) and the earlier ones
// practise it (◐) — the usual progression. The user
// clicks a cell to change it (○ → ◐ → ● → none → back to the
// suggestion); the choice is kept in moduleMappingData.depth.
//
// Checks under the table: a task never assessed; a task assessed before
// it is practised (in module order); a task assessed in several modules.
// ============================================================
import { appState } from './state.js';
import { _esc, _taskLabel, _tx, _txf } from './modules_shared.js';
import { _collectModuleTaskAnalysis, moduleRef, persistModuleMapping } from './module_mapping.js';

const SYM = { i: '○', p: '◐', a: '●' };
const CYCLE = ['i', 'p', 'a', '-'];
let _open = (() => { try { return localStorage.getItem('dacum_cmx_open') === '1'; } catch (_) { return false; } })();

function _mm() { return appState.moduleMappingData || { modules: [] }; }

/** The suggested depth of each task in each module, from the criteria. */
function _suggested() {
  const out = {};   // taskId → moduleId → 'a' | 'p'
  const tasks = [];  // { id, code, text } in first-seen order
  const seen = new Set();
  const last = {};
  _mm().modules.forEach(m => {
    const { sourceTasks } = _collectModuleTaskAnalysis(m);
    sourceTasks.forEach(t => {
      if (!seen.has(t.id)) { seen.add(t.id); tasks.push(t); }
      (out[t.id] = out[t.id] || {})[m.id] = 'p';
      last[t.id] = m.id;
    });
  });
  Object.keys(last).forEach(id => { out[id][last[id]] = 'a'; });
  return { out, tasks };
}

/** The level shown in a cell: the user's choice, else the suggestion. */
export function curriculumDepth(taskId, moduleId, sug) {
  const d = (_mm().depth || {})[taskId];
  if (d && d[moduleId]) return d[moduleId] === '-' ? '' : d[moduleId];
  const s = (sug || _suggested().out)[taskId];
  return (s && s[moduleId]) || '';
}

/** The whole matrix as data: for exports and tests. */
export function getCurriculumMatrix() {
  const { out, tasks } = _suggested();
  const mods = _mm().modules;
  const rows = tasks.map(t => ({
    id: t.id, code: t.code || _taskLabel(t.id), text: t.text || '',
    cells: mods.map(m => curriculumDepth(t.id, m.id, out))
  }));
  const checks = [];
  rows.forEach(r => {
    const firstA = r.cells.indexOf('a'), firstP = r.cells.indexOf('p');
    const nA = r.cells.filter(c => c === 'a').length;
    if (!nA) checks.push({ kind: 'never', task: r.code });
    else if (firstP > firstA) checks.push({ kind: 'early', task: r.code });
    if (nA > 1) checks.push({ kind: 'multi', task: r.code, n: nA });
  });
  return { modules: mods.map(m => ({ id: m.id, ref: moduleRef(m), title: m.title || '' })), rows, checks };
}

function _cycle(taskId, moduleId) {
  const mm = _mm();
  mm.depth = mm.depth || {};
  const cur = (mm.depth[taskId] || {})[moduleId];
  const shown = curriculumDepth(taskId, moduleId);
  let next;
  if (!cur) next = CYCLE[(CYCLE.indexOf(shown || '-') + 1) % CYCLE.length];
  else {
    const i = CYCLE.indexOf(cur);
    next = i === CYCLE.length - 1 ? null : CYCLE[i + 1];   // after «none»: back to the suggestion
  }
  mm.depth[taskId] = mm.depth[taskId] || {};
  if (next) mm.depth[taskId][moduleId] = next; else delete mm.depth[taskId][moduleId];
  if (!Object.keys(mm.depth[taskId]).length) delete mm.depth[taskId];
  persistModuleMapping();
  renderCurriculumMatrix();
}

function _styles() {
  if (document.getElementById('cmxStyles')) return;
  const st = document.createElement('style');
  st.id = 'cmxStyles';
  st.textContent = `
    .cmx-wrap { overflow-x: auto; margin-top: 10px; }
    .cmx-table { border-collapse: collapse; font-size: 0.86em; min-width: 100%; }
    .cmx-table th, .cmx-table td { border: 1px solid #e2e8f0; padding: 6px 8px; }
    .cmx-table thead th { background: #f1f5f9; color: #334155; white-space: nowrap; }
    .cmx-task { text-align: start; min-width: 220px; color: #1f2937; }
    .cmx-task small { color: #64748b; font-weight: 700; margin-inline-end: 6px; }
    button.cmx-cell { width: 38px !important; min-width: 38px; height: 32px !important; font: 700 19px/1 "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",sans-serif !important; overflow: visible; background: #fff !important; color: #4338ca !important;
      border: 1px dashed transparent !important; border-radius: 6px !important; cursor: pointer; padding: 0 !important; box-shadow: none !important; }
    button.cmx-cell:hover { border-color: #a5b4fc !important; background: #eef2ff !important; }
    button.cmx-cell.cmx-own { color: #1e1b4b !important; font-weight: 800; background: #e0e7ff !important; }
    .cmx-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 8px 0; color: #334155; font-size: 0.88em; }
    .cmx-legend b { color: #4338ca; font-size: 1.15em; }
    .cmx-checks { margin: 10px 0 0; padding: 8px 12px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; color: #9a3412; font-size: 0.86em; }
    .cmx-checks li { margin: 2px 0; }
    .cmx-ok { margin: 10px 0 0; color: #15803d; font-size: 0.88em; }
  `;
  document.head.appendChild(st);
}

/** Drawn after the coverage matrix of the Module Mapping tab. */
export function renderCurriculumMatrix() {
  const after = document.getElementById('coverageMatrixSection');
  let sec = document.getElementById('curriculumMatrixSection');
  if (!after || !_mm().modules.length) { if (sec) sec.remove(); return; }
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'curriculumMatrixSection';
    sec.className = 'clustering-section';
    after.parentNode.insertBefore(sec, after.nextSibling);
  }
  _styles();
  const { out } = _suggested();
  const m = getCurriculumMatrix();
  const own = (t, mid) => !!(((_mm().depth || {})[t] || {})[mid]);
  const head = '<tr><th class="cmx-task">' + _esc(_tx('cmxColTask')) + '</th>' +
    m.modules.map(md => `<th title="${_esc(md.title)}"><bdi>${_esc(md.ref)}</bdi></th>`).join('') + '</tr>';
  const body = m.rows.map(r => '<tr><td class="cmx-task"><small>' + _esc(r.code) + '</small>' + _esc(r.text) + '</td>' +
    r.cells.map((c, i) => {
      const mid = m.modules[i].id;
      return `<td style="text-align:center"><button type="button" class="cmx-cell${own(r.id, mid) ? ' cmx-own' : ''}" data-cmx-task="${_esc(r.id)}" data-cmx-mod="${_esc(mid)}" ` +
        `title="${_esc(c ? _tx('cmxLvl_' + c) : _tx('cmxLvlNone'))}" aria-label="${_esc(r.code + ' · ' + m.modules[i].ref + ': ' + (c ? _tx('cmxLvl_' + c) : _tx('cmxLvlNone')))}">${c ? SYM[c] : ''}</button></td>`;
    }).join('') + '</tr>').join('');
  const checks = m.checks.map(c => '<li>' + _esc(_txf('cmxCheck_' + c.kind, { t: c.task, n: c.n || '' })) + '</li>').join('');
  const nNever = m.checks.filter(c => c.kind === 'never').length;
  sec.innerHTML = `
   <details class="cov-fold" ${_open ? 'open' : ''}>
    <summary class="cov-fold-head">
      <span class="cov-fold-title">📐 ${_esc(_tx('cmxTitle'))}</span>
      <span class="cov-fold-mini">${m.rows.length ? `<span class="cov-pill ${nNever ? 'cov-gap' : 'cov-ok'}">${_esc(_txf('cmxSummary', { n: m.rows.length, k: nNever }))}</span>` : ''}</span>
      <span class="cov-fold-toggle">${_esc(_tx(_open ? 'covHide' : 'covShow'))}</span>
    </summary>
    <div class="cov-fold-body">
      <p class="cov-hint">${_esc(_tx('cmxHint'))}</p>
      <div class="cmx-legend"><span><b>○</b> ${_esc(_tx('cmxLvl_i'))}</span><span><b>◐</b> ${_esc(_tx('cmxLvl_p'))}</span><span><b>●</b> ${_esc(_tx('cmxLvl_a'))}</span></div>
      ${m.rows.length ? `<div class="cmx-wrap"><table class="cmx-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>` : `<div class="no-clusters-message">${_esc(_tx('cmxEmpty'))}</div>`}
      ${checks ? `<ul class="cmx-checks">${checks}</ul>` : (m.rows.length ? `<p class="cmx-ok">✓ ${_esc(_tx('cmxAllGood'))}</p>` : '')}
    </div>
   </details>`;
  const det = sec.querySelector('details');
  det.addEventListener('toggle', () => {
    _open = det.open;
    try { localStorage.setItem('dacum_cmx_open', _open ? '1' : '0'); } catch (_) {}
    const t = det.querySelector('.cov-fold-toggle');
    if (t) t.textContent = _tx(_open ? 'covHide' : 'covShow');
  });
  sec.querySelectorAll('[data-cmx-task]').forEach(b => b.addEventListener('click', () => _cycle(b.getAttribute('data-cmx-task'), b.getAttribute('data-cmx-mod'))));
}
