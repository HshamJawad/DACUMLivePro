// ============================================================
// /content_lang.js
// Content languages of a project — the data side (3.79.0).
//
// The INTERFACE language (the switcher in the top bar) changes the
// screens only. A project's CONTENT — duties, tasks, analysis,
// clusters, outcomes, modules … — is written in one language, its
// ORIGINAL, and may keep translations of it. One version is SHOWN at
// a time; the shown one is what every tab, every export and every AI
// card works with.
//
// appState.contentLanguages (null until the user sets it):
//   {
//     original: 'en',               the language the content is written in
//     active:   'en' | 'ar' | …     the version shown now
//     versions: { ar: {
//        tm:   { <hash of original text>: { t: translation,
//                                            e: 1 = edited by a person,
//                                            w: previous edited wording
//                                               (its source changed) } },
//        keys: { <unit key>: <hash> } — which text each place had when
//                it was last translated (finds "source changed")
//        reviewed: bool, reviewedAt, updatedAt } },
//     foreign:  { <hash>: 'ar' } — texts added while a translation was
//               shown, still not in the original language
//     view:     null while the original is shown; otherwise
//               { lang, applied: { <group>: [[original, shown], …] },
//                 snapshot: JSON of the original project,
//                 appliedHash } — what is needed to go back exactly
//   }
//
// HOW SWITCHING WORKS. Nothing in the app has to know about languages.
// The project is captured (the same object that is saved), its texts
// are swapped, and it is applied back — exactly like opening a
// project. A translation is keyed by the ORIGINAL TEXT (its hash), so
// the same sentence is translated once wherever it appears, and a
// sentence that changes simply has no translation yet.
//
// Many texts are COPIES of others: a cluster lists its tasks' texts,
// a learning outcome keeps the criteria it links to, links themselves
// are keys made of text ("pc|cluster_1|<criterion>"), verification
// keeps task titles. Units (below) are only the places a text is
// WRITTEN; every other string in the project is mapped through the
// same original → translation table, so copies and text-based links
// always change together with their source. IDs, numbers, ratings,
// priorities and settings are never touched (DENY).
//
// Everything here is pure: state in, state out. settings_languages.js
// does the capturing, applying and the user interface.
// ============================================================

import { isSeededSkillText } from './state.js';

export const LANGS = ['en', 'ar', 'fr'];
export const LANG_NAMES = { en: 'English', ar: 'العربية', fr: 'Français' };
export const RTL = ['ar'];

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Short, stable hash of a text (FNV-1a 32-bit + length). */
export function hashText(s) {
  s = String(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36) + '.' + s.length.toString(36);
}

/* A list item keeps its bullet or number: "2. Wear PPE" is translated
   as "Wear PPE" and written back as "2. <translation>". The pattern is
   the one the app itself uses to clean criteria (task_analysis.js,
   supplementary_verification.js), so a link built from the cleaned
   text finds the same translation as the text it came from. */
const PREFIX = /^(\s*(?:[•\-*○●▪◦·]\s*)?(?:\d+[.)]\s*)?)/;
export function splitText(v) {
  v = String(v);
  const m = PREFIX.exec(v);
  const p = m ? m[1] : '';
  const rest = v.slice(p.length);
  const x = /\s*$/.exec(rest)[0];
  return [p, rest.slice(0, rest.length - x.length), x];
}

const translatable = (c) => /\p{L}/u.test(c);

function _isDefaultHeading(field, text) {
  const I = typeof window !== 'undefined' ? window.i18n : null;
  if (!I || !I.tIn || typeof document === 'undefined') return false;
  const el = document.getElementById(field + 'Heading');
  const key = el && el.getAttribute('data-i18n');
  if (!key) return false;
  const v = String(text).trim();
  return (I.languages ? I.languages() : LANGS).some(l => (I.tIn(key, l) || '').trim() === v);
}

