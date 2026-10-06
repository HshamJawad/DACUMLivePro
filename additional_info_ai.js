// ============================================================
// /additional_info_ai.js
// AI generation for the Additional Information tab.
//
// Mirrors the duties/tasks generator in projects.js:
//   • Same Railway backend + /api/generate-dacum endpoint (that
//     route is a generic "run this prompt" proxy — it isn't
//     duties-specific, so no backend change is needed here).
//   • Same usage-limit accounting (checkUsageLimit / incrementUsage).
//   • Same loading modal and status-toast conventions.
//   • Same grounding inputs: Occupation Title (required), plus
//     Job Title / Scope of Work / Sector / Context when present.
//
// One thing it does that the duties generator can't: when duties and
// tasks already exist, they are fed into the prompt as the primary
// evidence base. Knowledge, Skills, Tools and Behaviors are supposed
// to be *derived from* the tasks a worker actually performs — that's
// the DACUM logic — so generating them from the chart rather than
// from the occupation title alone produces far more defensible
// output. The chart is truncated (see _summariseChart) to keep the
// request within a sane size on large charts.
//
// Since 3.42.1 the Skills section is kept to occupation-specific
// technical skills whenever the Skills Level Matrix lists employability
// competencies: the matrix is exported next to these sections, so the
// same "Work within a team" line would otherwise appear twice.
//
// Output is written straight into the seven fixed textareas of the
// Additional Information tab, as "• " bullet lines — the format the
// tab's own Bullets button produces and every reader already accepts. Custom sections added by the user are
// deliberately NOT touched — their headings are user-defined and the
// model has no reliable way to know what belongs in them.
// ============================================================

import { appState, skillsLevelIsEmpty, defaultSkillsLevelData } from './state.js';
import { showStatus } from './renderer.js';
import { checkUsageLimit, incrementUsage,
         showLoadingModal, hideLoadingModal } from './storage.js';
import { isBatchRun } from './draft_mode.js';
import { showAIServiceError, jobFocusLines, callAI } from './ai_client.js';
import { openAIPartsDialog, writeAIDraft, clearAIDraft, restoreAIDraft,
         isAIDraft, canRestoreAI, aiMarkHTML } from './ai_draft.js';


/* i18n access — resolved lazily; see duties.js for why. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

/* Output-language directive for the generation backend. Appended at the
   ONE place this module builds a request, so any prompt added later is
   covered without having to remember. Empty string in English. */
const _aiDir = () => (window.i18n ? window.i18n.aiDirective() : '');



// Maps the JSON keys the model returns → the textarea that receives
// them. Order here is also the order used in the overwrite warning.
// `headingId` / `labelKey` give the section's name as the user sees it
// (renamed heading, else the translated default). `label` is the
// English name used inside the prompt only.
//
// `max` is a HARD cap enforced in code, not just in the prompt.
// Language models routinely overshoot soft counts, and this output is
// only ever a first draft for the facilitator — an over-long list
// costs review time in the workshop and buries the items that
// actually matter. The prompt asks for min–max; this backstop
// guarantees the ceiling. `min` is prompt-side only (you cannot
// invent missing items in code).
const _FIELD_MAP = [
  { key: 'knowledge',  inputId: 'knowledgeInput', headingId: 'knowledgeHeading', labelKey: 'sectionKnowledge',  label: 'Knowledge Requirements',                 min: 10, max: 15 },
  { key: 'skills',     inputId: 'skillsInput', headingId: 'skillsHeading', labelKey: 'sectionSkills',     label: 'Skills Requirements',                    min: 10, max: 15 },
  { key: 'behaviors',  inputId: 'behaviorsInput', headingId: 'behaviorsHeading', labelKey: 'sectionBehaviors',  label: 'Worker Behaviors/Traits',                min:  8, max: 12 },
  { key: 'tools',      inputId: 'toolsInput', headingId: 'toolsHeading', labelKey: 'sectionTools',      label: 'Tools, Equipment, Supplies and Materials', min: 12, max: 18 },
  { key: 'trends',     inputId: 'trendsInput', headingId: 'trendsHeading', labelKey: 'sectionTrends',     label: 'Future Trends and Concerns',             min:  6, max: 10 },
  { key: 'acronyms',   inputId: 'acronymsInput', headingId: 'acronymsHeading', labelKey: 'sectionAcronyms',   label: 'Acronyms',                               min:  6, max: 12 },
  { key: 'careerPath', inputId: 'careerPathInput', headingId: 'careerPathHeading', labelKey: 'sectionCareerPath', label: 'Career Path',                            min:  4, max:  6 },
];

