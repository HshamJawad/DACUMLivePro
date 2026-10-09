/* ============================================================
   mb_link.js — arriving from Module Builder, and going back (3.97.0)
   ------------------------------------------------------------
   Module Builder lists the tasks of a module that have no Task
   Analysis yet; each one opens this app with
     #mb-ta=<taskId>&project=<DACUM project id>&module=<module id>&mtitle=…
   This file opens that project (when it is not the one on screen),
   the Task Analysis tab and that task, and shows a bar
   "↩ Back to Module Builder" that sends the module again and returns
   to the Module Builder tab, which imports it at once.
   The bar stays (sessionStorage) until used or closed.
   ============================================================ */
import { switchTab } from './projects.js';
import { loadProject } from './dacum_projects.js';
import { openTaskAnalysisFor } from './task_analysis.js';
import { openModuleBuilderFromMapping } from './module_mapping.js';
import { appState } from './state.js';
import { showStatus } from './renderer.js';

const KEY = 'dacum_mb_return';
const _t = k => (window.i18n && window.i18n.t) ? window.i18n.t(k) : k;
const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function _readHash() {
  const h = String(location.hash || '').replace(/^#/, '');
  if (!h.startsWith('mb-ta=')) return null;
  const q = new URLSearchParams(h);
  return { task: q.get('mb-ta') || '', project: q.get('project') || '', module: q.get('module') || '', mtitle: q.get('mtitle') || '' };
}

function _clearHash() {
  try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { /* ignore */ }
}

function _status(msg, type) { showStatus(msg, type || 'info'); }

function _renderBar() {
  let info = null;
  try { info = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (_) { info = null; }
  let bar = document.getElementById('mbReturnBar');
  if (!info || !info.module) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'mbReturnBar';
    bar.className = 'mb-return-bar';
    document.body.appendChild(bar);
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-mbr]');
      if (!b) return;
      if (b.getAttribute('data-mbr') === 'back') goBack();
      else { try { sessionStorage.removeItem(KEY); } catch (_) {} _renderBar(); }
    });
  }
  bar.innerHTML = `
    <span class="mb-return-text">🔗 ${_esc(_t('mbReturnText'))}${info.mtitle ? ` — <b>${_esc(info.mtitle)}</b>` : ''}</span>
    <button type="button" class="mb-return-btn" data-mbr="back">↩ ${_esc(_t('mbReturnBtn'))}</button>
    <button type="button" class="mb-return-close" data-mbr="close" title="${_esc(_t('mbReturnClose'))}" aria-label="${_esc(_t('mbReturnClose'))}">✕</button>`;
}

export function goBack() {
  let info = null;
  try { info = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (_) { info = null; }
  if (!info || !info.module) return;
  const exists = (appState.moduleMappingData?.modules || []).some(m => m.id === info.module);
  if (!exists) { _status('⚠️ ' + _t('mbReturnNoModule'), 'error'); return; }
  openModuleBuilderFromMapping(info.module);
  try { sessionStorage.removeItem(KEY); } catch (_) { /* ignore */ }
  _renderBar();
}

function _handle() {
  const req = _readHash();
  if (!req || !req.task) return;
  _clearHash();
  let active = null;
  try { active = localStorage.getItem('dacum_active_project'); } catch (_) { active = null; }
  if (req.project && req.project !== active) {
    let ok = true;
    try { loadProject(req.project); } catch (_) { ok = false; }
    let now = null;
    try { now = localStorage.getItem('dacum_active_project'); } catch (_) { now = null; }
    if (!ok || now !== req.project) { _status('⚠️ ' + _t('mbReturnNoProject'), 'error'); return; }
  }
  try { sessionStorage.setItem(KEY, JSON.stringify({ module: req.module, mtitle: req.mtitle })); } catch (_) { /* ignore */ }
  switchTab('task-analysis-tab');
  setTimeout(() => {
    if (!openTaskAnalysisFor(req.task)) _status('⚠️ ' + _t('mbReturnNoTask'), 'error');
  }, 120);
  _renderBar();
  try { window.focus(); } catch (_) { /* ignore */ }
}

export function initMbLink() {
  try { if (!window.name) window.name = 'dacum-live-pro'; } catch (_) { /* ignore */ }
  window.addEventListener('hashchange', _handle);
  window.addEventListener('dacum:langchange', _renderBar);
  _handle();
  _renderBar();
}
