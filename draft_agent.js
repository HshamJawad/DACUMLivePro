// ============================================================
//  draft_agent.js — Full Draft generator (orchestrator)
//  DACUM Live Pro
// ------------------------------------------------------------
//  WHAT THIS IS
//
//  Not a new AI. Every stage below already exists as a working
//  module; this file is the conductor that runs them in the one
//  order DACUM allows, carries the output of each into the next,
//  and reports progress.
//
//  WHAT THIS DELIBERATELY IS NOT
//
//  It does not generate Task Verification. Importance, Frequency
//  and Difficulty are the judgement of a panel of practitioners —
//  their value comes from WHO produced them, not from whether the
//  numbers look plausible. A generated column labelled "Mean
//  Importance" would read to a ministry exactly like a verified
//  one. That stage stays human.
//
//  An optional UNVERIFIED draft can be produced for workshop prep,
//  but it is tagged in state, excluded from exports, and must be
//  accepted by a facilitator before it counts (see STAGE_DRAFT_TV).
// ============================================================

import { appState }                     from './state.js';
import { showStatus }                   from './renderer.js';
import { generateAIDacum }              from './projects.js';
import { generateAdditionalInfoAI }     from './additional_info_ai.js';
import { suggestClustersAI,
         generateRangeAndCriteriaAI }   from './clustering_ai.js';
import { generateLearningOutcomesAI }   from './learning_outcomes_ai.js';
import { generateModulesAI }            from './module_mapping_ai.js';
import { setBatchRun }                  from './draft_mode.js';
import { checkUsageLimit, DAILY_LIMIT } from './storage.js';
import { markUnverified, isUnverified } from './draft_unverified.js';
import { generateDraftRatings }         from './draft_ratings.js';
import { dropLearningHistory }          from './modules.js';

/* i18n access — resolved lazily; see duties.js for why. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

// ── The pipeline, as DATA ────────────────────────────────────
//
// Declared rather than coded so a future stage is one entry here
// instead of edits scattered through the runner, the progress bar
// and the dependency checks. Each stage declares:
//
//   id        stable key, also used in appState.draftProgress
//   labelKey  translation key for the progress bar
//   tab       which tab it fills (for "regenerate from here")
//   run       the existing module function
//   verify    did it actually produce anything? Return values are
//             inconsistent across the AI modules — some return a
//             boolean, some nothing at all — so state is the only
//             trustworthy signal that a stage succeeded.
//   optional  off the critical chain: skipping it does not break
//             anything downstream
//   snapshot  (optional) taken just before run(); passed to verify().
//             For stages whose tab may already hold work, a count is
//             not proof: a failed run leaves the OLD content in place
//             and "> 0" would report it as the new draft. Those stages
//             also require the content to have changed.
//   replaces  (optional) the stage rebuilds Learning Outcomes / Module
//             Mapping, so their tab-level Undo history is dropped after.
export const STAGES = [
  {
    id:       'duties',
    labelKey: 'dgStageDuties',
    tab:      'duties-tab',
    run:      () => generateAIDacum(),
    verify:   () => _countDuties() > 0,
  },
  {
    id:       'additional',
    labelKey: 'dgStageAdditional',
    tab:      'additional-info-tab',
    optional: true,
    run:      () => generateAdditionalInfoAI(),
    // Any one section filled counts: the model is told not to invent
    // content it has no basis for, so a sparse result is correct
    // behaviour rather than a failure.
    verify:   () => _anySectionFilled(),
  },
  {
    id:       'clusters',
    labelKey: 'dgStageClusters',
    tab:      'clustering-tab',
    run:      () => suggestClustersAI(),
    verify:   () => (appState.clusteringData?.clusters?.length || 0) > 0,
  },
  {
    id:       'criteria',
    labelKey: 'dgStageCriteria',
    tab:      'clustering-tab',
    run:      () => generateRangeAndCriteriaAI(),
    verify:   () => (appState.clusteringData?.clusters || [])
                      .some(c => (c.criteria || []).length > 0),
  },
  {
    id:       'outcomes',
    labelKey: 'dgStageOutcomes',
    tab:      'learning-outcomes-tab',
    run:      () => generateLearningOutcomesAI('C'),
    snapshot: () => _sig(appState.learningOutcomesData?.outcomes),
    verify:   (before) => (appState.learningOutcomesData?.outcomes?.length || 0) > 0
                          && (before === undefined || _sig(appState.learningOutcomesData?.outcomes) !== before),
    replaces: true,
  },
  /* OFF the chain and off by default. Nothing downstream consumes
     verification, so skipping it costs nothing — and the output is
     quarantined the moment it lands (see draft_unverified.js). */
  {
    id:       'draftTV',
    labelKey: 'dgStageDraftTV',
    tab:      'verification-tab',
    optional: true,
    run:      async () => { await generateDraftRatings(); markUnverified(); },
    verify:   () => isUnverified(),
  },
  {
    id:       'modules',
    labelKey: 'dgStageModules',
    tab:      'module-mapping-tab',
    run:      () => generateModulesAI(),
    snapshot: () => _sig(appState.moduleMappingData?.modules),
    verify:   (before) => (appState.moduleMappingData?.modules?.length || 0) > 0
                          && (before === undefined || _sig(appState.moduleMappingData?.modules) !== before),
    replaces: true,
  },
];

