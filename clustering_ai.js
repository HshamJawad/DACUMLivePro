// ============================================================
// /clustering_ai.js
// AI assistance for the Competency Clusters tab.
//
// TWO SEPARATE ACTIONS, deliberately not one button:
//
//   1. suggestClustersAI()  — groups the available tasks into
//      competency clusters and names each one.
//   2. generateRangeAndCriteriaAI() — writes the Range and the
//      Performance Criteria for clusters that already exist.
//
// They are split because clustering is a panel-level judgement that
// determines the entire curriculum structure, while Range/PC is
// per-cluster elaboration. Many facilitators will cluster BY HAND with
// their expert panel — that is the orthodox DACUM way — and still want
// help drafting criteria. Fusing both into one button would deny them
// step 2 and would force anyone who likes 5 of 6 suggested clusters to
// throw away the lot to redo one.
//
// A third entry point, generateForSingleCluster(), regenerates just one
// cluster so accepted work is never collateral damage.
//
// Rules encoded in the prompts come from the guidance shown in the
// tab's own help modals (Norton's DACUM Handbook conventions):
//   • Cluster on common purpose, shared workflow, or shared knowledge
//     and skills rather than on which duty a task came from. Clusters
//     usually cut across duties — but a duty-aligned cluster is valid
//     when those tasks really do form one competency, so this is
//     steered in the prompt and flagged for review, never forced.
//   • Performance criteria must be observable, measurable and
//     learner-focused, in What + Action + Qualifier form.
//   • Range describes the contexts, conditions, equipment and
//     variables the competency is applied across — not more criteria.
// ============================================================

import { appState }   from './state.js';
import { showStatus } from './renderer.js';
import { renderAvailableTasks, renderClusters, persistClustering,
         loText } from './modules.js';
import { getTaskPerformanceCriteria } from './task_analysis.js';
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

// A cluster below ~4 tasks is rarely a competency in its own right;
// above ~12 it stops being a coherent unit of assessment.
const MIN_TASKS_PER_CLUSTER = 4;
const MAX_TASKS_PER_CLUSTER = 12;

// Enough criteria to assess the competency, not an exhaustive audit.
const MIN_CRITERIA = 4;
const MAX_CRITERIA = 8;

// ── Shared helpers ────────────────────────────────────────────

function _chartContext() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const occupation = v('occupationTitle');
  const jobTitle   = v('jobTitle');
  const scope      = v('scopeOfWork');
  return `OCCUPATION: ${occupation || '(not specified)'}` +
         (jobTitle ? `\nJOB / ROLE: ${jobTitle}` : '') +
         (scope    ? `\nSCOPE OF WORK: ${scope}` : '');
}

async function _callBackend(prompt) {
  const response = await fetch(`${BACKEND_URL}/api/generate-dacum`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ prompt: prompt + _aiDir() }),
  });
  await throwIfAIError(response);
  const data = await response.json();
  if (!data.content?.[0]?.text) {
    throw new Error('Invalid response from backend - no content found');
  }
  const jsonText = data.content[0].text.trim()
    .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(jsonText); }
  catch (e) { throw new Error('Failed to parse AI response as JSON'); }
}

function _guardQuota() {
  const usage = checkUsageLimit();
  if (!usage.allowed) {
    showStatus('❌ ' + _tf('msgDailyLimit', { n: usage.count }), 'error');
    return false;
  }
  return true;
}

/* ── What depends on the criteria about to be replaced ────────
   Since 3.26 Learning Outcomes link to these criteria, and Modules (and
   Module Curriculum) are built on the outcomes. Regenerating marks the
   links ⚠ stale; the user only found out on opening the LO tab later.
   Cluster-written criteria are the ones replaced (key "pc|cluster|…");
   Task Analysis criteria ("ta|task|…") are re-matched by task and
   survive a regrouping. */