/* ── Units: every place a content text is written ─────────────────
   key   — stable: built on ids (task:duty_1_2) or on a list position
           (ta:duty_1_2:performanceSteps#3)
   group — the list a positional unit belongs to (for alignment when
           items were added or removed while a translation was shown)
   text  — the text without its bullet / number
   set() — writes a new text back, keeping the bullet / number

   Default seeded wording (Skills Matrix rows, Additional Info headings
   never renamed) is NOT a unit: the app has it in every language and
   switches it itself (i18n_defaults.js). */
export function collectUnits(s) {
  const units = [];
  const fins = [];
  const push = (key, group, text, set) => units.push({ key, group: group || key, text, set });

  const add = (key, holder, prop) => {
    if (!holder || typeof holder[prop] !== 'string') return;
    const [p, c, x] = splitText(holder[prop]);
    if (!translatable(c)) return;
    push(key, null, c, (t) => { holder[prop] = p + t + x; });
  };
  const addList = (base, arr) => {
    if (!Array.isArray(arr)) return;
    let n = 0;
    arr.forEach((v, i) => {
      if (typeof v !== 'string') return;
      const [p, c, x] = splitText(v);
      if (!translatable(c)) return;
      push(`${base}#${n++}`, base, c, (t) => { arr[i] = p + t + x; });
    });
  };
  /* A textarea holding one item per line: one unit per line. */
  const addBlock = (base, holder, prop) => {
    if (!holder || typeof holder[prop] !== 'string' || !holder[prop]) return;
    const lines = holder[prop].split('\n');
    let n = 0;
    lines.forEach((ln, i) => {
      const [p, c, x] = splitText(ln);
      if (!translatable(c)) return;
      push(`${base}#${n++}`, base, c, (t) => { lines[i] = p + t + x; });
    });
    if (n) fins.push(() => { holder[prop] = lines.join('\n'); });
  };
  // prerequisites hold module ids; shortName is a code-like label.
  const SKIP = new Set(['id', 'code', 'credits', 'hours', 'qty', 'splitOverride', 'level', 'levels',
                        'prerequisites', 'shortName']);
  const addTree = (base, holder, prop) => {
    const v = holder[prop];
    if (typeof v === 'string') return add(base, holder, prop);
    if (Array.isArray(v)) {
      if (v.every(x => x == null || typeof x === 'string')) return addList(base, v);
      v.forEach((x, i) => {
        if (x && typeof x === 'object') Object.keys(x).forEach(k => {
          if (!SKIP.has(k) && k[0] !== '_') addTree(`${base}#${i}.${k}`, x, k);
        });
      });
      return;
    }
    if (v && typeof v === 'object') Object.keys(v).forEach(k => {
      if (!SKIP.has(k) && k[0] !== '_') addTree(`${base}.${k}`, v, k);
    });
  };

  // Chart Info — names of people (facilitators, panel) are not translated.
  const ci = s._chartInfo || {};
  ['occupationTitle', 'jobTitle', 'scopeOfWork', 'sector', 'context', 'venue', 'producedFor', 'producedBy']
    .forEach(f => add('ci:' + f, ci, f));

  // Additional Info
  const ai = s._additionalInfo || {};
  const heads = ai.headings || {};
  Object.keys(heads).forEach(k => {
    if (!_isDefaultHeading(k, heads[k])) add('aih:' + k, heads, k);
  });
  const content = ai.content || {};
  Object.keys(content).forEach(k => addBlock('ai:' + k, content, k));
  (ai.customSections || []).forEach((cs, i) => {
    if (!cs) return;
    add(`aics:${i}:h`, cs, 'heading');
    addBlock(`aics:${i}`, cs, 'content');
  });

  // Duties and tasks
  (s.dutiesData || []).forEach(d => {
    if (!d) return;
    add('duty:' + d.id, d, 'title');
    (d.tasks || []).forEach(t => t && add('task:' + t.inputId, t, 'text'));
  });

  // Task Analysis — every section, standard or added; AI-draft bookkeeping
  // (_aiDraft, _aiPrev …) holds copies and is mapped with them.
  const ta = s.taskAnalysisData || {};
  Object.keys(ta).forEach(taskId => {
    const rec = ta[taskId];
    if (!rec || typeof rec !== 'object') return;
    Object.keys(rec).forEach(sec => {
      if (sec[0] === '_') return;
      const v = rec[sec];
      if (Array.isArray(v)) addList(`ta:${taskId}:${sec}`, v);
      else if (typeof v === 'string') add(`ta:${taskId}:${sec}`, rec, sec);
    });
  });
  (s.taskAnalysisCustomSections || []).forEach(c => c && add('tacs:' + c.id, c, 'title'));

  // Competency clusters (their task lists are copies)
  ((s.clusteringData && s.clusteringData.clusters) || []).forEach(c => {
    if (!c) return;
    add(`cl:${c.id}:name`, c, 'name');
    add(`cl:${c.id}:range`, c, 'range');
    addList(`cl:${c.id}:pc`, c.performanceCriteria);
  });

  // Learning outcomes (their criteria are copies)
  ((s.learningOutcomesData && s.learningOutcomesData.outcomes) || [])
    .forEach(o => o && add('lo:' + o.id, o, 'statement'));

  // Modules (their outcomes are copies)
  ((s.moduleMappingData && s.moduleMappingData.modules) || []).forEach(m => {
    if (!m) return;
    ['title', 'rationale', 'description'].forEach(f => add(`mod:${m.id}:${f}`, m, f));
  });

  // Module curriculum — every text field of every module record
  const cur = s.moduleCurriculumData;
  if (cur && typeof cur === 'object') {
    if (cur.settings) add('cur:programme', cur.settings, 'programmeName');
    if (cur.byModule && typeof cur.byModule === 'object') {
      Object.keys(cur.byModule).forEach(mid => addTree('cur:' + mid, cur.byModule, mid));
    }
  }

  // Skills Level Matrix — rows the user typed or edited only
  (s.skillsLevelData || []).forEach(cat => {
    if (!cat) return;
    if (!isSeededSkillText(cat.category)) add(`slm:${cat.id}`, cat, 'category');
    (cat.competencies || []).forEach(c => {
      if (c && !isSeededSkillText(c.text)) add(`slm:${cat.id}:${c.id}`, c, 'text');
    });
  });
  (s.skillsLevelColumns || []).forEach(c => c && add('slcol:' + c.id, c, 'label'));

  // Supplementary verification — its items repeat Additional Info lines
  const sv = s.supplementaryVerification;
  ((sv && sv.categories) || []).forEach(cat => {
    if (!cat) return;
    add(`sv:${cat.id}:name`, cat, 'name');
    (cat.items || []).forEach(it => it && add(`sv:${cat.id}:${it.id}`, it, 'text'));
  });

  return { units, finish: () => fins.forEach(f => f()) };
}

