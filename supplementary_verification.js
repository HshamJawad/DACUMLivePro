// ============================================================
// /supplementary_verification.js
// Supplementary Occupational Verification — optional, additive.
//
// Collects occupation-level evidence (knowledge & skills, tools,
// behaviours, future trends, custom lists) and verifies it with the
// SAME methodology as Task Verification:
//   • the same 0–3 scale,
//   • the same two collection modes (workshop counts / individual),
//   • the same participant ceiling (appState.workshopParticipants),
//   • the same weighted mean (calculateWeightedMean from tasks.js).
//
// It is deliberately kept apart from task results. Nothing here reads
// or writes verificationRatings, workshopCounts, workshopResults,
// dutiesData or the Priority Index, and nothing re-orders duties or
// tasks. Its only outputs are:
//   1. its own UI block in the Task Verification tab,
//   2. an export section (exports_pdf.js / exports_docx.js),
//   3. a read-only data contract for Module Builder
//      (getSupplementaryVerificationData).
// ============================================================

import { appState, defaultSupplementaryVerification,
         SV_DEFAULT_CATEGORIES } from './state.js';
import { showStatus, escapeHtml } from './renderer.js';
import { calculateWeightedMean } from './tasks.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

const CONTAINER_ID = 'supplementaryVerificationSection';
const SCALE = [0, 1, 2, 3];

/* Stable, language-neutral category kinds for Module Builder. The
   display name follows the interface language; the kind never does. */
const KIND_BY_ID = {
  knowledgeSkills: 'knowledge_skills',
  toolsEquipment:  'tools_equipment_materials',
  workBehaviours:  'work_behaviours',
  futureTrends:    'future_trends',
};

// ── State access ─────────────────────────────────────────────

/* Old projects have no supplementaryVerification key at all, and a
   hand-edited file may carry a partial one. Everything goes through
   this so the rest of the module can assume a complete shape. */
function _sv() {
  let s = appState.supplementaryVerification;
  if (!s || typeof s !== 'object' || !Array.isArray(s.categories)) {
    s = defaultSupplementaryVerification();
    appState.supplementaryVerification = s;
  }
  s.enabled         = !!s.enabled;
  s.itemCounter     = s.itemCounter     || 0;
  s.categoryCounter = s.categoryCounter || 0;
  s.categories.forEach(c => {
    if (!Array.isArray(c.items)) c.items = [];
    c.items.forEach(it => {
      if (!it.counts || typeof it.counts !== 'object') it.counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
      if (it.rating === undefined) it.rating = null;
    });
  });
  return s;
}

function _findCat(id)  { return _sv().categories.find(c => c.id === id) || null; }
function _findItem(cat, id) { return cat ? cat.items.find(i => i.id === id) || null : null; }

export function categoryDisplayName(cat) {
  if (!cat) return '';
  if (cat.name && cat.name.trim()) return cat.name.trim();
  if (cat.key) return _t(cat.key);
  return _tf('svCustomCatDefault', { n: '' }).trim();
}

// ── Computation (same maths as task workshop results) ────────

function _itemResult(item) {
  if (appState.collectionMode === 'workshop') {
    const c   = item.counts || {};
    const sum = SCALE.reduce((a, v) => a + (parseInt(c[v]) || 0), 0);
    const max = appState.workshopParticipants;
    // Counts that came from a Live Workshop session are real ballots:
    // their total is the number of participants who voted, so the
    // manual participant ceiling does not apply to them.
    const live = item.source === 'live';
    if (sum === 0)  return { valid: false, responses: 0,   status: 'empty' };
    if (!live && sum > max)  return { valid: false, responses: sum, status: 'error' };
    const mean = calculateWeightedMean(c);
    if (mean === null) return { valid: false, responses: 0, status: 'empty' };
    return { valid: true, mean, percentage: (mean / 3) * 100, responses: sum,
             status: (!live && sum < max) ? 'partial' : 'ok' };
  }
  const r = item.rating;
  if (r === null || r === undefined) return { valid: false, responses: 0, status: 'empty' };
  return { valid: true, mean: r, percentage: (r / 3) * 100, responses: 1, status: 'ok' };
}

/* Recomputes every item and caches the result on the item itself, so
   the saved project / JSON file carries aggregatedScore and rank for
   any consumer that reads the raw data rather than the contract. */