function _downstreamOf(clusterIds /* Set | null = every cluster */) {
  const outcomes = appState.learningOutcomesData?.outcomes || [];
  const los = outcomes.filter(o => (o.linkedCriteria || []).some(pc =>
    pc && !pc.stale && !pc.taskId &&
    (!clusterIds || clusterIds.has(pc.clusterId))));
  const loIds = new Set(los.map(o => o.id));
  const mods = (appState.moduleMappingData?.modules || []).filter(m =>
    (m.learningOutcomes || []).some(o => o && loIds.has(o.id)));
  return { lo: los.length, mm: mods.length };
}

function _downstreamLine(clusterIds) {
  const d = _downstreamOf(clusterIds);
  return d.lo ? '\n\n' + loText('clConfirmDownstream', { lo: d.lo, mm: d.mm }) : '';
}

/** Normalised form for duplicate checks (case, spaces, end punctuation). */
const _norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.;:,]+$/, '').trim();

/** Task Analysis criteria of every task in a cluster (deduplicated). */
function _taCriteriaOf(cluster) {
  const seen = new Set(), out = [];
  (cluster.tasks || []).forEach(t => {
    if (!t || !t.id) return;
    let list = [];
    try { list = getTaskPerformanceCriteria(t.id) || []; } catch (_) {}
    list.forEach(txt => {
      const k = _norm(txt);
      if (k && !seen.has(k)) { seen.add(k); out.push(txt); }
    });
  });
  return out;
}

// ── 1 · Suggest clusters ──────────────────────────────────────

function _buildClusterPrompt(tasks) {
  const list = tasks.map(t =>
    `  - id: ${t.id}\n    task: ${t.text}\n    from duty: ${t.dutyTitle || '(unknown)'}`
  ).join('\n');

  const target = Math.max(2, Math.round(tasks.length / 7));

  return `You are an occupational analysis engine specialized in DACUM methodology and competency-based training.

${_chartContext()}

TASKS TO GROUP (${tasks.length} total):
${list}

TASK:
Group these tasks into COMPETENCY CLUSTERS and name each cluster.

CLUSTERING RULES (these are the defining rules — follow them strictly):
- Group tasks that share ONE of:
    • a common purpose or industry objective
    • a similar workflow or process
    • the same underpinning knowledge and skills
- CRITICAL: Tasks from DIFFERENT duties SHOULD be grouped together when
  they are related by purpose, process, or required skills. Duties
  organise work by AREA; clusters organise it by COMPETENCE, so the two
  structures will usually differ. Examine cross-duty relationships
  FIRST, before considering any duty-aligned grouping.
- Do NOT simply reproduce the duty structure. Copying each duty's task
  list into a cluster of the same name is the default lazy answer and
  is almost always wrong.
- HOWEVER: a cluster MAY align with a single duty when those tasks
  genuinely constitute one coherent competency in their own right —
  judged on shared purpose, workflow and underpinning skills, NOT on
  the fact that they happen to share a duty heading. This is a
  legitimate outcome; just make sure it is a conclusion you reached,
  not a shortcut you took.
- Each cluster must contain between ${MIN_TASKS_PER_CLUSTER} and ${MAX_TASKS_PER_CLUSTER} tasks.
- Aim for roughly ${target} clusters, adjusting where the content justifies it.
- EVERY task id above must appear in exactly ONE cluster.
- Use ONLY the ids given. Do NOT invent, reword, split or merge tasks.

CLUSTER NAMING RULES:
- Name each cluster as a COMPETENCE STATEMENT, not "Cluster 1".
- Structure: Action Verb + Task/Activity (What) + Context (where relevant).
- Keep the standard, leave out the purpose: write "according to
  manufacturer specifications", not "to ensure accurate results".
- 3-9 words, specific to this occupation.

OUTPUT FORMAT (STRICT — NO EXTRA TEXT, NO MARKDOWN):
{
  "clusters": [
    {
      "name": "Calibrate testing equipment to manufacturer specifications",
      "taskIds": ["task_1", "task_7"]
    }
  ]
}

Return ONLY that JSON object.`;
}