/* ── Copies ─────────────────────────────────────────────────────── */

/* Values under these keys are ids, codes, dates, modes or names —
   never content, whatever text they happen to hold. */
const DENY = new Set([
  'id', 'inputId', 'divId', 'dutyId', 'taskId', 'clusterId', 'loId', 'moduleId',
  'number', 'track', 'code', 'source', 'addedAt', 'status', 'version',
  'dacumDate', 'dacumDateEnd', 'workshopFormat', 'collectionMode', 'workflowMode',
  'priorityFormula', 'trainingLoadMethod', 'tvExportMode', 'lwSessionId',
  'lwParticipantUrl', 'producedForImage', 'producedByImage', 'levelStyle',
  'labelMode', 'filePrefix', 'facilitators', 'observers', 'panelMembers',
  'contentLanguages', 'addedToClusterId', 'sourceLabel',
]);
const LINK = /^((?:ta|pc)\|[^|]*\|)([\s\S]*)$/;
/* The only objects whose KEYS are texts (criterion → task ids). Every
   other object is keyed by ids, which are never renamed. */
const TEXT_KEYED = new Set(['criterionTasks']);

function mapStr(v, map, lower) {
  if (!v || v.startsWith('data:') || v.startsWith('idb:')) return v;
  const lk = LINK.exec(v);
  if (lk) return lk[1] + mapStr(lk[2], map, lower);
  const [p, c, x] = splitText(v);
  if (map.has(c)) return p + map.get(c) + x;
  if (lower && lower.has(c)) return p + lower.get(c) + x;
  if (v.indexOf('\n') !== -1) {          // a whole textarea kept as a copy
    let ch = false;
    const out = v.split('\n').map(l => { const r = mapStr(l, map, lower); if (r !== l) ch = true; return r; });
    return ch ? out.join('\n') : v;
  }
  return v;
}

