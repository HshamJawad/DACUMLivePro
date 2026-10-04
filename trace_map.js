// ============================================================
// /trace_map.js — Traceability Map (3.48.0)
//
// A read-only picture of the whole chain, from the occupation to the
// modules:
//
//   duty → task → competency → performance criterion
//        → learning outcome → module
//
// Every box and every line comes from what is already entered; nothing
// here writes to the project. The data is one snapshot taken by
// modules.js getTraceGraph(), which uses the same tracing rules as the
// coverage matrix and the Module Builder handoff (a Task Analysis
// criterion traces to its own task; a competency criterion to the tasks
// it is linked to, or to every task of its competency).
//
//   • Click a box: its chain lights up, the rest fades. Click it again,
//     click empty space or press Esc to clear.
//   • Filter by duty, competency or module: only that chain is drawn.
//   • Hide any column: the lines bridge across it.
//   • "Show gaps": tasks in no competency, competencies without
//     criteria, criteria in no outcome, outcomes in no module.
//   • Narrow screens (phones) get a list instead: one entry per task,
//     opening onto its chain.
//
// Loaded on demand (events.js imports it when the button is pressed),
// and precached by sw.js so it also opens offline.
// ============================================================

import { getTraceGraph } from './modules.js';

const COLS = ['task', 'comp', 'crit', 'lo', 'mod'];
const LIST_BREAK = 760;            // below this width: list mode

const S = {
  en: {
    title: 'Traceability Map', badge: 'read-only', close: 'Close',
    sub: 'From the occupation to the modules — every line comes from what is already entered. Click any box to light up its chain.',
    duty: 'Duty', comp: 'Competency', mod: 'Module', all: 'All',
    col_task: 'Tasks', col_comp: 'Competencies', col_crit: 'Criteria', col_lo: 'Outcomes', col_mod: 'Modules',
    h_task: 'Occupational Profile', h_comp: 'Competencies', h_crit: 'Performance criteria', h_lo: 'Learning outcomes', h_mod: 'Modules',
    showGaps: 'Show gaps', noGaps: '✓ No gaps',
    g_task: 'Tasks in no competency: {n}', g_comp: 'Competencies without criteria: {n}',
    g_crit: 'Criteria in no outcome: {n}', g_lo: 'Outcomes in no module: {n}',
    n_task: 'In no competency', n_comp: 'No criteria', n_crit: 'In no learning outcome', n_lo: 'In no module',
    selected: 'Selected', hint: 'Click any box to light up its chain. Click it again, or press Esc, to clear.',
    lg_link: 'link', lg_linked: 'criterion linked to specific tasks', lg_ta: 'criterion from Task Analysis',
    lg_chain: 'chain of the selected box', lg_gap: 'gap',
    compN: 'Competency {n}', extraGroup: 'Not in the Occupational Profile',
    empty: 'Nothing to show yet — add duties and tasks first.',
    gapsTitle: 'Gaps', onlyChain: 'Show only this chain', showAll: 'Show all', none: '—', showColumns: 'Columns',
  },
  fr: {
    title: 'Carte de traçabilité', badge: 'lecture seule', close: 'Fermer',
    sub: 'Du métier aux modules — chaque lien vient de ce qui est déjà saisi. Cliquez sur une case pour éclairer sa chaîne.',
    duty: 'Fonction', comp: 'Compétence', mod: 'Module', all: 'Tout',
    col_task: 'Tâches', col_comp: 'Compétences', col_crit: 'Critères', col_lo: 'Résultats', col_mod: 'Modules',
    h_task: 'Profil professionnel', h_comp: 'Compétences', h_crit: 'Critères de performance', h_lo: 'Résultats d’apprentissage', h_mod: 'Modules',
    showGaps: 'Afficher les lacunes', noGaps: '✓ Aucune lacune',
    g_task: 'Tâches sans compétence : {n}', g_comp: 'Compétences sans critères : {n}',
    g_crit: 'Critères sans résultat : {n}', g_lo: 'Résultats sans module : {n}',
    n_task: 'Dans aucune compétence', n_comp: 'Aucun critère', n_crit: 'Dans aucun résultat d’apprentissage', n_lo: 'Dans aucun module',
    selected: 'Sélection', hint: 'Cliquez sur une case pour éclairer sa chaîne. Cliquez à nouveau, ou appuyez sur Échap, pour effacer.',
    lg_link: 'lien', lg_linked: 'critère relié à des tâches précises', lg_ta: 'critère issu de l’analyse des tâches',
    lg_chain: 'chaîne de la case choisie', lg_gap: 'lacune',
    compN: 'Compétence {n}', extraGroup: 'Hors profil professionnel',
    empty: 'Rien à afficher pour l’instant — ajoutez d’abord des fonctions et des tâches.',
    gapsTitle: 'Lacunes', onlyChain: 'Afficher seulement cette chaîne', showAll: 'Tout afficher', none: '—', showColumns: 'Colonnes',
  },
  ar: {
    title: 'خريطة التتبع', badge: 'للقراءة فقط', close: 'إغلاق',
    sub: 'من المهنة إلى الوحدات — كل رابط مأخوذ مما أُدخل من قبل. انقر أي مربع لتُضاء سلسلته.',
    duty: 'الواجب', comp: 'الكفاءة', mod: 'الوحدة', all: 'الكل',
    col_task: 'المهام', col_comp: 'الكفاءات', col_crit: 'المعايير', col_lo: 'المحصلات', col_mod: 'الوحدات',
    h_task: 'الوصف المهني', h_comp: 'الكفاءات', h_crit: 'معايير الأداء', h_lo: 'محصلات التعلم', h_mod: 'الوحدات التعلمية',
    showGaps: 'إظهار الفجوات', noGaps: '✓ لا فجوات',
    g_task: 'مهام بلا كفاءة: {n}', g_comp: 'كفاءات بلا معايير: {n}',
    g_crit: 'معايير ليست في أي محصلة: {n}', g_lo: 'محصلات ليست في أي وحدة: {n}',
    n_task: 'ليست في أي كفاءة', n_comp: 'بلا معايير', n_crit: 'ليس في أي محصلة تعلم', n_lo: 'ليست في أي وحدة',
    selected: 'المختار', hint: 'انقر أي مربع لتُضاء سلسلته. انقره مرة أخرى، أو اضغط Esc، للإلغاء.',
    lg_link: 'رابط', lg_linked: 'معيار مرتبط بمهام محددة', lg_ta: 'معيار من تحليل المهمة',
    lg_chain: 'سلسلة المربع المختار', lg_gap: 'فجوة',
    compN: 'الكفاءة {n}', extraGroup: 'خارج الوصف المهني',
    empty: 'لا شيء لعرضه بعد — أضف الواجبات والمهام أولاً.',
    gapsTitle: 'الفجوات', onlyChain: 'إظهار هذه السلسلة فقط', showAll: 'إظهار الكل', none: '—', showColumns: 'الأعمدة',
  },
};

