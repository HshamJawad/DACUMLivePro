// ============================================================
// /module_tracks.js  (3.135.0)
// Tracks (specialisations) and alternative modules.
//
// A programme built from ONE occupational standard can split into
// specialisations at any level: most modules are common, and in one
// or more places each track has a module of its own (the CMCN pattern:
// level 3 divides into Computer Maintenance and Computer Networks).
//
// This builds on what Module Mapping already stored — it adds nothing
// that older projects need to be migrated for:
//
//   module.track     existing. Free text; empty = common to all tracks.
//   module.slot      NEW, optional. Modules that share a slot are
//                    ALTERNATIVES: they fill the same place in the
//                    programme, one per track. Set from the module's
//                    "Alternative to" field; never typed.
//   moduleMappingData.tracks
//                    NEW, optional. [{ code, name }] — gives a track
//                    code (what is typed in a module's Track field) a
//                    readable name. Tracks typed on modules but never
//                    registered still count, with their code as name.
//
// The programme of a track is simply: the common modules + that
// track's own modules. Nothing is copied, so a change to a common
// module is a change in every track's programme.
//
// Imports from the other module-mapping files are used inside
// functions only (see the note in modules.js about load order).
// ============================================================

import { appState } from './state.js';
import { _esc, _tx, _txf } from './modules_shared.js';
import { moduleRef, _moduleLevel, getModuleLevelCount, persistModuleMapping, _injectCovFoldStyles } from './module_mapping.js';
import { renderModules } from './learning_outcomes.js';
import { getCurriculumModel } from './module_curriculum.js';

function _mm() { return appState.moduleMappingData || { modules: [] }; }
function _mods() { return _mm().modules || []; }
const _clean = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const _track = (m) => _clean(m && m.track, 40);

// ── Tracks ────────────────────────────────────────────────────

/** The tracks the user named: [{ code, name }]. */
export function getTrackRegistry() {
  const r = _mm().tracks;
  if (!Array.isArray(r)) return [];
  const seen = new Set();
  const out = [];
  r.forEach(x => {
    const code = _clean(x && x.code, 40);
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push({ code, name: _clean(x && x.name, 80) });
  });
  return out;
}

/** Every track of the programme: the named ones first, then any typed on
 *  a module but never named. [{ code, name, registered }] */
export function getProgrammeTracks() {
  const out = getTrackRegistry().map(t => ({ ...t, registered: true }));
  const seen = new Set(out.map(t => t.code));
  _mods().forEach(m => {
    const c = _track(m);
    if (c && !seen.has(c)) { seen.add(c); out.push({ code: c, name: '', registered: false }); }
  });
  return out;
}

/** "CM — Computer Maintenance", or just the code. */
export function trackFullLabel(t) { return t.name ? `${t.code} — ${t.name}` : t.code; }

/** Replaces the registry from the editor's text ("CODE = name" per line).
 *  An empty text removes it (tracks typed on modules still count). */
export function saveTrackRegistry(text) {
  const seen = new Set();
  const list = [];
  String(text || '').split('\n').forEach(line => {
    if (!line.trim()) return;
    const m = line.match(/^\s*([^=]+?)\s*(?:=|\s[—–-]\s)\s*(.+?)\s*$/);
    const code = _clean(m ? m[1] : line, 40);
    if (!code || seen.has(code)) return;
    seen.add(code);
    list.push({ code, name: _clean(m ? m[2] : '', 80) });
  });
  const mm = _mm();
  if (list.length) mm.tracks = list; else delete mm.tracks;
  renderModules();
  persistModuleMapping();
}

// ── Programme view (filter) ───────────────────────────────────
// 'all' | 'common' | a track code. Display only, kept for the session.
let _filter = (() => { try { return sessionStorage.getItem('dacum_track_filter') || 'all'; } catch (_) { return 'all'; } })();

export function getTrackFilter() {
  if (_filter === 'all' || _filter === 'common') return _filter;
  return getProgrammeTracks().some(t => t.code === _filter) ? _filter : 'all';
}