// ── Run state ────────────────────────────────────────────────
//
// Module-level rather than in appState: this describes a run in
// flight, not project content, and must never be saved into a
// project file or restored from one.
let _running   = false;
let _cancelled = false;
let _listeners = [];

export function isDraftRunning() { return _running; }

/** Subscribe to progress. Returns an unsubscribe function. */
export function onDraftProgress(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

function _emit(event) {
  _listeners.forEach(fn => { try { fn(event); } catch (_) {} });
}

// ── Helpers ──────────────────────────────────────────────────

/** Cheap content signature for "did this stage change anything?". */
function _sig(v) {
  try { return JSON.stringify(v || []); } catch (_) { return String(Math.random()); }
}

function _countDuties() {
  return document.querySelectorAll('#dutiesContainer [data-duty-id]').length
    ? new Set([...document.querySelectorAll('input[data-duty-id], textarea[data-duty-id]')]
        .filter(el => el.value.trim())
        .map(el => el.getAttribute('data-duty-id'))).size
    : 0;
}

function _anySectionFilled() {
  return ['knowledge', 'skills', 'behaviors', 'tools',
          'trends', 'acronyms', 'careerPath']
    .some(id => (document.getElementById(id + 'Input')?.value || '').trim());
}

/**
 * HARD prerequisites — the pipeline genuinely cannot start without these.
 *
 * Only the occupation title qualifies. Scope of Work was on this list
 * and should not have been: the single-generation path treats it as a
 * strong recommendation with a "Generate Anyway" escape, and making it
 * mandatory here contradicted that for no reason the user could see.
 * A tool that accepts a value in one place and refuses it two clicks
 * later reads as broken, not as careful.
 *
 * Scope is now surfaced as a soft notice instead — see scopeIsMissing().
 */
export function missingPrerequisites() {
  const missing = [];
  if (!(document.getElementById('occupationTitle')?.value || '').trim()) {
    missing.push('occupationTitle');
  }
  return missing;
}

/**
 * SOFT recommendation. Never blocks a run.
 *
 * Scope still matters more here than in a single generation — every
 * stage inherits the boundary it sets, so its absence compounds through
 * the chain rather than affecting one result. That argues for saying so
 * clearly, not for refusing to proceed.
 */
export function scopeIsMissing() {
  return !(document.getElementById('scopeOfWork')?.value || '').trim();
}

/**
 * True when the run rebuilds the modules and the CURRENT modules carry
 * Module Curriculum work (purpose, credits, resources, LO hours…). That
 * tab is not a stage, but its content is tied to module ids: after the
 * rebuild it is kept (by id) yet no longer shown, so it belongs in the
 * up-front overwrite warning.
 */
export function moduleCurriculumAtStake(selectedIds) {
  if (!selectedIds.includes('modules')) return false;
  const bm   = appState.moduleCurriculumData?.byModule || {};
  const mods = appState.moduleMappingData?.modules || [];
  return mods.some(m => {
    const rec = m && bm[m.id];
    return rec && typeof rec === 'object' && Object.keys(rec).length > 0;
  });
}

/**
 * True when the run rebuilds the outcomes but NOT the modules while
 * modules exist: they would keep pointing at outcomes that are gone.
 */
export function modulesLeftBehind(selectedIds) {
  return selectedIds.includes('outcomes') && !selectedIds.includes('modules')
      && (appState.moduleMappingData?.modules?.length || 0) > 0
      && (appState.learningOutcomesData?.outcomes?.length || 0) > 0;
}

/** Stages that would overwrite existing content, for the up-front warning. */
export function stagesWithExistingContent(selectedIds) {
  return STAGES
    .filter(s => selectedIds.includes(s.id))
    .filter(s => { try { return s.verify(); } catch (_) { return false; } })
    .map(s => s.id);
}

// ── The runner ───────────────────────────────────────────────
//
// Sequential and awaited. The stages are genuinely dependent — a
// cluster cannot be built before its tasks exist — so there is
// nothing to parallelise, and attempting it would only race the
// shared appState.
export async function runDraft(selectedIds, opts = {}) {
  if (_running) return { ok: false, reason: 'already-running' };

  const stages = STAGES.filter(s => selectedIds.includes(s.id));
  if (!stages.length) return { ok: false, reason: 'nothing-selected' };

  const quota = quotaCheck(selectedIds);
  if (!quota.ok) return { ok: false, reason: 'quota', quota };

  try {
    return await _runStages(stages);
  } finally {
    // Every exit path releases the lock: success, cancel, failure and
    // any exception that escapes the loop. A stuck lock would leave the
    // switcher permanently dead with no way to recover but a reload.
    _running = false;
    setBatchRun(false);
    if (window.i18n && window.i18n.lockLang) window.i18n.lockLang(false);
  }
}

async function _runStages(stages) {
  const selectedIds = stages.map(s => s.id);

  _running   = true;
  _cancelled = false;
  appState.draftProgress = { startedAt: Date.now(), done: [], failed: null };

  /* Lock the language for the whole run. Each stage sends the model an
     output-language directive read at call time, so a switch between
     stage 2 and stage 3 would produce a project whose first half and
     second half are in different languages — with nothing in the file
     to say which is which. */
  if (window.i18n && window.i18n.lockLang) window.i18n.lockLang(true);

  /* Tell the AI modules they are stages, not standalone actions: no
     per-stage confirm dialogs, no per-stage loading overlay. The
     overwrite question was asked once before this started. */
  setBatchRun(true);

  _emit({ type: 'start', stages: stages.map(s => s.id) });

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];

    if (_cancelled) {
      _emit({ type: 'cancelled', at: stage.id, index: i });
      // Completed stages stay. They are valid work and re-running
      // them would cost quota to produce the same thing.
      showStatus(_t('dgCancelled'), 'error');
      return { ok: false, reason: 'cancelled', done: appState.draftProgress.done };
    }

    _emit({ type: 'stage-start', id: stage.id, index: i, total: stages.length });

    let before;
    try { before = stage.snapshot ? stage.snapshot() : undefined; } catch (_) { before = undefined; }

    try {
      await stage.run();
    } catch (err) {
      console.error('[draft] stage failed:', stage.id, err);
      appState.draftProgress.failed = stage.id;
      _emit({ type: 'stage-error', id: stage.id, index: i, error: err });
      return { ok: false, reason: 'error', at: stage.id, error: err };
    }

    // Return values across the AI modules are inconsistent, so the
    // authoritative check is whether state actually changed.
    let produced = false;
    try { produced = !!stage.verify(before); } catch (_) { produced = false; }

    if (!produced) {
      // An optional stage that produced nothing is not a failure —
      // it may simply have had nothing to say. A required one is.
      if (stage.optional) {
        _emit({ type: 'stage-skipped', id: stage.id, index: i });
        continue;
      }
      appState.draftProgress.failed = stage.id;
      _emit({ type: 'stage-error', id: stage.id, index: i, error: null });
      return { ok: false, reason: 'empty', at: stage.id };
    }

    if (stage.replaces) { try { dropLearningHistory(); } catch (_) {} }

    appState.draftProgress.done.push(stage.id);
    _emit({ type: 'stage-done', id: stage.id, index: i, total: stages.length });
  }

  _emit({ type: 'complete', done: appState.draftProgress.done });
  showStatus(_tf('dgComplete', { n: appState.draftProgress.done.length }), 'success');
  return { ok: true, done: appState.draftProgress.done };
}