/* The section name shown to the user: the heading as it stands in the
   tab (it may have been renamed), else the translated default. */
function _sectionLabel(f) {
  const h = document.getElementById(f.headingId);
  const txt = h ? String(h.textContent || '').trim() : '';
  if (txt) return txt;
  const tr = _t(f.labelKey);
  return tr && tr !== f.labelKey ? tr : f.label;
}

/* The bullet the tab's "Bullets" button uses (renderer.js formatList). */
const _BULLET = '\u2022 ';

/** Look up the configured range for a field key. */
function _range(key) {
  const f = _FIELD_MAP.find(x => x.key === key);
  return f ? { min: f.min, max: f.max } : { min: 5, max: 15 };
}

// ── Input readers ─────────────────────────────────────────────

function _readAIInputs() {
  return {
    occupationTitle: (document.getElementById('occupationTitle')?.value || '').trim(),
    jobTitle:        (document.getElementById('jobTitle')?.value        || '').trim(),
    scopeOfWork:     (document.getElementById('scopeOfWork')?.value     || '').trim(),
    sector:          (document.getElementById('sector')?.value          || '').trim(),
    context:         (document.getElementById('context')?.value         || '').trim(),
  };
}

/**
 * Condense the current chart into a compact text block for the prompt.
 * Returns '' when there is no usable chart yet, in which case the
 * generator falls back to occupation-level reasoning.
 */
function _summariseChart() {
  const duties = (appState.dutiesData || []).filter(
    d => (d.title || '').trim() || (d.tasks || []).some(t => (t.text || '').trim())
  );
  if (!duties.length) return '';

  // Caps keep very large charts from blowing up the request body.
  const MAX_DUTIES        = 14;
  const MAX_TASKS_PER_DUTY = 12;

  const lines = duties.slice(0, MAX_DUTIES).map(duty => {
    const tasks = (duty.tasks || [])
      .map(t => (t.text || '').trim())
      .filter(Boolean)
      .slice(0, MAX_TASKS_PER_DUTY);
    const title = (duty.title || '').trim() || 'Untitled duty';
    return tasks.length
      ? `- ${title}\n${tasks.map(t => `    · ${t}`).join('\n')}`
      : `- ${title}`;
  });

  return lines.join('\n');
}

/**
 * Employability competencies listed in the Skills Level Matrix — the
 * matrix as it stands, or the default rows a fresh project will show.
 * Capped so a very large matrix cannot swell the request.
 */
function _matrixCompetencies() {
  let data;
  try {
    data = skillsLevelIsEmpty() ? defaultSkillsLevelData() : appState.skillsLevelData;
  } catch (e) { data = []; }
  const out = [];
  const seen = new Set();
  (data || []).forEach(cat => (cat.competencies || []).forEach(c => {
    const t = String(c && c.text || '').trim();
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }));
  return out.slice(0, 60);
}

/** True when at least one of the seven fields already has text. */
function _collectFilledFields() {
  return _FIELD_MAP.filter(f => {
    const el = document.getElementById(f.inputId);
    return el && el.value.trim().length > 0;
  });
}

// ── Prompt builder ────────────────────────────────────────────

