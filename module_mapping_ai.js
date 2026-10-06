// ============================================================
// /module_mapping_ai.js
// Module generation for the Module Mapping tab.
//
// Two generators, deliberately different in kind:
//
//   1. generateOneModulePerOutcome() — LOCAL, instant, no network.
//      "One Learning Outcome -> one Module" is pure arithmetic: there
//      is no judgement to make, so routing it through a language model
//      would only add latency, consume the daily AI quota, break
//      offline, and risk a slightly different answer each run. It runs
//      in the browser and is always correct.
//
//   2. generateModulesAI() — grouping + naming + SEQUENCING, and
//      (optionally) a suggested LEVEL and specialisation per module.
//      "Which outcomes belong together, and at which level?" is a
//      pedagogical judgement that needs to read the content, which is
//      exactly what the model is good at.
//
// Options (modules.js → getModuleGenOptions, shown inside the card):
//   • keepExisting — only outcomes not yet in a module are used and the
//     new modules are ADDED; hand-built modules are never touched.
//     Otherwise the generated set replaces the existing modules (after
//     a confirmation naming how many would be lost).
//   • assignLevels — the model also proposes a level (1..levelCount)
//     and, where the programme specialises, a track code.
//
// Manual grouping via the existing controls is untouched by both.
//
// Hard guarantees enforced in code, not just asked for in the prompt:
//   • Only EXISTING learning outcomes are used — any id the model
//     invents is discarded (_resolveOutcomeIds).
//   • Every outcome in scope lands in exactly one module; anything the
//     model forgot is swept into a final review module rather than
//     silently vanishing from the curriculum.
//   • Module size is capped at MAX_LOS_PER_MODULE.
//   • Levels are clamped to 1..levelCount; anything else is left blank.
//   • Titles are stored WITHOUT a number — "M1, M2 …" is display-only
//     and follows position, so it stays right after any reorder.
// ============================================================

import { appState }        from './state.js';
import { showStatus }      from './renderer.js';
import { renderModules, renderModuleLoList,
         getModuleGenOptions, persistModuleMapping, loText } from './modules.js';
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
const _aiDir = () => (window.i18n ? window.i18n.aiDirective() : '');



// Grouping bounds. MAX is enforced in code; inside it the model is
// guided (2-4 outcomes is typical). A single-outcome module is allowed
// when that outcome is a large, stand-alone capability.
const TYPICAL_MIN_LOS    = 2;
const TYPICAL_MAX_LOS    = 4;
const MAX_LOS_PER_MODULE = 6;

// ── Shared helpers ────────────────────────────────────────────

function _outcomes() {
  return (appState.learningOutcomesData?.outcomes) || [];
}

function _modules() {
  return (appState.moduleMappingData?.modules) || [];
}

/** Outcomes the run works on: all of them, or only unassigned ones. */
function _scope(keepExisting) {
  const all = _outcomes();
  if (!keepExisting) return all;
  const inModule = new Set();
  _modules().forEach(m => (m.learningOutcomes || []).forEach(o => o && inModule.add(o.id)));
  return all.filter(o => !inModule.has(o.id));
}

/** Human-readable text for an outcome: its own statement, or its criteria. */
function _outcomeText(o) {
  const stated = (o.statement || '').trim();
  if (stated) return stated;
  const crit = (o.linkedCriteria || [])
    .map(c => (c.text || '').trim())
    .filter(Boolean);
  return crit.length ? crit.join('; ') : '(no statement yet)';
}

/** Strip any number the model (or an old version) put in a title. */
function _cleanTitle(t) {
  return String(t || '').trim()
    .replace(/^\s*(module|unit|m)\s*\d+\s*[:.\-–—]\s*/i, '')
    .replace(/^\s*\d+\s*[.)\-–—:]\s*/, '')
    .trim();
}

/** A unique module id that never collides with an existing one. */
function _newModuleId(keepExisting = true) {
  const mm = appState.moduleMappingData;
  // In replace mode the old modules are about to go, so their ids are free.
  const taken = new Set(keepExisting ? _modules().map(m => m.id) : []);
  /* Module Curriculum keeps its records by module id, even for modules
     that were replaced (so Undo can bring them back). Replace mode resets
     the counter, so without this a new "module_1" would inherit the
     purpose, credits, resources and hours written for the old one. */
  Object.keys(appState.moduleCurriculumData?.byModule || {}).forEach(id => taken.add(id));
  let id;
  do { mm.moduleCounter = (mm.moduleCounter || 0) + 1; id = `module_${mm.moduleCounter}`; }
  while (taken.has(id));
  return id;
}