export function setTrackFilter(v) {
  _filter = v || 'all';
  try { sessionStorage.setItem('dacum_track_filter', _filter); } catch (_) { /* session only */ }
  renderModules();
}

/** Whether the module belongs to the programme view being shown. */
export function moduleMatchesTrackFilter(m) {
  const f = getTrackFilter();
  if (f === 'all') return true;
  const t = _track(m);
  return f === 'common' ? !t : (!t || t === f);
}

// ── Alternatives (slots) ──────────────────────────────────────

function _newSlotId() {
  const used = new Set(_mods().map(m => m && m.slot).filter(Boolean));
  let n = 1;
  while (used.has('slot_' + n)) n++;
  return 'slot_' + n;
}

/** A slot held by one module alone means nothing: forget it. */
export function tidySlots() {
  const count = {};
  _mods().forEach(m => { if (m && m.slot) count[m.slot] = (count[m.slot] || 0) + 1; });
  _mods().forEach(m => { if (m && m.slot && count[m.slot] < 2) delete m.slot; });
}

/** The other modules in this module's slot. */
export function getSlotPartners(module) {
  if (!module || !module.slot) return [];
  return _mods().filter(x => x !== module && x.slot === module.slot);
}

/** Modules this one could be an alternative to: track-specific, same
 *  level, another track. */
export function slotCandidates(module) {
  const lvl = _moduleLevel(module);
  const t = _track(module);
  if (!lvl || !t) return [];
  return _mods().filter(x => x !== module && _track(x) && _track(x) !== t && _moduleLevel(x) === lvl);
}

/** Links `moduleId` as an alternative to `otherId`; '' unlinks it. */
export function setModuleAlternativeOf(moduleId, otherId) {
  const mods = _mods();
  const m = mods.find(x => x.id === moduleId);
  if (!m) return;
  if (!otherId) delete m.slot;
  else {
    const o = mods.find(x => x.id === otherId);
    if (!o || o === m) return;
    if (!o.slot) o.slot = _newSlotId();
    m.slot = o.slot;
  }
  tidySlots();
  renderModules();
  persistModuleMapping();
}

/** Groups of alternatives, in programme order: [{ slot, level, members }]. */
export function getSlotGroups() {
  const groups = [];
  const idx = new Map();
  _mods().forEach(m => {
    if (!m || !m.slot) return;
    let g = idx.get(m.slot);
    if (!g) { g = { slot: m.slot, members: [] }; idx.set(m.slot, g); groups.push(g); }
    g.members.push(m);
  });
  return groups.filter(g => g.members.length > 1)
    .map(g => ({ ...g, level: _moduleLevel(g.members[0]) }))
    .sort((a, b) => (a.level || 99) - (b.level || 99));
}

/** Problems with the alternatives, as { kind, refs }. */
export function getTrackIssues() {
  const out = [];
  getSlotGroups().forEach(g => {
    const refs = g.members.map(moduleRef).join(', ');
    const tracks = g.members.map(_track);
    if (tracks.some(t => !t) || new Set(tracks).size !== tracks.length) out.push({ kind: 'sameTrack', refs });
    if (new Set(g.members.map(_moduleLevel)).size > 1) out.push({ kind: 'levels', refs });
  });
  return out;
}

// ── Programmes ────────────────────────────────────────────────

function _criteriaCount(m) {
  let n = 0;
  (m.learningOutcomes || []).forEach(o => (o.linkedCriteria || []).forEach(pc => { if (!pc.stale) n++; }));
  return n;
}

function _hours(m) {
  try { const cm = getCurriculumModel(m.id, {}); return cm && cm.hours ? (Number(cm.hours.total) || 0) : 0; }
  catch (_) { return 0; }
}

function _stats(list) {
  const byLevel = Array.from({ length: getModuleLevelCount() }, () => 0);
  let noLevel = 0, los = 0, criteria = 0, hours = 0;
  list.forEach(m => {
    const l = _moduleLevel(m);
    if (l && byLevel[l - 1] !== undefined) byLevel[l - 1]++; else noLevel++;
    los += (m.learningOutcomes || []).length;
    criteria += _criteriaCount(m);
    hours += _hours(m);
  });
  return { modules: list.length, los, criteria, hours, byLevel, noLevel };
}