/** Every string (and object key) of `node` that is a known text is
 *  replaced through `map`; returns a new object where anything changed.
 *  `lower` (lower-cased map) applies only to the lists the app keeps in
 *  lower case (dismissed supplementary items). */
export function remapCopies(node, map, lower, key) {
  if (typeof node === 'string') return mapStr(node, map, key === 'dismissed' ? lower : null);
  if (Array.isArray(node)) {
    let out = null;
    node.forEach((x, i) => {
      const y = remapCopies(x, map, lower, key);
      if (y !== x) { out = out || node.slice(); out[i] = y; }
    });
    return out || node;
  }
  if (node && typeof node === 'object') {
    let changed = false;
    const keys = Object.keys(node);
    const names = _newKeys(keys, TEXT_KEYED.has(key) ? (k) => mapStr(k, map, null) : null);
    const out = {};
    keys.forEach((k, i) => {
      const val = node[k];
      const nv = DENY.has(k) ? val : remapCopies(val, map, lower, k);
      if (names[i] !== k || nv !== val) changed = true;
      out[names[i]] = nv;
    });
    return changed ? out : node;
  }
  return node;
}

/* New names for the keys of one object. A key keeps its name when the
   new one is taken — by a key that stays, or by an earlier rename — so
   two entries are never merged into one. */
function _newKeys(keys, rename) {
  if (!rename) return keys;
  const wanted = keys.map(k => { const n = rename(k); return n === undefined ? k : n; });
  const taken = new Set(keys.filter((k, i) => wanted[i] === k));
  return keys.map((k, i) => {
    const n = wanted[i];
    if (n === k) return k;
    if (taken.has(n)) return k;
    taken.add(n);
    return n;
  });
}

/* The way back for copies. Where the project still has the shape it had
   when the translation was shown, the original string at the same place
   (in the snapshot taken then) is restored — exact, even when two
   originals share one translation. Elsewhere the shown → original pairs
   are used. */
function backCopies(node, snap, fwd, pairs, key) {
  const lowF = key === 'dismissed' ? fwd.lower : null;
  const lowP = key === 'dismissed' ? pairs.lower : null;
  if (typeof node === 'string') {
    if (typeof snap === 'string' && mapStr(snap, fwd.map, lowF) === node) return snap;
    return mapStr(node, pairs.map, lowP);
  }
  if (Array.isArray(node)) {
    let out = null;
    const sa = Array.isArray(snap) ? snap : [];
    node.forEach((x, i) => {
      const y = backCopies(x, sa[i], fwd, pairs, key);
      if (y !== x) { out = out || node.slice(); out[i] = y; }
    });
    return out || node;
  }
  if (node && typeof node === 'object') {
    const so = (snap && typeof snap === 'object' && !Array.isArray(snap)) ? snap : {};
    const textKeyed = TEXT_KEYED.has(key);
    // live key → snapshot key (text-keyed objects: through the forward map)
    const snapKeyOf = new Map();
    if (textKeyed) Object.keys(so).forEach(sk => { const f = mapStr(sk, fwd.map, null); if (!snapKeyOf.has(f)) snapKeyOf.set(f, sk); });
    const keys = Object.keys(node);
    const names = _newKeys(keys, textKeyed
      ? (k) => (snapKeyOf.has(k) ? snapKeyOf.get(k) : mapStr(k, pairs.map, null)) : null);
    let changed = false;
    const out = {};
    keys.forEach((k, i) => {
      const val = node[k];
      const sk = textKeyed ? (snapKeyOf.has(k) ? snapKeyOf.get(k) : undefined) : k;
      const nv = DENY.has(k) ? val : backCopies(val, sk === undefined ? undefined : so[sk], fwd, pairs, k);
      if (names[i] !== k || nv !== val) changed = true;
      out[names[i]] = nv;
    });
    return changed ? out : node;
  }
  return node;
}