/** Add to, or replace, the module list; then refresh, persist, render. */
function _commitModules(newModules, keepExisting) {
  const mm = appState.moduleMappingData;
  if (keepExisting) mm.modules = _modules().concat(newModules);
  else              mm.modules = newModules;
  persistModuleMapping();
  renderModuleLoList();
  renderModules();
}

/**
 * Confirm before discarding existing modules. Names the count so the
 * user knows exactly what is at stake rather than facing a generic
 * "are you sure?". Nothing to confirm when existing modules are kept.
 */
function _confirmOverwrite(keepExisting) {
  const existing = _modules();
  if (keepExisting || existing.length === 0) return true;
  /* The Full Draft run asks about overwriting ONCE, up front, naming
     every tab at stake. Re-asking here would mean four or five
     dialogs during a run the user has already authorised — and each
     one silently stalls the pipeline until someone notices. */
  if (isBatchRun()) return true;
  return confirm('⚠️ ' + _tf(
    existing.length === 1 ? 'confirmReplaceModulesOne' : 'confirmReplaceModulesMany',
    { n: existing.length }
  ));
}

/* In a Full Draft run (batch) the generators always rebuild the whole
   set — that run starts from a fresh draft by design. */
function _options() {
  const o = getModuleGenOptions();
  if (isBatchRun()) o.keepExisting = false;
  return o;
}

// ── Mode 1: one module per outcome (local, instant) ───────────

export function generateOneModulePerOutcome() {
  const opts = _options();
  if (_outcomes().length === 0) {
    showStatus(_t('msgNoLOsYet'), 'error');
    return false;
  }
  const outcomes = _scope(opts.keepExisting);
  if (outcomes.length === 0) {
    showStatus(loText('mmNothingNew'), 'error');
    return false;
  }
  if (!_confirmOverwrite(opts.keepExisting)) {
    showStatus(_t('msgCancelModules'), 'error');
    return false;
  }

  if (!opts.keepExisting) appState.moduleMappingData.moduleCounter = 0;
  const modules = outcomes.map(o => ({
    id:    _newModuleId(opts.keepExisting),
    title: _shortTitle(o),
    learningOutcomes: [o],
  }));

  _commitModules(modules, opts.keepExisting);
  showStatus('✓ ' + _tf('msgModulesOnePerLO', { n: modules.length }), 'success');
  return true;
}

/** A compact module title derived from an outcome, for Mode 1. */
function _shortTitle(o) {
  const text = _outcomeText(o);
  if (text === '(no statement yet)') return o.number || 'Untitled';
  const words = text.split(/\s+/).slice(0, 7).join(' ');
  return words.length < text.length ? `${words}…` : words;
}

// ── Mode 2: AI grouping + naming + sequencing (+ levels) ──────

function _levelRules(levelCount, tracks) {
  return `
LEVELS (IMPORTANT):
The programme has ${levelCount} levels: 1 = entry level ... ${levelCount} = highest.
For EACH module also return "level" (an integer from 1 to ${levelCount}) and
"track" (a short specialisation code, or "" when the module is common to all learners).
Decide the level with these rules:
- PREREQUISITES FIRST: a module whose skills other modules build on goes at a
  lower level than the modules that depend on it.
- COMPLEXITY AND AUTONOMY: routine work done under supervision belongs at lower
  levels; diagnosing, planning, decision-making, financial responsibility and
  supervising others belong at higher levels.
- PERFORM -> CHECK -> DIAGNOSE: carrying out a task comes before testing and
  documenting it, which comes before diagnosing and rectifying faults.
- SPIRAL IS ALLOWED: the same theme (e.g. hardware, safety, finance) MAY appear
  at several levels as separate modules of increasing difficulty — do not force
  a whole theme into one level.
- SPECIALISATION: only the highest level(s) may split into tracks; lower levels
  are common ("").${tracks.length ? `
  Track codes already used in this programme: ${tracks.join(', ')} — reuse them where they fit.` : ''}
- BALANCE: every level should receive modules; avoid placing nearly everything
  at one level.
Return the modules ordered by level (1 first), and foundational -> advanced
within each level.`;
}

