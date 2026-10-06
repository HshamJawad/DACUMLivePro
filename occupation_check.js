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

const _key = (title, lang, job = '') => lang + '\u0000' + title.trim().toLowerCase() +
  '\u0000' + String(job || '').trim().toLowerCase();

/* 3.72.0: the Job Title is checked in the same call — that it is a
   real job and that it belongs to the occupation (DACUM analyses the
   job; the occupation is its family). */
export const JOB_VERDICT = {
  FITS:      'fits',
  TYPO:      'likely_typo',
  MISMATCH:  'not_in_occupation',
  UNKNOWN:   'unknown',
  UNCHECKED: 'unchecked',
};

/* Verdicts. `unchecked` is not a fourth classification the model can
   return — it is what WE record when we could not ask. */
export const VERDICT = {
  KNOWN:     'known',
  TYPO:      'likely_typo',
  UNKNOWN:   'unknown',
  UNCHECKED: 'unchecked',
};

function _prompt(title, lang, job = '') {
  const langName = lang === 'ar' ? 'Arabic' : lang === 'fr' ? 'French' : 'English';
  const jobBlock = job ? `

SECOND STRING — JOB TITLE: ${JSON.stringify(job)}
In DACUM the chart describes this JOB; the occupation above is only its
wider family. Judge the job title with exactly one "job_verdict":
  "fits"              a real job or role that plausibly belongs to the
                      occupation, or is the occupation itself (the same
                      string as the occupation is "fits").
  "likely_typo"       a misspelling of a specific real job you can name.
                      Put that job in "job_suggestion".
  "not_in_occupation" a real job, but clearly from a different occupation
                      (e.g. occupation "Maintenance Technician", job
                      "Accountant").
  "unknown"           not recognisable as a job or role.
Be generous: specialisations, local or dialect names, emerging roles and
seniority variants are "fits". "job_reason" is ONE short sentence in
${langName} for the user; omit it when "fits".` : '';

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

${jobBlock}

Return ONLY this JSON, no prose, no code fences:
{"verdict":"known|likely_typo|unknown","suggestion":"","standard_name":"","reason":""${
  job ? ',"job_verdict":"fits|likely_typo|not_in_occupation|unknown","job_suggestion":"","job_reason":""' : ''}}`;
}

/**
 * Classify an occupation title.
 *
 * @param  {string} title
 * @returns {Promise<{verdict:string, suggestion:string,
 *                    standardName:string, reason:string, title:string}>}
 */
export async function verifyOccupation(title, jobTitle = '') {
  const clean = String(title || '').trim();
  const job   = String(jobTitle || '').trim();
  const lang  = window.i18n && window.i18n.getLang ? window.i18n.getLang() : 'en';

  const noJob = { verdict: JOB_VERDICT.UNCHECKED, suggestion: '', reason: '' };
  const miss = { verdict: VERDICT.UNCHECKED, suggestion: '', standardName: '', reason: '',
                 title: clean, jobTitle: job, job: noJob };
  if (!clean) return miss;

  const key = _key(clean, lang, job);
  if (_cache.has(key)) return _cache.get(key);

  let result;
  try {
    const res = await fetch(`${BACKEND_URL}/api/generate-dacum`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt: _prompt(clean, lang, job) })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    const text = (data?.content || []).map(b => (b && b.type === 'text' ? b.text : '')).join('');
    if (!text.trim()) throw new Error('empty response');

    const body = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(body); }
    catch (_) {
      const a = body.indexOf('{'), b = body.lastIndexOf('}');
      parsed = JSON.parse(body.slice(a, b + 1));
    }

    const verdict = [VERDICT.KNOWN, VERDICT.TYPO, VERDICT.UNKNOWN]
      .includes(parsed.verdict) ? parsed.verdict : VERDICT.UNCHECKED;

    result = {
      verdict,
      suggestion:   String(parsed.suggestion    || '').trim(),
      standardName: String(parsed.standard_name || '').trim(),
      reason:       String(parsed.reason        || '').trim(),
      title:        clean,
      jobTitle:     job,
      job:          noJob,
    };

    if (job) {
      const jv = [JOB_VERDICT.FITS, JOB_VERDICT.TYPO, JOB_VERDICT.MISMATCH, JOB_VERDICT.UNKNOWN]
        .includes(parsed.job_verdict) ? parsed.job_verdict : JOB_VERDICT.UNCHECKED;
      result.job = {
        verdict:    jv,
        suggestion: String(parsed.job_suggestion || '').trim(),
        reason:     String(parsed.job_reason     || '').trim(),
      };
      if (result.job.verdict === JOB_VERDICT.TYPO && !result.job.suggestion) {
        result.job.verdict = JOB_VERDICT.UNKNOWN;
      }
    }

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

/** True when the occupation title itself should be questioned. */
function _occNeeds(result) {
  return result.verdict === VERDICT.TYPO || result.verdict === VERDICT.UNKNOWN;
}
/** True when the job title should be questioned (3.72.0). */
function _jobNeeds(result) {
  const v = result && result.job && result.job.verdict;
  return v === JOB_VERDICT.TYPO || v === JOB_VERDICT.MISMATCH || v === JOB_VERDICT.UNKNOWN;
}

/** True when the titles should be questioned before generating. */
export function needsConfirmation(result) {
  return !!result && (_occNeeds(result) || _jobNeeds(result));
}

/**
 * What the warning should say, for both warning cards (Duties & Tasks,
 * Full Draft). The occupation is asked about first; the job only when
 * the occupation is fine. `field` is the Chart Info input to correct.
 */
export function describeCheck(result) {
  const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
  if (_occNeeds(result)) {
    const isTypo = result.verdict === VERDICT.TYPO;
    return {
      field: 'occupationTitle', isTypo, suggestion: result.suggestion,
      title: isTypo ? _tf('occWarnTypoTitle', { v: result.suggestion }) : _t('occWarnUnknownTitle'),
      body:  result.reason || _t(isTypo ? 'occWarnTypoBody' : 'occWarnUnknownBody'),
      typed: _tf('occWarnYouTyped', { v: result.title }),
      editLabel: _t('occBtnEdit'),
    };
  }
  const j = result.job || {};
  const isTypo = j.verdict === JOB_VERDICT.TYPO;
  const titleKey = isTypo ? 'jobWarnTypoTitle'
                 : j.verdict === JOB_VERDICT.MISMATCH ? 'jobWarnMismatchTitle' : 'jobWarnUnknownTitle';
  const bodyKey  = isTypo ? 'jobWarnTypoBody'
                 : j.verdict === JOB_VERDICT.MISMATCH ? 'jobWarnMismatchBody' : 'jobWarnUnknownBody';
  return {
    field: 'jobTitle', isTypo, suggestion: j.suggestion,
    title: _tf(titleKey, { v: j.suggestion, occ: result.title }),
    body:  j.reason || _tf(bodyKey, { occ: result.title }),
    typed: _tf('jobWarnYouTyped', { job: result.jobTitle, occ: result.title }),
    editLabel: _t('jobBtnEdit'),
  };
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
// 3.72.0: keyed on the occupation + job PAIR — accepting a job for one
// occupation says nothing about the same job under another.
const _bk = (title, job) => String(title || '').trim().toLowerCase() +
  '\u0000' + String(job || '').trim().toLowerCase();

export function markBypassed(title, job = '') {
  _bypassed.add(_bk(title, job));
}

export function wasBypassed(title, job = '') {
  return _bypassed.has(_bk(title, job));
}

/** Applying a suggestion invalidates the bypass for the OLD pair only. */
export function clearBypass(title, job = '') {
  _bypassed.delete(_bk(title, job));
}