function _buildPrompt(inputs, chartSummary, matrixComps, hasLangDirective, onlyKeys = null) {
  const { occupationTitle, jobTitle, scopeOfWork, sector, context } = inputs;
  const matrix = (matrixComps || []).length > 0;

  /* 3.75.0: generate only the ticked sections; filled sections that are
     NOT being generated go in as agreed context, so the new ones fit
     them and do not repeat them. */
  const subset = Array.isArray(onlyKeys) && onlyKeys.length && onlyKeys.length < _FIELD_MAP.length;
  const keepBlock = subset ? _FIELD_MAP
    .filter(f => !onlyKeys.includes(f.key))
    .map(f => {
      const lines = (document.getElementById(f.inputId)?.value || '').split('\n')
        .map(l => l.replace(/^[\s]*[•\-\*○●]\s*/, '').replace(/^[\s]*\d+[.)]\s*/, '').trim())
        .filter(Boolean).slice(0, 20);
      return lines.length ? `${f.key} (${f.label}) — already agreed:\n${lines.map(l => '  - ' + l).join('\n')}` : '';
    }).filter(Boolean).join('\n\n') : '';

  return `You are an occupational analysis engine specialized in DACUM methodology.
Your task is to generate the SUPPORTING INFORMATION sections of a DACUM chart.
The output will be injected directly into a DACUM chart UI.

INPUT:
${jobFocusLines()}${scopeOfWork ? `
Scope of Work (CRITICAL BOUNDARY): ${scopeOfWork}` : ''}${sector ? `
Sector: ${sector}` : ''}${context ? `
Country / Context: ${context}` : ''}
${chartSummary ? `
EXISTING DACUM CHART (PRIMARY EVIDENCE BASE):
${chartSummary}
` : ''}${matrix ? `
EMPLOYABILITY COMPETENCIES ALREADY COVERED (Skills Level Matrix — do NOT repeat):
${matrixComps.map(c => `- ${c}`).join('\n')}
` : ''}
UNIT OF ANALYSIS (DACUM — VERY IMPORTANT):
- Everything you generate is for the JOB above — what its holders must
  know, do and use. The occupation is context only; do NOT add items
  that belong to other jobs in the same occupation.
- If Scope of Work is provided → it further DEFINES and LIMITS the job.
${chartSummary ? `- The chart above lists the REAL WORK already agreed for this job.
  Every item you generate must be traceable to those duties and tasks.
  Do NOT introduce knowledge, skills or tools for work that is not in the chart.
` : ''}
TASK:
${subset ? `GENERATE ONLY THESE SECTIONS: ${onlyKeys.join(', ')}.
For every other key return an EMPTY array — those sections are already
done by the panel.${keepBlock ? `

SECTIONS ALREADY AGREED (keep consistent with them; do NOT repeat their items):
${keepBlock}` : ''}