/* How alike two texts are (Dice coefficient over character pairs,
   0…1). Used only to tell a corrected translation from a new item. */
function _similar(a, b) {
  a = String(a).toLowerCase().replace(/\s+/g, ' ').trim();
  b = String(b).toLowerCase().replace(/\s+/g, ' ').trim();
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const ga = grams(a), gb = grams(b);
  let both = 0;
  ga.forEach((n, g) => { both += Math.min(n, gb.get(g) || 0); });
  return (2 * both) / (a.length - 1 + b.length - 1);
}

const _lowerOf = (map) => {
  const m = new Map();
  map.forEach((v, k) => { const lk = k.toLowerCase(); if (!m.has(lk)) m.set(lk, v.toLowerCase()); });
  return m;
};

/* ── The content-language record ─────────────────────────────────── */

export function stripCL(s) {
  const o = { ...s };
  delete o.contentLanguages;
  return o;
}

/** Guess the language a project is written in (for the first set-up). */
export function guessLanguage(s, uiLang) {
  const sample = collectUnits(s).units.slice(0, 200).map(u => u.text).join(' ');
  const ar = (sample.match(/[؀-ۿ]/g) || []).length;
  const lat = (sample.match(/[A-Za-zÀ-ſ]/g) || []).length;
  if (ar > lat) return 'ar';
  if (lat === 0) return LANGS.includes(uiLang) ? uiLang : 'en';
  if (/[àâçéèêëîïôûùüÿœæ]/i.test(sample) && (sample.match(/\b(le|la|les|des|du|et)\b/gi) || []).length > 3) return 'fr';
  return uiLang === 'fr' ? 'fr' : 'en';
}

export function newCL(original) {
  return { original, active: original, versions: {}, foreign: {}, view: null };
}

const _ver = (cl, lang) => {
  const v = (cl.versions && cl.versions[lang]) || {};
  return { tm: {}, keys: {}, reviewed: false, ...v, tm: { ...(v.tm || {}) }, keys: { ...(v.keys || {}) } };
};

/* ── Switching ─────────────────────────────────────────────────── */

/** Original shown → translation `lang` shown. Returns the new state. */
export function viewTranslation(s0, lang) {
  const s = clone(s0);
  const cl = s.contentLanguages;
  if (!cl) throw new Error('no content languages');
  if (cl.view) throw new Error('a translation is already shown');
  if (lang === cl.original) return s;
  const tm = _ver(cl, lang).tm;
  const bare = stripCL(s);
  const snapshot = JSON.stringify(bare);

  const map = new Map();
  const applied = {};
  collectUnits(bare).units.forEach(u => {
    const e = tm[hashText(u.text)];
    const tr = (e && typeof e.t === 'string' && e.t) ? e.t : u.text;
    (applied[u.group] = applied[u.group] || []).push([u.text, tr]);
    if (tr !== u.text && !map.has(u.text)) map.set(u.text, tr);
  });
  const out = map.size ? remapCopies(bare, map, _lowerOf(map)) : bare;
  out.contentLanguages = { ...cl, versions: { ...cl.versions }, active: lang,
    view: { lang, applied, snapshot, appliedHash: null } };
  return out;
}