function _buildPrompt(outcomes, opts) {
  const scope      = (document.getElementById('scopeOfWork')?.value || '').trim();

  // Each outcome is listed with its competency and criteria so the
  // model can group on substance rather than on wording alone.
  const clusters = appState.clusteringData?.clusters || [];
  const compName = n => (clusters[n - 1] && clusters[n - 1].name) || `Competency ${n}`;
  const list = outcomes.map(o => {
    const crit = (o.linkedCriteria || [])
      .filter(c => (c.text || '').trim())
      .map(c => `      · [${compName(c.clusterNumber)}] ${(c.text || '').trim()}`);
    return `  - id: ${o.id}\n    outcome: ${_outcomeText(o)}` +
           (crit.length ? `\n    performance criteria:\n${crit.join('\n')}` : '');
  }).join('\n');

  const suggested = Math.max(1, Math.round(outcomes.length / 3));

  const existing = opts.keepExisting ? _modules() : [];
  const existingBlock = existing.length ? `
EXISTING MODULES (already built — do NOT change or repeat them; use them as
context so the new modules fit around them):
${existing.map(m => {
    const l = parseInt(m.level, 10);
    return `  - ${m.title}${l ? ` (level ${l}${m.track ? `, track ${m.track}` : ''})` : ''}`;
  }).join('\n')}
` : '';

  const tracks = Array.from(new Set(_modules().map(m => (m.track || '').trim()).filter(Boolean)));

  return `You are a curriculum design engine specialized in competency-based training (CBT) derived from DACUM analysis.

${jobFocusLines()}${scope ? `
SCOPE OF WORK: ${scope}` : ''}
${existingBlock}
LEARNING OUTCOMES TO ORGANISE (${outcomes.length} total):
${list}

TASK:
Group these Learning Outcomes into training modules, name each module, and
ORDER THE MODULES AS A TEACHING SEQUENCE.

GROUPING RULES:
- Group outcomes that share a common workflow, phase of work, or body of
  underpinning knowledge and skill.
- A module usually holds ${TYPICAL_MIN_LOS}-${TYPICAL_MAX_LOS} outcomes and NEVER more than ${MAX_LOS_PER_MODULE}.
  A module with a single outcome is acceptable only when that outcome is a
  large, stand-alone capability.
- Aim for roughly ${suggested} module(s), adjusting where the content clearly justifies it.
- EVERY outcome id listed above must appear in exactly ONE module.
- Use ONLY the ids given above. Do NOT invent, merge, split or reword outcomes.

MODULE TITLE RULES:
- Name the module for the COMPETENCE it develops.
- Action-oriented noun phrase, e.g. "Implementing Hardware Procedures".
- 3-8 words, specific to this job.
- NO numbering of any kind ("Module 1", "1.", "M1") — the app numbers modules.
${opts.assignLevels ? _levelRules(opts.levelCount, tracks) : `
SEQUENCING RULES:
- Order the modules from FOUNDATIONAL to ADVANCED — the order they would be
  delivered in a training programme.
- Earlier modules build the knowledge and skills later modules assume:
  safety and preparation first, core work next, then checking and quality,
  and diagnosis, complex or supervisory work last.
- Where two modules are independent, place the one with broader transferable
  value first.`}
- Return the modules ALREADY IN ORDER — position in the array IS the sequence.
- For each module give a one-sentence "rationale" explaining its place in the
  sequence${opts.assignLevels ? ' and its level' : ''} (what it builds on, or what it prepares for).

OUTPUT FORMAT (STRICT — NO EXTRA TEXT, NO MARKDOWN):
{
  "modules": [
    {
      "title": "Implementing Hardware Procedures",
      "rationale": "Builds the basic tool and assembly skills every later hardware module depends on.",${opts.assignLevels ? `
      "level": 1,
      "track": "",` : ''}
      "outcomeIds": ["${outcomes[0] ? outcomes[0].id : 'lo_1'}"]
    }
  ]
}

Return ONLY that JSON object.`;
}

/**
 * Map model-supplied ids back onto real outcome objects.
 * Unknown ids are dropped and duplicates ignored, so a hallucinated or
 * repeated id can never corrupt the curriculum structure.
 */
function _resolveOutcomeIds(ids, byId, alreadyUsed) {
  const resolved = [];
  (ids || []).forEach(rawId => {
    const id = String(rawId || '').trim();
    const outcome = byId[id];
    if (!outcome || alreadyUsed.has(id)) return;
    alreadyUsed.add(id);
    resolved.push(outcome);
  });
  return resolved;
}

/* Pure step, exported for testing: turns the model's JSON into module
   objects, enforcing every guarantee listed at the top of this file. */