The rules for each section follow.` : 'Generate the following seven sections.'}

1. knowledge — Knowledge Requirements
   - WHAT THE WORKER MUST KNOW (cognitive, theoretical, regulatory)
   - Noun phrases, e.g. "Principles of hydraulic pressure", "Local electrical code"
   - NOT actions, NOT tasks
   - COUNT: minimum ${_range('knowledge').min}, maximum ${_range('knowledge').max} items

2. skills — Skills Requirements
${matrix ? `   - OCCUPATION-SPECIFIC TECHNICAL SKILLS the work demands
   - Employability skills (communication, teamwork, problem solving,
     safety awareness, learning, initiative, technology use…) are covered
     by the Skills Level Matrix listed above — do NOT include them here,
     neither verbatim nor reworded.` : `   - TRANSFERABLE ABILITIES the work demands (technical + employability)`}
   - Short ability statements, e.g. "Interpret technical drawings"
   - Distinct from tasks: a skill is an underlying capability, a task is a
     discrete unit of work. Do NOT simply restate the chart's tasks here.
   - COUNT: minimum ${_range('skills').min}, maximum ${_range('skills').max} items

3. behaviors — Worker Behaviors/Traits
   - Personal attributes and work habits expected on the job
   - Short trait phrases, e.g. "Attention to detail", "Punctuality"
   - COUNT: minimum ${_range('behaviors').min}, maximum ${_range('behaviors').max} items

4. tools — Tools, Equipment, Supplies and Materials
   - MAIN CATEGORIES AND KEY ITEMS ONLY — this is a facilitator's draft,
     NOT a procurement inventory. A real workplace may use hundreds of
     items; list only what is characteristic of this job.
   - Group related consumables rather than listing them one by one
     (e.g. "Fasteners: screws, bolts, anchors" as ONE item, not three)
   - Prefer items that appear in, or are clearly implied by, the tasks
   - Include category when useful, e.g. "Digital multimeter", "PPE: safety goggles"
   - COUNT: minimum ${_range('tools').min}, maximum ${_range('tools').max} items

5. trends — Future Trends and Concerns
   - Realistic developments affecting this job (and its occupation) in the next 3–7 years
   - Technology, regulation, market, workforce, sustainability
   - Reflect the Country/Context and Sector when given
   - COUNT: minimum ${_range('trends').min}, maximum ${_range('trends').max} items

6. acronyms — Acronyms
   - Abbreviations that genuinely appear in the work of this job
   - STRICT FORMAT: "ABC - Full Expansion" (one per item)
   - Only include acronyms you are confident are real and in use
   - COUNT: minimum ${_range('acronyms').min}, maximum ${_range('acronyms').max} items

7. careerPath — Career Path
   - Realistic progression into and beyond this job within its occupation, entry level upward
   - STRICT FORMAT: "Level: Role title" e.g. "Entry Level: Apprentice Technician"
   - Order from entry to most senior
   - COUNT: minimum ${_range('careerPath').min}, maximum ${_range('careerPath').max} items

GENERAL RULES:
- COUNT LIMITS ARE MANDATORY, not suggestions. Never exceed a maximum.
  This output is a STARTING DRAFT for a DACUM facilitator to review with
  an expert panel — not an exhaustive reference. A shorter, sharper list
  of the items that genuinely characterise the job is far more
  useful than a long list padded with generic or marginal entries.
- If you cannot reach a minimum with genuinely relevant items, return
  fewer rather than padding with filler.
- Every item is a SINGLE LINE of plain text.
- Do NOT prefix items with bullets, dashes, or numbers — the UI applies
  its own formatting.
- Keep each item concise (under about 12 words).
- No duplicates within a section.
- Stay INSIDE the defined scope; prefer specificity over completeness.
- Be data-informed and realistic for the given sector and country context.
${hasLangDirective ? '' : '- Use the same language as the Occupation Title input.\n'}
OUTPUT FORMAT (STRICT – NO EXTRA TEXT):
Return ONLY valid JSON using the following structure:

{
  "knowledge":  ["item", "item"],
  "skills":     ["item", "item"],
  "behaviors":  ["item", "item"],
  "tools":      ["item", "item"],
  "trends":     ["item", "item"],
  "acronyms":   ["ABC - Full Expansion"],
  "careerPath": ["Entry Level: Role title"]
}

Generate the supporting information now in valid JSON format only.`;
}

// ── Public entry point ────────────────────────────────────────

/**
 * generateAdditionalInfoAI()
 * Validates, prompts, calls the backend, and fills the seven
 * Additional Information textareas. Returns true on success.
 */
/**
 * @param {string[]|null} onlyKeys  3.75.0: sections to generate (null = all)
 * @param {{confirmed?:boolean}} opts  confirmed: the dialog already showed
 *        what will be replaced, so the overwrite question is skipped
 */
