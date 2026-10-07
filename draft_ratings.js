// ============================================================
//  draft_ratings.js — generated Task Verification draft
//  DACUM Live Pro
// ------------------------------------------------------------
//  READ THIS BEFORE CHANGING ANYTHING HERE
//
//  These scores are NOT verification. Verification is what a panel
//  of practitioners says when asked "how often do YOU do this, how
//  critical is it in YOUR work, how hard was it to learn". The
//  numbers below are a model's guess at what such a panel might
//  say — useful as a starting grid to react to in a workshop,
//  worthless as evidence.
//
//  Everything this file produces is tagged unverified by the
//  caller and blocked from every export until a human accepts it.
//  If you ever find yourself removing that tag automatically, stop:
//  that single change would turn the tool from a DACUM instrument
//  into a machine for manufacturing credible-looking findings.
// ============================================================

import { appState }                     from './state.js';
import { showStatus }                   from './renderer.js';
import { checkUsageLimit, incrementUsage,
         showLoadingModal, hideLoadingModal } from './storage.js';
import { getDutyLetter }                from './codes.js';
import { showAIServiceError, callAI } from './ai_client.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);


/** Collect the duties and tasks currently on the chart. */
function _readChart() {
  const duties = [];
  document.querySelectorAll('#dutiesContainer [data-duty-id]').forEach(() => {});

  (appState.dutiesData || []).forEach((d, i) => {
    const title = (d.title || '').trim();
    const kept = (d.tasks || [])
      .map(t => ({ text: (typeof t === 'string' ? t : (t.text || '')).trim(),
                   id:   typeof t === 'string' ? null : t.inputId }))
      .filter(t => t.text);
    if (title && kept.length) {
      // ids travel with the texts (3.80.0): blank tasks and untitled
      // duties are skipped here, so a position can no longer be used
      // to find the task again in appState.dutiesData.
      duties.push({ letter: getDutyLetter(i), title, tasks: kept.map(t => t.text), ids: kept.map(t => t.id) });
    }
  });
  return duties;
}

function _buildPrompt(duties) {
  const chart = duties.map(d =>
    `${d.letter}. ${d.title}\n` +
    d.tasks.map((t, i) => `   ${d.letter}${i + 1}. ${t}`).join('\n')
  ).join('\n\n');

  return `You are assisting a DACUM facilitator PREPARING for a verification
workshop. You are NOT replacing the workshop panel.

Produce a first-pass estimate for each task on three independent 0-3 scales,
so the facilitator has a grid to react to rather than a blank one. The panel
will overwrite these.

SCALES (use whole integers 0-3 only):
- importance: 0 = not important, 1 = somewhat, 2 = important, 3 = critical
- frequency:  how often THE WORKER performs it. 0 = rarely, 1 = sometimes,
              2 = often, 3 = daily. Count the worker's repetitions, not how
              often one client or one unit needs it.
- difficulty: how hard it is to LEARN. 0 = easy, 1 = moderate,
              2 = challenging, 3 = very difficult

RULES:
- Rate EVERY task listed. Do not add, merge, reword or drop any task.
- Spread the scores. A grid where everything is 2 or 3 is useless as a
  starting point; real occupations have easy frequent tasks and hard rare ones.
- Difficulty is about learning, not about physical effort.

CHART:
${chart}

OUTPUT FORMAT (STRICT - NO EXTRA TEXT):
Return ONLY valid JSON:

{
  "ratings": [
    { "code": "A1", "importance": 3, "frequency": 2, "difficulty": 1 }
  ]
}`;
}

export async function generateDraftRatings() {
  const duties = _readChart();
  if (!duties.length) {
    showStatus(_t('msgNoDutiesDesc'), 'error');
    return false;
  }

  const usage = checkUsageLimit();
  if (!usage.allowed) {
    showStatus('\u274C ' + _tf('msgDailyLimit', { n: usage.count }), 'error');
    return false;
  }

  showLoadingModal();   // no-op during a Full Draft run

  try {
    // 3.74.0: one shared call (ai_client.js callAI).
    const json = await callAI(_buildPrompt(duties));

    _applyRatings(json.ratings || [], duties);
    incrementUsage();
    return true;
  } catch (err) {
    console.error('[draft-ratings]', err);
    showStatus(_tf('msgAIFailed', {}), 'error');
    showAIServiceError(err, { safeKey: 'aiSvcSafeGeneric' });
    return false;
  } finally {
    hideLoadingModal();
  }
}

/**
 * Write the scores into the SURVEY slot, never the workshop slot.
 *
 * appState.workshopResults carries per-level response counts — how many
 * panel members chose each score. There are no respondents here, so
 * populating it would fabricate a panel that never met. The survey slot
 * holds one respondent's ratings, which is a closer description of what
 * a model's single guess actually is.
 */
function _applyRatings(ratings, duties) {
  const byCode = {};
  ratings.forEach(r => {
    if (!r || !r.code) return;
    byCode[String(r.code).trim().toUpperCase()] = r;
  });

  appState.verificationRatings = appState.verificationRatings || {};

  duties.forEach(d => {
    d.tasks.forEach((_, ti) => {
      const hit = byCode[(d.letter + (ti + 1)).toUpperCase()];
      if (!hit) return;
      // 3.80.0: keyed by the task's inputId, the key the verification
      // table, the chart and the exports read. Before this the key was
      // "<dutyId>_task_<index>", which nothing reads, so drafted ratings
      // never appeared. normalizeDraftRatingKeys() (tasks.js) moves the
      // ratings of projects drafted before the fix.
      const key = d.ids[ti];
      if (!key) return;
      appState.verificationRatings[key] = {
        importance:  _clamp(hit.importance),
        frequency:   _clamp(hit.frequency),
        difficulty:  _clamp(hit.difficulty),
        criticality: null,
      };
    });
  });

  // Survey mode, for the reason given above.
  appState.collectionMode = 'survey';
}

/** Anything outside 0-3 is a model error, not a score. */
function _clamp(v) {
  const n = Math.round(Number(v));
  if (!isFinite(n)) return null;
  return Math.min(3, Math.max(0, n));
}
