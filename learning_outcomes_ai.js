// ============================================================
// /learning_outcomes_ai.js
// AI generation for the Learning Outcomes tab.
//
// Implements the three design patterns documented in the tab's help
// modal, as three explicit user choices rather than one "smart" button:
//
//   Pattern A — One-to-One:  each Performance Criterion becomes one
//               Learning Outcome. Grouping is fixed; only the WORDING
//               is generated.
//   Pattern B — Many-to-One: related criteria are integrated into
//               fewer, broader outcomes. Grouping IS the judgement.
//   Pattern C — Hybrid:      criteria that stand alone stay alone,
//               those that belong together are integrated.
//
// Note that unlike the module generator, Pattern A is NOT a local
// no-AI shortcut. A Learning Outcome is not a copy of a criterion with
// a new label: a criterion states the STANDARD an assessor checks
// against, while an outcome states what the LEARNER will be able to do.
// Converting one into the other is a rewriting task, so even the
// one-to-one case needs the model.
//
// The pattern is applied per run, not stored as a setting — the help
// modal is explicit that a facilitator may use a different pattern for
// each cluster, so the generator can be re-run per selection.
//
// Guarantees enforced in code, not merely requested in the prompt:
//   • Only EXISTING criterion ids are linked; invented ids are dropped.
//   • A criterion is never linked to two outcomes.
//   • Under Pattern A the 1:1 relationship is verified after the fact.
//   • Criteria the model ignored are reported, never silently lost.
// ============================================================

import { appState }   from './state.js';
import { showStatus } from './renderer.js';
import { renderPCSourceList, renderLearningOutcomes } from './modules.js';
import { checkUsageLimit, incrementUsage,
         showLoadingModal, hideLoadingModal } from './storage.js';
import { isBatchRun } from './draft_mode.js';
import { throwIfAIError, showAIServiceError } from './ai_client.js';


/* i18n access — resolved lazily; see duties.js for why. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

/* Output-language directive for the generation backend. Appended at the
   ONE place this module builds a request, so any prompt added later is
   covered without having to remember. Empty string in English. */
const _aiDir = () => (window.i18n ? window.i18n.aiDirective() : '');


const BACKEND_URL = 'https://dacum-ai-backend-production.up.railway.app';

// Integration bounds for Patterns B and C. Beyond ~5 criteria an
// outcome becomes too broad to assess as a single capability.
const MIN_PC_PER_LO = 2;
const MAX_PC_PER_LO = 5;

// ── Collect criteria ──────────────────────────────────────────

/**
 * Build the working set of criteria.
 * If the user has ticked boxes in the source list, only those are used
 * — that is the existing manual workflow and the AI must respect it.
 * With nothing ticked, every unused criterion in the chart is used.
 */
function _collectCriteria() {
  const cd = appState.clusteringData;
  const lo = appState.learningOutcomesData;
  const clusters = cd?.clusters || [];

  const used = new Set();
  (lo?.outcomes || []).forEach(o =>
    (o.linkedCriteria || []).forEach(pc => used.add(pc.id))
  );

  const checked = new Set(
    Array.from(document.querySelectorAll('#pcSourceList input[type="checkbox"]:checked'))
         .map(cb => cb.getAttribute('data-pc-id'))
         .filter(Boolean)
  );

  const all = [];
  clusters.forEach((cluster, ci) => {
    const clusterNumber = ci + 1;
    (cluster.performanceCriteria || []).forEach((text, idx) => {
      if (!text || !text.trim()) return;
      const id = `C${clusterNumber}-PC${idx + 1}`;
      all.push({
        id,
        text: text.trim(),
        clusterNumber,
        clusterName: cluster.name || `Cluster ${clusterNumber}`,
      });
    });
  });

  const selection = checked.size
    ? all.filter(c => checked.has(c.id))
    : all.filter(c => !used.has(c.id));

  return { selection, usedSelection: checked.size > 0 };
}

// ── Prompt ────────────────────────────────────────────────────