function _recompute() {
  _sv().categories.forEach(cat => {
    const rows = cat.items.map((item, idx) => ({ item, idx, res: _itemResult(item) }));
    const ranked = rows.filter(r => r.res.valid)
      .sort((a, b) => (b.res.percentage - a.res.percentage) || (a.idx - b.idx));
    const rankOf = new Map(ranked.map((r, i) => [r.item.id, i + 1]));
    rows.forEach(r => {
      r.item.result = {
        valid:           r.res.valid,
        status:          r.res.status,
        responses:       r.res.responses,
        aggregatedScore: r.res.valid ? +r.res.mean.toFixed(2) : null,
        percentage:      r.res.valid ? +r.res.percentage.toFixed(1) : null,
        rank:            rankOf.get(r.item.id) || null,
      };
    });
  });
}

function _rankedItems(cat) {
  return cat.items
    .filter(i => i.result && i.result.valid)
    .slice()
    .sort((a, b) => a.result.rank - b.result.rank);
}

// ── Public data contract ─────────────────────────────────────

/**
 * Verified Occupational Reference Data for Module Builder.
 *
 * Read-only and decoupled from the UI: it reads appState only, never
 * the DOM, so it works whether or not the tab was ever opened. When
 * the feature is off or nothing has been verified it returns
 * { available: false, message: 'No supplementary verification data' }
 * and callers simply carry on.
 *
 * The items are REFERENCE EVIDENCE, not learning outcomes: whether a
 * verified tool becomes a resource, a knowledge item becomes content,
 * or a behaviour becomes an outcome is a curriculum-design decision
 * that stays with the designer and expert review.
 */
export function getSupplementaryVerificationData() {
  const sv = _sv();
  _syncFromAdditionalInfo();
  _recompute();

  const base = {
    type: 'Verified Occupational Reference Data',
    source: 'DACUM Live Pro — Supplementary Occupational Verification',
    usage: 'reference-only: not to be converted automatically into learning outcomes',
    separateFromTaskPriority: true,
  };

  if (!sv.enabled) {
    return { ...base, available: false, message: 'No supplementary verification data', categories: [] };
  }

  const categories = sv.categories
    .filter(c => c.enabled)
    .map(c => ({
      id:     c.id,
      kind:   KIND_BY_ID[c.id] || 'custom',
      name:   categoryDisplayName(c),
      custom: !KIND_BY_ID[c.id],
      items:  _rankedItems(c).map(i => ({
        id:              i.id,
        text:            i.text,
        rank:            i.result.rank,
        aggregatedScore: i.result.aggregatedScore,
        percentage:      i.result.percentage,
        responses:       i.result.responses,
      })),
    }))
    .filter(c => c.items.length > 0);

  if (!categories.length) {
    return { ...base, available: false, message: 'No supplementary verification data', categories: [] };
  }

  return {
    ...base,
    available: true,
    scale: { min: 0, max: 3,
             aggregatedScore: 'weighted mean of 0–3 importance ratings',
             percentage: 'aggregatedScore ÷ 3 × 100' },
    collectionMode: appState.collectionMode,
    participants: appState.collectionMode === 'workshop' ? appState.workshopParticipants : 1,
    categories,
  };
}

/** Export-ready sections, lettered A, B, C… Empty array = omit section. */
export function getSupplementaryExportSections() {
  const data = getSupplementaryVerificationData();
  if (!data.available) return [];
  return data.categories.map((c, i) => ({
    letter: String.fromCharCode(65 + i),
    title:  c.name,
    items:  c.items,
  }));
}

/** True when any item holds a response — used by "Clear This Tab". */
/* ── Live Workshop bridge ─────────────────────────────────────────
   Items sent to the participant voting page when a live session is
   created. Returns null when the feature is off or has no items, so
   the session payload — and therefore the participant form — carries
   no supplementary section at all in that case. */
export function getSupplementaryItemsForLiveSession() {
  const sv = _sv();
  if (!sv.enabled) return null;
  _syncFromAdditionalInfo();
  const categories = sv.categories
    .filter(c => c.enabled && c.items.length)
    .map(c => ({
      id: c.id,
      name: categoryDisplayName(c),
      items: c.items.map(i => ({ id: i.id, text: i.text })),
    }));
  return categories.length ? { scale: '0-3', categories } : null;
}

/* Applies aggregated live-session counts (from /api/get-results →
   supplementaryResults) onto the matching items. Items are matched by
   id; anything the facilitator changed after the session was created
   is simply left as it is. Returns the number of items updated. */
