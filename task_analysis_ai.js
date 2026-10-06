// ============================================================
// /task_analysis_ai.js
// AI assistance for the Task Analysis tab — ONE task at a time.
//
// • Same backend route as every other AI card (/api/generate-dacum is
//   a generic prompt proxy), so no backend change is needed.
// • The user picks which sections to generate. Sections that already
//   hold content start UNticked and are never overwritten unless the
//   user ticks them explicitly.
// • The prompt is grounded in what the chart already contains:
//   occupation/job/scope, the duty and its sibling tasks, the lists in
//   Additional Info, the task's own filled sections and any cluster
//   criteria covering this task — so the model selects and adapts
//   rather than inventing a parallel vocabulary.
// • Every generated section is marked as an AI draft until the user
//   edits it (see task_analysis.js → _aiDraft). A section that had
//   content keeps its previous value until then, so the user can
//   "↶ Restore previous" (3.70.0).
// • 3.70.0: the sections the user added ("➕ Add section") are offered
//   too, their title standing in for the rule, and their filled lines
//   are sent as context like the standard sections.
// • Not part of the Full Draft pipeline, by design.
// ============================================================

import { appState }            from './state.js';
import { showAIServiceError, jobFocusLines, callAI } from './ai_client.js';
import { showStatus, escapeHtml } from './renderer.js';
import { incrementUsage, showLoadingModal, hideLoadingModal } from './storage.js';
import { openAIPartsDialog } from './ai_draft.js';
import { getTaskAnalysisContext, writeTaskAnalysisAI,
         TA_FIELD_SPECS }      from './task_analysis.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);
const _aiDir = () => (window.i18n && window.i18n.aiDirective ? window.i18n.aiDirective() : '');


/* What each section means and how much of it to produce. `max` is
   enforced in code as well as asked for in the prompt. */
const GUIDE = {
  performanceSteps:            { max: 12, rule: '5–12 sequential, observable steps in the order the worker performs them; each starts with one action verb.' },
  requiredKnowledge:           { max: 8,  rule: '3–8 items of underpinning knowledge THIS task needs (concepts, principles, specifications to know).' },
  requiredSkills:              { max: 8,  rule: '3–8 practical or cognitive skills THIS task needs.' },
  toolsEquipmentMaterials:     { max: 10, rule: '3–10 tools, equipment, instruments, materials or consumables actually used in THIS task.' },
  safetyOSH:                   { max: 6,  rule: '2–6 task-specific hazards and precautions (including PPE only where it genuinely applies).' },
  conditionsWorkEnvironment:   { text: true, rule: '1–3 sentences: where and under what conditions the task is performed (setting, given resources, constraints).' },
  decisionsCriticalPoints:     { max: 5,  rule: '2–5 decision points or critical checkpoints where the worker must judge or verify before continuing.' },
  performanceCriteria:         { max: 6,  rule: '3–6 observable, assessable criteria describing correct performance of THIS task (e.g. "Joint is aligned within tolerance").' },
  performanceStandard:         { text: true, rule: '1–2 sentences stating the acceptable level of performance (accuracy, quality, time, compliance). Refer to standards only generically (e.g. "manufacturer specifications", "applicable local regulations").' },
  commonErrorsTroubleshooting: { max: 6,  rule: '2–6 common errors or faults with their likely cause or remedy.' },
};

/* 3.70.0: one list of everything the dialog can offer — the ten
   standard sections, then the user's own (key "custom:<id>"). */