const _PATTERN_RULES = {
  A: `PATTERN A — ONE-TO-ONE
- Create EXACTLY ONE Learning Outcome for EACH criterion listed.
- The number of outcomes MUST equal the number of criteria.
- Each outcome links to exactly one criterion id.
- Rewrite the criterion as a learner capability; do NOT copy it verbatim
  and do NOT merge criteria.`,

  B: `PATTERN B — MANY-TO-ONE
- Integrate related criteria into FEWER, broader Learning Outcomes.
- Each outcome must link ${MIN_PC_PER_LO}-${MAX_PC_PER_LO} criteria.
- Group criteria that a learner would demonstrate together in a single
  assessment task, or that rest on the same underpinning skill.
- Criteria from different clusters MAY be integrated when they genuinely
  form one capability.`,

  C: `PATTERN C — HYBRID
- Decide criterion by criterion.
- A criterion that describes a distinct, independently assessable
  capability becomes its OWN outcome (1 criterion -> 1 outcome).
- Criteria that a learner would demonstrate together are INTEGRATED into
  one outcome linking up to ${MAX_PC_PER_LO} criteria.
- Do not force either extreme: a result where everything is integrated,
  or nothing is, means the hybrid judgement was not actually made.`,
};

function _buildPrompt(criteria, pattern) {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const occupation = v('occupationTitle');
  const jobTitle   = v('jobTitle');

  const byCluster = {};
  criteria.forEach(c => {
    (byCluster[c.clusterName] ||= []).push(c);
  });

  const list = Object.entries(byCluster).map(([name, items]) =>
    `  Competency: ${name}\n` +
    items.map(c => `    - id: ${c.id}\n      criterion: ${c.text}`).join('\n')
  ).join('\n');

  return `You are a curriculum design engine specialized in competency-based training (CBT) derived from DACUM analysis.

OCCUPATION: ${occupation || '(not specified)'}${jobTitle ? `
JOB / ROLE: ${jobTitle}` : ''}

PERFORMANCE CRITERIA (${criteria.length} total):
${list}

TASK:
Convert these Performance Criteria into Learning Outcomes using the
pattern specified below.

${_PATTERN_RULES[pattern]}

WHAT A LEARNING OUTCOME IS (this distinction is the whole point):
- A Performance Criterion states the STANDARD an assessor checks against.
- A Learning Outcome states what the LEARNER WILL BE ABLE TO DO after
  the training.
- Therefore: rewrite, never relabel. "Joints are cut to within 1 mm of
  the marked line" (criterion) becomes "Cut mortise and tenon joints to
  within 1 mm of the marked line" (outcome).

LEARNING OUTCOME WRITING RULES:
- Begin with a single, observable, measurable ACTION VERB.
- NEVER use understand, know, learn, be aware of, appreciate,
  be familiar with — these cannot be assessed.
- Address ONE demonstrable capability per outcome.
- Keep the STANDARD or condition where it makes the outcome assessable
  ("to within 1 mm", "according to manufacturer specifications").
  Leave out the purpose ("to ensure quality").
- Write in the third person, present tense, without the "The learner
  will be able to" prefix — the app supplies that framing.
- 6-20 words. One line of plain text, no numbering or bullets.
- Every outcome must be traceable to the criteria linked to it. Do NOT
  invent capabilities that no listed criterion supports.
- Use ONLY the criterion ids given above. Link each id to at most ONE
  outcome, and link every id exactly once.

OUTPUT FORMAT (STRICT — NO EXTRA TEXT, NO MARKDOWN):
{
  "outcomes": [
    {
      "statement": "Cut mortise and tenon joints to within 1 mm of the marked line",
      "criterionIds": ["C1-PC1"]
    }
  ]
}

Return ONLY that JSON object.`;
}

// ── Generation ────────────────────────────────────────────────

/* Resolved through _t() at call time rather than frozen at module load:
   these labels appear inside user-facing messages, and the language can
   change between load and use. */
const _PATTERN_KEY = { A: 'patternA', B: 'patternB', C: 'patternC' };
const _patternLabel = (p) => _t(_PATTERN_KEY[p] || 'patternC');

