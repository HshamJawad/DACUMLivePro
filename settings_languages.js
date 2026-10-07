// ============================================================
// /settings_languages.js
// Settings → Languages (3.79.0): the content languages of the open
// project — which version is shown, AI translation, review — and the
// slim banner shown while a translation is on screen.
//
// The data rules live in content_lang.js; the AI calls in
// content_translate.js. This file captures the project, hands it to
// those, and applies the result through the same path that opens a
// project (dacum_projects.applyProjectState), so every tab, export and
// AI card simply sees the version that is shown.
// ============================================================

import { appState } from './state.js';
import { captureProjectState, applyProjectState, saveCurrentProject,
         getActiveProjectId } from './dacum_projects.js';
import * as CL from './content_lang.js';
import { runTranslation, makeBatches, tidyTranslation } from './content_translate.js';
import { showStatus } from './renderer.js';
import { syncDefaultsToLanguage } from './i18n_defaults.js';
import { showAIServiceError } from './ai_client.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
const _esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _name = (l) => CL.LANG_NAMES[l] || l;
const _cl = () => appState.contentLanguages || null;

/* ── The content language the rest of the app follows ───────────── */
function _registerProvider() {
  if (window.i18n && window.i18n.setContentLangProvider) {
    window.i18n.setContentLangProvider(() => (_cl() ? _cl().active : null));
  }
}
_registerProvider();

/* ── State of the panel ──────────────────────────────────────────── */
let _box = null;            // the Settings body while this tab is open
let _mode = 'main';         // 'main' | 'review'
let _reviewLang = null;
let _reviewFilter = 'all';
let _reviewQuery = '';
let _reviewLimit = 150;
let _busy = false;          // a translation run is in progress
let _cancel = false;
let _progress = null;       // { i, n }
let _estimate = null;       // { from, to, all, items, calls, noSource }
let _choice = null;         // { from, to, all } — kept across re-renders

/* ── Switching the shown version ─────────────────────────────────── */

function _applyAndRecord(s) {
  applyProjectState(s, { onApplied: () => { try { syncDefaultsToLanguage(); } catch (e) {} } });
  const cl = _cl();
  if (cl && cl.view) {
    // What the screen holds right after showing the translation: going
    // back with nothing changed then restores the original exactly.
    const after = CL.stripCL(captureProjectState());
    cl.view.appliedHash = CL.hashText(JSON.stringify(after));
    saveCurrentProject();
  }
  _syncDocument();
  renderLanguageBanner();
}

/** Show version `lang` of the content (no AI call). Returns false when
 *  it could not switch. */
export function switchContentLanguage(lang, { quiet = false } = {}) {
  const cl = _cl();
  if (!cl || cl.active === lang) return !!cl;
  if (_busy) { showStatus(_t('lgBusy'), 'error'); return false; }
  if (window.i18n && window.i18n.isLangLocked && window.i18n.isLangLocked()) {
    showStatus(_t('dgLangLocked'), 'error');
    return false;
  }
  if (lang !== cl.original && !(cl.versions && cl.versions[lang])) return false;

  let s = captureProjectState();
  let edited = 0, added = 0;
  const left = s.contentLanguages.view ? s.contentLanguages.view.lang : null;
  if (left) {
    const r = CL.viewOriginal(s);
    s = r.state; edited = r.edited; added = r.added;
  }
  if (lang !== s.contentLanguages.original) s = CL.viewTranslation(s, lang);
  _applyAndRecord(s);

  if (!quiet) {
    const msgs = [_tf('lgSwitched', { lang: _name(lang) })];
    if (edited) msgs.push(_tf('lgSwitchedEdits', { n: edited, lang: _name(left) }));
    if (added)  msgs.push(_tf('lgSwitchedAdded', { n: added, lang: _name(left) }));
    showStatus('🌐 ' + msgs.join(' '), 'success');
  }
  _rerender();
  return true;
}

/* The interface may run in one direction and the content in the
   other; inputs then take each paragraph's own direction. */
function _syncDocument() {
  const root = document.documentElement;
  const cl = _cl();
  const contentRTL = cl ? CL.RTL.includes(cl.active) : null;
  const uiRTL = !!(window.i18n && window.i18n.uiLang && CL.RTL.includes(window.i18n.uiLang()));
  if (cl) root.setAttribute('data-content-lang', cl.active);
  else root.removeAttribute('data-content-lang');
  if (cl && contentRTL !== uiRTL) root.setAttribute('data-content-mixed', '');
  else root.removeAttribute('data-content-mixed');
}