export function applyLiveSupplementaryResults(results) {
  if (!results || typeof results !== 'object') return 0;
  const sv = _sv();
  let n = 0;
  sv.categories.forEach(c => c.items.forEach(i => {
    const r = results[i.id];
    if (!r || !r.counts) return;
    i.counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    SCALE.forEach(v => { i.counts[v] = parseInt(r.counts[v]) || 0; });
    i.source = 'live';
    n++;
  }));
  if (n) {
    renderSupplementaryVerification();
    _scheduleSave();
  }
  return n;
}

export function hasSupplementaryResponses() {
  return _sv().categories.some(c => c.items.some(i =>
    (i.rating !== null && i.rating !== undefined) ||
    SCALE.some(v => (parseInt(i.counts?.[v]) || 0) > 0)));
}

// ── Persistence ──────────────────────────────────────────────

/* The verification tab is not on autosave.js's watch list, so this
   module saves itself. Imported lazily: dacum_projects.js reaches this
   file through modules.js, and a static import back would be a cycle. */
let _saveTimer = null;
function _scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    import('./dacum_projects.js')
      .then(m => m.saveCurrentProject())
      .catch(err => console.warn('[supplementary] save failed:', err));
  }, 800);
}

// ── Styles ───────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('svStyles')) return;
  const s = document.createElement('style');
  s.id = 'svStyles';
  s.textContent = `
    #${CONTAINER_ID}{margin:40px 0 10px;padding-top:30px;border-top:3px dashed #c7d2fe;}
    .sv-card{background:#fff;border:1.5px solid #e0e7ff;border-radius:12px;padding:18px 20px;}
    .sv-head h3{margin:0 0 6px;color:#4338ca;font-size:1.15em;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .sv-badge{font-size:.62em;font-weight:700;background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;border-radius:999px;padding:2px 10px;letter-spacing:.03em;}
    .sv-note{margin:0 0 12px;color:#64748b;font-size:.88em;line-height:1.6;}
    .sv-master{display:inline-flex;align-items:center;gap:10px;font-weight:700;color:#1e293b;cursor:pointer;background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:8px;padding:9px 14px;max-width:100%;box-sizing:border-box;}
    .sv-master input{width:18px;height:18px;flex-shrink:0;}
    .sv-method{margin:14px 0 6px;font-size:.85em;color:#475569;background:#f1f5f9;border-radius:8px;padding:8px 12px;line-height:1.55;}
    .sv-cat{border:1px solid #e2e8f0;border-radius:10px;margin-top:12px;overflow:hidden;}
    .sv-cat-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:#f8fafc;}
    .sv-cat.sv-off .sv-cat-head{opacity:.65;}
    .sv-cat-toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;color:#334155;min-width:0;}
    .sv-cat-toggle input{width:17px;height:17px;flex-shrink:0;}
    .sv-cat-name{flex:1 1 180px;min-width:0;padding:6px 10px;border:1.5px solid #cbd5e1;border-radius:6px;font-weight:600;}
    .sv-count{font-size:.78em;color:#64748b;background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:2px 9px;}
    .sv-cat-body{padding:10px 14px 14px;}
    .sv-empty{color:#94a3b8;font-size:.85em;font-style:italic;margin:6px 0 10px;}
    .sv-table{width:100%;}
    .sv-table td,.sv-table th{vertical-align:middle;}
    .sv-item-input{width:100%;min-width:140px;box-sizing:border-box;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:.92em;}
    .sv-actions{display:flex;gap:4px;justify-content:center;}
    .sv-icon{border:1px solid #cbd5e1;background:#fff;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:.85em;line-height:1;padding:0;}
    .sv-icon:hover{background:#eef2ff;}
    .sv-icon.sv-del{color:#dc2626;}
    .sv-icon:disabled{opacity:.35;cursor:default;}
    .sv-add-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
    .sv-add-row input{flex:1 1 220px;min-width:0;padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:7px;}
    .sv-btn{border:1.5px solid #667eea;background:#fff;color:#4f46e5;border-radius:7px;padding:7px 14px;font-weight:600;cursor:pointer;font-size:.88em;}
    .sv-btn.sv-primary{background:#667eea;color:#fff;}
    .sv-btn.sv-danger{border-color:#fca5a5;color:#dc2626;}
    .sv-btn:hover{filter:brightness(.97);}
    .sv-add-cat{margin-top:12px;}
    .sv-results{margin-top:20px;border-top:1px solid #e2e8f0;padding-top:16px;}
    .sv-results h4{margin:0 0 10px;color:#334155;}
    .sv-res-cat{margin-bottom:14px;}
    .sv-res-cat h5{margin:0 0 6px;font-size:.95em;color:#4338ca;}
    .sv-sep{margin:10px 0 0;font-size:.8em;color:#64748b;border-inline-start:3px solid #667eea;padding:6px 10px;background:#f8fafc;border-radius:4px;}
    .sv-pct{font-weight:700;color:#10b981;}
    /* Phone layout: each item becomes a compact card — item text on
       top, the four 0–3 counts side by side in ONE row (not stacked
       one under another), then score, % and the row actions. */
    @media (max-width:760px){
      #${CONTAINER_ID} .sv-table{display:block;width:100%;min-width:0!important;border:none;}
      #${CONTAINER_ID} .sv-table thead{display:none;}
      #${CONTAINER_ID} .sv-table tbody{display:block;width:100%;}
      #${CONTAINER_ID} .sv-table tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;align-items:end;gap:8px 10px;
        padding:12px 10px;margin:0 0 10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;}
      #${CONTAINER_ID} .sv-table td{display:block;width:auto!important;min-width:0!important;
        border:none!important;padding:0!important;background:transparent!important;text-align:start!important;}
      #${CONTAINER_ID} .sv-table td:nth-child(1),
      #${CONTAINER_ID} .sv-table td:nth-child(2){grid-column:1/-1;}
      /* Score · % · actions share one line instead of the buttons
         taking a row of their own under every item. */
      #${CONTAINER_ID} .sv-table td:nth-child(5){grid-column:auto;align-self:end;}
      #${CONTAINER_ID} .sv-table td[data-label]::before{content:attr(data-label);display:block;
        font-size:.74em;font-weight:700;color:#64748b;margin-bottom:4px;}
      #${CONTAINER_ID} .sv-table .count-input-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;}
      #${CONTAINER_ID} .sv-table .count-input-item{display:flex!important;flex-direction:column;align-items:center;gap:3px;margin:0!important;}
      #${CONTAINER_ID} .sv-table .count-input-item input{width:100%!important;max-width:64px;min-width:0!important;
        box-sizing:border-box;text-align:center;padding:6px 2px;}
      #${CONTAINER_ID} .sv-table .rating-scale{display:flex!important;flex-direction:row!important;justify-content:space-around;}
      #${CONTAINER_ID} .sv-item-input{min-width:0;font-weight:600;}
      #${CONTAINER_ID} .sv-actions{justify-content:flex-end;flex-wrap:nowrap;gap:5px;}
      #${CONTAINER_ID} .sv-icon{width:34px;height:34px;flex-shrink:0;}
    }
    @media (max-width:640px){
      .sv-card{padding:14px 12px;}
      .sv-cat-body{padding:8px 8px 12px;}
      .sv-master{font-size:.92em;}
    }
  `;
  document.head.appendChild(s);
}