/** Cancel after the current stage finishes. */
export function cancelDraft() {
  if (!_running) return;
  _cancelled = true;
  _emit({ type: 'cancelling' });
}

/**
 * Resume after a failure, starting at the stage that failed.
 * Everything before it is already in state and is not recomputed —
 * re-running six stages to recover from a fault in the fifth would
 * burn quota and could produce a different draft.
 */
export async function resumeDraft(selectedIds) {
  const failed = appState.draftProgress?.failed;
  if (!failed) return runDraft(selectedIds);
  const from = STAGES.findIndex(s => s.id === failed);
  const rest = STAGES.slice(from).map(s => s.id).filter(id => selectedIds.includes(id));
  return runDraft(rest);
}

/**
 * Regenerate from one stage onward — the answer to error
 * propagation, applied AFTER the run rather than as a mid-flight
 * gate. A facilitator cannot judge the duties until they have seen
 * what the duties produced, so the review belongs at the end.
 */
export async function regenerateFrom(stageId) {
  const from = STAGES.findIndex(s => s.id === stageId);
  if (from < 0) return { ok: false, reason: 'unknown-stage' };
  return runDraft(STAGES.slice(from).map(s => s.id));
}

/** Estimated quota cost, shown BEFORE the run rather than discovered during it. */
export function estimatedCalls(selectedIds) {
  return STAGES.filter(s => selectedIds.includes(s.id)).length;
}

/**
 * Quota for the WHOLE run, checked before the first call.
 *
 * Each AI module guards its own quota, which is right when it is run
 * alone — but in a pipeline that means the run starts happily, spends
 * four generations, and dies at stage five with the chart half-built
 * and the quota gone. Checking the total up front either runs the
 * whole thing or spends nothing.
 */
export function quotaCheck(selectedIds) {
  const need  = estimatedCalls(selectedIds);
  const usage = checkUsageLimit();
  const left  = usage.remaining ?? 0;
  return { ok: left >= need, need, left, max: DAILY_LIMIT };
}