/* ── Banner ──────────────────────────────────────────────────────── */

export function renderLanguageBanner() {
  const host = document.querySelector('.container');
  let el = document.getElementById('clBanner');
  const cl = _cl();
  const view = cl && cl.view;
  if (!view) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'clBanner';
    el.setAttribute('role', 'status');
    if (host) host.insertBefore(el, host.firstChild); else return;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cl]');
      if (!b) return;
      const a = b.getAttribute('data-cl');
      if (a === 'original') switchContentLanguage(_cl().original);
      else if (a === 'settings') openLanguagesSettings();
    });
  }
  const ver = (cl.versions && cl.versions[view.lang]) || {};
  el.innerHTML = `
    <span class="cl-b-icon" aria-hidden="true">🌐</span>
    <span class="cl-b-text">${_esc(_tf('lgBanner', { lang: _name(view.lang), orig: _name(cl.original) }))}</span>
    <span class="cl-b-chip ${ver.reviewed ? 'cl-ok' : 'cl-draft'}">${_esc(ver.reviewed ? _t('lgStatusReviewed') : _t('lgBannerDraft'))}</span>
    <span class="cl-b-actions">
      <button type="button" data-cl="original">${_esc(_tf('lgBannerOriginal', { lang: _name(cl.original) }))}</button>
      <button type="button" data-cl="settings">${_esc(_t('lgBannerSettings'))}</button>
    </span>`;
}

export function openLanguagesSettings() {
  import('./export_settings.js')
    .then(m => m.openExportSettings({ tab: 'languages' }))
    .catch(err => console.error('[languages] settings load failed:', err));
}

/* ── The Languages tab ───────────────────────────────────────────── */

/* Only while the Languages tab is on screen: the Settings body is shared
   with the Export tab, and the modal is hidden rather than removed. */
function _tabOnScreen() {
  if (!_box || !_box.isConnected) return false;
  const modal = document.getElementById('esModal');
  if (!modal || modal.style.display === 'none') return false;
  return !!document.querySelector('#esTabs [data-es-tab="languages"].es-tab-on');
}
function _rerender() { if (_tabOnScreen()) renderLanguagesTab(_box); }

export function renderLanguagesTab(box) {
  _box = box;
  if (_mode === 'review' && _reviewLang && _cl() && _cl().versions && _cl().versions[_reviewLang]) {
    _renderReview(box);
    return;
  }
  _mode = 'main';
  const cl = _cl();
  const hasProject = !!getActiveProjectId();
  const uiLang = window.i18n ? window.i18n.uiLang() : 'en';

  let html = `<p class="es-intro">🌐 ${_esc(_t('lgIntro'))}</p>`;
  if (!hasProject) {
    box.innerHTML = html + `<p class="es-note">${_esc(_t('lgNoProject'))}</p>`;
    return;
  }

  // ── Versions
  html += `<section class="es-section"><div class="es-sec-head"><span>📚 ${_esc(_t('lgSecVersions'))}</span></div>`;
  if (!cl) {
    const guess = CL.guessLanguage(captureProjectState(), uiLang);
    html += `
      <div class="es-field">
        <label for="clOriginalNew">${_esc(_t('lgOriginal'))}</label>
        <div class="cl-row">
          <select id="clOriginalNew" class="es-select">${CL.LANGS.map(l =>
            `<option value="${l}"${l === guess ? ' selected' : ''}>${_esc(_name(l))}</option>`).join('')}</select>
          <button type="button" class="cl-btn cl-primary" data-cl-act="init">${_esc(_t('lgConfirmOriginal'))}</button>
        </div>
        <p class="es-note">${_esc(_t('lgOriginalHint'))}</p>
      </div>`;
  } else {
    const nVersions = Object.keys(cl.versions || {}).length;
    html += `
      <div class="es-field">
        <label for="clOriginal">${_esc(_t('lgOriginal'))}</label>
        <select id="clOriginal" class="es-select" ${nVersions || cl.view ? 'disabled' : ''}>${CL.LANGS.map(l =>
          `<option value="${l}"${l === cl.original ? ' selected' : ''}>${_esc(_name(l))}</option>`).join('')}</select>
        <p class="es-note">${_esc(_t('lgOriginalHint'))}</p>
      </div>
      <div class="cl-versions" role="list">${_versionRow(cl.original, true)}${
        Object.keys(cl.versions || {}).map(l => _versionRow(l, false)).join('')}</div>`;
  }
  html += `</section>`;

  if (cl) {
    html += _translateSection(cl);
    html += _foreignSection();
  }
  html += `<p class="es-note es-scope">ℹ️ ${_esc(_t('lgFooter'))}</p>`;
  box.innerHTML = html;
  _wireMain(box);
}