/** Translation shown → original shown. Edits made meanwhile are kept:
 *  a changed text updates the translation (marked as edited); a text
 *  that was added is kept as it is and listed as not yet translated
 *  into the original. Returns { state, edited, added }. */
export function viewOriginal(s0, opts = {}) {
  const s = clone(s0);
  const cl = s.contentLanguages;
  const view = cl && cl.view;
  if (!view) return { state: s, edited: 0, added: 0 };
  const lang = view.lang;
  const bare = stripCL(s);

  // Nothing changed since it was shown → the original exactly as it was.
  if (!opts.noFastPath && view.snapshot && view.appliedHash &&
      hashText(JSON.stringify(bare)) === view.appliedHash) {
    const orig = JSON.parse(view.snapshot);
    orig.contentLanguages = { ...cl, active: cl.original, view: null };
    return { state: orig, edited: 0, added: 0 };
  }

  const ver = _ver(cl, lang);
  const foreign = { ...(cl.foreign || {}) };
  const { units } = collectUnits(bare);
  const groups = new Map();
  units.forEach(u => { if (!groups.has(u.group)) groups.set(u.group, []); groups.get(u.group).push(u); });

  const assign = new Map();     // unit key → original text
  const pairs = new Map();      // shown text → original text (for copies)
  let edited = 0, added = 0;
  const match = (u, a) => {
    const [orig, shown] = a;
    if (u.text !== shown) {
      const h = hashText(orig);
      ver.tm[h] = { t: u.text, e: 1 };
      ver.keys[u.key] = h;
      edited++;
    }
    assign.set(u.key, orig);
    if (!pairs.has(u.text)) pairs.set(u.text, orig);
    if (!pairs.has(shown)) pairs.set(shown, orig);     // copies still holding the old wording
  };
  const fresh = (u) => {
    const h = hashText(u.text);
    foreign[h] = lang;
    ver.tm[h] = { t: u.text, e: 1 };
    added++;
  };
  groups.forEach((live, g) => {
    const ap = (view.applied && view.applied[g]) || [];
    // 1) An item still showing the text it was given is that item —
    //    first where it stayed in place, then wherever it moved to.
    const used = new Set();
    const done = new Set();
    live.forEach((u, i) => {
      if (i < ap.length && ap[i][1] === u.text) { used.add(i); done.add(i); match(u, ap[i]); }
    });
    const left = [];
    live.forEach((u, i) => {
      if (done.has(i)) return;
      let j = -1;
      for (let k = 0; k < ap.length; k++) if (!used.has(k) && ap[k][1] === u.text) { j = k; break; }
      if (j >= 0) { used.add(j); match(u, ap[j]); } else left.push(i);
    });
    // 2) What is left was changed on this screen. A changed item is the
    //    left-over item at the same place (rewritten), or one whose
    //    shown text it still resembles (a corrected translation that
    //    moved); anything else was added here, and left-over items
    //    were deleted.
    if (!left.length) return;
    const free = [];
    for (let k = 0; k < ap.length; k++) if (!used.has(k)) free.push(k);
    const paired = new Set();
    const pair = (i, k) => { paired.add(i); used.add(k); match(live[i], ap[k]); };
    if (left.length === free.length) {
      left.forEach((i, n) => {
        const k = free[n];
        if (i === k || _similar(live[i].text, ap[k][1]) >= 0.35) pair(i, k);
      });
    } else {
      const cand = [];
      left.forEach(i => free.forEach(k => {
        const sim = _similar(live[i].text, ap[k][1]);
        if (sim >= 0.35) cand.push([sim, -Math.abs(i - k), i, k]);
      }));
      cand.sort((x, y) => (y[0] - x[0]) || (y[1] - x[1]));
      cand.forEach(([, , i, k]) => { if (!paired.has(i) && !used.has(k)) pair(i, k); });
      left.forEach(i => { if (!paired.has(i) && i < ap.length && !used.has(i)) pair(i, i); });
    }
    left.forEach(i => { if (!paired.has(i)) fresh(live[i]); });
  });

  const fwd = new Map();
  Object.keys(view.applied || {}).forEach(g => view.applied[g].forEach(([o, t]) => {
    if (t !== o && !fwd.has(o)) fwd.set(o, t);
  }));
  let snap = null;
  try { snap = view.snapshot ? JSON.parse(view.snapshot) : null; } catch (e) { snap = null; }
  const out = backCopies(bare, snap, { map: fwd, lower: _lowerOf(fwd) },
                                    { map: pairs, lower: _lowerOf(pairs) });
  const again = collectUnits(out);
  again.units.forEach(u => { if (assign.has(u.key)) u.set(assign.get(u.key)); });
  again.finish();

  if (edited || added) ver.updatedAt = Date.now();
  out.contentLanguages = { ...cl, versions: { ...cl.versions, [lang]: ver }, foreign,
    active: cl.original, view: null };
  return { state: out, edited, added };
}