// ── Rendering ────────────────────────────────────────────────

const _esc = (s) => escapeHtml(String(s == null ? '' : s));

function _countInputs(cat, item) {
  const max = appState.workshopParticipants;
  return `<div class="count-input-grid">${SCALE.map(v => {
    const id = `sv_${item.id}_c${v}`;
    return `<div class="count-input-item">
      <label for="${id}">${v}</label>
      <input type="number" id="${id}" min="0" max="${max}" value="${parseInt(item.counts?.[v]) || 0}"
             data-sv="count" data-cat="${cat.id}" data-item="${item.id}" data-scale="${v}">
    </div>`;
  }).join('')}</div>
  <div class="validation-warning" id="sv_warn_${item.id}"></div>`;
}

function _ratingRadios(cat, item) {
  return `<div class="rating-scale">${SCALE.map(v => {
    const id = `sv_${item.id}_r${v}`;
    return `<div class="rating-option">
      <input type="radio" id="${id}" name="sv_${item.id}" value="${v}" ${item.rating === v ? 'checked' : ''}
             data-sv="rate" data-cat="${cat.id}" data-item="${item.id}">
      <label for="${id}">${v}</label>
    </div>`;
  }).join('')}</div>`;
}

function _fmtScore(r) { return r && r.valid ? r.aggregatedScore.toFixed(2) : '-'; }
function _fmtPct(r)   { return r && r.valid ? `${r.percentage.toFixed(1)}%` : '-'; }