function _versionRow(lang, isOriginal) {
  const cl = _cl();
  const shown = cl.active === lang;
  let meta = '';
  let actions = '';
  if (isOriginal) {
    meta = `<span class="cl-chip cl-orig">${_esc(_t('lgBadgeOriginal'))}</span>`;
  } else {
    const ver = cl.versions[lang] || {};
    const st = CL.versionStats(_stateForStats(), lang);
    meta = `<span class="cl-chip ${ver.reviewed ? 'cl-ok' : 'cl-draft'}">${_esc(ver.reviewed ? _t('lgStatusReviewed') : _t('lgStatusAI'))}</span>
      <span class="cl-count">${_esc(_tf('lgCount', { done: st.done, total: st.total }))}${
        st.edited ? ' · ' + _esc(_tf('lgEdited', { n: st.edited })) : ''}${
        st.flagged ? ' · ' + _esc(_tf('lgFlagged', { n: st.flagged })) : ''}</span>`;
    actions = `<button type="button" class="cl-btn" data-cl-act="review" data-lang="${lang}">${_esc(_t('lgReview'))}</button>
      <button type="button" class="cl-btn cl-danger" data-cl-act="delete" data-lang="${lang}" ${shown ? 'disabled' : ''}>${_esc(_t('lgDelete'))}</button>`;
  }
  return `<div class="cl-version${shown ? ' cl-shown' : ''}" role="listitem">
      <label class="cl-pick">
        <input type="radio" name="clShown" value="${lang}" ${shown ? 'checked' : ''} ${_busy ? 'disabled' : ''}>
        <span class="cl-lname" lang="${lang}" dir="${CL.RTL.includes(lang) ? 'rtl' : 'ltr'}">${_esc(_name(lang))}</span>
      </label>
      <span class="cl-meta">${meta}${shown ? ` <span class="cl-chip cl-shown-chip">${_esc(_t('lgBadgeShown'))}</span>` : ''}</span>
      <span class="cl-actions">${actions}</span>
    </div>`;
}

let _statsCache = null;
function _stateForStats() {
  // One capture per render of the tab.
  if (!_statsCache) { _statsCache = captureProjectState(); setTimeout(() => { _statsCache = null; }, 0); }
  return _statsCache;
}

function _fromOptions(cl) {
  const opts = [cl.original];
  Object.keys(cl.versions || {}).forEach(l => { if (cl.versions[l].reviewed) opts.push(l); });
  return opts;
}

function _translateSection(cl) {
  const froms = _fromOptions(cl);
  const c = _choice || {};
  const from = froms.includes(c.from) ? c.from : cl.original;
  const tos = CL.LANGS.filter(l => l !== cl.original && l !== from);
  const to = tos.includes(c.to) ? c.to
           : (tos.find(l => l === (window.i18n && window.i18n.uiLang())) || tos[0]);
  const all = !!c.all;
  _choice = { from, to, all };
  let status = '';
  if (_busy && _progress) {
    const pct = _progress.n ? Math.round(100 * _progress.i / _progress.n) : 0;
    status = `<div class="cl-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <p class="es-note">${_esc(_tf('lgProgress', { i: Math.min(_progress.i + 1, _progress.n), n: _progress.n }))}</p>`;
  } else if (_estimate && _estimate.from === from && _estimate.to === to && _estimate.all === all) {
    status = `<p class="es-note cl-estimate">${_esc(_estimate.items.length
      ? _tf('lgEstimate', { n: _estimate.items.length, calls: _estimate.calls })
      : _t('lgNothing'))}${_estimate.noSource ? ' ' + _esc(_tf('lgNoSource', { n: _estimate.noSource, lang: _name(from) })) : ''}</p>`;
  }
  return `<section class="es-section">
    <div class="es-sec-head"><span>🤖 ${_esc(_t('lgSecTranslate'))}</span><span class="es-badges"><i class="es-badge">AI</i></span></div>
    <div class="cl-row cl-fromto">
      <label>${_esc(_t('lgFrom'))}
        <select id="clFrom" class="es-select" ${_busy ? 'disabled' : ''}>${froms.map(l =>
          `<option value="${l}"${l === from ? ' selected' : ''}>${_esc(_name(l))}${l === cl.original ? ' — ' + _esc(_t('lgBadgeOriginal')) : ''}</option>`).join('')}</select>
      </label>
      <span aria-hidden="true" class="cl-arrow">→</span>
      <label>${_esc(_t('lgTo'))}
        <select id="clTo" class="es-select" ${_busy ? 'disabled' : ''}>${tos.map(l =>
          `<option value="${l}"${l === to ? ' selected' : ''}>${_esc(_name(l))}</option>`).join('')}</select>
      </label>
    </div>
    <label class="cl-check"><input type="checkbox" id="clAll" ${all ? 'checked' : ''} ${_busy ? 'disabled' : ''}> ${_esc(_t('lgAll'))}</label>
    <p class="es-note">${_esc(_t('lgFromNote'))}</p>
    ${status}
    <div class="cl-row">
      ${_busy
        ? `<button type="button" class="cl-btn cl-danger" data-cl-act="stop">${_esc(_t('lgStop'))}</button>`
        : `<button type="button" class="cl-btn cl-primary" data-cl-act="translate" id="clTranslateBtn">🌐 ${_esc(_t('lgTranslate'))}</button>`}
    </div>
  </section>`;
}