const _lang = () => (window.i18n && window.i18n.getLang) ? window.i18n.getLang() : 'en';
const _rtl  = () => !!(window.i18n && window.i18n.isRTL && window.i18n.isRTL());
const _s = (k, v) => {
  const d = S[_lang()] || S.en;
  let str = d[k] != null ? d[k] : (S.en[k] != null ? S.en[k] : k);
  if (v) Object.keys(v).forEach(n => { str = str.split(`{${n}}`).join(String(v[n])); });
  return str;
};
const _esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ── State (one map open at a time) ──────────────────────────────
let G = null;          // graph snapshot
let X = null;          // indexes
const ui = { hidden: new Set(), filter: null, focus: null, gaps: false, mode: null };
let overlay = null, launcher = null, raf = 0;

// ── Indexes and chain logic ─────────────────────────────────────
function _index(g) {
  const ix = {
    task: new Map(), comp: new Map(), crit: new Map(), lo: new Map(), mod: new Map(),
    compsOfTask: new Map(), critsOfTask: new Map(), critsOfComp: new Map(),
    losOfCrit: new Map(), modsOfLo: new Map(), dutyTasks: new Map(),
  };
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); const a = m.get(k); if (!a.includes(v)) a.push(v); };
  g.duties.forEach(d => { ix.dutyTasks.set(d.id, d.tasks.map(t => t.id)); d.tasks.forEach(t => ix.task.set(t.id, t)); });
  g.extra.forEach(t => ix.task.set(t.id, t));
  g.comps.forEach(c => { ix.comp.set(c.id, c); c.taskIds.forEach(t => push(ix.compsOfTask, t, c.id)); });
  g.crits.forEach(p => {
    ix.crit.set(p.key, p);
    push(ix.critsOfComp, p.compId, p.key);
    p.taskIds.forEach(t => push(ix.critsOfTask, t, p.key));
  });
  g.los.forEach(o => { ix.lo.set(o.id, o); o.critKeys.forEach(k => push(ix.losOfCrit, k, o.id)); });
  g.mods.forEach(m => { ix.mod.set(m.id, m); m.loIds.forEach(l => push(ix.modsOfLo, l, m.id)); });
  return ix;
}

const _get = (m, k) => m.get(k) || [];

/** Everything on the chain of one box, column by column. */
function _chain(type, id) {
  const out = { task: new Set(), comp: new Set(), crit: new Set(), lo: new Set(), mod: new Set() };
  let crits = [];
  if (type === 'task')      crits = _get(X.critsOfTask, id);
  else if (type === 'comp') crits = _get(X.critsOfComp, id);
  else if (type === 'crit') crits = [id];
  else if (type === 'lo')   crits = (X.lo.get(id) || { critKeys: [] }).critKeys;
  else if (type === 'mod')  ((X.mod.get(id) || { loIds: [] }).loIds).forEach(l =>
                              ((X.lo.get(l) || { critKeys: [] }).critKeys).forEach(k => crits.push(k)));
  crits.forEach(k => out.crit.add(k));

  if (type === 'task') out.task.add(id);
  else if (type === 'comp') ((X.comp.get(id) || { taskIds: [] }).taskIds).forEach(t => out.task.add(t));
  else crits.forEach(k => ((X.crit.get(k) || { taskIds: [] }).taskIds).forEach(t => out.task.add(t)));

  if (type === 'task') _get(X.compsOfTask, id).forEach(c => out.comp.add(c));
  else if (type === 'comp') out.comp.add(id);
  else crits.forEach(k => { const p = X.crit.get(k); if (p) out.comp.add(p.compId); });

  if (type === 'lo') out.lo.add(id);
  else if (type === 'mod') ((X.mod.get(id) || { loIds: [] }).loIds).forEach(l => out.lo.add(l));
  else crits.forEach(k => _get(X.losOfCrit, k).forEach(l => out.lo.add(l)));

  if (type === 'mod') out.mod.add(id);
  else out.lo.forEach(l => _get(X.modsOfLo, l).forEach(m => out.mod.add(m)));
  return out;
}