function _itemRow(cat, item, idx, total) {
  const isWorkshop = appState.collectionMode === 'workshop';
  const r = item.result;
  return `<tr data-item-row="${item.id}">
    <td style="width:${isWorkshop ? '34%' : '42%'};">
      <input type="text" class="sv-item-input" value="${_esc(item.text)}"
             data-sv="edit-item" data-cat="${cat.id}" data-item="${item.id}">
    </td>
    <td data-label="${_esc(_t(isWorkshop ? 'svThRatingCounts' : 'svThRating'))}" style="width:${isWorkshop ? '30%' : '22%'};">${isWorkshop ? _countInputs(cat, item) : _ratingRadios(cat, item)}</td>
    <td data-label="${_esc(_t('svThScore'))}" style="text-align:center;width:10%;"><span class="weighted-mean" data-sv-score="${item.id}">${_fmtScore(r)}</span></td>
    <td data-label="%" style="text-align:center;width:10%;"><span class="sv-pct" data-sv-pct="${item.id}">${_fmtPct(r)}</span></td>
    <td style="width:14%;">
      <div class="sv-actions">
        <button type="button" class="sv-icon" data-sv="up" data-cat="${cat.id}" data-item="${item.id}"
                title="${_esc(_t('svTtMoveUp'))}" aria-label="${_esc(_t('svTtMoveUp'))}" ${idx === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" class="sv-icon" data-sv="down" data-cat="${cat.id}" data-item="${item.id}"
                title="${_esc(_t('svTtMoveDown'))}" aria-label="${_esc(_t('svTtMoveDown'))}" ${idx === total - 1 ? 'disabled' : ''}>▼</button>
        <button type="button" class="sv-icon sv-del" data-sv="del-item" data-cat="${cat.id}" data-item="${item.id}"
                title="${_esc(_t('svTtDeleteItem'))}" aria-label="${_esc(_t('svTtDeleteItem'))}">✕</button>
      </div>
    </td>
  </tr>`;
}