function _foreignSection() {
  const cl = _cl();
  if (!cl || cl.view) return '';
  const list = CL.foreignTexts(captureProjectState());
  if (!list.length) return '';
  return `<section class="es-section">
    <div class="es-sec-head"><span>↩️ ${_esc(_t('lgSecForeign'))}</span></div>
    <p class="es-note">${_esc(_tf('lgForeign', { n: list.length, lang: _name(cl.original) }))}</p>
    <ul class="cl-foreign">${list.slice(0, 8).map(x => `<li dir="auto">${_esc(x.text)}</li>`).join('')}${list.length > 8 ? '<li>…</li>' : ''}</ul>
    <div class="cl-row"><button type="button" class="cl-btn cl-primary" data-cl-act="back" ${_busy ? 'disabled' : ''}>${_esc(_tf('lgTranslateBack', { lang: _name(cl.original) }))}</button></div>
  </section>`;
}

function _wireMain(box) {
  box.querySelectorAll('input[name="clShown"]').forEach(r => r.addEventListener('change', function () {
    if (!switchContentLanguage(this.value)) _rerender();
  }));
  const orig = box.querySelector('#clOriginal');
  if (orig) orig.addEventListener('change', function () {
    const cl = _cl();
    if (!cl || cl.view || Object.keys(cl.versions || {}).length) return;
    appState.contentLanguages = { ...cl, original: this.value, active: this.value };
    saveCurrentProject(); _syncDocument(); _estimate = null; _rerender();
  });
  const sel = () => ({
    from: (box.querySelector('#clFrom') || {}).value,
    to: (box.querySelector('#clTo') || {}).value,
    all: !!(box.querySelector('#clAll') || {}).checked,
  });
  ['#clFrom', '#clTo', '#clAll'].forEach(q => {
    const el = box.querySelector(q);
    if (el) el.addEventListener('change', () => { _estimate = null; _choice = sel(); _rerender(); });
  });
  box.addEventListener('click', _onClick);
}


function _onClick(e) {
  const b = e.target.closest('[data-cl-act]');
  if (!b || !_box || !_box.contains(b)) return;
  const act = b.getAttribute('data-cl-act');
  const lang = b.getAttribute('data-lang');
  if (_busy && act !== 'stop') return;
  if (act === 'init') {
    const v = (_box.querySelector('#clOriginalNew') || {}).value || 'en';
    appState.contentLanguages = CL.newCL(v);
    saveCurrentProject(); _syncDocument(); _rerender();
  } else if (act === 'review') {
    _mode = 'review'; _reviewLang = lang; _reviewFilter = 'all'; _reviewQuery = ''; _reviewLimit = 150;
    _rerender();
  } else if (act === 'delete') {
    const cl = _cl();
    if (!cl || cl.active === lang) return;
    if (!window.confirm(_tf('lgConfirmDelete', { lang: _name(lang) }))) return;
    // Texts added in that language stay listed (foreign) — they are
    // still in the original and still need translating into it.
    const versions = { ...cl.versions }; delete versions[lang];
    appState.contentLanguages = { ...cl, versions };
    saveCurrentProject(); _rerender();
  } else if (act === 'translate') {
    _onTranslate();
  } else if (act === 'stop') {
    _cancel = true;
  } else if (act === 'back') {
    _translateBack();
  }
}