/* ── Status of each version ──────────────────────────────────────── */

/** The distinct original texts of the project, in order. */
export function originalTexts(s) {
  const cl = s.contentLanguages;
  const seen = new Set();
  const out = [];
  const take = (t) => { if (!seen.has(t)) { seen.add(t); out.push(t); } };
  if (cl && cl.view && cl.view.applied) {
    Object.keys(cl.view.applied).forEach(g => cl.view.applied[g].forEach(a => take(a[0])));
  } else {
    collectUnits(stripCL(s)).units.forEach(u => take(u.text));
  }
  return out;
}

export function versionStats(s, lang) {
  const cl = s.contentLanguages;
  const texts = originalTexts(s);
  const tm = (cl && cl.versions && cl.versions[lang] && cl.versions[lang].tm) || {};
  let done = 0, edited = 0, flagged = 0;
  texts.forEach(t => {
    const e = tm[hashText(t)];
    if (!e) return;
    done++;
    if (e.e) edited++;
    if (e.w !== undefined) flagged++;
  });
  return { total: texts.length, done, missing: texts.length - done, edited, flagged };
}

/** Texts added while a translation was shown and not yet translated
 *  into the original: [{ text, lang }]. Original view only. */
export function foreignTexts(s) {
  const cl = s.contentLanguages;
  if (!cl || cl.view || !cl.foreign) return [];
  return originalTexts(s)
    .map(text => ({ text, lang: cl.foreign[hashText(text)] }))
    .filter(x => x.lang && x.lang !== cl.original);
}

/* ── Translating ─────────────────────────────────────────────────── */

/** What has to be sent to the AI to bring version `to` up to date.
 *  Original view only. from = cl.original or a reviewed version.
 *  all = also re-translate texts already translated (never the ones
 *  a person edited). Returns { items: [{ h, src, was? }], noSource }. */
export function planTranslation(s, { from, to, all = false }) {
  const cl = s.contentLanguages;
  const { units } = collectUnits(stripCL(s));
  const target = _ver(cl, to);
  const source = from === cl.original ? null : _ver(cl, from);
  const items = [];
  const seen = new Set();
  let noSource = 0;
  units.forEach(u => {
    const h = hashText(u.text);
    if (seen.has(h)) return;
    seen.add(h);
    const have = target.tm[h];
    if (have && (!all || have.e)) return;
    let src = u.text;
    if (source) {
      const e = source.tm[h];
      if (!e || !e.t) { noSource++; return; }
      src = e.t;
    }
    const item = { h, src };
    // Its place had another text before, translated and edited by hand:
    // keep that wording visible for the reviewer.
    const old = target.keys[u.key];
    if (old && old !== h && target.tm[old] && target.tm[old].e) item.was = target.tm[old].t;
    items.push(item);
  });
  return { items, noSource };
}

