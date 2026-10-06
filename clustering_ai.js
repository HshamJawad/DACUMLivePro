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
// 3.71.0:
//   • The per-card button opens a dialog: Range and/or Performance
//     Criteria. A part that already has content starts unticked, so a
//     Range written with the panel is never replaced by asking for
//     criteria.
//   • A replaced part keeps its previous content (cluster._aiPrev) and
//     is marked as an AI draft (cluster._aiDraft) until the user edits
//     it — "↶ Restore previous" in the card brings it back (modules.js).
//   • The prompt now carries, per cluster, the Task Analysis tools,
//   conditions and safety lines of its tasks (the natural source of a
//   Range), sector and country, and the no-invented-standards rule.
//   • The reply is read from every text block and survives a line of
//     prose around the JSON.
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
         loText, initializeClusteringFromTasks, syncClusteringWithProfile,
         isClusterAddedTask } from './modules.js';
import { getTaskPerformanceCriteria, getTaskAnalysisRecord } from './task_analysis.js';
import { writeAIDraft, openAIPartsDialog } from './ai_draft.js';
import { checkUsageLimit, incrementUsage,
         showLoadingModal, hideLoadingModal } from './storage.js';
import { isBatchRun } from './draft_mode.js';
import { showAIServiceError, jobFocusLines, callAI } from './ai_client.js';


/* i18n access — resolved lazily; see duties.js for why. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

/* Output-language directive for the generation backend. Appended at the
   ONE place this module builds a request, so any prompt added later is
   covered without having to remember. Empty string in English. */
const _aiDir = () => (window.i18n ? window.i18n.aiDirective() : '');   // (callAI appends it)



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
  const scope      = v('scopeOfWork');
  const sector     = v('sector');
  const country    = v('context');
  return jobFocusLines() +
         (scope    ? `\nSCOPE OF WORK: ${scope}` : '') +
         (sector   ? `\nSECTOR: ${sector}` : '') +
         (country  ? `\nCOUNTRY / CONTEXT: ${country}` : '');
}

// 3.74.0: one shared call (ai_client.js callAI) — every text block,
// fences removed, {...} fallback, output-language directive.
function _callBackend(prompt) {
  return callAI(prompt);
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

/** 3.71.0: the Task Analysis lines a Range is made of — tools,
 *  conditions and safety of the cluster's tasks — deduplicated and
 *  capped so a large cluster cannot flood the prompt. */
function _taRangeSourcesOf(cluster) {
  const take = { tools: [], conditions: [], safety: [] };
  const seen = { tools: new Set(), conditions: new Set(), safety: new Set() };
  const add = (bucket, txt, cap) => {
    const t = String(txt || '').replace(/^[\s]*[•\-*○●]\s*/, '').replace(/^[\s]*\d+[.)]\s*/, '').trim();
    const k = _norm(t);
    if (!k || seen[bucket].has(k) || take[bucket].length >= cap) return;
    seen[bucket].add(k); take[bucket].push(t);
  };
  (cluster.tasks || []).forEach(t => {
    if (!t || !t.id) return;
    let r = null;
    try { r = getTaskAnalysisRecord(t.id); } catch (_) { r = null; }
    if (!r) return;
    (r.toolsEquipmentMaterials || []).forEach(x => add('tools', x, 20));
    if (r.conditionsWorkEnvironment) add('conditions', r.conditionsWorkEnvironment, 6);
    (r.safetyOSH || []).forEach(x => add('safety', x, 12));
  });
  return take;
}