/* First press: estimate. Second press (same choice): translate. */
function _onTranslate() {
  const cl = _cl();
  if (!cl || _busy) return;
  const from = (_box.querySelector('#clFrom') || {}).value || cl.original;
  const to = (_box.querySelector('#clTo') || {}).value;
  const all = !!(_box.querySelector('#clAll') || {}).checked;
  if (!to || to === cl.original) return;
  _choice = { from, to, all };
  if (_estimate && _estimate.from === from && _estimate.to === to && _estimate.all === all && _estimate.items.length) {
    _runTranslate(_estimate);
    return;
  }
  // Plan against the ORIGINAL text — leave a shown translation first.
  if (cl.view && !switchContentLanguage(cl.original, { quiet: true })) return;
  const plan = CL.planTranslation(captureProjectState(), { from, to, all });
  _estimate = { from, to, all, items: plan.items, noSource: plan.noSource, calls: makeBatches(plan.items).length };
  _rerender();
  const btn = _box && _box.querySelector('#clTranslateBtn');
  if (btn && _estimate.items.length) { btn.textContent = '🌐 ' + _tf('lgTranslateN', { n: _estimate.items.length }); btn.focus(); }
}

async function _runTranslate(est) {
  const projectId = getActiveProjectId();
  const cl0 = _cl();
  if (cl0.view && !switchContentLanguage(cl0.original, { quiet: true })) return;
  if (!_cl().versions[est.to]) {
    appState.contentLanguages = CL.storeTranslations(_cl(), est.to, []);
    saveCurrentProject();
  }
  _busy = true; _cancel = false; _progress = { i: 0, n: est.calls };
  _rerender();
  const sameProject = () => getActiveProjectId() === projectId;
  let res;
  try {
    res = await runTranslation({
      items: est.items, from: est.from, to: est.to,
      isCancelled: () => _cancel || !sameProject() || !_cl(),
      onProgress: (i, n) => { _progress = { i, n }; _rerender(); },
      onBatch: (r) => {
        if (!sameProject() || !_cl()) return;
        appState.contentLanguages = CL.storeTranslations(_cl(), est.to, r);
        saveCurrentProject();
      },
    });
  } finally {
    _busy = false; _progress = null; _estimate = null;
  }
  if (!sameProject() || !_cl()) { _rerender(); return; }
  if (!_cl().view) {
    appState.contentLanguages = CL.tidyVersion(captureProjectState(), est.to);
    saveCurrentProject();
  }
  if (res.failed && !res.translated) {
    showAIServiceError(res.lastError, {});
  } else if (res.failed) {
    showStatus('⚠️ ' + _tf('lgPartial', { n: res.translated, m: res.failed }), 'error');
  } else if (res.translated) {
    showStatus('✓ ' + _tf('lgDone', { n: res.translated }), 'success');
  }
  if (res.translated) switchContentLanguage(est.to, { quiet: true });
  _rerender();
}

/* Texts added while a translation was shown → into the original. */
async function _translateBack() {
  const cl = _cl();
  if (!cl || cl.view || _busy) return;
  const projectId = getActiveProjectId();
  const list = CL.foreignTexts(captureProjectState());
  if (!list.length) return;
  const byLang = {};
  list.forEach(x => { (byLang[x.lang] = byLang[x.lang] || []).push({ h: CL.hashText(x.text), src: x.text }); });
  const pairs = [];
  _busy = true; _cancel = false; _progress = { i: 0, n: 1 }; _rerender();
  let lastError = null;
  try {
    for (const lang of Object.keys(byLang)) {
      const items = byLang[lang];
      const srcOf = new Map(items.map(i => [i.h, i.src]));
      const r = await runTranslation({
        items, from: lang, to: cl.original,
        isCancelled: () => _cancel || getActiveProjectId() !== projectId || !_cl(),
        onProgress: (i, n) => { _progress = { i, n }; _rerender(); },
        onBatch: (res) => res.forEach(x => pairs.push({ from: srcOf.get(x.h), to: x.t })),
      });
      if (r.lastError) lastError = r.lastError;
    }
  } finally { _busy = false; _progress = null; }
  if (getActiveProjectId() !== projectId || !_cl()) { _rerender(); return; }
  if (pairs.length) {
    _applyAndRecord(CL.replaceOriginalTexts(captureProjectState(), pairs));
    showStatus('✓ ' + _tf('lgDone', { n: pairs.length }), 'success');
  } else if (lastError) {
    showAIServiceError(lastError, {});
  }
  _rerender();
}