function _categoryBlock(cat) {
  const isWorkshop = appState.collectionMode === 'workshop';
  const renameable = !cat.key || cat.renameable;
  const name = categoryDisplayName(cat);

  const head = `
    <div class="sv-cat-head">
      <label class="sv-cat-toggle">
        <input type="checkbox" data-sv="toggle-cat" data-cat="${cat.id}" ${cat.enabled ? 'checked' : ''}>
        ${renameable ? '' : `<span>${_esc(name)}</span>`}
      </label>
      ${renameable ? `<input type="text" class="sv-cat-name" value="${_esc(cat.name || '')}"
            placeholder="${_esc(cat.key ? _t(cat.key) : _t('svPhCategoryName'))}"
            data-sv="rename-cat" data-cat="${cat.id}" aria-label="${_esc(_t('svPhCategoryName'))}">` : ''}
      <span class="sv-count">${_esc(_tf('svItemsCount', { n: cat.items.length }))}</span>
      ${!cat.key ? `<button type="button" class="sv-btn sv-danger" data-sv="del-cat" data-cat="${cat.id}">🗑️ ${_esc(_t('svBtnDeleteCategory'))}</button>` : ''}
    </div>`;

  if (!cat.enabled) return `<div class="sv-cat sv-off" data-cat-block="${cat.id}">${head}</div>`;

  const rows = cat.items.map((it, i) => _itemRow(cat, it, i, cat.items.length)).join('');
  const table = cat.items.length ? `
    <div style="overflow-x:auto;width:100%;">
      <table class="verification-table sv-table">
        <thead><tr>
          <th>${_esc(_t('svThItem'))}</th>
          <th>${_esc(_t(isWorkshop ? 'svThRatingCounts' : 'svThRating'))}</th>
          <th>${_esc(_t('svThScore'))}</th>
          <th>%</th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : `<p class="sv-empty">${_esc(_t('svEmptyCategory'))}</p>`;

  return `<div class="sv-cat" data-cat-block="${cat.id}">
    ${head}
    <div class="sv-cat-body">
      ${table}
      <div class="sv-add-row">
        <input type="text" data-sv="new-item" data-cat="${cat.id}" placeholder="${_esc(_t('svPhAddItem'))}">
        <button type="button" class="sv-btn sv-primary" data-sv="add-item" data-cat="${cat.id}">${_esc(_t('svBtnAdd'))}</button>
      </div>
    </div>
  </div>`;
}

function _resultsHtml() {
  const blocks = getSupplementaryExportSections().map(sec => `
    <div class="sv-res-cat">
      <h5>${_esc(sec.letter)}. ${_esc(sec.title)}</h5>
      <div style="overflow-x:auto;width:100%;">
        <table class="dashboard-table verification-table">
          <thead><tr>
            <th style="width:10%;">${_esc(_t('svThRank'))}</th>
            <th>${_esc(_t('svThItem'))}</th>
            <th style="width:14%;">${_esc(_t('svThScore'))}</th>
            <th style="width:12%;">%</th>
            <th style="width:14%;">${_esc(_t('svThResponses'))}</th>
          </tr></thead>
          <tbody>${sec.items.map(it => `<tr>
            <td style="text-align:center;"><span class="rank-badge ${it.rank <= 3 ? 'top' : ''}">#${it.rank}</span></td>
            <td>${_esc(it.text)}</td>
            <td style="text-align:center;"><span class="mean-value">${it.aggregatedScore.toFixed(2)}</span></td>
            <td style="text-align:center;"><span class="sv-pct">${it.percentage.toFixed(1)}%</span></td>
            <td style="text-align:center;">${it.responses}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`).join('');

  return `<div class="sv-results" id="svResults">
    <h4>📊 ${_esc(_t('svResultsTitle'))}</h4>
    ${blocks || `<p class="sv-empty">${_esc(_t('svNoResults'))}</p>`}
    <p class="sv-sep">${_esc(_t('svSeparateNote'))}</p>
  </div>`;
}

export function renderSupplementaryVerification() {
  const host = document.getElementById(CONTAINER_ID);
  if (!host) return;
  _injectStyles();
  const sv = _sv();
  if (_syncFromAdditionalInfo()) _scheduleSave();
  _recompute();

  const isWorkshop = appState.collectionMode === 'workshop';
  const body = sv.enabled ? `
    <p class="sv-method">${_esc(isWorkshop
      ? _tf('svMethodWorkshop', { n: appState.workshopParticipants })
      : _t('svMethodSurvey'))}</p>
    ${sv.categories.map(_categoryBlock).join('')}
    <div class="sv-add-cat">
      <button type="button" class="sv-btn" data-sv="add-cat">${_esc(_t('svBtnAddCategory'))}</button>
    </div>
    ${_resultsHtml()}` : '';

  host.innerHTML = `
    <div class="sv-card">
      <div class="sv-head">
        <h3>🧭 <span>${_esc(_t('svTitle'))}</span> <span class="sv-badge">${_esc(_t('svOptional'))}</span></h3>
        <p class="sv-note">${_esc(_t('svNote'))}</p>
        <label class="sv-master">
          <input type="checkbox" data-sv="toggle-feature" ${sv.enabled ? 'checked' : ''}>
          <span>${_esc(_t('svEnable'))}</span>
        </label>
      </div>
      ${body}
    </div>`;

  if (sv.enabled && isWorkshop) {
    sv.categories.forEach(c => c.enabled && c.items.forEach(i => _showWarning(i)));
  }
}

/* Same wording and styling as the task count validation in tasks.js. */
function _showWarning(item) {
  const el = document.getElementById(`sv_warn_${item.id}`);
  if (!el) return;
  const r = item.result || {};
  const max = appState.workshopParticipants;
  if (r.status === 'error') {
    el.innerHTML = `<p>❌ ${_esc(_tf('msgResponsesExceed', { sum: r.responses, max }))}</p>`;
    el.className = 'validation-warning show error';
  } else if (r.status === 'partial') {
    el.innerHTML = `<p>⚠️ ${_esc(_tf('msgResponsesPartial', { sum: r.responses, max }))}</p>`;
    el.className = 'validation-warning show warning';
  } else {
    el.innerHTML = '';
    el.className = 'validation-warning';
  }
}

/* Light refresh after a rating change: updates the edited row and the
   results block only, so the input keeps focus while the user types. */
function _refreshAfterRating(item) {
  _recompute();
  const cat = _sv().categories.find(c => c.items.includes(item));
  (cat ? cat.items : [item]).forEach(i => {
    const s = document.querySelector(`[data-sv-score="${i.id}"]`);
    const p = document.querySelector(`[data-sv-pct="${i.id}"]`);
    if (s) s.textContent = _fmtScore(i.result);
    if (p) p.textContent = _fmtPct(i.result);
  });
  _showWarning(item);
  const res = document.getElementById('svResults');
  if (res) res.outerHTML = _resultsHtml();
}

// ── Mutations ────────────────────────────────────────────────

function _cleanLine(s) {
  return String(s || '').trim().replace(/^(\d+[.)]|[•\-*○●])\s*/, '').trim();
}