/**
 * Warn when the suggested clustering merely mirrors the duty structure.
 * This is the most common and most damaging failure of automated
 * clustering: it looks tidy, passes every other check, and quietly
 * defeats the entire purpose of the clustering step. It is surfaced as
 * advice, never as a blocker — occasionally a duty genuinely IS a
 * single competency.
 */
function _dutyMirrorWarning(clusters) {
  const singleDuty = clusters.filter(c => {
    const duties = new Set(c.tasks.map(t => t.dutyTitle || ''));
    return duties.size === 1;
  }).length;

  if (clusters.length && singleDuty === clusters.length) {
    return loText('clNoteMirrorAll');
  }
  if (singleDuty > clusters.length / 2) {
    return loText('clNoteMirrorSome', { n: singleDuty, total: clusters.length });
  }
  return '';
}

export async function suggestClustersAI() {
  const cd = appState.clusteringData;
  const available = cd?.availableTasks || [];
  const existing  = cd?.clusters || [];

  // Work from the full task pool, not just what is left unassigned —
  // otherwise a partial manual clustering would produce a suggestion
  // built on the leftovers, which is worse than no suggestion.
  const pool = [...available, ...existing.flatMap(c => c.tasks || [])];

  if (pool.length < MIN_TASKS_PER_CLUSTER * 2) {
    showStatus(_tf('msgNotEnoughTasks', { n: pool.length }), 'error');
    return false;
  }

  /* The Full Draft run asks about overwriting ONCE, up front, naming
     every tab at stake. Re-asking here would mean four or five
     dialogs during a run the user has already authorised — and each
     one silently stalls the pipeline until someone notices. */
  if (!isBatchRun() && existing.length && !confirm(
    _tf('confirmReplaceClusters', { n: existing.length }) + _downstreamLine(null)
  )) {
    showStatus(_t('msgCancelClusters'), 'error');
    return false;
  }

  if (!_guardQuota()) return false;

  showLoadingModal();
  await new Promise(r => setTimeout(r, 100));

  try {
    const parsed = await _callBackend(_buildClusterPrompt(pool));
    if (!Array.isArray(parsed.clusters) || !parsed.clusters.length) {
      throw new Error('AI response contained no clusters');
    }

    const byId = {};
    pool.forEach(t => { byId[t.id] = t; });

    const used = new Set();
    const clusters = [];
    let trimmed = 0;

    parsed.clusters.forEach(c => {
      let members = [];
      (c.taskIds || []).forEach(rawId => {
        const id = String(rawId || '').trim();
        if (!byId[id] || used.has(id)) return;   // unknown or duplicate → drop
        used.add(id);
        members.push(byId[id]);
      });

      if (members.length > MAX_TASKS_PER_CLUSTER) {
        members.slice(MAX_TASKS_PER_CLUSTER).forEach(t => used.delete(t.id));
        members = members.slice(0, MAX_TASKS_PER_CLUSTER);
        trimmed++;
      }
      if (!members.length) return;

      clusters.push({
        id:   `cluster_${clusters.length + 1}`,
        name: String(c.name || '').trim() || `Cluster ${clusters.length + 1}`,
        tasks: members,
        range: '',
        performanceCriteria: [],
      });
    });

    if (!clusters.length) throw new Error('No valid clusters could be built from the response');

    // Tasks the model skipped stay in the Available list rather than
    // disappearing — the facilitator can place them by hand.
    const leftovers = pool.filter(t => !used.has(t.id));

    cd.clusters       = clusters;
    cd.clusterCounter = clusters.length;
    cd.availableTasks = leftovers;

    renderAvailableTasks();
    renderClusters();
    // Save now, as the LO and module generators do since 3.29/3.30 —
    // otherwise the result lived only until the next autosave.
    persistClustering();
    hideLoadingModal();
    incrementUsage();

    const notes = [];
    if (leftovers.length) notes.push(loText('clNoteLeftover', { n: leftovers.length }));
    if (trimmed)          notes.push(loText('clNoteTrimmed', { n: trimmed }));
    const mirror = _dutyMirrorWarning(clusters);
    if (mirror) notes.push(mirror);

    showStatus(
      '✓ ' + _tf('msgClustersSuggested', { n: clusters.length }) +
      (notes.length ? ' ' + _tf('msgNotesSuffix', { notes: notes.join('; ') }) : '') +
      ' ' + _t('msgReviewBeforeCriteria'),
      'success'
    );
    return true;

  } catch (error) {
    hideLoadingModal();
    console.error('Error suggesting clusters:', error);
    showStatus(_t('msgAIClusteringFailed'), 'error');
    showAIServiceError(error, { safeKey: 'aiErrSafeClusters', tipKeys: ['aiTipClusters1', 'aiTipClusters2', 'aiTipClusters3'] });
    return false;
  }
}