function _union(a, b) { COLS.forEach(c => b[c].forEach(v => a[c].add(v))); return a; }
function _emptySets() { return { task: new Set(), comp: new Set(), crit: new Set(), lo: new Set(), mod: new Set() }; }

/** The set the current filter keeps, or null (everything). */
function _filterSet() {
  const f = ui.filter;
  if (!f) return null;
  if (f.type === 'duty') {
    const s = _emptySets();
    _get(X.dutyTasks, f.id).forEach(t => _union(s, _chain('task', t)));
    return s;
  }
  return _chain(f.type, f.id);
}

// ── Gaps ────────────────────────────────────────────────────────
function _gapOf(type, id) {
  if (type === 'task') return !_get(X.compsOfTask, id).length;
  if (type === 'comp') return !_get(X.critsOfComp, id).length;
  if (type === 'crit') return !_get(X.losOfCrit, id).length;
  if (type === 'lo')   return !_get(X.modsOfLo, id).length;
  return false;
}
function _gapCounts() {
  const n = { task: 0, comp: 0, crit: 0, lo: 0 };
  X.task.forEach((_, id) => { if (_gapOf('task', id)) n.task++; });
  X.comp.forEach((_, id) => { if (_gapOf('comp', id)) n.comp++; });
  X.crit.forEach((_, id) => { if (_gapOf('crit', id)) n.crit++; });
  X.lo.forEach((_, id) => { if (_gapOf('lo', id)) n.lo++; });
  return n;
}
function _gapSummaryHtml() {
  const n = _gapCounts();
  const parts = ['task', 'comp', 'crit', 'lo'].filter(k => n[k]).map(k => _esc(_s('g_' + k, { n: n[k] })));
  return parts.length
    ? `<span class="tm-gapsum">⚠ ${parts.join(' · ')}</span>`
    : `<span class="tm-gapsum is-ok">${_esc(_s('noGaps'))}</span>`;
}

// ── Box labels ──────────────────────────────────────────────────
function _code(type, item) {
  if (type === 'task') return item.code || '';
  if (type === 'comp') return String(item.num);
  if (type === 'crit') return item.id;
  if (type === 'lo')   return item.number;
  if (type === 'mod')  return item.ref;
  return '';
}
function _text(type, item) {
  if (type === 'task') return item.text;
  if (type === 'comp') return item.name;
  if (type === 'crit') return item.text;
  if (type === 'lo')   return item.statement;
  if (type === 'mod')  return item.title;
  return '';
}
function _box(type, id, item) {
  const gap = _gapOf(type, id);
  const mark = type === 'crit' ? (item.source === 'ta' ? '🔬 ' : item.linked ? '🔗 ' : '') : '';
  const text = _text(type, item);
  return `<button type="button" class="tm-n tm-${type}${gap ? ' tm-gap' : ''}" data-t="${type}" data-id="${_esc(id)}"
            title="${_esc(text)}"><span class="tm-row"><bdi class="tm-code">${_esc(_code(type, item))}</bdi> ${mark}<span class="tm-x" dir="auto">${_esc(text)}</span></span>${gap
            ? `<span class="tm-gapnote">⚠ ${_esc(_s('n_' + type))}</span>` : ''}</button>`;
}