function _addItem(cat, text) {
  const clean = _cleanLine(text);
  if (!clean) return false;
  if (cat.items.some(i => i.text.trim().toLowerCase() === clean.toLowerCase())) {
    showStatus(_t('svMsgDuplicate'), 'error');
    return false;
  }
  const sv = _sv();
  sv.itemCounter++;
  cat.items.push({ id: `sv_item_${sv.itemCounter}`, text: clean,
                   counts: { 0: 0, 1: 0, 2: 0, 3: 0 }, rating: null, result: null });
  return true;
}

function _itemHasResponse(i) {
  return (i.rating !== null && i.rating !== undefined) ||
         SCALE.some(v => (parseInt(i.counts?.[v]) || 0) > 0);
}

/* ── Automatic sync with the Additional Info tab ──────────────────
   The lists a panel already wrote in Additional Info (knowledge,
   skills, tools, behaviours, trends) ARE the items to verify, so they
   appear in their cards automatically — no import step. Rules:
     • a new line in Additional Info → a new item here (flagged auto);
     • a line removed/changed there → its auto item is removed here,
       unless it already carries responses (evidence is never dropped
       silently);
     • an item the user deleted here is remembered in `dismissed` and
       is not re-added on the next sync;
     • items added manually here are never touched by the sync. */
function _sourceLines(cat) {
  const out = [];
  (cat.source || []).forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value) el.value.split('\n').forEach(l => {
      const c = _cleanLine(l);
      if (c) out.push(c);
    });
  });
  return out;
}

function _syncFromAdditionalInfo() {
  const sv = _sv();
  if (!sv.enabled || typeof document === 'undefined' || !document.getElementById) return false;
  let changed = false;
  sv.categories.forEach(cat => {
    if (!Array.isArray(cat.source) || !cat.source.length) return;
    if (!Array.isArray(cat.dismissed)) cat.dismissed = [];
    const lines = _sourceLines(cat);
    const wanted = new Set(lines.map(l => l.toLowerCase()));
    const dismissed = new Set(cat.dismissed);

    const before = cat.items.length;
    cat.items = cat.items.filter(i =>
      !i.auto || wanted.has(i.text.trim().toLowerCase()) || _itemHasResponse(i));
    if (cat.items.length !== before) changed = true;

    const have = new Set(cat.items.map(i => i.text.trim().toLowerCase()));
    lines.forEach(text => {
      const key = text.toLowerCase();
      if (have.has(key) || dismissed.has(key)) return;
      have.add(key);
      sv.itemCounter++;
      cat.items.push({ id: `sv_item_${sv.itemCounter}`, text, auto: true,
                       counts: { 0: 0, 1: 0, 2: 0, 3: 0 }, rating: null, result: null });
      changed = true;
    });
  });
  return changed;
}

function _onClick(e) {
  const btn = e.target.closest('[data-sv]');
  if (!btn || btn.tagName === 'INPUT') return;
  const action = btn.getAttribute('data-sv');
  const cat  = _findCat(btn.getAttribute('data-cat'));
  const item = _findItem(cat, btn.getAttribute('data-item'));
  let changed = false;

  if (action === 'add-item' && cat) {
    const input = document.querySelector(`input[data-sv="new-item"][data-cat="${cat.id}"]`);
    if (input && _addItem(cat, input.value)) changed = true;
  } else if ((action === 'up' || action === 'down') && cat && item) {
    const i = cat.items.indexOf(item);
    const j = action === 'up' ? i - 1 : i + 1;
    if (j >= 0 && j < cat.items.length) {
      [cat.items[i], cat.items[j]] = [cat.items[j], cat.items[i]];
      changed = true;
    }
  } else if (action === 'del-item' && cat && item) {
    if (!_itemHasResponse(item) || confirm(_t('svConfirmDeleteItem'))) {
      if (item.auto) {
        if (!Array.isArray(cat.dismissed)) cat.dismissed = [];
        cat.dismissed.push(item.text.trim().toLowerCase());
      }
      cat.items.splice(cat.items.indexOf(item), 1);
      changed = true;
    }
  } else if (action === 'add-cat') {
    const sv = _sv();
    sv.categoryCounter++;
    sv.categories.push({ id: `sv_cat_${sv.categoryCounter}`, key: null, name:
      _tf('svCustomCatDefault', { n: sv.categoryCounter }), enabled: true, source: [], items: [] });
    changed = true;
  } else if (action === 'del-cat' && cat && !cat.key) {
    if (confirm(_tf('svConfirmDeleteCategory', { name: categoryDisplayName(cat) }))) {
      const sv = _sv();
      sv.categories.splice(sv.categories.indexOf(cat), 1);
      changed = true;
    }
  }

  if (changed) {
    renderSupplementaryVerification();
    _scheduleSave();
    if (action === 'add-item' && cat) {
      const next = document.querySelector(`input[data-sv="new-item"][data-cat="${cat.id}"]`);
      if (next) next.focus();
    }
  }
}