/** The modules of one track's programme: common + that track's own. */
export function getTrackProgrammeModules(code) {
  return _mods().filter(m => !_track(m) || _track(m) === code);
}

/** Everything the summary and the exports show, or null with no tracks. */
export function getTracksExportData() {
  const tracks = getProgrammeTracks();
  if (!tracks.length || !_mods().length) return null;
  const common = _mods().filter(m => !_track(m));
  return {
    tracks,
    levelCount: getModuleLevelCount(),
    common: _stats(common),
    programmes: tracks.map(t => {
      const list = getTrackProgrammeModules(t.code);
      return { code: t.code, name: t.name, label: t.name || t.code, stats: _stats(list), modules: list.map(m => moduleRef(m)) };
    }),
    slots: getSlotGroups().map(g => ({
      level: g.level,
      cells: tracks.map(t => {
        const m = g.members.find(x => _track(x) === t.code);
        return m ? { ref: moduleRef(m), title: m.title || '', criteria: _criteriaCount(m) } : null;
      })
    })),
    issues: getTrackIssues()
  };
}

/** The same data as plain-text tables, for the Word and PDF exports:
 *  { programme: { head, rows }, slots: { head, rows } | null, issues }. */
export function getTracksExportTables() {
  const d = getTracksExportData();
  if (!d) return null;
  const all = [d.common, ...d.programmes.map(p => p.stats)];
  const showHours = all.some(s => s.hours > 0);
  const showNoLevel = all.some(s => s.noLevel > 0);
  const lvlHead = Array.from({ length: d.levelCount }, (_, i) => _txf('lblLevelShort', { n: i + 1 }));
  const row = (label, s) => [label, String(s.modules), String(s.los), String(s.criteria),
    ...(showHours ? [s.hours ? String(s.hours) : '—'] : []),
    ...s.byLevel.map(String), ...(showNoLevel ? [String(s.noLevel)] : [])];
  const programme = {
    head: [_tx('trkColProgramme'), _tx('trkColModules'), _tx('expColLOs'), _tx('expColCriteria'),
      ...(showHours ? [_tx('trkColHours')] : []), ...lvlHead, ...(showNoLevel ? [_tx('covColNoLevel')] : [])],
    rows: [row(_tx('trkCommonOnly'), d.common),
      ...d.programmes.map(p => row(_txf('trkProgrammeOf', { t: p.label }), p.stats))]
  };
  const slots = d.slots.length ? {
    head: [_tx('lblModuleLevel'), ...d.tracks.map(t => t.name || t.code)],
    rows: d.slots.map(s => [s.level ? _txf('lblLevelN', { n: s.level }) : _tx('lblNoLevelGroup'),
      ...s.cells.map(c => c ? `${c.ref} — ${c.title} (${c.criteria})` : '—')])
  } : null;
  const issues = d.issues.map(i => _txf(i.kind === 'levels' ? 'trkIssueLevels' : 'trkIssueSameTrack', { refs: i.refs }));
  return { programme, slots, issues };
}

// ── Styles ────────────────────────────────────────────────────