const _isFilledRange    = c => !!String(c.range || '').trim();
const _isFilledCriteria = c => (c.performanceCriteria || []).some(x => String(x || '').trim());

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
- 3-9 words, specific to this job.

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

  /* 3.74.0 — bring the task pool up to date with Duties & Tasks first.
     It used to be seeded only when the Clusters tab was opened, so a
     Full Draft (which never opens it) found an empty pool on a new
     project and stopped with "not enough tasks"; on a filled project it
     still held the OLD tasks of duties the run had just regenerated.
     Both calls are the ones the tab itself makes on entry. */
  if (cd && Array.isArray(cd.clusters) && Array.isArray(cd.availableTasks)) {
    try {
      if (!cd.clusters.length && !cd.availableTasks.length) initializeClusteringFromTasks();
      else syncClusteringWithProfile();
    } catch (err) { console.warn('[clusters] pool refresh failed', err); }
  }

  const available = cd?.availableTasks || [];
  const existing  = cd?.clusters || [];

  // Only tasks that exist in the profile now (or were added during
  // clustering) — a removed task must not be suggested again.
  const present = new Set();
  (appState.dutiesData || []).forEach(d => (d.tasks || []).forEach(t => {
    if (t && t.inputId && String(t.text || '').trim()) present.add(t.inputId);
  }));
  const current = t => t && (present.has(t.id) || isClusterAddedTask(t));

  // Work from the full task pool, not just what is left unassigned —
  // otherwise a partial manual clustering would produce a suggestion
  // built on the leftovers, which is worse than no suggestion.
  const pool = [...available, ...existing.flatMap(c => c.tasks || [])].filter(current);

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