// ── Desktop map ─────────────────────────────────────────────────
function _visibleLists(keep) {
  const has = (c, id) => !keep || keep[c].has(id);
  const groups = G.duties.map(d => ({
    key: d.id, title: `${d.code ? d.code + ' — ' : ''}${d.title}`,
    tasks: d.tasks.filter(t => has('task', t.id)),
  }));
  if (G.extra.length) groups.push({ key: '_extra', title: _s('extraGroup'), tasks: G.extra.filter(t => has('task', t.id)) });
  const comps = G.comps.filter(c => has('comp', c.id));
  const crits = G.crits.filter(p => has('crit', p.key));
  /* Outcomes and modules follow the criteria they use (barycentre of
     their positions), so the lines cross as little as possible. */
  const critPos = new Map(crits.map((p, i) => [p.key, i]));
  const bary = (keys, pos) => {
    const v = keys.map(k => pos.get(k)).filter(n => n != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : Infinity;
  };
  const los = G.los.filter(o => has('lo', o.id))
    .map((o, i) => ({ o, i, b: bary(o.critKeys, critPos) }))
    .sort((a, b) => a.b - b.b || a.i - b.i).map(x => x.o);
  const loPos = new Map(los.map((o, i) => [o.id, i]));
  const mods = G.mods.filter(m => has('mod', m.id))
    .map((m, i) => ({ m, i, b: bary(m.loIds, loPos) }))
    .sort((a, b) => a.b - b.b || a.i - b.i).map(x => x.m);
  return { groups: groups.filter(g => g.tasks.length), comps, crits, los, mods };
}

function _renderMap(body) {
  const keep = _filterSet();
  const L = _visibleLists(keep);
  const cols = COLS.filter(c => !ui.hidden.has(c));
  const colHtml = {
    task: L.groups.map(g => `
      <div class="tm-duty"><div class="tm-dt" dir="auto">${_esc(g.title)}</div>
        ${g.tasks.map(t => _box('task', t.id, t)).join('')}</div>`).join(''),
    comp: L.comps.map(c => _box('comp', c.id, c)).join(''),
    crit: L.crits.map(p => _box('crit', p.key, p)).join(''),
    lo:   L.los.map(o => _box('lo', o.id, o)).join(''),
    mod:  L.mods.map(m => _box('mod', m.id, m)).join(''),
  };
  const tone = { task: 'ph', comp: 'st', crit: 'st', lo: 'cu', mod: 'cu' };
  body.innerHTML = `
    <div class="tm-stage${ui.focus ? ' is-focus' : ''}${ui.gaps ? ' is-gaps' : ''}" style="--tm-cols:${cols.length}">
      <svg class="tm-links" aria-hidden="true"></svg>
      <div class="tm-cols">
        ${cols.map(c => `
          <div class="tm-col" data-col="${c}">
            <div class="tm-colh tm-${tone[c]}">${_esc(_s('h_' + c))}</div>
            <div class="tm-colb">${colHtml[c] || ''}</div>
          </div>`).join('')}
      </div>
    </div>`;
  _applyFocusClasses();
  _scheduleLinks();
}

/** Lines between neighbouring visible columns; a hidden column is
 *  bridged (e.g. competency → outcome when criteria are hidden). */
function _edges() {
  const cols = COLS.filter(c => !ui.hidden.has(c));
  const nodesOf = (type, p) => {
    if (type === 'task') return p.taskIds;
    if (type === 'comp') return [p.compId];
    if (type === 'crit') return [p.key];
    if (type === 'lo')   return _get(X.losOfCrit, p.key);
    const m = new Set(); _get(X.losOfCrit, p.key).forEach(l => _get(X.modsOfLo, l).forEach(x => m.add(x)));
    return [...m];
  };
  const out = new Map();
  const add = (a, ia, b, ib, kind) => {
    const k = `${a}|${ia}>${b}|${ib}`;
    if (!out.has(k)) out.set(k, { a, ia, b, ib, kind: kind || '' });
  };
  for (let i = 0; i + 1 < cols.length; i++) {
    const a = cols[i], b = cols[i + 1];
    if (a === 'task' && b === 'comp') { G.comps.forEach(c => c.taskIds.forEach(t => add('task', t, 'comp', c.id))); continue; }
    if (a === 'lo' && b === 'mod')    { G.mods.forEach(m => m.loIds.forEach(l => add('lo', l, 'mod', m.id))); continue; }
    G.crits.forEach(p => {
      const kind = (a === 'task' && b === 'crit' && p.linked) ? 'linked' : '';
      nodesOf(a, p).forEach(x => nodesOf(b, p).forEach(y => add(a, x, b, y, kind)));
    });
  }
  /* With the competency column shown, a criterion tied to specific
     tasks gets its own dashed line from those tasks — drawn only for
     the chain on screen, or the map turns into a web. */
  if (ui.focus && cols.includes('task') && cols.includes('comp') && cols.includes('crit')) {
    G.crits.forEach(p => { if (p.linked) p.taskIds.forEach(t => add('task', t, 'crit', p.key, 'linked')); });
  }
  return [...out.values()];
}

function _scheduleLinks() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(_drawLinks);
}