function _styles() {
  if (document.getElementById('trkStyles')) return;
  const st = document.createElement('style');
  st.id = 'trkStyles';
  st.textContent = `
    #mmTracksBar { margin: 0 0 14px; padding: 10px 12px; border: 1px solid #ddd6fe; border-radius: 10px; background: #faf5ff; }
    #mmTracksBar .trk-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
    #mmTracksBar .trk-title { font-weight: 800; color: #5b21b6; font-size: .9em; }
    #mmTracksBar .trk-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    #mmTracksBar button.trk-chip, #mmTracksBar button.trk-edit {
      width: auto !important; margin: 0 !important; padding: 5px 12px !important; border-radius: 999px !important;
      border: 1px solid #c4b5fd !important; background: #fff !important; color: #5b21b6 !important;
      font: inherit; font-size: .86em; font-weight: 700; cursor: pointer; box-shadow: none !important; }
    #mmTracksBar button.trk-chip[aria-pressed="true"] { background: #7c3aed !important; border-color: #7c3aed !important; color: #fff !important; }
    #mmTracksBar button.trk-edit { border-style: dashed !important; margin-inline-start: auto !important; }
    #mmTracksBar .trk-hint { margin: 8px 0 0; font-size: .82em; color: #64748b; line-height: 1.55; }
    .mod-slot-chip { background: #e0f2fe; color: #075985; border: 1px solid #bae6fd; border-radius: 999px; padding: 1px 9px; font-size: .78em; font-weight: 700; white-space: nowrap; }
    #modulesContainer .mod-slot-row { margin-top: 6px; }
    #modulesContainer .mod-meta-field.mod-slot-field { display: flex; width: 100%; }
    #modulesContainer .mod-meta-field .mod-slot-select {
      flex: 1 1 auto; width: auto !important; min-width: 0; margin: 0 !important; border-color: #bae6fd; }
    .trk-wrap { overflow-x: auto; margin-top: 10px; }
    .trk-table { border-collapse: collapse; font-size: .86em; min-width: 100%; }
    .trk-table th, .trk-table td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: center; }
    .trk-table th:first-child, .trk-table td:first-child { text-align: start; }
    .trk-table thead th { background: #f1f5f9; color: #334155; }
    .trk-table td small { color: #64748b; }
    .trk-sub { margin: 16px 0 4px; font-weight: 800; color: #334155; font-size: .95em; }
    .trk-issues { margin: 10px 0 0; padding: 8px 12px 8px 28px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; color: #9a3412; font-size: .86em; }
    html[dir="rtl"] .trk-issues { padding: 8px 28px 8px 12px; }
    @media (max-width: 600px) { #mmTracksBar button.trk-edit { margin-inline-start: 0 !important; } }
  `;
  document.head.appendChild(st);
}

// ── Programme-view bar (above the module list) ────────────────

export function ensureTracksBar() {
  const cont = document.getElementById('modulesContainer');
  if (!cont || !cont.parentNode) return;
  let bar = document.getElementById('mmTracksBar');
  const tracks = getProgrammeTracks();
  if (!tracks.length) { if (bar) bar.remove(); return; }
  _styles();
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'mmTracksBar';
    bar.addEventListener('click', e => {
      const f = e.target.closest('[data-trk-filter]');
      if (f) { setTrackFilter(f.getAttribute('data-trk-filter')); return; }
      if (e.target.closest('[data-trk-edit]')) openTracksEditor();
    });
  }
  // Just above the TVQF/NQF bar when there is one, so the two never swap places.
  const anchor = document.getElementById('mmNqfBar') || cont;
  if (bar.nextSibling !== anchor || bar.parentNode !== anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor);
  const cur = getTrackFilter();
  const chip = (v, label, tip) => `<button type="button" class="trk-chip" data-trk-filter="${_esc(v)}" aria-pressed="${cur === v}" title="${_esc(tip)}">${_esc(label)}</button>`;
  bar.innerHTML = `
    <div class="trk-row">
      <span class="trk-title">⑂ ${_esc(_tx('trkBarTitle'))}</span>
      <span class="trk-chips" role="group" aria-label="${_esc(_tx('trkBarTitle'))}">
        ${chip('all', _tx('trkAll'), _tx('trkChipAllTip'))}
        ${chip('common', _tx('trkCommonOnly'), _tx('trkChipCommonTip'))}
        ${tracks.map(t => chip(t.code, trackFullLabel(t), _tx('trkChipTip'))).join('')}
      </span>
      <button type="button" class="trk-edit" data-trk-edit>✎ ${_esc(_tx('trkEdit'))}</button>
    </div>
    <p class="trk-hint">${_esc(_tx('trkBarHint'))}</p>
    <datalist id="mmTrackList">${tracks.map(t => `<option value="${_esc(t.code)}">${_esc(t.name)}</option>`).join('')}</datalist>`;
}

// ── Tracks editor ─────────────────────────────────────────────