function _onChange(e) {
  const el = e.target.closest('[data-sv]');
  if (!el) return;
  const action = el.getAttribute('data-sv');
  const sv = _sv();
  const cat  = _findCat(el.getAttribute('data-cat'));
  const item = _findItem(cat, el.getAttribute('data-item'));

  if (action === 'toggle-feature') {
    sv.enabled = el.checked;
  } else if (action === 'toggle-cat' && cat) {
    cat.enabled = el.checked;
  } else if (action === 'rename-cat' && cat) {
    cat.name = el.value.trim();
    _scheduleSave();
    const res = document.getElementById('svResults');
    if (res) { _recompute(); res.outerHTML = _resultsHtml(); }
    return;
  } else if (action === 'edit-item' && cat && item) {
    const clean = _cleanLine(el.value);
    if (!clean) { el.value = item.text; return; }
    item.text = clean;
    item.auto = false;   // edited here → now the user's own item
    _scheduleSave();
    const res = document.getElementById('svResults');
    if (res) { _recompute(); res.outerHTML = _resultsHtml(); }
    return;
  } else if (action === 'rate' && item) {
    item.rating = parseInt(el.value);
    _refreshAfterRating(item);
    _scheduleSave();
    return;
  } else {
    return;
  }
  renderSupplementaryVerification();
  _scheduleSave();
}

function _onInput(e) {
  const el = e.target.closest('[data-sv="count"]');
  if (!el) return;
  const cat  = _findCat(el.getAttribute('data-cat'));
  const item = _findItem(cat, el.getAttribute('data-item'));
  if (!item) return;
  const max = appState.workshopParticipants;
  let v = parseInt(el.value);
  if (isNaN(v) || v < 0) v = 0;
  if (v > max) { v = max; el.value = v; }
  item.counts[el.getAttribute('data-scale')] = v;
  delete item.source;   // edited by hand → no longer a live-session result
  _refreshAfterRating(item);
  _scheduleSave();
}

function _onKeydown(e) {
  const el = e.target.closest('input[data-sv="new-item"]');
  if (!el || e.key !== 'Enter') return;
  e.preventDefault();
  const cat = _findCat(el.getAttribute('data-cat'));
  if (cat && _addItem(cat, el.value)) {
    renderSupplementaryVerification();
    _scheduleSave();
    const next = document.querySelector(`input[data-sv="new-item"][data-cat="${cat.id}"]`);
    if (next) next.focus();
  }
}

// ── Init ─────────────────────────────────────────────────────

let _inited = false;

export function initSupplementaryVerification() {
  if (_inited) return;
  _inited = true;

  const host = document.getElementById(CONTAINER_ID);
  if (!host) return;

  host.addEventListener('click',   _onClick);
  host.addEventListener('change',  _onChange);
  host.addEventListener('input',   _onInput);
  host.addEventListener('keydown', _onKeydown);

  renderSupplementaryVerification();

  // Collection mode / participant count drive the input type and the
  // ceiling. tasks.js updates appState on these events; re-render after.
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.name === 'collectionMode' || t.id === 'workshopParticipants') {
      setTimeout(renderSupplementaryVerification, 0);
    }
  });

  // Re-render whenever the Task Verification tab becomes active, so the
  // block always reflects the state of the project currently loaded.
  const tab = document.getElementById('verification-tab');
  if (tab && 'MutationObserver' in window) {
    let wasActive = tab.classList.contains('active');
    new MutationObserver(() => {
      const isActive = tab.classList.contains('active');
      if (isActive && !wasActive) renderSupplementaryVerification();
      wasActive = isActive;
    }).observe(tab, { attributes: true, attributeFilter: ['class'] });
  }

  window.addEventListener('dacum:langchange', renderSupplementaryVerification);
  document.addEventListener('dacum:project-loaded', () => setTimeout(renderSupplementaryVerification, 0));
  document.addEventListener('dacum:supplementary-changed', renderSupplementaryVerification);

  // Stable, UI-independent access point for Module Builder integrations.
  window.DACUM = window.DACUM || {};
  window.DACUM.getSupplementaryVerification = getSupplementaryVerificationData;
}

export { SV_DEFAULT_CATEGORIES };
