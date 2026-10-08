// ============================================================
// /wording_check.js  (3.88.0)
// ------------------------------------------------------------
// Gentle wording notes for competency statements (cluster names),
// performance criteria and learning outcomes. A note is a SUGGESTION:
// it never blocks saving, generating or exporting, and it changes no
// data. It only states which writing rule a statement seems to miss.
//
// The rules are the ones the app already teaches in its help and
// gives the AI (clustering_ai.js, learning_outcomes_ai.js), following
// Norton's DACUM conventions:
//   • competency statement — Action Verb + What + Context, concise,
//     unique, the standard kept and the purpose left out;
//   • performance criterion — a statement of the result:
//     What + is/are + verb + qualifier (standard);
//   • learning outcome — one observable verb in the base form, no
//     "The learner will…", no understand/know/learn, 6–20 words.
//
// LANGUAGE. Checks that read grammar (verb first, is/are, -ing …) run
// only on ENGLISH content: they are reliable there and would misfire
// in Arabic or French. Checks that do not read grammar (a repeated
// competency, a very long one) run in every language. The language is
// the content language of the project (content_lang.js) when one is
// set; otherwise each text is judged on its own letters.
// ============================================================

import { appState } from './state.js';

const _t = (k) => (window.i18n ? window.i18n.t(k) : k);
/* Each value is wrapped in Unicode isolates (FSI … PDI) so an English
   phrase quoted inside an Arabic sentence keeps its own direction. */
const _tf = (k, vars) => String(_t(k)).replace(/\{(\w+)\}/g,
  (m, v) => (v in vars ? '\u2068' + vars[v] + '\u2069' : m));
const _esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── Language ─────────────────────────────────────────────────── */

const _ARABIC = /[؀-ۿ]/;
const _FRENCH = /[àâçéèêëîïôûùüÿœæ]/i;

/** True when the grammar checks should run on this text. */
export function isEnglishText(text) {
  const s = String(text || '');
  if (!/[A-Za-z]/.test(s) || _ARABIC.test(s)) return false;
  const cl = appState && appState.contentLanguages;
  if (cl && cl.active) return cl.active === 'en';
  return !_FRENCH.test(s);
}

/* ── Shared English patterns ──────────────────────────────────── */

const _COGNITIVE = /^(understand|understands|know|knows|learn|learns|appreciate|appreciates|be aware|is aware|are aware|be familiar|is familiar|are familiar)\b/i;
const _COGNITIVE_ANY = /\b(understands?|knows?|learns?|appreciates?|(?:is|are|be) aware of|(?:is|are|be) familiar with)\b/i;
const _WILL = /^((the\s+)?(learners?|students?|trainees?|participants?|workers?)\s+(will|should|must|can|shall)(\s+be\s+able\s+to)?|will\s+be\s+able\s+to|be\s+able\s+to|able\s+to|to)\b/i;
const _NOT_VERB = /^(the|a|an|this|that|these|those|all|each|every|any|its|their)\b/i;
const _PURPOSE = /\b(to ensure|in order to|so as to|so that)\b/i;
/* -ing words that are verbs in their base form, not gerunds. */
const _ING_OK = new Set(['bring', 'string', 'swing', 'sling', 'spring', 'ring', 'sing',
  'wring', 'fling', 'cling', 'sting', 'king', 'thing', 'wing', 'ping', 'ding']);
const _AUX = /\b(is|are|was|were|be|been|being)\b/i;

const _firstWord = (s) => (String(s).trim().match(/^[A-Za-z'-]+/) || [''])[0];
const _words = (s) => String(s).trim().split(/\s+/).filter(Boolean);

function _isGerund(w) {
  const l = w.toLowerCase();
  return l.length > 5 && l.endsWith('ing') && !_ING_OK.has(l);
}

/* Problems with how a verb-first statement STARTS (competency, outcome). */
function _startIssues(text) {
  const s = String(text).trim();
  const out = [];
  const will = s.match(_WILL);
  if (will) { out.push(_tf('wnWill', { w: will[0].trim() })); return out; }
  const cog = s.match(_COGNITIVE);
  if (cog) { out.push(_tf('wnCognitive', { w: cog[0] })); return out; }
  const w = _firstWord(s);
  if (_NOT_VERB.test(s)) out.push(_tf('wnStartVerb', { w }));
  else if (w && _isGerund(w)) out.push(_tf('wnGerund', { w }));
  return out;
}

function _purposeIssue(text) {
  const m = String(text).match(_PURPOSE);
  return m ? [_tf('wnPurpose', { w: m[0] })] : [];
}

/* ── Competency statement (cluster name) ──────────────────────── */

const _norm = (s) => String(s || '').toLowerCase()
  .normalize('NFKD').replace(/[ً-ٰٟ̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/* A name the app gave by default ("Cluster 1", or its translation)
   is a placeholder, not a statement: nothing to check yet. */
const _isPlaceholder = (name) => /^\S+\s*\d+$/.test(String(name || '').trim());

/** Notes for the name of clusters[index]. */
export function competencyNameIssues(clusters, index) {
  const name = String((clusters[index] || {}).name || '').trim();
  if (!name || _isPlaceholder(name)) return [];
  const out = [];
  const key = _norm(name);
  const twin = clusters.findIndex((c, i) => i !== index && _norm(c && c.name) === key);
  if (twin >= 0) out.push(_tf('wnNameDup', { n: 'C' + (twin + 1) }));
  const n = _words(name).length;
  if (n > 12) out.push(_tf('wnNameLong', { n }));
  if (isEnglishText(name)) out.push(..._startIssues(name), ..._purposeIssue(name));
  return out;
}

/* ── Performance criterion ────────────────────────────────────── */

export function criterionIssues(text) {
  const s = String(text || '').trim();
  if (!s || !isEnglishText(s)) return [];
  const out = [];
  const cog = s.match(_COGNITIVE_ANY);
  if (cog) out.push(_tf('wnCognitive', { w: cog[0] }));
  else if (!_AUX.test(s)) out.push(_t('wnPCResult'));
  out.push(..._purposeIssue(s));
  return out;
}

/* ── Learning outcome ─────────────────────────────────────────── */

export function outcomeIssues(text) {
  const s = String(text || '').trim();
  if (!s || !isEnglishText(s)) return [];
  const out = [..._startIssues(s), ..._purposeIssue(s)];
  const n = _words(s).length;
  if (n > 20) out.push(_tf('wnLOLong', { n }));
  return out;
}

/* ── Rendering ────────────────────────────────────────────────── */

/**
 * The note box. `lines` are plain-text messages (escaped here);
 * an empty list renders the box hidden, so it can be refreshed in
 * place without moving anything on the page.
 */
export function wordingNoteHtml(id, lines) {
  const body = lines.map(l => `<div>💬 ${_esc(l)}</div>`).join('');
  return `<div class="wording-note" id="${_esc(id)}" role="status" aria-live="polite"${lines.length ? '' : ' hidden'}>` +
    (lines.length ? `<div class="wording-note-head">${_esc(_t('wnHead'))}</div>` : '') + body + '</div>';
}

/** Replace an existing note box with a fresh one (no-op if absent). */
export function refreshWordingNote(id, lines) {
  const el = typeof document !== 'undefined' && document.getElementById(id);
  if (el) el.outerHTML = wordingNoteHtml(id, lines);
}
