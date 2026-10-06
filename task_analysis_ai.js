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
import { throwIfAIError, showAIServiceError, BACKEND_URL, jobFocusLines } from './ai_client.js';
import { showStatus, escapeHtml } from './renderer.js';
import { incrementUsage, showLoadingModal, hideLoadingModal } from './storage.js';
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
    const res = await fetch(`${BACKEND_URL}/api/generate-dacum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: _buildPrompt(ctx, wanted) + _aiDir() }),
    });
    await throwIfAIError(res);
    const data = await res.json();
    const text = (data.content || []).map(b => (b.type === 'text' ? b.text : '')).join('')
      .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (_) {
      const a = text.indexOf('{'), b = text.lastIndexOf('}');
      parsed = JSON.parse(text.slice(a, b + 1));
    }
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

export function openTaskAnalysisAI(taskKey) {
  const ctx = getTaskAnalysisContext(taskKey);
  if (!ctx) return;

  document.getElementById('taAiModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'taAiModal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('dir', (window.i18n && window.i18n.isRTL()) ? 'rtl' : 'ltr');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;' +
    'justify-content:center;padding:16px;background:rgba(0,0,0,0.55);';

  const specs = _specs(ctx);
  const rows = specs.map((f, i) => {
    const filled = !!ctx.filled[f.key];
    const k = escapeHtml(f.key);
    const head = (f.custom && (i === 0 || !specs[i - 1].custom))
      ? `<p style="margin:12px 0 2px;font-size:.74em;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#0369a1;">${escapeHtml(_t('taAiCustomHead'))}</p>` : '';
    return `${head}
      <label style="display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid #f1f5f9;cursor:pointer;">
        <input type="checkbox" data-ta-ai-field="${k}" ${filled ? '' : 'checked'}
               style="width:18px;height:18px;flex-shrink:0;accent-color:#0284c7;">
        <span style="flex:1;min-width:0;font-size:.9em;color:#334155;overflow-wrap:anywhere;"><span dir="auto">${escapeHtml(f.label)}</span></span>
        ${filled ? `<span data-ta-ai-tag="${k}" style="font-size:.72em;font-weight:700;color:#64748b;background:#f1f5f9;border-radius:999px;padding:2px 8px;white-space:nowrap;">${escapeHtml(_t('taAiFilled'))}</span>` : ''}
      </label>`;
  }).join('');

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;max-width:520px;width:100%;
         box-shadow:0 24px 60px rgba(0,0,0,0.35);overflow:hidden;font-family:inherit;
         max-height:88vh;display:flex;flex-direction:column;">
      <div style="padding:16px 20px;display:flex;align-items:center;gap:10px;
           background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border-bottom:1px solid #bae6fd;flex-shrink:0;">
        <span style="font-size:1.3em;line-height:1;">✨</span>
        <div style="min-width:0;">
          <p style="margin:0;font-size:.98em;font-weight:800;color:#075985;">${escapeHtml(_t('taAiTitle'))}</p>
          <p style="margin:2px 0 0;font-size:.8em;color:#0369a1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <bdi>${escapeHtml(ctx.taskCode)}</bdi>. ${escapeHtml(ctx.taskText)}</p>
        </div>
      </div>
      <div style="padding:14px 20px;overflow-y:auto;flex:1;">
        <p style="margin:0 0 8px;font-size:.85em;color:#475569;line-height:1.6;">${escapeHtml(_t('taAiIntro'))}</p>
        <div>${rows}</div>
        <p data-ta-ai-lolink style="display:none;margin:12px 0 0;font-size:.8em;color:#9a3412;background:#fff7ed;
                  border:1px solid #fed7aa;border-radius:8px;padding:8px 10px;line-height:1.55;">🔗 ${
          escapeHtml(_tf('taAiLinkedWarn', _linkedDownstream(taskKey)))}</p>
        <p data-ta-ai-restorenote style="display:none;margin:12px 0 0;font-size:.8em;color:#075985;background:#f0f9ff;
                  border:1px solid #bae6fd;border-radius:8px;padding:8px 10px;line-height:1.55;">↶ ${escapeHtml(_t('taAiRestoreNote'))}</p>
        <p style="margin:12px 0 0;font-size:.8em;color:#92400e;background:#fffbeb;border:1px solid #fde68a;
                  border-radius:8px;padding:8px 10px;line-height:1.55;">⚠️ ${escapeHtml(_t('taAiNote'))}</p>
      </div>
      <div style="padding:12px 20px;border-top:1px solid #eef0f4;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;flex-wrap:wrap;">
        <button type="button" data-ta-ai-cancel style="padding:9px 18px;background:#f1f5f9;color:#334155;border:none;
                border-radius:8px;font-size:.88em;font-weight:600;cursor:pointer;font-family:inherit;">${escapeHtml(_t('btnCancel'))}</button>
        <button type="button" data-ta-ai-go style="padding:9px 20px;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;border:none;
                border-radius:8px;font-size:.88em;font-weight:700;cursor:pointer;font-family:inherit;">${escapeHtml(_t('taAiGenerate'))}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-ta-ai-cancel]').addEventListener('click', close);

  // Ticking a filled "Performance Criteria" that Learning Outcomes use
  // shows the downstream warning.
  const link = _linkedDownstream(taskKey);
  const linkNote = overlay.querySelector('[data-ta-ai-lolink]');
  const syncLinkNote = () => {
    const cb = overlay.querySelector('input[data-ta-ai-field="performanceCriteria"]');
    const on = !!(cb && cb.checked && ctx.filled.performanceCriteria && link.lo > 0);
    if (linkNote) linkNote.style.display = on ? '' : 'none';
  };
  syncLinkNote();

  // 3.70.0: when a filled section is ticked, say it can be restored.
  const restoreNote = overlay.querySelector('[data-ta-ai-restorenote]');
  const syncRestoreNote = () => {
    const on = [...overlay.querySelectorAll('input[data-ta-ai-field]:checked')]
      .some(cb => ctx.filled[cb.getAttribute('data-ta-ai-field')]);
    if (restoreNote) restoreNote.style.display = on ? '' : 'none';
  };
  syncRestoreNote();

  // A ticked FILLED section will be replaced — say so on its tag.
  overlay.querySelectorAll('input[data-ta-ai-field]').forEach(cb => {
    cb.addEventListener('change', () => {
      syncLinkNote();
      syncRestoreNote();
      const tag = [...overlay.querySelectorAll('[data-ta-ai-tag]')]
        .find(el => el.getAttribute('data-ta-ai-tag') === cb.getAttribute('data-ta-ai-field'));
      if (!tag) return;
      tag.textContent = _t(cb.checked ? 'taAiWillReplace' : 'taAiFilled');
      tag.style.color = cb.checked ? '#b45309' : '#64748b';
      tag.style.background = cb.checked ? '#fef3c7' : '#f1f5f9';
    });
  });

  overlay.querySelector('[data-ta-ai-go]').addEventListener('click', () => {
    const wanted = [...overlay.querySelectorAll('input[data-ta-ai-field]:checked')]
      .map(cb => cb.getAttribute('data-ta-ai-field'));
    if (!wanted.length) { showStatus(_t('taAiNoneSelected'), 'error'); return; }
    close();
    _generate(taskKey, wanted);
  });
}