/* ── Review list ─────────────────────────────────────────────────── */

function _renderReview(box) {
  const cl = _cl();
  const lang = _reviewLang;
  const ver = cl.versions[lang] || { tm: {} };
  const s = captureProjectState();
  const texts = CL.originalTexts(s);
  const q = _reviewQuery.trim().toLowerCase();
  const rows = texts.map(src => {
    const h = CL.hashText(src);
    return { h, src, e: ver.tm[h] || null };
  }).filter(r => {
    if (_reviewFilter === 'missing' && r.e) return false;
    if (_reviewFilter === 'edited' && !(r.e && r.e.e)) return false;
    if (_reviewFilter === 'flagged' && !(r.e && r.e.w !== undefined)) return false;
    if (q && !(r.src.toLowerCase().includes(q) || (r.e && r.e.t.toLowerCase().includes(q)))) return false;
    return true;
  });
  const dirL = CL.RTL.includes(lang) ? 'rtl' : 'ltr';
  const dirO = CL.RTL.includes(cl.original) ? 'rtl' : 'ltr';
  const filters = ['all', 'missing', 'edited', 'flagged'];
  const fKey = { all: 'lgFilterAll', missing: 'lgFilterMissing', edited: 'lgFilterEdited', flagged: 'lgFilterFlagged' };
  box.innerHTML = `
    <div class="cl-rev-head">
      <button type="button" class="cl-btn" data-rv="back">${_esc(_t('lgBack'))}</button>
      <b>${_esc(_tf('lgReviewTitle', { lang: _name(lang) }))}</b>
      <label class="cl-check"><input type="checkbox" data-rv="reviewed" ${ver.reviewed ? 'checked' : ''}> ${_esc(_t('lgMarkReviewed'))}</label>
    </div>
    <div class="cl-row cl-rev-tools">
      <select class="es-select" data-rv="filter">${filters.map(f =>
        `<option value="${f}"${f === _reviewFilter ? ' selected' : ''}>${_esc(_t(fKey[f]))}</option>`).join('')}</select>
      <input type="search" class="es-select cl-search" data-rv="search" placeholder="${_esc(_t('lgSearch'))}" value="${_esc(_reviewQuery)}">
      <span class="es-note">${rows.length} / ${texts.length}</span>
    </div>
    <div class="cl-rev-list">
      <div class="cl-rev-cols"><span>${_esc(_name(cl.original))} — ${_esc(_t('lgColOriginal'))}</span><span>${_esc(_name(lang))} — ${_esc(_t('lgColTranslation'))}</span></div>
      ${rows.slice(0, _reviewLimit).map(r => `
        <div class="cl-rev-row${r.e ? '' : ' cl-missing'}">
          <div class="cl-rev-src" dir="${dirO}" lang="${cl.original}">${_esc(r.src)}</div>
          <div class="cl-rev-dst">
            <textarea dir="${dirL}" lang="${lang}" rows="${Math.min(6, Math.max(1, Math.ceil(r.src.length / 60)))}"
              data-h="${r.h}" data-orig="${_esc(r.e ? r.e.t : '')}">${_esc(r.e ? r.e.t : '')}</textarea>
            <span class="cl-chip ${r.e ? (r.e.e ? 'cl-edit' : 'cl-ai') : 'cl-miss'}">${_esc(r.e ? (r.e.e ? _t('lgChipEdited') : _t('lgChipAI')) : _t('lgChipMissing'))}</span>
            ${r.e && r.e.w !== undefined ? `<p class="es-note cl-was" dir="${dirL}">${_esc(_tf('lgWas', { t: r.e.w }))}</p>` : ''}
          </div>
        </div>`).join('')}
      ${rows.length > _reviewLimit ? `<button type="button" class="cl-btn" data-rv="more">${_esc(_t('lgShowMore'))}</button>` : ''}
    </div>
    <div class="cl-row cl-rev-foot">
      <span class="es-note" id="clRevFlag">${_flash ? '✓ ' + _esc(_flash) : ''}</span>
      <button type="button" class="cl-btn cl-primary" data-rv="save">💾 ${_esc(_t('lgSaveEdits'))}</button>
    </div>`;

  _flash = '';
  const flag = box.querySelector('#clRevFlag');
  box.querySelectorAll('textarea[data-h]').forEach(ta => ta.addEventListener('input', () => {
    if (flag) flag.textContent = _t('esUnsaved');
  }));
  box.querySelector('[data-rv="filter"]').addEventListener('change', function () { _collectPending(); _reviewFilter = this.value; _reviewLimit = 150; _rerender(); });
  box.querySelector('[data-rv="search"]').addEventListener('change', function () { _collectPending(); _reviewQuery = this.value; _rerender(); });
  box.querySelector('[data-rv="reviewed"]').addEventListener('change', function () {
    const c = _cl();
    const v = { ...(c.versions[lang] || {}), reviewed: this.checked, reviewedAt: this.checked ? Date.now() : null };
    appState.contentLanguages = { ...c, versions: { ...c.versions, [lang]: v } };
    saveCurrentProject(); renderLanguageBanner();
  });
  box.querySelector('[data-rv="back"]').addEventListener('click', () => {
    _collectPending();
    if (_pending.size && !window.confirm(_t('esDiscardConfirm'))) return;
    _pending.clear(); _mode = 'main'; _rerender();
  });
  const more = box.querySelector('[data-rv="more"]');
  if (more) more.addEventListener('click', () => { _collectPending(); _reviewLimit += 150; _rerender(); });
  box.querySelector('[data-rv="save"]').addEventListener('click', () => {
    _collectPending();
    _flash = _t('lgSaved');
    _saveReview(lang, new Map(texts.map(t => [CL.hashText(t), t])));
  });
  // Keep edits typed before a filter change / show more.
  _pending.forEach((t, h) => {
    const ta = box.querySelector(`textarea[data-h="${h}"]`);
    if (ta) ta.value = t;
  });
}