export async function generateLearningOutcomesAI(pattern = 'C') {
  if (!_PATTERN_RULES[pattern]) pattern = 'C';

  const cd = appState.clusteringData;
  if (!cd?.clusters?.length) {
    showStatus(_t('msgNoClustersForLO'), 'error');
    return false;
  }

  const { selection, usedSelection } = _collectCriteria();

  if (!selection.length) {
    showStatus(
      _t(usedSelection ? 'msgTickedCriteriaEmpty' : 'msgNoUnusedPC'),
      'error'
    );
    return false;
  }

  if (pattern !== 'A' && selection.length < MIN_PC_PER_LO) {
    showStatus(
      _tf('msgPatternNeedsMore', { pattern: _patternLabel(pattern), min: MIN_PC_PER_LO }),
      'error'
    );
    return false;
  }

  const existing = appState.learningOutcomesData?.outcomes || [];
  /* The Full Draft run asks about overwriting ONCE, up front, naming
     every tab at stake. Re-asking here would mean four or five
     dialogs during a run the user has already authorised — and each
     one silently stalls the pipeline until someone notices. */
  if (!isBatchRun() && existing.length && !confirm(
    _tf('confirmAddLOs', { pattern: _patternLabel(pattern), n: existing.length })
  )) {
    showStatus(_t('msgCancelOutcomes'), 'error');
    return false;
  }

  const usage = checkUsageLimit();
  if (!usage.allowed) {
    showStatus('❌ ' + _tf('msgDailyLimit', { n: usage.count }), 'error');
    return false;
  }

  showLoadingModal();
  await new Promise(r => setTimeout(r, 100));

  try {
    const response = await fetch(`${BACKEND_URL}/api/generate-dacum`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt: _buildPrompt(selection, pattern) + _aiDir() }),
    });
    await throwIfAIError(response);

    const data = await response.json();
    if (!data.content?.[0]?.text) {
      throw new Error('Invalid response from backend - no content found');
    }

    const jsonText = data.content[0].text.trim()
      .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(jsonText); }
    catch (e) { throw new Error('Failed to parse AI response as JSON'); }

    if (!Array.isArray(parsed.outcomes) || !parsed.outcomes.length) {
      throw new Error('AI response contained no learning outcomes');
    }

    const byId = {};
    selection.forEach(c => { byId[c.id] = c; });

    const lo = appState.learningOutcomesData;
    const linked = new Set();
    let added = 0;

    parsed.outcomes.forEach(item => {
      const statement = String(item.statement || '')
        .trim()
        .replace(/^[\s]*[•\-*]\s*/, '')
        .replace(/^[\s]*\d+[.)]\s*/, '')
        // Strip the framing prefix if the model added it anyway
        .replace(/^(the\s+)?learner(s)?\s+(will\s+be\s+able\s+to|can|should\s+be\s+able\s+to)\s+/i, '')
        .trim();

      const criteria = [];
      (item.criterionIds || []).forEach(raw => {
        const id = String(raw || '').trim();
        const c = byId[id];
        if (!c || linked.has(id)) return;   // unknown or already linked → drop
        linked.add(id);
        criteria.push({ id: c.id, text: c.text, clusterNumber: c.clusterNumber });
      });

      // An outcome with no valid criteria has nothing to assess against
      // and no traceability back to the chart — discard it.
      if (!statement || !criteria.length) return;

      lo.outcomeCounter++;
      lo.outcomes.push({
        id:      `lo_${lo.outcomeCounter}`,
        number:  `LO-${lo.outcomeCounter}`,
        statement,
        linkedCriteria: criteria,
      });
      added++;
    });

    if (!added) throw new Error('No valid learning outcomes could be built from the response');

    renderPCSourceList();
    renderLearningOutcomes();
    hideLoadingModal();
    incrementUsage();

    // ── Post-checks reported as advice, never as failure ──────
    const notes = [];

    const skipped = selection.filter(c => !linked.has(c.id)).length;
    if (skipped) {
      notes.push(`${skipped} criterion${skipped > 1 ? 'a' : ''} left unlinked — still available below`);
    }

    // Pattern A promises a 1:1 relationship; verify rather than assume.
    if (pattern === 'A' && added !== (selection.length - skipped)) {
      notes.push('one-to-one mapping was not exact — review the linked criteria');
    }

    // A "hybrid" run that integrated nothing is really Pattern A.
    if (pattern === 'C') {
      const integrated = lo.outcomes.slice(-added)
        .filter(o => (o.linkedCriteria || []).length > 1).length;
      if (integrated === 0) {
        notes.push('no criteria were integrated — this result is effectively Pattern A');
      } else if (integrated === added) {
        notes.push('every outcome integrated several criteria — closer to Pattern B');
      }
    }

    showStatus(
      '✓ ' + _tf('msgLOsCreated', { n: added, pattern: _patternLabel(pattern) }) +
      (notes.length ? ' ' + _tf('msgNotesSuffix', { notes: notes.join('; ') }) : ''),
      'success'
    );
    return true;

  } catch (error) {
    hideLoadingModal();
    console.error('Error generating learning outcomes:', error);
    showStatus(_t('msgAIFailed'), 'error');
    showAIServiceError(error, { safeKey: 'aiErrSafeLO', tipKeys: ['aiTipLO1', 'aiTipLO2'] });
    return false;
  }
}