// ── 2 · Range + Performance Criteria ──────────────────────────

function _buildCriteriaPrompt(clusters) {
  const blocks = clusters.map(c => {
    const tasks = (c.tasks || [])
      .map(t => `      · ${t.text}${t.dutyTitle ? ` [${t.dutyTitle}]` : ''}`)
      .join('\n');
    const ta = _taCriteriaOf(c);
    const taBlock = ta.length
      ? `\n    already written in Task Analysis (task level):\n${ta.map(x => `      · ${x}`).join('\n')}`
      : '';
    return `  - id: ${c.id}\n    competency: ${c.name}\n    tasks:\n${tasks}${taBlock}`;
  }).join('\n');

  return `You are a competency-based training (CBT) engine working from a DACUM analysis.

${_chartContext()}

COMPETENCY CLUSTERS (${clusters.length}):
${blocks}

TASK:
For EACH cluster, write a Range statement and a set of Performance Criteria.

RANGE — defines the SCOPE AND CONTEXT in which the competency is applied.
It must cover, where relevant:
  • Different situations, environments, or conditions
  • Types of equipment, tools, or materials used
  • Variable contexts that may affect performance
Write it as 2-4 short sentences of plain prose.
The Range is NOT a list of criteria and NOT a restatement of the tasks —
it describes the conditions the competency must hold across.

PERFORMANCE CRITERIA — define the STANDARDS to which the competency must
be performed. Every criterion must be:
  • Observable — can be seen or detected during assessment
  • Measurable — can be evaluated against a standard
  • Learner-focused — describes what the learner must demonstrate

Each criterion is built from three components:
  • What (Object)  — the thing being acted upon
  • Action (Verb)  — the precise action being performed
  • Qualifier      — the specific condition, standard, or requirement

Example structure:
  "Equipment calibration is verified to be within manufacturer's tolerance ranges"
   ^-- What              ^-- Action    ^-- Qualifier

CRITERIA RULES:
- Between ${MIN_CRITERIA} and ${MAX_CRITERIA} criteria per cluster.
- ALWAYS include the qualifier — a criterion with no standard cannot be assessed.
- Keep the STANDARD, drop the PURPOSE: write "within manufacturer's
  tolerance ranges", never "to ensure accurate results".
- NEVER use cognitive verbs (understand, know, learn, be aware of) —
  criteria describe demonstrable performance, not mental states.
- One criterion = one line of plain text, no numbering or bullets
  (the app adds numbering itself).
- Base every criterion on the tasks actually listed for that cluster.
- Where a cluster lists criteria "already written in Task Analysis",
  those are kept and shown beside yours. Do NOT repeat or paraphrase
  them: write competency-level criteria that COMPLEMENT them (integration
  across tasks, quality, safety, compliance), and you may write fewer.

OUTPUT FORMAT (STRICT — NO EXTRA TEXT, NO MARKDOWN):
{
  "clusters": [
    {
      "id": "cluster_1",
      "range": "Applies to ... across ... using ...",
      "performanceCriteria": ["Equipment calibration is verified to be within manufacturer's tolerance ranges"]
    }
  ]
}

Return ONLY that JSON object.`;
}

