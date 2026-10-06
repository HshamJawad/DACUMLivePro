// ============================================================
//  occupation_check.js — occupation-title sanity gate
//  DACUM Live Pro
// ------------------------------------------------------------
//  THE PROBLEM
//
//  Every AI path in this app is rooted in one free-text field.
//  The only guard on it was `.trim()` being non-empty, so a
//  single character, a typo, or keyboard noise all passed.
//
//  A language model completes; it does not verify. The generation
//  prompt in projects.js calls the title "BASE CONTEXT" — an
//  assumed fact — and then demands "valid JSON format only". Even
//  if the model doubted the input, we left it no channel to say
//  so: the only permitted output is a duties array. So it builds
//  a plausible chart around whatever it was given.
//
//  The dangerous case is not gibberish. It is the typo that lands
//  on a NEIGHBOURING REAL OCCUPATION — a chart that is internally
//  perfect and about the wrong job, with nothing in it to betray
//  the drift. In a Full Draft that error is the root of a chain
//  seven stages deep and costs the whole daily quota.
//
//  WHAT THIS DOES — AND DELIBERATELY DOES NOT
//
//  One short classification call, before any generation. It never
//  edits the field. A curriculum expert may legitimately enter a
//  local Iraqi trade name the model has not met, and silently
//  replacing that with a "corrected" standard term would destroy
//  their intent with total confidence — worse than the typo.
//  The user decides; this module only asks.
//
//  It FAILS OPEN. If the backend is down, the response is
//  unparseable, or anything else goes wrong, the verdict is
//  `unchecked` and generation proceeds. A sanity check that can
//  block the app when it breaks is a worse liability than the
//  problem it solves.
// ============================================================

import { BACKEND_URL } from './ai_client.js';

const _t = (k) => (window.i18n ? window.i18n.t(k) : k);

/* Cache keyed by title + language. Retries after "Generate Anyway",
   the Full Draft pre-check and the duties-tab button all ask about
   the same string; charging the user a round trip each time would
   make the gate feel like a tax. Cleared only by a reload — the
   answer for a given string does not change within a session. */
const _cache = new Map();

const _key = (title, lang) => lang + '\u0000' + title.trim().toLowerCase();

/* Verdicts. `unchecked` is not a fourth classification the model can
   return — it is what WE record when we could not ask. */
export const VERDICT = {
  KNOWN:     'known',
  TYPO:      'likely_typo',
  UNKNOWN:   'unknown',
  UNCHECKED: 'unchecked',
};

function _prompt(title, lang) {
  const langName = lang === 'ar' ? 'Arabic' : lang === 'fr' ? 'French' : 'English';

  return `You are validating a single input field before an occupational
analysis tool generates a DACUM chart from it. You are NOT generating
a chart. Classify the string below and return JSON only.

INPUT STRING: ${JSON.stringify(title)}

WHAT COUNTS AS A VALID OCCUPATION TITLE:
- A recognised occupation, trade, craft or job role, at any skill level.
- Standard-classification names are ideal (Arab Standard Classification
  of Occupations, ISCO-08), but are NOT required.
- Emerging and newly-created occupations are valid when the name is
  clear and aligns with international naming conventions
  (e.g. "Solar PV Installer", "Drone Operator", "Data Annotator").
- Regional, dialect and colloquial trade names ARE VALID when the trade
  is identifiable. A curriculum expert in Iraq or the Gulf may write a
  local name on purpose. Classify these as "known" and put the standard
  equivalent in "standard_name" WITHOUT changing the verdict.
- A title may be in Arabic, French or English regardless of interface
  language. Do not penalise the language of the input.

WHAT IS NOT VALID:
- Misspellings of a real occupation.
- Random characters, keyboard noise, placeholder text ("test", "asdf"),
  single letters, or a lone number.
- Words that are not occupations at all (an object, a place, a company,
  a person's name, a bare sector such as "construction").

VERDICTS — choose exactly one:
  "known"        the string identifies a real occupation.
  "likely_typo"  it is a misspelling of a specific real occupation you
                 can name. Put that occupation in "suggestion".
  "unknown"      not recognisable as any occupation. No suggestion
                 unless you are genuinely confident of one.

RULES:
- Be strict about typos and noise; that is the entire purpose here.
- Be generous about legitimate variety: dialect, emerging occupations
  and non-standard-but-clear names are "known".
- Never invent an occupation to make an input valid.
- "reason" must be ONE short sentence written in ${langName}, addressed
  to the user, explaining the verdict. Omit it when the verdict is
  "known".

Return ONLY this JSON, no prose, no code fences:
{"verdict":"known|likely_typo|unknown","suggestion":"","standard_name":"","reason":""}`;
}

/**
 * Classify an occupation title.
 *
 * @param  {string} title
 * @returns {Promise<{verdict:string, suggestion:string,
 *                    standardName:string, reason:string, title:string}>}
 */
export async function verifyOccupation(title) {
  const clean = String(title || '').trim();
  const lang  = window.i18n && window.i18n.getLang ? window.i18n.getLang() : 'en';

  const miss = { verdict: VERDICT.UNCHECKED, suggestion: '', standardName: '', reason: '', title: clean };
  if (!clean) return miss;

  const key = _key(clean, lang);
  if (_cache.has(key)) return _cache.get(key);

  let result;
  try {
    const res = await fetch(`${BACKEND_URL}/api/generate-dacum`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt: _prompt(clean, lang) })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error('empty response');

    const parsed = JSON.parse(
      text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    );

    const verdict = [VERDICT.KNOWN, VERDICT.TYPO, VERDICT.UNKNOWN]
      .includes(parsed.verdict) ? parsed.verdict : VERDICT.UNCHECKED;

    result = {
      verdict,
      suggestion:   String(parsed.suggestion    || '').trim(),
      standardName: String(parsed.standard_name || '').trim(),
      reason:       String(parsed.reason        || '').trim(),
      title:        clean,
    };

    /* A typo verdict with nothing to suggest is not actionable — the
       user would be told they are wrong and offered no way forward.
       Demote it to "unknown", which at least reads honestly. */
    if (result.verdict === VERDICT.TYPO && !result.suggestion) {
      result.verdict = VERDICT.UNKNOWN;
    }
  } catch (err) {
    console.warn('[occupation-check] verification unavailable, proceeding:', err);
    result = miss;
  }

  _cache.set(key, result);
  return result;
}

/** True when the title should be questioned before generating. */
export function needsConfirmation(result) {
  return result.verdict === VERDICT.TYPO || result.verdict === VERDICT.UNKNOWN;
}

/* ── Bypass ledger ────────────────────────────────────────────
   Once the user has looked at the warning for a specific string and
   chosen to proceed, that decision holds for that string.

   This differs on purpose from the Scope warning, which re-appears on
   every attempt. Scope asks the user to ADD something they may still
   add; this asks them to confirm a judgement they have already made.
   Re-asking would train them to click through it, which is exactly
   how a gate stops working. */
const _bypassed = new Set();

export function markBypassed(title) {
  _bypassed.add(String(title || '').trim().toLowerCase());
}

export function wasBypassed(title) {
  return _bypassed.has(String(title || '').trim().toLowerCase());
}

/** Applying a suggestion invalidates the bypass for the OLD string only. */
export function clearBypass(title) {
  _bypassed.delete(String(title || '').trim().toLowerCase());
}