const _pending = new Map();
let _flash = '';
function _collectPending() {
  if (!_box) return;
  _box.querySelectorAll('textarea[data-h]').forEach(ta => {
    const h = ta.getAttribute('data-h');
    if (ta.value !== ta.getAttribute('data-orig')) _pending.set(h, ta.value);
    else _pending.delete(h);
  });
}

function _saveReview(lang, srcOf) {
  if (!_pending.size) { _rerender(); return; }
  // A one-line text stays one line (a line break would split an
  // Additional Info item in two).
  const edits = [..._pending].map(([h, t]) => {
    const src = srcOf.get(h);
    return { h, t: (src !== undefined && t.trim()) ? tidyTranslation(src, t) : t.trim() };
  });
  _pending.clear();
  const cl = _cl();
  if (cl.view && cl.view.lang === lang) {
    // Shown now: go back to the original (keeping any edits made on
    // screen), store the corrections, and show the version again.
    if (!switchContentLanguage(cl.original, { quiet: true })) return;
    appState.contentLanguages = CL.editTranslations(_cl(), lang, edits);
    saveCurrentProject();
    switchContentLanguage(lang, { quiet: true });
  } else {
    appState.contentLanguages = CL.editTranslations(cl, lang, edits);
    saveCurrentProject();
  }
  _rerender();
}

/* ── Start-up ────────────────────────────────────────────────────── */

let _inited = false;
export function initContentLanguages() {
  if (_inited) return;
  _inited = true;
  _registerProvider();
  _syncDocument();
  renderLanguageBanner();
  let shownProject = getActiveProjectId();
  document.addEventListener('dacum:project-loaded', () => {
    const id = getActiveProjectId();
    if (id !== shownProject) {          // another project: start the tab afresh
      shownProject = id;
      _estimate = null; _choice = null; _mode = 'main'; _pending.clear();
    }
    _syncDocument(); renderLanguageBanner(); _rerender();
  });
  document.addEventListener('dacum:content-languages-changed', () => {
    _syncDocument(); renderLanguageBanner(); _rerender();
  });
  window.addEventListener('dacum:langchange', () => {
    _syncDocument(); renderLanguageBanner(); _rerender();
  });
  // Test / console hook.
  window.dacumContentLanguages = { switchTo: switchContentLanguage, openSettings: openLanguagesSettings };
}