/** Clean, de-duplicate and cap a criteria array coming from the model. */
function _sanitiseCriteria(list) {
  const seen = new Set();
  return (list || [])
    .map(v => String(v == null ? '' : v).trim())
    .map(v => v.replace(/^[\s]*[•\-*○●]\s*/, '').replace(/^[\s]*\d+[-.)]\s*/, '').trim())
    .filter(v => {
      if (!v) return false;
      const k = v.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_CRITERIA);
}

/**
 * Generate Range + Criteria.
 * @param {string|null} onlyClusterId  regenerate a single cluster when given.
 */
export async function generateRangeAndCriteriaAI(onlyClusterId = null) {
  const cd = appState.clusteringData;
  const all = cd?.clusters || [];

  const targets = onlyClusterId
    ? all.filter(c => c.id === onlyClusterId)
    : all;

  if (!targets.length) {
    showStatus(_t('msgNoClustersYet'), 'error');
    return false;
  }

  const filled = targets.filter(
    c => (c.range || '').trim() || (c.performanceCriteria || []).length
  );
  /* The Full Draft run asks about overwriting ONCE, up front, naming
     every tab at stake. Re-asking here would mean four or five
     dialogs during a run the user has already authorised — and each
     one silently stalls the pipeline until someone notices. */
  if (!isBatchRun() && filled.length && !confirm('\u26A0\uFE0F ' + _tf(
    filled.length === 1 ? 'confirmReplaceCriteriaOne' : 'confirmReplaceCriteriaMany',
    { n: filled.length }
  ) + _downstreamLine(new Set(targets.map(c => c.id))))) {
    showStatus(_t('msgCancelCriteria'), 'error');
    return false;
  }

  if (!_guardQuota()) return false;

  showLoadingModal();
  await new Promise(r => setTimeout(r, 100));

  try {
    const parsed = await _callBackend(_buildCriteriaPrompt(targets));
    if (!Array.isArray(parsed.clusters) || !parsed.clusters.length) {
      throw new Error('AI response contained no clusters');
    }

    let updated = 0;
    let criteriaCount = 0;

    parsed.clusters.forEach(item => {
      const cluster = targets.find(c => c.id === String(item.id || '').trim());
      if (!cluster) return;   // unknown id → ignore, never create a cluster here

      const range    = String(item.range || '').trim();
      // Task Analysis criteria of this cluster's tasks already appear in
      // the Learning Outcomes source list next to these — drop exact
      // repeats so the list does not carry the same criterion twice.
      const taKeys   = new Set(_taCriteriaOf(cluster).map(_norm));
      const criteria = _sanitiseCriteria(item.performanceCriteria)
        .filter(c => !taKeys.has(_norm(c)));

      if (!range && !criteria.length) return;
      if (range)          cluster.range = range;
      if (criteria.length) cluster.performanceCriteria = criteria;

      updated++;
      criteriaCount += criteria.length;
    });

    if (!updated) throw new Error('AI response did not match any existing cluster');

    renderClusters();
    persistClustering();
    hideLoadingModal();
    incrementUsage();

    const thin = targets.filter(
      c => (c.performanceCriteria || []).length && c.performanceCriteria.length < MIN_CRITERIA
    ).length;

    showStatus(
      '✓ ' + _tf('msgCriteriaGenerated', { criteria: criteriaCount, clusters: updated }) +
      (thin ? ' ' + _tf('msgThinClusters', { n: thin, min: MIN_CRITERIA }) : ''),
      'success'
    );
    return true;

  } catch (error) {
    hideLoadingModal();
    console.error('Error generating range/criteria:', error);
    showStatus(_t('msgAIFailed'), 'error');
    showAIServiceError(error, { safeKey: 'aiErrSafeClusters', tipKeys: ['aiTipClusters1', 'aiTipClusters2', 'aiTipClusters3'] });
    return false;
  }
}

/** Regenerate one cluster only — used by the per-card 🤖 button. */
export function generateForSingleCluster(clusterId) {
  return generateRangeAndCriteriaAI(clusterId);
}