/** Store AI results into version `to` (new object). results: [{h,t,was?}] */
export function storeTranslations(cl, to, results) {
  const ver = _ver(cl, to);
  results.forEach(r => {
    if (!r || !r.h || typeof r.t !== 'string' || !r.t.trim()) return;
    const e = { t: r.t };
    if (r.was !== undefined) e.w = r.was;
    ver.tm[r.h] = e;
  });
  ver.updatedAt = Date.now();
  if (results.length) ver.reviewed = false;
  return { ...cl, versions: { ...cl.versions, [to]: ver } };
}

/** After a run: remember which text each place had, and drop
 *  translations of texts no longer in the project. Original view. */
export function tidyVersion(s, lang) {
  const cl = s.contentLanguages;
  const ver = _ver(cl, lang);
  const { units } = collectUnits(stripCL(s));
  const live = new Set();
  units.forEach(u => {
    const h = hashText(u.text);
    live.add(h);
    if (ver.tm[h]) ver.keys[u.key] = h;
  });
  // Wording a person wrote is kept even when its text is gone for now
  // (a duty deleted and brought back with Undo finds it again).
  Object.keys(ver.tm).forEach(h => { if (!live.has(h) && !ver.tm[h].e) delete ver.tm[h]; });
  Object.keys(ver.keys).forEach(k => { if (!live.has(ver.keys[k])) delete ver.keys[k]; });
  return { ...cl, versions: { ...cl.versions, [lang]: ver } };
}

/** Replace texts of the ORIGINAL (shown) project: pairs [{from, to}].
 *  Used when items added in a translation are translated back. The
 *  version they came from keeps their wording as an edited translation. */
export function replaceOriginalTexts(s0, pairs) {
  const s = clone(s0);
  const cl = s.contentLanguages;
  const map = new Map();
  pairs.forEach(p => { if (p.from && p.to && p.from !== p.to) map.set(p.from, p.to); });
  const bare = stripCL(s);
  const out = map.size ? remapCopies(bare, map, _lowerOf(map)) : bare;
  const again = collectUnits(out);
  again.units.forEach(u => { if (map.has(u.text)) u.set(map.get(u.text)); });
  again.finish();
  const foreign = { ...(cl.foreign || {}) };
  const versions = { ...cl.versions };
  pairs.forEach(p => {
    const oldH = hashText(p.from);
    const lang = foreign[oldH];
    delete foreign[oldH];
    if (!lang || !versions[lang]) return;
    const ver = _ver({ versions }, lang);
    delete ver.tm[oldH];
    ver.tm[hashText(p.to)] = { t: p.from, e: 1 };
    versions[lang] = ver;
  });
  out.contentLanguages = { ...cl, versions, foreign };
  return out;
}

/** A state restored from a saved snapshot or a crash backup carries the
 *  content-language record of its own moment. Its view (which version
 *  its texts are in) must be kept; the translations made since are
 *  kept too — they are knowledge about texts, not part of the content.
 *  No record (taken before 3.79.0 or before languages were set): its
 *  texts are the original's. */
export function mergeRestoredCL(restored, current) {
  if (!restored) return current ? { ...current, active: current.original, view: null } : null;
  if (!current || current.original !== restored.original) return restored;
  return { ...restored,
    versions: { ...(restored.versions || {}), ...(current.versions || {}) },
    foreign: { ...(restored.foreign || {}), ...(current.foreign || {}) } };
}

/** Translations edited in the review list: [{ h, t }]. */
export function editTranslations(cl, lang, edits) {
  const ver = _ver(cl, lang);
  edits.forEach(x => {
    if (!x || !x.h) return;
    const t = String(x.t || '');
    if (!t.trim()) delete ver.tm[x.h];
    else ver.tm[x.h] = { t, e: 1 };
  });
  ver.updatedAt = Date.now();
  return { ...cl, versions: { ...cl.versions, [lang]: ver } };
}