function _specs(ctx) {
  return [
    ...TA_FIELD_SPECS.map(f => ({ key: f.key, label: _t(f.labelKey), custom: false })),
    ...(ctx.customSections || []).map(c => ({ key: c.key, label: c.title, custom: true })),
  ];
}
const _isCustom = (k) => String(k).indexOf('custom:') === 0;
const _guide = (k, ctx) => {
  if (!_isCustom(k)) return GUIDE[k];
  const sec = (ctx.customSections || []).find(c => c.key === k);
  const title = String((sec && sec.title) || '').replace(/["\n]/g, ' ').trim();
  return { max: 8, rule: `a section the analyst added to every task, titled "${title}": 2–8 short items that belong under that title for THIS task.` };
};
const _value = (ctx, k) => _isCustom(k)
  ? (((ctx.record && ctx.record.custom) || {})[k.slice(7)] || [])
  : ctx.record[k];

const _clean = (s) => String(s == null ? '' : s)
  .replace(/^[\s]*[•\-\*○●]\s*/, '').replace(/^[\s]*\d+[.)]\s*/, '').trim();

const _lines = (id, max = 40) => ((document.getElementById(id)?.value) || '')
  .split('\n').map(_clean).filter(Boolean).slice(0, max);

// ── Prompt ───────────────────────────────────────────────────

function _buildPrompt(ctx, wanted) {
  const v = (id) => (document.getElementById(id)?.value || '').trim();
  const occ = v('occupationTitle'), job = v('jobTitle'), scope = v('scopeOfWork'),
        sector = v('sector'), country = v('context');

  const lists = [
    ['KNOWLEDGE (Additional Info)', _lines('knowledgeInput')],
    ['SKILLS (Additional Info)',    _lines('skillsInput')],
    ['TOOLS, EQUIPMENT & MATERIALS (Additional Info)', _lines('toolsInput')],
    ['WORKER BEHAVIOURS (Additional Info)', _lines('behaviorsInput', 20)],
  ].filter(([, arr]) => arr.length)
   .map(([h, arr]) => `${h}:\n${arr.map(x => '  - ' + x).join('\n')}`).join('\n\n');

  const filled = _specs(ctx)
    .filter(f => !wanted.includes(f.key) && ctx.filled[f.key])
    .map(f => {
      const val = _value(ctx, f.key);
      const txt = Array.isArray(val) ? val.map(_clean).filter(Boolean).map(x => '  - ' + x).join('\n') : '  ' + String(val).trim();
      return `${f.custom ? `"${f.key}" (${f.label})` : f.key}:\n${txt}`;
    }).join('\n');

  const req = wanted.map(k => { const g = _guide(k, ctx);
    return `- "${k}": ${g.rule}${g.text ? ' (return a STRING)' : ' (return an ARRAY of strings)'}`; }).join('\n');

  return `You are an occupational analysis specialist performing a DACUM TASK ANALYSIS for ONE task.

${jobFocusLines()}${scope ? `\nSCOPE OF WORK (boundary): ${scope}` : ''}${sector ? `\nSECTOR: ${sector}` : ''}${country ? `\nCOUNTRY / CONTEXT: ${country}` : ''}

DUTY ${ctx.dutyLetter}: ${ctx.dutyTitle}
TASK TO ANALYSE — ${ctx.taskCode}: ${ctx.taskText}
${ctx.siblings.length ? `OTHER TASKS IN THIS DUTY (do NOT describe these — they mark the boundaries of the task above):\n${ctx.siblings.map(s => '  - ' + s).join('\n')}\n` : ''}
${lists ? `OCCUPATION-WIDE LISTS ALREADY AGREED FOR THIS CHART.\nWhere relevant, SELECT from these and reuse their wording; add task-specific items only where the lists do not cover this task. Never copy a whole list.\n\n${lists}\n` : ''}
${ctx.clusterCriteria.length ? `COMPETENCY CLUSTER CRITERIA ALREADY COVERING THIS TASK (stay consistent; do not contradict or duplicate them verbatim):\n${ctx.clusterCriteria.map(c => '  - ' + c).join('\n')}\n` : ''}
${filled ? `SECTIONS OF THIS TASK ALREADY COMPLETED BY THE USER (context only — do not return them):\n${filled}\n` : ''}
GENERATE ONLY THESE SECTIONS:
${req}

RULES:
- Describe THIS task only, as the holder of the job above performs it, within its scope.
- Be concrete and practical; short items, no explanations or numbering.
- NEVER invent standard numbers, regulation names, codes or clause references (no "ISO 9606", "OSHA 1910" etc.). If a specific standard would be needed, write it generically.
- If there is genuinely no basis for a section, return an empty array (or empty string) rather than guessing.

OUTPUT (STRICT — ONLY this JSON, no markdown, no commentary):
{ "sections": { ${wanted.map(k => `"${k}": ${_guide(k, ctx).text ? '""' : '[]'}`).join(', ')} } }
Use the section keys exactly as written above, including any "custom:" prefix.`;
}

// ── Call ─────────────────────────────────────────────────────

async function _generate(taskKey, wanted) {
  const ctx = getTaskAnalysisContext(taskKey);
  if (!ctx) return;

  showLoadingModal();
  await new Promise(r => setTimeout(r, 60));
  try {
    // 3.74.0: one shared call (ai_client.js callAI).
    const parsed = await callAI(_buildPrompt(ctx, wanted));
    const sections = parsed.sections || parsed;

    const out = {};
    wanted.forEach(k => {
      const g = _guide(k, ctx), val = sections[k];
      if (g.text) {
        const s = String(val || '').trim();
        if (s) out[k] = s;
      } else if (Array.isArray(val)) {
        const seen = new Set();
        const arr = val.map(_clean).filter(x => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
                       .slice(0, g.max);
        if (arr.length) out[k] = arr;
      }
    });

    const n = Object.keys(out).length;
    if (!n) { showStatus(_t('taAiEmpty'), 'error'); return; }
    writeTaskAnalysisAI(taskKey, out);
    incrementUsage();
    showStatus(_tf('taAiDone', { n }), 'success');
  } catch (err) {
    console.error('[task-analysis-ai]', err);
    showStatus(_tf('taAiFailed', { msg: err.message || String(err) }), 'error');
    showAIServiceError(err, { safeKey: 'aiSvcSafeGeneric' });
  } finally {
    hideLoadingModal();
  }
}

// ── Dialog ───────────────────────────────────────────────────

/* Learning Outcomes (and the modules built on them) linked to THIS
   task's Task Analysis criteria. Replacing those criteria flags the
   links ⚠ stale in the LO tab, so the dialog says so before the run. */
function _linkedDownstream(taskKey) {
  const outcomes = appState.learningOutcomesData?.outcomes || [];
  const los = outcomes.filter(o => (o.linkedCriteria || [])
    .some(pc => pc && !pc.stale && pc.taskId === taskKey));
  const ids = new Set(los.map(o => o.id));
  const mm = (appState.moduleMappingData?.modules || []).filter(m =>
    (m.learningOutcomes || []).some(o => o && ids.has(o.id))).length;
  return { lo: los.length, mm };
}

export async function openTaskAnalysisAI(taskKey) {
  const ctx = getTaskAnalysisContext(taskKey);
  if (!ctx) return;
  const link = _linkedDownstream(taskKey);

  // 3.75.0: the shared dialog (ai_draft.js). Same parts, same notes.
  const wanted = await openAIPartsDialog({
    id:       'taAiModal',
    title:    _t('taAiTitle'),
    subtitle: `${ctx.taskCode}. ${ctx.taskText}`,
    intro:    _t('taAiIntro'),
    parts:    _specs(ctx).map(f => ({
      key: f.key, label: f.label, filled: !!ctx.filled[f.key],
      group: f.custom ? _t('taAiCustomHead') : undefined,
    })),
    notes: [
      // Ticking a filled "Performance Criteria" that Learning Outcomes use.
      { icon: '🔗', tone: 'link', text: _tf('taAiLinkedWarn', link),
        when: (on) => on.has('performanceCriteria') && !!ctx.filled.performanceCriteria && link.lo > 0 },
      { icon: '↶',  tone: 'restore', text: _t('taAiRestoreNote') },
      { icon: '⚠️', tone: 'warn', text: _t('taAiNote') },
    ],
  });
  if (wanted && wanted.length) _generate(taskKey, wanted);
}