function _drawLinks() {
  if (!overlay) return;
  const stage = overlay.querySelector('.tm-stage');
  const svg = stage && stage.querySelector('.tm-links');
  if (!svg) return;
  const sb = stage.getBoundingClientRect();
  svg.setAttribute('width', stage.scrollWidth);
  svg.setAttribute('height', stage.scrollHeight);
  const el = new Map();
  stage.querySelectorAll('.tm-n').forEach(n => el.set(n.dataset.t + '|' + n.dataset.id, n));
  const chain = ui.focus ? _chain(ui.focus.type, ui.focus.id) : null;
  let base = '', hot = '';
  _edges().forEach(e => {
    const A = el.get(e.a + '|' + e.ia), B = el.get(e.b + '|' + e.ib);
    if (!A || !B) return;
    const on = chain && chain[e.a].has(e.ia) && chain[e.b].has(e.ib);
    if (e.kind === 'linked' && !on && !(ui.hidden.has('comp'))) return;
    const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
    const forward = (rb.left + rb.right) / 2 >= (ra.left + ra.right) / 2;
    const x1 = (forward ? ra.right : ra.left) - sb.left, y1 = ra.top + ra.height / 2 - sb.top;
    const x2 = (forward ? rb.left : rb.right) - sb.left, y2 = rb.top + rb.height / 2 - sb.top;
    const dx = (x2 - x1) / 2;
    const d = `M${x1.toFixed(1)},${y1.toFixed(1)} C${(x1 + dx).toFixed(1)},${y1.toFixed(1)} ${(x2 - dx).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    const cls = `tm-l${on ? ' is-on' : ''}${e.kind === 'linked' ? ' is-linked' : ''}`;
    if (on) hot += `<path class="${cls}" d="${d}"/>`; else base += `<path class="${cls}" d="${d}"/>`;
  });
  svg.innerHTML = base + hot;        // the lit chain is drawn last, on top
}

function _applyFocusClasses() {
  if (!overlay) return;
  const chain = ui.focus ? _chain(ui.focus.type, ui.focus.id) : null;
  overlay.querySelectorAll('.tm-n').forEach(n => {
    const on = !!chain && chain[n.dataset.t] && chain[n.dataset.t].has(n.dataset.id);
    n.classList.toggle('is-on', on);
    n.classList.toggle('is-focus', !!ui.focus && n.dataset.t === ui.focus.type && n.dataset.id === ui.focus.id);
    n.setAttribute('aria-pressed', String(!!ui.focus && n.dataset.t === ui.focus.type && n.dataset.id === ui.focus.id));
  });
  const st = overlay.querySelector('.tm-stage');
  if (st) st.classList.toggle('is-focus', !!ui.focus);
  _renderDetail();
}

function _renderDetail() {
  const box = overlay && overlay.querySelector('.tm-detail');
  if (!box) return;
  if (!ui.focus) { box.innerHTML = `<span class="tm-hint">${_esc(_s('hint'))}</span>`; return; }
  const c = _chain(ui.focus.type, ui.focus.id);
  const arrow = _rtl() ? '←' : '→';
  const list = (type) => {
    const codes = [...c[type]].map(id => _code(type, X[type].get(id) || {})).filter(Boolean);
    if (!codes.length) return _esc(_s('none'));
    const shown = codes.slice(0, 8).map(v => `<bdi>${_esc(v)}</bdi>`).join(_lang() === 'ar' ? '، ' : ', ');
    return codes.length > 8 ? `${shown} +${codes.length - 8}` : shown;
  };
  box.innerHTML = `<b>${_esc(_s('selected'))}:</b> ` + COLS.map(t =>
    `<span class="tm-dg"><span class="tm-dl">${_esc(_s('col_' + t))}</span> ${list(t)}</span>`).join(`<span class="tm-arrow">${arrow}</span>`) +
    `<button type="button" class="tm-only" data-only>🔍 ${_esc(_s('onlyChain'))}</button>`;
}

// ── List (phones) ───────────────────────────────────────────────
function _renderList(body) {
  const keep = _filterSet();
  const L = _visibleLists(keep);
  const pill = (type, id) => {
    const it = X[type].get(id); if (!it) return '';
    return `<div class="tm-n tm-${type} is-static"><span class="tm-row"><bdi class="tm-code">${_esc(_code(type, it))}</bdi> ${
      type === 'crit' ? (it.source === 'ta' ? '🔬 ' : it.linked ? '🔗 ' : '') : ''}<span class="tm-x" dir="auto">${_esc(_text(type, it))}</span></span></div>`;
  };
  const taskEntry = t => {
    const c = _chain('task', t.id);
    const gap = _gapOf('task', t.id);
    const steps = ['comp', 'crit', 'lo', 'mod'].map(type => {
      const ids = [...c[type]];
      return `<div class="tm-step"><div class="tm-stepl">${_esc(_s('h_' + type))}</div>${
        ids.length ? ids.map(id => pill(type, id)).join('') : `<div class="tm-none">${_esc(_s('none'))}</div>`}</div>`;
    }).join('');
    return `<details class="tm-task-item${gap ? ' tm-gapitem' : ''}"><summary><bdi class="tm-code">${_esc(t.code || '')}</bdi> <span dir="auto">${_esc(t.text)}</span>${
      gap ? `<span class="tm-gapnote">⚠ ${_esc(_s('n_task'))}</span>` : ''}</summary><div class="tm-chainlist">${steps}</div></details>`;
  };
  /* The other gaps have no task to hang from: listed once, folded. */
  const others = ['comp', 'crit', 'lo'].map(type => {
    const ids = [...X[type].keys()].filter(id => _gapOf(type, id) && (!keep || keep[type].has(id)));
    return ids.length ? `<div class="tm-step"><div class="tm-stepl">⚠ ${_esc(_s('n_' + type))}</div>${ids.map(id => pill(type, id)).join('')}</div>` : '';
  }).join('');
  body.innerHTML = `
    <div class="tm-list">
      ${L.groups.map(g => `<div class="tm-lgroup"><div class="tm-dt" dir="auto">${_esc(g.title)}</div>${g.tasks.map(taskEntry).join('')}</div>`).join('')}
      ${others ? `<details class="tm-task-item tm-gapitem"><summary>⚠ ${_esc(_s('gapsTitle'))}</summary><div class="tm-chainlist">${others}</div></details>` : ''}
    </div>`;
}

// ── Shell ───────────────────────────────────────────────────────
function _toolbarHtml() {
  const f = ui.filter || {};
  const opt = (v, label, sel) => `<option value="${_esc(v)}"${sel ? ' selected' : ''}>${_esc(label)}</option>`;
  const short = s => (s.length > 60 ? s.slice(0, 58) + '…' : s);
  const dutySel = `<label class="tm-sel"><span>${_esc(_s('duty'))}</span><select data-filter="duty">${opt('', _s('all'), !f.type)}${
    G.duties.filter(d => d.tasks.length).map(d => opt(d.id, short(`${d.code} — ${d.title}`), f.type === 'duty' && f.id === d.id)).join('')}</select></label>`;
  const compSel = `<label class="tm-sel"><span>${_esc(_s('comp'))}</span><select data-filter="comp">${opt('', _s('all'), !f.type)}${
    G.comps.map(c => opt(c.id, short(`${c.num} — ${c.name}`), f.type === 'comp' && f.id === c.id)).join('')}</select></label>`;
  const modSel = G.mods.length ? `<label class="tm-sel"><span>${_esc(_s('mod'))}</span><select data-filter="mod">${opt('', _s('all'), !f.type)}${
    G.mods.map(m => opt(m.id, short(`${m.ref} — ${m.title}`), f.type === 'mod' && f.id === m.id)).join('')}</select></label>` : '';
  const chips = COLS.map(c => `<button type="button" class="tm-chip${ui.hidden.has(c) ? ' is-off' : ''}" data-col-toggle="${c}" aria-pressed="${!ui.hidden.has(c)}">${
    ui.hidden.has(c) ? '' : '✓ '}${_esc(_s('col_' + c))}</button>`).join('');
  return `${dutySel}${compSel}${modSel}
    <span class="tm-sep tm-desk"></span><span class="tm-chips tm-desk" role="group" aria-label="${_esc(_s('showColumns'))}">${chips}</span>
    <span class="tm-sep tm-desk"></span><button type="button" class="tm-chip tm-gapbtn tm-desk${ui.gaps ? ' is-on' : ''}" data-gaps aria-pressed="${ui.gaps}">⚠ ${_esc(_s('showGaps'))}</button>
    ${ui.filter ? `<button type="button" class="tm-chip tm-showall" data-showall>✕ ${_esc(_s('showAll'))}</button>` : ''}
    ${_gapSummaryHtml()}`;
}

function _legendHtml() {
  return `<span><i class="tm-lg"></i>${_esc(_s('lg_link'))}</span>
    <span><i class="tm-lg is-linked"></i>🔗 ${_esc(_s('lg_linked'))}</span>
    <span>🔬 ${_esc(_s('lg_ta'))}</span>
    <span><i class="tm-lg is-on"></i>${_esc(_s('lg_chain'))}</span>
    <span><i class="tm-lg-gap"></i>${_esc(_s('lg_gap'))}</span>`;
}

function _render() {
  if (!overlay) return;
  const listMode = overlay.clientWidth < LIST_BREAK;
  ui.mode = listMode ? 'list' : 'map';
  overlay.setAttribute('dir', _rtl() ? 'rtl' : 'ltr');
  overlay.classList.toggle('is-list', listMode);
  overlay.querySelector('.tm-bar').innerHTML = _toolbarHtml();
  const body = overlay.querySelector('.tm-scroll');
  overlay.querySelector('.tm-foot').hidden = listMode;
  const empty = !G.duties.some(d => d.tasks.length) && !G.extra.length && !G.comps.length;
  if (empty) { body.innerHTML = `<p class="tm-empty">${_esc(_s('empty'))}</p>`; return; }
  if (listMode) _renderList(body); else _renderMap(body);
  _renderDetail();
}

function _onClick(e) {
  const t = e.target;
  if (t.closest('[data-tm-close]')) { closeTraceMap(); return; }
  const col = t.closest('[data-col-toggle]');
  if (col) {
    const c = col.getAttribute('data-col-toggle');
    if (ui.hidden.has(c)) ui.hidden.delete(c);
    else if (COLS.length - ui.hidden.size > 2) ui.hidden.add(c);   // keep at least two columns
    _render(); return;
  }
  if (t.closest('[data-gaps]')) { ui.gaps = !ui.gaps; _render(); return; }
  if (t.closest('[data-only]') && ui.focus) {
    /* Keep only the chain on screen: the lit boxes are often far apart
       in a large project, and this brings them together. */
    ui.filter = { type: ui.focus.type, id: ui.focus.id };
    _render(); _applyFocusClasses(); _scheduleLinks(); return;
  }
  if (t.closest('[data-showall]')) { ui.filter = null; _render(); _applyFocusClasses(); _scheduleLinks(); return; }
  const n = t.closest('.tm-n[data-t]');
  if (n && !n.classList.contains('is-static')) {
    const same = ui.focus && ui.focus.type === n.dataset.t && ui.focus.id === n.dataset.id;
    ui.focus = same ? null : { type: n.dataset.t, id: n.dataset.id };
    _applyFocusClasses(); _scheduleLinks(); return;
  }
  if (t.closest('.tm-stage') && ui.focus) { ui.focus = null; _applyFocusClasses(); _scheduleLinks(); }
}

function _onChange(e) {
  const s = e.target.closest('select[data-filter]');
  if (!s) return;
  ui.filter = s.value ? { type: s.getAttribute('data-filter'), id: s.value } : null;
  ui.focus = null;
  _render();
}

function _onKey(e) {
  if (e.key !== 'Escape' || !overlay) return;
  e.preventDefault(); e.stopPropagation();
  if (ui.focus) { ui.focus = null; _applyFocusClasses(); _scheduleLinks(); }
  else closeTraceMap();
}

let _lastWidthMode = null;
function _onResize() {
  if (!overlay) return;
  const mode = overlay.clientWidth < LIST_BREAK ? 'list' : 'map';
  if (mode !== _lastWidthMode) { _lastWidthMode = mode; _render(); }
  else if (mode === 'map') _scheduleLinks();
}

function _onLang() { if (overlay) { G = getTraceGraph(); X = _index(G); _render(); _localiseShell(); } }

function _localiseShell() {
  overlay.setAttribute('aria-label', _s('title'));
  overlay.querySelector('.tm-title').textContent = '🧭 ' + _s('title');
  overlay.querySelector('.tm-badge').textContent = _s('badge');
  overlay.querySelector('.tm-sub').textContent = _s('sub');
  const c = overlay.querySelector('[data-tm-close]');
  c.title = _s('close'); c.setAttribute('aria-label', _s('close'));
  overlay.querySelector('.tm-legend').innerHTML = _legendHtml();
}

export function openTraceMap(fromButton) {
  if (overlay) return;
  _injectStyles();
  launcher = fromButton || document.activeElement;
  G = getTraceGraph();
  X = _index(G);
  ui.filter = null; ui.focus = null; ui.gaps = false;
  overlay = document.createElement('div');
  overlay.className = 'tm-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="tm-panel">
      <div class="tm-head">
        <h2 class="tm-title"></h2><span class="tm-badge"></span>
        <button type="button" class="tm-close" data-tm-close>✕</button>
      </div>
      <p class="tm-sub"></p>
      <div class="tm-bar"></div>
      <div class="tm-scroll"></div>
      <div class="tm-foot"><div class="tm-detail" aria-live="polite"></div><div class="tm-legend"></div></div>
    </div>`;
  document.body.appendChild(overlay);
  document.documentElement.classList.add('tm-lock');
  _localiseShell();
  overlay.addEventListener('click', _onClick);
  overlay.addEventListener('change', _onChange);
  document.addEventListener('keydown', _onKey, true);
  window.addEventListener('resize', _onResize);
  window.addEventListener('dacum:langchange', _onLang);
  _lastWidthMode = null;
  _onResize();
  overlay.querySelector('.tm-close').focus();
}

export function closeTraceMap() {
  if (!overlay) return;
  document.removeEventListener('keydown', _onKey, true);
  window.removeEventListener('resize', _onResize);
  window.removeEventListener('dacum:langchange', _onLang);
  overlay.remove();
  overlay = null; G = null; X = null;
  document.documentElement.classList.remove('tm-lock');
  if (launcher && launcher.focus) { try { launcher.focus(); } catch (_) {} }
  launcher = null;
}

// ── Styles (injected once; the file is loaded on demand) ────────
function _injectStyles() {
  if (document.getElementById('tm-styles')) return;
  const st = document.createElement('style');
  st.id = 'tm-styles';
  st.textContent = `
html.tm-lock, html.tm-lock body { overflow: hidden; }
.tm-overlay { position: fixed; inset: 0; z-index: 99990; background: rgba(15,23,42,.55); display: flex; padding: 14px; }
.tm-panel { flex: 1; min-width: 0; background: #fff; border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,.35);
  display: flex; flex-direction: column; overflow: hidden; color: #1e293b; }
.tm-head { display: flex; align-items: center; gap: 10px; padding: 14px 18px 0; }
.tm-title { margin: 0; font-size: 1.15em; }
.tm-badge { font-size: .72em; background: #ede9fe; color: #5b21b6; border-radius: 999px; padding: 2px 9px; font-weight: 700; white-space: nowrap; }
.tm-close { margin-inline-start: auto; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; width: 34px; height: 34px;
  font-size: 1em; cursor: pointer; color: #334155; flex-shrink: 0; }
.tm-close:hover { background: #e2e8f0; }
.tm-sub { margin: 4px 18px 10px; color: #64748b; font-size: .84em; line-height: 1.5; }
.tm-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 18px 10px; padding: 9px 10px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; }
.tm-sel { display: inline-flex; align-items: center; gap: 6px; font-size: .8em; color: #475569; min-width: 0; }
.tm-sel select { max-width: 240px; min-width: 0; border: 1px solid #cbd5e1; border-radius: 8px; padding: 5px 8px; background: #fff; font: inherit; color: #1e293b; }
.tm-sep { width: 1px; height: 22px; background: #e2e8f0; }
.tm-chips { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.tm-chip { border-radius: 999px; padding: 4px 11px; font-size: .76em; font-weight: 600; border: 1px solid #c7d2fe; background: #eef2ff;
  color: #3730a3; cursor: pointer; }
.tm-chip.is-off { background: #fff; color: #94a3b8; border-color: #e2e8f0; text-decoration: line-through; }
.tm-gapbtn { border-color: #fecaca; background: #fff; color: #b91c1c; }
.tm-gapbtn.is-on { background: #dc2626; color: #fff; border-color: #dc2626; }
.tm-gapsum { margin-inline-start: auto; font-size: .78em; color: #991b1b; background: #fef2f2; border: 1px solid #fecaca;
  border-radius: 8px; padding: 5px 10px; font-weight: 600; line-height: 1.5; }
.tm-gapsum.is-ok { color: #166534; background: #f0fdf4; border-color: #bbf7d0; }
.tm-scroll { flex: 1; min-height: 0; overflow: auto; padding: 0 18px 14px; overscroll-behavior: contain; }
.tm-stage { position: relative; min-width: calc(var(--tm-cols) * 230px); }
.tm-links { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 0; }
.tm-cols { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(var(--tm-cols), minmax(0, 1fr)); column-gap: 46px; align-items: start; }
.tm-col { min-width: 0; }
.tm-colh { position: sticky; top: 0; z-index: 2; background: #fff; font-weight: 800; font-size: .76em; letter-spacing: .02em;
  text-transform: uppercase; padding: 8px 0 6px; margin-bottom: 8px; border-bottom: 2px dashed; }
.tm-ph { color: #2f5597; border-color: #2f5597; } .tm-st { color: #548235; border-color: #548235; } .tm-cu { color: #7030a0; border-color: #7030a0; }
.tm-colb { display: flex; flex-direction: column; gap: 8px; }
.tm-duty { border: 1px solid #c7d7f0; border-radius: 10px; background: #f5f8fd; padding: 7px; display: flex; flex-direction: column; gap: 6px; }
.tm-dt { font-size: .74em; font-weight: 700; color: #2f5597; margin: 0 2px 2px; line-height: 1.35; }
.tm-n { display: block; width: 100%; text-align: start; font: inherit; font-size: .76em; line-height: 1.35; color: #1e293b;
  border: 1px solid; border-radius: 8px; padding: 6px 9px; cursor: pointer; transition: opacity .15s, box-shadow .15s; }
.tm-n:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.tm-row { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.tm-code { font-weight: 800; }
.tm-task { background: #dbe6f6; border-color: #9db5de; } .tm-task .tm-code { color: #2f5597; }
.tm-comp { background: #dcebd3; border-color: #9cc28a; } .tm-comp .tm-code { color: #3f6b27; }
.tm-crit { background: #eef6e9; border-color: #b9d6a9; } .tm-crit .tm-code { color: #3f6b27; }
.tm-lo   { background: #efe4f8; border-color: #c3a3dc; } .tm-lo .tm-code { color: #7030a0; }
.tm-mod  { background: #7030a0; border-color: #5b2386; color: #fff; } .tm-mod .tm-code { color: #fde68a; }
.tm-gap { border: 2px dashed #dc2626 !important; background: #fef2f2 !important; color: #1e293b !important; }
.tm-gap .tm-code { color: #b91c1c !important; }
.tm-gapnote { display: block; color: #dc2626; font-size: .9em; font-weight: 700; margin-top: 2px; }
.tm-stage.is-focus .tm-n:not(.is-on) { opacity: .25; }
.tm-stage.is-gaps:not(.is-focus) .tm-n:not(.tm-gap) { opacity: .3; }
.tm-n.is-on { box-shadow: 0 0 0 3px #f59e0b; opacity: 1; }
.tm-n.is-focus { box-shadow: 0 0 0 3px #f59e0b, 0 6px 16px rgba(245,158,11,.35); }
.tm-l { fill: none; stroke: #94a3b8; stroke-width: 1.2; opacity: .5; }
.tm-l.is-linked { stroke-dasharray: 6 4; }
.tm-l.is-on { stroke: #f59e0b; stroke-width: 3; opacity: 1; }
.tm-stage.is-focus .tm-l:not(.is-on) { opacity: .15; }
.tm-stage.is-gaps:not(.is-focus) .tm-l { opacity: .18; }
.tm-foot { border-top: 1px solid #e2e8f0; padding: 9px 18px 12px; display: flex; flex-direction: column; gap: 7px; }
.tm-detail { font-size: .8em; color: #78350f; background: #fffbeb; border: 1px solid #fde68a; border-radius: 9px; padding: 7px 11px;
  display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; line-height: 1.5; }
.tm-detail .tm-hint { color: #92400e; }
.tm-dl { font-weight: 700; color: #92400e; }
.tm-arrow { color: #d97706; font-weight: 800; }
.tm-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: .74em; color: #475569; align-items: center; }
.tm-lg { display: inline-block; width: 26px; border-top: 2px solid #94a3b8; vertical-align: middle; margin-inline-end: 6px; }
.tm-lg.is-linked { border-top-style: dashed; } .tm-lg.is-on { border-top: 3px solid #f59e0b; }
.tm-lg-gap { display: inline-block; width: 16px; height: 11px; border: 2px dashed #dc2626; border-radius: 3px; vertical-align: middle; margin-inline-end: 6px; }
.tm-foot[hidden] { display: none; }
.tm-overlay.is-list .tm-sub { display: none; }
.tm-overlay.is-list .tm-bar { gap: 6px; padding: 7px 8px; }
.tm-only { border: 1px solid #f59e0b; background: #fff; color: #92400e; border-radius: 999px; padding: 2px 10px; font: inherit; font-weight: 700; cursor: pointer; margin-inline-start: auto; }
.tm-showall { border-color: #f59e0b; background: #fffbeb; color: #92400e; }
.tm-empty { color: #64748b; text-align: center; padding: 40px 10px; }
/* list mode (phones) */
.tm-overlay.is-list { padding: 0; }
.tm-overlay.is-list .tm-panel { border-radius: 0; }
.tm-overlay.is-list .tm-desk { display: none; }
.tm-overlay.is-list .tm-head { padding: 12px 12px 0; }
.tm-overlay.is-list .tm-sub { margin: 4px 12px 8px; }
.tm-overlay.is-list .tm-bar { margin: 0 12px 8px; }
.tm-overlay.is-list .tm-sel { flex: 1 1 100%; }
.tm-overlay.is-list .tm-sel select { flex: 1; max-width: none; }
.tm-overlay.is-list .tm-gapsum { margin: 0; flex: 1 1 100%; }
.tm-overlay.is-list .tm-scroll { padding: 0 12px 14px; }
.tm-list { display: flex; flex-direction: column; gap: 12px; }
.tm-lgroup { display: flex; flex-direction: column; gap: 6px; }
.tm-task-item { border: 1px solid #dbe6f6; border-radius: 10px; background: #f8fafc; }
.tm-task-item > summary { padding: 8px 10px; font-size: .82em; cursor: pointer; line-height: 1.4; overflow-wrap: anywhere; }
.tm-task-item > summary .tm-code { color: #2f5597; }
.tm-task-item[open] { background: #fff; border-color: #f59e0b; }
.tm-gapitem { border: 2px dashed #fca5a5; }
.tm-chainlist { margin: 0 10px 10px; padding-inline-start: 10px; border-inline-start: 3px solid #f59e0b; display: flex; flex-direction: column; gap: 8px; }
.tm-step { display: flex; flex-direction: column; gap: 4px; }
.tm-stepl { font-size: .72em; font-weight: 700; color: #64748b; }
.tm-n.is-static { cursor: default; }
.tm-none { font-size: .78em; color: #94a3b8; }
`;
  document.head.appendChild(st);
}