export function buildModulesFromResponse(parsed, outcomes, opts) {
  const byId = {};
  outcomes.forEach(o => { byId[o.id] = o; });

  const used    = new Set();
  const modules = [];
  let   trimmed = 0;

  (parsed && Array.isArray(parsed.modules) ? parsed.modules : []).forEach(m => {
    let members = _resolveOutcomeIds(m && m.outcomeIds, byId, used);

    // Hard cap — release the surplus so it can be picked up by the
    // sweep below instead of bloating one module.
    if (members.length > MAX_LOS_PER_MODULE) {
      members.slice(MAX_LOS_PER_MODULE).forEach(o => used.delete(o.id));
      members = members.slice(0, MAX_LOS_PER_MODULE);
      trimmed++;
    }
    if (members.length === 0) return;

    const mod = {
      title: _cleanTitle(m.title) || 'Untitled Module',
      rationale: String(m.rationale || '').trim(),
      learningOutcomes: members,
    };
    if (opts.assignLevels) {
      const l = parseInt(m.level, 10);
      if (Number.isInteger(l) && l >= 1 && l <= opts.levelCount) mod.level = l;
      const tr = String(m.track || '').trim().slice(0, 40);
      if (tr) mod.track = tr;
    }
    modules.push(mod);
  });

  // Keep the model's order inside each level; levels ascending, any
  // module without a level at the end.
  if (opts.assignLevels) {
    modules.forEach((m, i) => { m._i = i; });
    modules.sort((a, b) => ((a.level || 99) - (b.level || 99)) || (a._i - b._i));
    modules.forEach(m => { delete m._i; });
  }

  // ── Safety net: nothing may be lost ────────────────────────
  // An outcome the model skipped would otherwise disappear from the
  // curriculum without any warning — the most damaging failure mode
  // here, since the omission is invisible in the UI.
  const orphans = outcomes.filter(o => !used.has(o.id));
  if (orphans.length) {
    modules.push({
      title: loText('mmAiReviewTitle'),
      rationale: loText('mmAiReviewWhy'),
      learningOutcomes: orphans,
    });
  }

  return { modules, orphans: orphans.length, trimmed };
}

export async function generateModulesAI() {
  const opts = _options();

  if (_outcomes().length === 0) {
    showStatus(_t('msgNoLOsYet'), 'error');
    return false;
  }
  const outcomes = _scope(opts.keepExisting);
  if (outcomes.length === 0) {
    showStatus(loText('mmNothingNew'), 'error');
    return false;
  }
  if (outcomes.length < 2) {
    showStatus(_t('msgNeedTwoLOs'), 'error');
    return false;
  }

  const usageStatus = checkUsageLimit();
  if (!usageStatus.allowed) {
    showStatus('❌ ' + _tf('msgDailyLimit', { n: usageStatus.count }), 'error');
    return false;
  }

  if (!_confirmOverwrite(opts.keepExisting)) {
    showStatus(_t('msgCancelModules'), 'error');
    return false;
  }

  showLoadingModal();
  await new Promise(r => setTimeout(r, 100));

  try {
    // 3.74.0: one shared call (ai_client.js callAI).
    const parsed = await callAI(_buildPrompt(outcomes, opts));

    if (!Array.isArray(parsed.modules) || parsed.modules.length === 0) {
      throw new Error('AI response contained no modules');
    }

    const { modules, orphans, trimmed } = buildModulesFromResponse(parsed, outcomes, opts);
    if (modules.length === 0) throw new Error('No valid modules could be built from the response');

    if (!opts.keepExisting) appState.moduleMappingData.moduleCounter = 0;
    modules.forEach(m => { m.id = _newModuleId(opts.keepExisting); });

    _commitModules(modules, opts.keepExisting);
    hideLoadingModal();
    incrementUsage();

    const notes = [];
    if (orphans)  notes.push(loText('mmAiOrphans', { n: orphans }));
    if (trimmed)  notes.push(loText('mmAiTrimmed', { n: trimmed }));
    if (opts.assignLevels) notes.push(loText('mmAiLevelsNote'));

    showStatus(
      '✓ ' + _tf('msgModulesSequenced', { n: modules.length }) +
      (notes.length ? ' ' + _tf('msgNotesSuffix', { notes: notes.join('; ') }) : ''),
      'success'
    );
    return true;

  } catch (error) {
    hideLoadingModal();
    console.error('Error generating modules:', error);
    showStatus(_t('msgAIFailed'), 'error');
    showAIServiceError(error, { safeKey: 'aiErrSafeModules', tipKeys: ['aiTipModules2', 'aiTipModules1'] });
    return false;
  }
}
