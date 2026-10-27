// ============================================================
//  draft_regen.js — "Regenerate from here" controls
//  DACUM Live Pro
// ------------------------------------------------------------
//  THE PROBLEM THIS SOLVES
//
//  In a chain, a bad duty at stage 1 quietly poisons stages 2-6.
//  The obvious fix is a review gate between stages — and it is the
//  wrong one twice over: it breaks the "one uninterrupted run" that
//  is the whole point, and it asks the facilitator to judge the
//  duties before seeing what the duties produced, which is the one
//  moment they are least able to judge them.
//
//  So the review happens AFTER, with the full draft on screen, and
//  the repair is surgical: fix the duty, then rebuild from the
//  first affected stage. Everything upstream is untouched, and
//  nothing correct is paid for twice.
// ============================================================

import { STAGES, regenerateFrom, quotaCheck,
         isDraftRunning, onDraftProgress }   from './draft_agent.js';
import { showStatus }                        from './renderer.js';
import { appState }                          from './state.js';
import { esc as _esc } from './escape.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

/* Where each button goes. Keyed by stage id so the mapping stays
   next to the pipeline definition rather than scattered through
   seven tab templates. A stage with no host id gets no button. */
const HOSTS = {
  duties:     'regenHost_duties',
  additional: 'regenHost_additional',
  clusters:   'regenHost_clusters',
  outcomes:   'regenHost_outcomes',
  modules:    'regenHost_modules',
};

/* 'criteria' is deliberately absent: it shares the Clustering tab
   with 'clusters', and two adjacent buttons whose difference is
   "rebuild the groupings too, or only their text" is a distinction
   that has to be read twice. The cluster button covers both. */

export function renderRegenButtons() {
  Object.entries(HOSTS).forEach(([stageId, hostId]) => {
    const host = document.getElementById(hostId);
    if (!host) return;

    const stage = STAGES.find(s => s.id === stageId);
    if (!stage) return;

    /* 3.129.0: only where the Full Draft generated this stage. Content
       typed by hand has nothing to "regenerate", and the button there
       suggested an AI run that never happened. */
    const generated = Array.isArray(appState.draftStages) && appState.draftStages.includes(stageId);
    if (!generated) { host.innerHTML = ''; return; }

    // Nothing to rebuild from if this stage has no content (any more).
    let hasContent = false;
    try { hasContent = !!stage.verify(); } catch (_) { hasContent = false; }
    if (!hasContent) { host.innerHTML = ''; return; }

    host.innerHTML = `
      <button type="button" class="rg-btn" data-regen="${stageId}"
              title="${_esc(_t('rgTooltip'))}">
        \u21BB ${_esc(_t('rgBtn'))}
      </button>`;

    host.querySelector('[data-regen]')
        .addEventListener('click', () => _confirmAndRun(stageId));
  });
}

function _confirmAndRun(stageId) {
  if (isDraftRunning()) return;

  const from  = STAGES.findIndex(s => s.id === stageId);
  const chain = STAGES.slice(from);
  const ids   = chain.map(s => s.id);
  const label = _t(STAGES[from].labelKey);

  const quota = quotaCheck(ids);
  if (!quota.ok) {
    showStatus(_tf('rgQuotaShort', { need: quota.need, left: quota.left }), 'error');
    return;
  }

  /* The confirmation NAMES every stage that will be rebuilt. "Are you
     sure?" is useless here — the user's real question is "how much of
     my work does this throw away", and only a list answers it.

     It no longer states the quota cost. quotaCheck() above already
     refuses the run outright when the allowance is short, with a
     message naming the shortfall — so the cost line only ever appeared
     in the case where it did not matter. */
  const list = chain.map(s => '  \u2022 ' + _t(s.labelKey)).join('\n');

  const ok = confirm(
    _tf('rgConfirmTitle', { stage: label }) + '\n\n' +
    _tf('rgConfirmBody', {
      stage:  label,
      stages: list,
    })
  );
  if (!ok) return;

  showStatus(_tf('rgRunning', { stage: label }), 'success');
  regenerateFrom(stageId);
}


/* Buttons appear and disappear with content, so they are re-rendered
   whenever a run finishes as well as on a language change. */
onDraftProgress((ev) => {
  if (ev.type === 'complete' || ev.type === 'cancelled' || ev.type === 'stage-error') {
    renderRegenButtons();
  }
});

window.addEventListener('dacum:langchange', renderRegenButtons);
/* 3.129.0: another project opened — its own record decides. */
document.addEventListener('dacum:project-loaded', renderRegenButtons);