function _buildCriteriaPrompt(clusters, parts = { range: true, criteria: true }) {
  const list = (h, arr) => arr.length ? `\n    ${h}:\n${arr.map(x => `      · ${x}`).join('\n')}` : '';
  const blocks = clusters.map(c => {
    const tasks = (c.tasks || [])
      .map(t => `      · ${t.text}${t.dutyTitle ? ` [${t.dutyTitle}]` : ''}`)
      .join('\n');
    const ta = _taCriteriaOf(c);
    const taBlock = list('already written in Task Analysis (task level)', ta);
    const src = _taRangeSourcesOf(c);
    const rangeSrc = list('tools, equipment & materials (Task Analysis)', src.tools) +
                     list('conditions / work environment (Task Analysis)', src.conditions) +
                     list('safety / OSH (Task Analysis)', src.safety);
    // The part NOT being generated is context, so the new one fits it.
    const keepRange = !parts.range && _isFilledRange(c)
      ? `\n    current range (keep consistent with it): ${String(c.range).trim()}` : '';
    const keepCrit = !parts.criteria && _isFilledCriteria(c)
      ? list('current competency criteria (keep consistent with them)', c.performanceCriteria.filter(x => String(x || '').trim())) : '';
    return `  - id: ${c.id}\n    competency: ${c.name}\n    tasks:\n${tasks}${taBlock}${rangeSrc}${keepRange}${keepCrit}`;
  }).join('\n');

  const what = parts.range && parts.criteria ? 'a Range statement and a set of Performance Criteria'
             : parts.range ? 'a Range statement ONLY (do not write criteria)'
             : 'a set of Performance Criteria ONLY (do not write a range)';
  const shape = [
    `      "id": "cluster_1"`,
    parts.range    ? `      "range": "Applies to ... across ... using ..."` : null,
    parts.criteria ? `      "performanceCriteria": ["Equipment calibration is verified to be within manufacturer's tolerance ranges"]` : null,
  ].filter(Boolean).join(',\n');

  return `You are a competency-based training (CBT) engine working from a DACUM analysis.

${_chartContext()}

COMPETENCY CLUSTERS (${clusters.length}):
${blocks}

TASK:
For EACH cluster, write ${what}.

GENERAL RULES:
- Base everything on the tasks listed for that cluster and the Task
  Analysis lines given with them; where tools, conditions or safety
  lines are given, the Range should draw on them (select and generalise,
  do not copy every item).
- NEVER invent standard numbers, regulation names, codes or clause
  references (no "ISO 9606", "OSHA 1910" etc.). Refer to them only
  generically ("manufacturer's specifications", "applicable local
  regulations").

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
${shape}
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
export async function generateRangeAndCriteriaAI(onlyClusterId = null, parts = null, opts = {}) {
  parts = { range: true, criteria: true, ...(parts || {}) };
  if (!parts.range && !parts.criteria) return false;
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
    c => (parts.range && _isFilledRange(c)) || (parts.criteria && _isFilledCriteria(c))
  );
  /* The Full Draft run asks about overwriting ONCE, up front, naming
     every tab at stake. Re-asking here would mean four or five
     dialogs during a run the user has already authorised — and each
     one silently stalls the pipeline until someone notices. */
  // The per-card dialog has already shown what will be replaced.
  if (!isBatchRun() && !opts.confirmed && filled.length && !confirm('\u26A0\uFE0F ' + _tf(
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
    const parsed = await _callBackend(_buildCriteriaPrompt(targets, parts));
    if (!Array.isArray(parsed.clusters) || !parsed.clusters.length) {
      throw new Error('AI response contained no clusters');
    }

    let updated = 0;
    let criteriaCount = 0;

    parsed.clusters.forEach(item => {
      const cluster = targets.find(c => c.id === String(item.id || '').trim());
      if (!cluster) return;   // unknown id → ignore, never create a cluster here

      const range    = parts.range ? String(item.range || '').trim() : '';
      // Task Analysis criteria of this cluster's tasks already appear in
      // the Learning Outcomes source list next to these — drop exact
      // repeats so the list does not carry the same criterion twice.
      const taKeys   = new Set(_taCriteriaOf(cluster).map(_norm));
      const criteria = parts.criteria
        ? _sanitiseCriteria(item.performanceCriteria).filter(c => !taKeys.has(_norm(c)))
        : [];

      if (!range && !criteria.length) return;
      if (range)           _writeAIPart(cluster, 'range', range);
      if (criteria.length) _writeAIPart(cluster, 'criteria', criteria);

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
      '✓ ' + (parts.criteria
        ? _tf('msgCriteriaGenerated', { criteria: criteriaCount, clusters: updated })
        : _tf('clAiRangeDone', { n: updated })) +
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

/* 3.71.0: write one generated part and remember what it replaced.
   A second run keeps the user's ORIGINAL, not the first draft. The
   marks are cleared by the user's own edit (modules.js). */
function _writeAIPart(cluster, part, value) {
  const field = part === 'range' ? 'range' : 'performanceCriteria';
  // 3.75.0: shared draft logic (ai_draft.js) — same _aiDraft/_aiPrev format.
  writeAIDraft(cluster, part, value, {
    get:    () => cluster[field],
    set:    (k, v) => { cluster[field] = v; },
    filled: () => part === 'range' ? _isFilledRange(cluster) : _isFilledCriteria(cluster),
  });
}

/** Regenerate one cluster only — used by the per-card ✨ button.
 *  3.71.0: asks first which parts to generate. Resolves true after a
 *  successful run, false when cancelled or failed. */
export async function generateForSingleCluster(clusterId) {
  const cd = appState.clusteringData;
  const idx = (cd?.clusters || []).findIndex(c => c.id === clusterId);
  if (idx === -1) return false;
  const cluster = cd.clusters[idx];

  const down = _downstreamOf(new Set([cluster.id]));
  const src = _taRangeSourcesOf(cluster);
  const nTa = src.tools.length + src.conditions.length + src.safety.length + _taCriteriaOf(cluster).length;

  // 3.75.0: the shared dialog (ai_draft.js). Same parts, same notes.
  const keys = await openAIPartsDialog({
    id:       'clAiModal',
    title:    _t('clAiTitle'),
    subtitle: `C${idx + 1} — ${cluster.name || ''}`,
    intro:    _t('clAiIntro'),
    parts: [
      { key: 'range',    label: _t('lblRange'),               filled: _isFilledRange(cluster) },
      { key: 'criteria', label: _t('lblPerformanceCriteria'), filled: _isFilledCriteria(cluster) },
    ],
    notes: [
      { icon: '🔬', tone: 'info', text: nTa ? _tf('clAiTaUsed', { n: nTa }) : _t('clAiTaNone') },
      { icon: '🔗', tone: 'link', text: loText('clConfirmDownstream', { lo: down.lo, mm: down.mm }),
        when: (on) => on.has('criteria') && _isFilledCriteria(cluster) && down.lo > 0 },
      { icon: '↶',  tone: 'restore', text: _t('taAiRestoreNote') },
      { icon: '⚠️', tone: 'warn', text: _t('clAiNote') },
    ],
  });
  if (!keys || !keys.length) return false;
  try {
    return !!(await generateRangeAndCriteriaAI(clusterId,
      { range: keys.includes('range'), criteria: keys.includes('criteria') }, { confirmed: true }));
  } catch (_) { return false; }
}