export async function generateAdditionalInfoAI(onlyKeys = null, opts = {}) {
  const wanted = Array.isArray(onlyKeys) && onlyKeys.length
    ? _FIELD_MAP.filter(f => onlyKeys.includes(f.key)).map(f => f.key)
    : _FIELD_MAP.map(f => f.key);
  // ── Usage limit (shared budget with the duties generator) ──
  const usageStatus = checkUsageLimit();
  if (!usageStatus.allowed) {
    showStatus('❌ ' + _tf('msgDailyLimit', { n: usageStatus.count }), 'error');
    return false;
  }

  const inputs = _readAIInputs();

  if (!inputs.occupationTitle) {
    alert(_t('msgOccupationRequiredAddInfo'));
    showStatus(_t('msgOccupationRequired'), 'error');
    return false;
  }

  // ── Overwrite guard — name exactly which sections are at risk ──
  const filled = _collectFilledFields().filter(f => wanted.includes(f.key));
  /* The Full Draft run asks about overwriting ONCE, up front, naming
     every tab at stake. Re-asking here would mean four or five
     dialogs during a run the user has already authorised — and each
     one silently stalls the pipeline until someone notices. */
  if (!isBatchRun() && !opts.confirmed && filled.length) {
    const names = filled.map(f => `  • ${_sectionLabel(f)}`).join('\n');
    if (!confirm('\u26A0\uFE0F ' + _tf('confirmReplaceSections', { list: names }))) {
      showStatus(_t('msgCancelAddInfo'), 'error');
      return false;
    }
  }

  const chartSummary = _summariseChart();

  showLoadingModal();
  await new Promise(resolve => setTimeout(resolve, 100));

  /* One output-language rule per request: when the interface asks for a
     language (AR/FR), the "same language as the Occupation Title" rule
     is left out so the two can never contradict each other. */
  const langDir      = _aiDir();
  const matrixComps  = _matrixCompetencies();
  const prompt = _buildPrompt(inputs, chartSummary, matrixComps, !!langDir,
                              wanted.length < _FIELD_MAP.length ? wanted : null);
  const matrixKeys = new Set(matrixComps.map(c => c.toLowerCase()));

  try {
    // 3.74.0: one shared call (ai_client.js callAI); it appends the
    // same language directive (langDir) the prompt was told about.
    const info = await callAI(prompt);

    // ── Write into the textareas ────────────────────────────
    // Partial responses are tolerated: a section the model omitted
    // is left untouched rather than being blanked out.
    let filledCount = 0;
    let itemCount   = 0;
    let trimmedAny  = false;

    _FIELD_MAP.forEach(({ key, inputId, max }) => {
      if (!wanted.includes(key)) return;   // 3.75.0: a section not ticked is never touched
      const items = info[key];
      if (!Array.isArray(items) || items.length === 0) return;

      let lines = items
        .map(v => String(v == null ? '' : v).trim())
        // Strip any bullet/number the model added despite instructions
        .map(v => v.replace(/^[\s]*[•\-\*○●]\s*/, '').replace(/^[\s]*\d+[.)]\s*/, '').trim())
        .filter(Boolean);

      // Drop case-insensitive duplicates before applying the cap, so a
      // repeated item never consumes one of the allotted slots.
      const seen = new Set();
      lines = lines.filter(v => {
        const k = v.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      // Backstop for the matrix rule: a skill identical to a matrix
      // competency is dropped (reworded overlap is left to the prompt).
      if (key === 'skills' && matrixKeys.size) {
        lines = lines.filter(v => !matrixKeys.has(v.toLowerCase()));
      }

      // HARD CAP — the prompt states the maximum, this enforces it.
      // Items are kept in the model's own order, which puts the most
      // characteristic entries first.
      if (max && lines.length > max) {
        lines = lines.slice(0, max);
        trimmedAny = true;
      }

      if (!lines.length) return;

      const el = document.getElementById(inputId);
      if (!el) return;

      // 3.75.0: written as an AI draft — the old text is kept for
      // "↶ Restore previous" until the user edits the section.
      _writeInfoDraft(key, el, lines.map(v => _BULLET + v).join('\n'));
      filledCount++;
      itemCount += lines.length;
    });

    if (filledCount === 0) {
      throw new Error('AI response contained no usable sections');
    }

    hideLoadingModal();
    incrementUsage();
    renderAdditionalInfoMarks();

    const basis = _t(chartSummary ? 'aiInfoBasisChart' : 'aiInfoBasisOccupation');
    const trimNote = trimmedAny ? ' ' + _t('aiInfoTrimNote') : '';
    showStatus(
      '✓ ' + _tf('msgAddInfoGenerated',
        { basis: basis, sections: filledCount, items: itemCount }) + trimNote,
      'success'
    );
    return true;

  } catch (error) {
    hideLoadingModal();
    console.error('Error generating Additional Information:', error);
    showStatus(_t('msgAIFailed'), 'error');
    showAIServiceError(error, { safeKey: 'aiErrSafeInfo', tipKeys: ['aiTipInfo1', 'aiTipInfo2', 'aiTipInfo3'] });
    return false;
  }
}

// ── 3.75.0: AI-draft marks on the sections ─────────────────────
// Stored in appState.additionalInfoAI (saved with the project):
//   _aiDraft[key] = true · _aiPrev[key] = old text · _aiText[key] = text written
// The sections are plain textareas that other code also rewrites
// (Bullets / Numbering / Clear, snapshots, imports), so a mark is shown
// only while the textarea still holds exactly what the AI wrote; any
// other text means the user's own work now, and the mark is dropped.

function _holder() {
  if (!appState.additionalInfoAI || typeof appState.additionalInfoAI !== 'object') appState.additionalInfoAI = {};
  return appState.additionalInfoAI;
}

function _writeInfoDraft(key, el, text) {
  const h = _holder();
  if (!h._aiText || typeof h._aiText !== 'object') h._aiText = {};
  writeAIDraft(h, key, text, {
    get:    () => el.value,
    set:    (k, v) => { el.value = v; },
    filled: () => !!el.value.trim(),
  });
  // Recorded BEFORE the input event below, so the listener recognises
  // the AI's own write and keeps the mark and the restore value.
  h._aiText[key] = text;
  try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
}

function _dropInfoDraft(key) {
  const h = _holder();
  clearAIDraft(h, key);
  if (h._aiText) delete h._aiText[key];
}

/** Draw (or remove) the mark row above each section. */
export function renderAdditionalInfoMarks() {
  const h = _holder();
  _FIELD_MAP.forEach(({ key, inputId }) => {
    const el = document.getElementById(inputId);
    document.querySelectorAll(`.ai-draft-row[data-info-key="${key}"]`).forEach(n => n.remove());
    if (!el || !isAIDraft(h, key)) return;
    if (el.value !== ((h._aiText || {})[key] || '')) { _dropInfoDraft(key); return; }
    const row = document.createElement('div');
    row.className = 'ai-draft-row';
    row.setAttribute('data-info-key', key);
    row.innerHTML = aiMarkHTML({ markId: 'info|' + key, restore: canRestoreAI(h, key),
                                 action: 'restore-info-ai', data: { key } });
    el.parentNode.insertBefore(row, el);
  });
}

/** The ✨ button: choose the sections, then generate. */
export async function openAdditionalInfoAI() {
  const keys = await openAIPartsDialog({
    id:    'infoAiModal',
    title: _t('aiInfoDlgTitle'),
    intro: _t('aiInfoDlgIntro'),
    parts: _FIELD_MAP.map(f => ({
      key: f.key, label: _sectionLabel(f),
      filled: !!(document.getElementById(f.inputId)?.value || '').trim(),
    })),
    notes: [
      { icon: '↶',  tone: 'restore', text: _t('taAiRestoreNote') },
      { icon: '⚠️', tone: 'warn', text: _t('aiInfoDlgNote') },
    ],
  });
  if (!keys || !keys.length) return false;
  return generateAdditionalInfoAI(keys, { confirmed: true });
}

let _marksWired = false;
function _wireInfoMarks() {
  if (_marksWired || typeof document === 'undefined') return;
  _marksWired = true;
  const ids = new Map(_FIELD_MAP.map(f => [f.inputId, f.key]));

  // Typing in a section makes it the user's own: drop the mark.
  document.addEventListener('input', (e) => {
    const key = e.target && ids.get(e.target.id);
    if (!key || !isAIDraft(_holder(), key)) return;
    if (e.target.value === ((_holder()._aiText || {})[key] || '')) return;   // our own write
    _dropInfoDraft(key);
    document.querySelectorAll(`.ai-draft-row[data-info-key="${key}"]`).forEach(n => n.remove());
  }, true);

  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'restore-info-ai') {
      const key = btn.getAttribute('data-key');
      const f = _FIELD_MAP.find(x => x.key === key);
      const el = f && document.getElementById(f.inputId);
      if (!el) return;
      const h = _holder();
      if (!restoreAIDraft(h, key, (k, v) => { el.value = v; })) return;
      if (h._aiText) delete h._aiText[key];
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
      renderAdditionalInfoMarks();
      try { import('./dacum_projects.js').then(m => m.saveCurrentProject()).catch(() => {}); } catch (_) {}
      showStatus(_t('taAiRestored') + ' ✓', 'success');
      return;
    }
    // Bullets / Numbering / Clear rewrite the textarea without an input
    // event; re-check the marks once they have run.
    if ((action === 'format-list' || action === 'clear-section') && ids.has(btn.getAttribute('data-input-id'))) {
      setTimeout(renderAdditionalInfoMarks, 0);
    }
  });

  document.addEventListener('dacum:project-loaded', () => setTimeout(renderAdditionalInfoMarks, 0));
  window.addEventListener('dacum:langchange', () => setTimeout(renderAdditionalInfoMarks, 0));
  document.addEventListener('dacum:app-ready', () => setTimeout(renderAdditionalInfoMarks, 0));
}
_wireInfoMarks();