export function openTracksEditor() {
  const old = document.getElementById('mmTrkModal');
  if (old) old.remove();
  const rtl = !!(window.i18n && window.i18n.isRTL && window.i18n.isRTL());
  const ov = document.createElement('div');
  ov.id = 'mmTrkModal';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  ov.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.5);';
  const lines = getProgrammeTracks().map(t => t.name ? `${t.code} = ${t.name}` : t.code).join('\n');
  ov.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:460px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden;font-family:inherit;">
      <div style="padding:16px 20px;background:linear-gradient(135deg,#f5f3ff,#ede9fe);border-bottom:1px solid #ddd6fe;font-weight:800;color:#5b21b6;">⑂ ${_esc(_tx('trkEditTitle'))}</div>
      <div style="padding:16px 20px;">
        <p style="margin:0 0 10px;font-size:.86em;color:#475569;line-height:1.6;">${_esc(_tx('trkEditHint'))}</p>
        <textarea id="mmTrkLines" dir="auto" rows="5" style="width:100%;box-sizing:border-box;min-height:120px;font:inherit;font-size:.92em;padding:10px;border:1.5px solid #ddd6fe;border-radius:8px;">${_esc(lines)}</textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px;">
          <button type="button" data-trk-act="cancel" style="padding:8px 14px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font:inherit;">${_esc(_tx('btnCancel'))}</button>
          <button type="button" data-trk-act="save" style="padding:8px 16px;border:none;background:#7c3aed;color:#fff;border-radius:8px;cursor:pointer;font:inherit;font-weight:700;">${_esc(_tx('btnSave'))}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const ta = ov.querySelector('#mmTrkLines');
  ta.focus();
  const close = () => ov.remove();
  ov.addEventListener('click', e => {
    if (e.target === ov) { close(); return; }
    const b = e.target.closest('[data-trk-act]');
    if (!b) return;
    if (b.getAttribute('data-trk-act') === 'save') { saveTrackRegistry(ta.value); close(); } else close();
  });
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

// ── Summary under the coverage matrix ─────────────────────────

let _open = (() => { try { return localStorage.getItem('dacum_trk_open') === '1'; } catch (_) { return false; } })();

/** "Programme by track": drawn after the coverage matrix; removed when
 *  the project has no tracks (or no modules). */
export function renderTrackSummary() {
  const after = document.getElementById('coverageMatrixSection');
  let sec = document.getElementById('trackSummarySection');
  const tables = after ? getTracksExportTables() : null;
  if (!tables) { if (sec) sec.remove(); return; }
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'trackSummarySection';
    sec.className = 'clustering-section';
    after.parentNode.insertBefore(sec, after.nextSibling);
  }
  _styles();
  _injectCovFoldStyles();
  const grid = t => `<div class="trk-wrap"><table class="trk-table"><thead><tr>${t.head.map(h => `<th>${_esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map(r => `<tr>${r.map(c => `<td><bdi>${_esc(c)}</bdi></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  sec.innerHTML = `
   <details class="cov-fold" ${_open ? 'open' : ''}>
    <summary class="cov-fold-head">
      <span class="cov-fold-title">⑂ ${_esc(_tx('trkSummaryTitle'))}</span>
      <span class="cov-fold-toggle">${_esc(_tx(_open ? 'covHide' : 'covShow'))}</span>
    </summary>
    <div class="cov-fold-body">
      <p class="cov-hint">${_esc(_tx('trkSummaryHint'))}</p>
      ${grid(tables.programme)}
      <div class="trk-sub">${_esc(_tx('trkSlotsTitle'))}</div>
      ${tables.slots ? grid(tables.slots) : `<p class="cov-hint">${_esc(_tx('trkNoSlots'))}</p>`}
      ${tables.issues.length ? `<ul class="trk-issues">${tables.issues.map(i => `<li>${_esc(i)}</li>`).join('')}</ul>` : ''}
    </div>
   </details>`;
  const det = sec.querySelector('details');
  det.addEventListener('toggle', () => {
    _open = det.open;
    try { localStorage.setItem('dacum_trk_open', _open ? '1' : '0'); } catch (_) { /* cosmetic */ }
    const t = det.querySelector('.cov-fold-toggle');
    if (t) t.textContent = _tx(_open ? 'covHide' : 'covShow');
  });
}
