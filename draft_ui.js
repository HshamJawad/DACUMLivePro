// ============================================================
//  draft_ui.js — Full Draft generator: card + modal
//  DACUM Live Pro
// ------------------------------------------------------------
//  Everything here is built at runtime, so none of it is reachable
//  by applyTranslations(). A dacum:langchange listener at the foot
//  of this file rebuilds the modal from state — the same pattern
//  used by duties.js, tasks.js, modules.js and dacum_projects.js.
// ============================================================

import { STAGES, runDraft, cancelDraft, resumeDraft,
         onDraftProgress, isDraftRunning,
         missingPrerequisites, stagesWithExistingContent,
         moduleCurriculumAtStake, modulesLeftBehind,
         quotaCheck,
         scopeIsMissing }                    from './draft_agent.js';
import { switchTab }                         from './projects.js';
import { verifyOccupation, needsConfirmation, VERDICT,
         markBypassed, wasBypassed,
         clearBypass }                       from './occupation_check.js';
import { showStatus }                        from './renderer.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

/* Depth into the chain, 1..STAGES-on-chain. Held here rather than in
   appState: it is a dialog setting, not project content. */
const CHAIN   = STAGES.filter(s => !s.optional);
const OPTIONAL = STAGES.filter(s => s.optional);

/* Copy for the off-chain options. The draft-ratings entry is marked
   `caution` because it is the only checkbox in this dialog whose output
   could be mistaken for evidence — its styling says so before the
   banner in the tab has a chance to. */
const OPTIONAL_COPY = {
  additional: { title: 'dgOptAdditional', hint: 'dgOptAdditionalHint' },
  draftTV:    { title: 'dgOptDraftTV',    hint: 'dgOptDraftTVHint', caution: true },
};

let _depth   = CHAIN.length;          // default: generate everything
let _extras  = new Set();             // ids of chosen optional stages
let _scopeOpen = false;               // inline Scope editor expanded?
let _phase   = 'setup';
/* Open/closed state of the "Occupation & job information" panel.
   null = decide automatically on first render (open when a key field is
   empty); after that the user's own choice is kept across re-renders. */
let _jobInfoOpen = null;               // setup | running | done | error

/* Result of the occupation-title check, held only while this dialog is
   open. The check runs at Start, not on open: opening the dialog should
   cost nothing, and the title can still be edited from the
   prerequisites panel after it is already open. */
let _occCheck = null;
let _current = -1;                    // index of the stage in flight
let _doneIds = new Set();
let _failed  = null;
let _unsub   = null;

// ── Selection ────────────────────────────────────────────────

function selectedIds() {
  const chain = CHAIN.slice(0, _depth).map(s => s.id);
  // Optional stages are interleaved at their declared position so the
  // progress bar shows the real execution order, not chain-then-extras.
  return STAGES.filter(s => chain.includes(s.id) || _extras.has(s.id))
               .map(s => s.id);
}

// ── Card (Chart Info tab) ────────────────────────────────────

export function renderDraftCard() {
  const host = document.getElementById('draftGeneratorCard');
  if (!host) return;

  host.innerHTML = `
    <div class="dg-card">
      <div class="dg-card-head">
        <span class="dg-card-icon">\u2728</span>
        <div class="dg-card-text">
          <h3 class="dg-card-title">${_esc(_t('dgCardTitle'))}</h3>
          <p class="dg-card-desc">${_esc(_t('dgCardDesc'))}</p>
        </div>
      </div>
      <button type="button" class="dg-card-btn" id="btnOpenDraftModal">
        \u2728 ${_esc(_t('dgCardBtn'))}
      </button>
      <p class="dg-card-hint">💡 ${_esc(_t('dgCardHint'))}</p>
    </div>`;

  host.querySelector('#btnOpenDraftModal')
      .addEventListener('click', openDraftModal);
}

// ── Modal ────────────────────────────────────────────────────

export function openDraftModal() {
  if (document.getElementById('dgOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'dgOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('dir', (window.i18n && window.i18n.isRTL()) ? 'rtl' : 'ltr');
  document.body.appendChild(overlay);

  /* ESCAPE ROUTES FIRST.
     These were attached after renderModal(). If renderModal() threw,
     openDraftModal() aborted before reaching them — leaving a
     full-screen blurred backdrop with no dialog, no close button and
     no way out but a page reload. Whatever else breaks, the user must
     always be able to dismiss this. */
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _phase !== 'running') closeDraftModal();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && _phase !== 'running') closeDraftModal();
  });

  _phase = 'setup';
  _scopeOpen = false;
  _occCheck = null;
  _jobInfoOpen = null;
  renderModal();

  _unsub = onDraftProgress(_onProgress);
  overlay.querySelector('.dg-dialog')?.focus();
}

export function closeDraftModal() {
  if (_unsub) { _unsub(); _unsub = null; }
  document.getElementById('dgOverlay')?.remove();
}

function renderModal() {
  const overlay = document.getElementById('dgOverlay');
  if (!overlay) return;

  /* Keep the dialog where the user is. Every tick of a stage box
     re-renders the body; without this the scroll position reset to the
     top and the user had to scroll back down to the options. */
  const _scrollers = () => [overlay, overlay.querySelector('.dg-dialog'),
                            overlay.querySelector('.dg-body')];
  const prevScroll = _scrollers().map(el => (el ? el.scrollTop : 0));
  const prevPhase  = overlay.getAttribute('data-phase');

  try {
    _renderModalInner(overlay);
    overlay.setAttribute('data-phase', _phase);
    if (prevPhase === _phase) {
      _scrollers().forEach((el, i) => { if (el) el.scrollTop = prevScroll[i]; });
    }
  } catch (err) {
    /* A blank blurred screen tells the user nothing and offers no way
       back. Show the failure, and always show a way out. */
    console.error('[draft] modal render failed', err);
    overlay.innerHTML = `
      <div class="dg-dialog" tabindex="-1">
        <div class="dg-head">
          <span class="dg-head-icon">\u26A0\uFE0F</span>
          <h2 class="dg-head-title">${_esc(_t('dgRenderFailed'))}</h2>
        </div>
        <div class="dg-body">
          <p class="dg-intro">${_esc(_t('dgRenderFailedBody'))}</p>
          <pre class="dg-errbox">${_esc(err && err.message ? err.message : String(err))}</pre>
        </div>
        <div class="dg-foot">
          <button type="button" class="dg-btn dg-btn-go" id="dgFail">${_esc(_t('dgBtnClose'))}</button>
        </div>
      </div>`;
    overlay.querySelector('#dgFail')?.addEventListener('click', closeDraftModal);
  }
}

function _renderModalInner(overlay) {
  overlay.innerHTML = `
    <div class="dg-dialog" tabindex="-1">
      <div class="dg-head">
        <span class="dg-head-icon">\u2728</span>
        <h2 class="dg-head-title">${_esc(_t('dgModalTitle'))}</h2>
        ${_phase === 'running' ? '' :
          `<button type="button" class="dg-x" id="dgClose"
                   aria-label="${_esc(_t('dgBtnClose'))}">\u2715</button>`}
      </div>
      <div class="dg-body">${_phase === 'setup' ? _setupBody() : _runBody()}</div>
      <div class="dg-foot">${_footButtons()}</div>
    </div>`;

  /* Wiring failures must not leave a rendered-but-dead dialog: the
     close button is attached first inside _wire(), and any later
     failure is logged rather than thrown on. */
  try {
    _wire();
  } catch (err) {
    console.error('[draft] modal wiring failed', err);
    showStatus(_t('dgWireFailed'), 'error');
  }
}

// ── Setup view ───────────────────────────────────────────────

function _setupBody() {
  const missing = missingPrerequisites();
  if (missing.length) return _prereqBody(missing);

  const ids       = selectedIds();
  const clashes   = stagesWithExistingContent(ids);
  const clashNames = STAGES.filter(s => clashes.includes(s.id)).map(s => _t(s.labelKey));
  // Not a stage, but its work is tied to the modules being rebuilt.
  if (moduleCurriculumAtStake(ids)) {
    clashes.push('moduleCurriculum');
    clashNames.push(_t('tabModuleCurriculum'));
  }
  const clashTabs = [...new Set(clashNames)].join('\u060C ');
  const leftBehind = modulesLeftBehind(ids);

  const _anyEmpty = JOB_FIELDS.slice(0, 3)
    .some(f => !(document.getElementById(f.id)?.value || '').trim());

  return `
    <p class="dg-intro">${_esc(_t('dgModalIntro'))}</p>

    ${_jobInfoBlock(_jobInfoOpen === null ? (_jobInfoOpen = _anyEmpty) : _jobInfoOpen)}

    <p class="dg-label">${_esc(_t('dgDepthLabel'))}</p>
    <p style="margin:-4px 0 8px;font-size:.82em;color:#64748b;line-height:1.5;">${_esc(_t('dgChainHint'))}</p>
    <ol class="dg-chain">
      ${CHAIN.map((s, i) => `
        <li class="dg-chain-item ${i < _depth ? 'is-on' : ''}"
            style="${i < _depth ? '' : 'opacity:.55;'}">
          <label style="display:flex;align-items:center;gap:10px;width:100%;cursor:${i === 0 ? 'default' : 'pointer'};">
            <input type="checkbox" class="dg-chain-cb" data-idx="${i}"
                   ${i < _depth ? 'checked' : ''} ${i === 0 ? 'disabled' : ''}
                   style="width:18px;height:18px;flex-shrink:0;accent-color:#4f46e5;cursor:inherit;">
            <span class="dg-chain-num">${i + 1}</span>
            <span class="dg-chain-label" style="flex:1;${i < _depth ? '' : 'text-decoration:line-through;'}">${_esc(_t(s.labelKey))}</span>
            ${i < _depth ? '' : `<span style="font-size:.75em;font-weight:700;color:#94a3b8;">${_esc(_t('dgExcluded'))}</span>`}
          </label>
        </li>`).join('')}
    </ol>

    <p class="dg-label">${_esc(_t('dgExtrasLabel'))}</p>
    ${OPTIONAL.map(s => {
      const copy = OPTIONAL_COPY[s.id] || { title: s.labelKey, hint: null };
      return `
      <label class="dg-extra ${copy.caution ? 'is-caution' : ''}">
        <input type="checkbox" data-extra="${s.id}"
               ${_extras.has(s.id) ? 'checked' : ''}>
        <span>
          <strong>${_esc(_t(copy.title))}</strong>
          ${copy.hint ? `<small>${_esc(_t(copy.hint))}</small>` : ''}
        </span>
      </label>`;
    }).join('')}

    ${_occCheck && needsConfirmation(_occCheck) ? `
      <div class="dg-note dg-note-warn">
        <strong>\u{1F50D} ${_esc(_occCheck.verdict === VERDICT.TYPO
          ? _tf('occWarnTypoTitle', { v: _occCheck.suggestion })
          : _t('occWarnUnknownTitle'))}</strong>
        <p>${_esc(_occCheck.reason || _t(_occCheck.verdict === VERDICT.TYPO
          ? 'occWarnTypoBody' : 'occWarnUnknownBody'))}</p>
        <p>${_esc(_tf('occWarnYouTyped', { v: _occCheck.title }))}</p>
        <div class="dg-scope-actions">
          ${_occCheck.verdict === VERDICT.TYPO ? `
            <button type="button" class="dg-inline-btn" id="dgOccApply">
              ${_esc(_tf('occBtnUseSuggestion', { v: _occCheck.suggestion }))}
            </button>` : ''}
          <button type="button" class="dg-inline-btn dg-inline-ghost" id="dgOccEdit">
            ${_esc(_t('occBtnEdit'))}
          </button>
          <button type="button" class="dg-inline-btn dg-inline-ghost" id="dgOccAnyway">
            ${_esc(_t('occBtnGenerateAnyway'))}
          </button>
        </div>
      </div>` : ''}

    <div class="dg-note dg-note-warn" id="dgScopeNote" style="${scopeIsMissing() ? '' : 'display:none;'}">
      <strong>\u26A0\uFE0F ${_esc(_t('dgScopeSoftTitle'))}</strong>
      <p>${_esc(_t('dgScopeSoftBody'))}</p>
    </div>

    <div class="dg-note dg-note-info">
      <strong>\u{1F465} ${_esc(_t('dgVerifExcludedTitle'))}</strong>
      <p>${_esc(_t('dgVerifExcludedBody'))}</p>
    </div>

    ${leftBehind ? `
      <div class="dg-note dg-note-warn" id="dgModulesLeftBehind">
        <strong>\u26A0\uFE0F ${_esc(_t('dgModulesBehindTitle'))}</strong>
        <p>${_esc(_t('dgModulesBehindBody'))}</p>
      </div>` : ''}

    ${clashes.length ? `
      <div class="dg-note dg-note-warn">
        <strong>\u26A0\uFE0F ${_esc(_t('dgOverwriteTitle'))}</strong>
        <p>${_esc(_tf('dgOverwriteBody', { tabs: clashTabs }))}</p>
        ${clashes.includes('moduleCurriculum') ? `<p>${_esc(_t('dgCurriculumKeptNote'))}</p>` : ''}
      </div>` : ''}

    ${_quotaBlock(ids)}`;
}

/* Renders ONLY the case that changes what the user can do: the chain
   costs more than the allowance has left, so the run cannot start.
   quotaCheck() counts the whole chain, so a run either has room for
   every stage or does not begin — spending four generations and dying
   at the fifth is the one outcome worth engineering against.

   The "this run will use n of your max" line that used to sit here in
   the healthy case is gone. It was shown on every open of the dialog
   to report a constraint that, when it actually binds, announces
   itself through the warning below and disables the start button. A
   number the reader can do nothing with is noise, and it competed for
   attention with the two notes above it that DO require a decision. */
function _quotaBlock(ids) {
  const q = quotaCheck(ids);
  if (!q.ok) {
    return `
      <div class="dg-note dg-note-warn">
        <strong>\u26A0\uFE0F ${_esc(_t('dgQuotaTitle'))}</strong>
        <p>${_esc(_tf('dgQuotaBody',
          { need: q.need, left: q.left, max: q.max }))}</p>
      </div>`;
  }
  return '';
}

/* ── Job information used for generation ──────────────────────
   The same inputs the Duties & Tasks generator sends to the model
   (generateAIDacum → _readAIInputs in projects.js): Occupation Title is
   the only hard requirement; Job Title, Scope of Work, Sector and
   Context are optional but narrow the draft to the actual JOB. Each
   field here edits the real Chart Info field directly, so a value
   entered in this dialog is already in the tab when the user returns. */
const JOB_FIELDS = [
  { id: 'occupationTitle', key: 'labelOccupation', required: true },
  { id: 'jobTitle',        key: 'labelJobTitle' },
  { id: 'scopeOfWork',     key: 'labelScope', tag: 'textarea' },
  { id: 'sector',          key: 'labelSector' },
  { id: 'context',         key: 'labelContext' },
];

function _fieldLabel(f) {
  let label = _t(f.key).replace(/\s*[:：]\s*$/, '');
  if (f.required) return label + ' *';
  if (!/[(（]/.test(label)) label += ` (${_t('dgOptionalTag')})`;
  return label;
}

function _jobFieldsHtml() {
  return JOB_FIELDS.map(f => {
    const val = (document.getElementById(f.id)?.value || '');
    const ph  = document.getElementById(f.id)?.getAttribute('placeholder') || '';
    return `
    <label class="dg-prereq-field">
      <span>${_esc(_fieldLabel(f))}</span>
      ${f.tag === 'textarea'
        ? `<textarea id="dgFix_${f.id}" data-dg-field="${f.id}" rows="3"
                     placeholder="${_esc(ph)}">${_esc(val)}</textarea>`
        : `<input type="text" id="dgFix_${f.id}" data-dg-field="${f.id}"
                  value="${_esc(val)}" placeholder="${_esc(ph)}">`}
    </label>`;
  }).join('');
}

function _jobInfoBlock(open) {
  return `
    <details class="dg-jobinfo" ${open ? 'open' : ''}
             style="margin:0 0 16px;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;background:#f8fafc;">
      <summary style="cursor:pointer;font-weight:700;color:#334155;">\u{1F4CB} ${_esc(_t('dgJobInfoTitle'))}</summary>
      <p style="margin:8px 0 10px;font-size:.85em;color:#64748b;line-height:1.55;">${_esc(_t('dgJobInfoHint'))}</p>
      ${_jobFieldsHtml()}
    </details>`;
}

/* Missing prerequisites are COLLECTED here rather than reported as an
   error. Opening a dialog only to be told to go elsewhere and come
   back is the worst of both: it interrupts and it does not help. */
function _prereqBody(missing) {
  const field = (id, labelKey, tag) => `
    <label class="dg-prereq-field">
      <span>${_esc(_t(labelKey))}</span>
      ${tag === 'textarea'
        ? `<textarea id="dgFix_${id}" rows="3"></textarea>`
        : `<input type="text" id="dgFix_${id}">`}
    </label>`;

  return `
    <div class="dg-note dg-note-warn">
      <strong>\u26A0\uFE0F ${_esc(_t('dgPrereqTitleV2'))}</strong>
      <p>${_esc(_t('dgPrereqBodyV2'))}</p>
    </div>
    <p style="margin:0 0 10px;font-size:.85em;color:#64748b;line-height:1.55;">${_esc(_t('dgJobInfoHint'))}</p>
    ${_jobFieldsHtml()}`;
}

// ── Running / done view ──────────────────────────────────────

function _runBody() {
  const ids = selectedIds();
  const run = STAGES.filter(s => ids.includes(s.id));

  const title = _phase === 'done'  ? _t('dgDoneTitle')
              : _phase === 'error' ? _tf('dgStageFailed',
                  { stage: _t(STAGES.find(s => s.id === _failed)?.labelKey || '') })
              : _t('dgRunningTitle');

  const hint  = _phase === 'done' ? _t('dgDoneHint')
              : _phase === 'error' ? '' : _t('dgRunningHint');

  return `
    <p class="dg-run-title">${_esc(title)}</p>

    <ol class="dg-progress">
      ${run.map((s, i) => {
        const state = _doneIds.has(s.id) ? 'done'
                    : _failed === s.id   ? 'error'
                    : i === _current     ? 'active' : 'idle';
        const mark  = state === 'done'  ? '\u2713'
                    : state === 'error' ? '\u2715'
                    : state === 'active' ? '\u2026' : '';
        return `
          <li class="dg-prog-item is-${state}">
            <span class="dg-prog-mark">${mark}</span>
            <span class="dg-prog-label">${_esc(_t(s.labelKey))}</span>
          </li>`;
      }).join('')}
    </ol>

    ${hint ? `<p class="dg-run-hint">${_esc(hint)}</p>` : ''}`;
}

function _footButtons() {
  if (_phase === 'setup') {
    const missing = missingPrerequisites();
    return missing.length
      ? `<button type="button" class="dg-btn dg-btn-ghost" id="dgCancel">${_esc(_t('dgBtnCancel'))}</button>
         <button type="button" class="dg-btn dg-btn-go" id="dgSaveFix">${_esc(_t('dgSaveAndContinue'))}</button>`
      : `<button type="button" class="dg-btn dg-btn-ghost" id="dgCancel">${_esc(_t('dgBtnCancel'))}</button>
         <button type="button" class="dg-btn dg-btn-go" id="dgStart"
                 ${quotaCheck(selectedIds()).ok ? '' : 'disabled'}>\u2728 ${_esc(_t('dgBtnStart'))}</button>`;
  }
  if (_phase === 'running') {
    return `<button type="button" class="dg-btn dg-btn-ghost" id="dgStop">${_esc(_t('dgBtnStop'))}</button>`;
  }
  if (_phase === 'error') {
    return `<button type="button" class="dg-btn dg-btn-ghost" id="dgClose2">${_esc(_t('dgBtnClose'))}</button>
            <button type="button" class="dg-btn dg-btn-go" id="dgRetry">${_esc(_t('dgBtnRetry'))}</button>`;
  }
  return `<button type="button" class="dg-btn dg-btn-go" id="dgReview">${_esc(_t('dgBtnReview'))}</button>`;
}

// ── Wiring ───────────────────────────────────────────────────

function _wire() {
  const q = (sel) => document.querySelector('#dgOverlay ' + sel);

  // Exits first: if anything below fails, these are already live.
  q('#dgClose')?.addEventListener('click', closeDraftModal);
  q('#dgClose2')?.addEventListener('click', closeDraftModal);
  q('#dgCancel')?.addEventListener('click', closeDraftModal);

  // Depth: clicking stage N selects stages 1..N. The dependency is
  // expressed by the interaction itself, so there is no invalid state
  // to warn about.
  /* Stages form a chain — each consumes the one before it — so the
     checkboxes keep that rule for the user: unticking a stage also
     excludes every stage after it, ticking one includes every stage
     before it. Stage 1 (Duties & Tasks) is the root and stays on. */
  document.querySelectorAll('#dgOverlay .dg-chain-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const i = parseInt(cb.getAttribute('data-idx'), 10);
      _depth = cb.checked ? i + 1 : Math.max(1, i);
      renderModal();
    });
  });

  document.querySelectorAll('#dgOverlay [data-extra]').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-extra');
      cb.checked ? _extras.add(id) : _extras.delete(id);
      renderModal();
    });
  });

  /* Live two-way edit: typing here writes straight into the Chart
     Info field (with the same input/change events a keystroke there
     would fire, so autosave and history see it). No re-render on each
     keystroke — that would steal focus mid-word. */
  q('.dg-jobinfo')?.addEventListener('toggle', (e) => {
    _jobInfoOpen = e.currentTarget.open;
  });

  document.querySelectorAll('#dgOverlay [data-dg-field]').forEach(el => {
    el.addEventListener('input', () => {
      const dst = document.getElementById(el.getAttribute('data-dg-field'));
      if (!dst) return;
      dst.value = el.value;
      try { dst.dispatchEvent(new Event('input',  { bubbles: true })); } catch (_) {}
      if (el.getAttribute('data-dg-field') === 'occupationTitle') _occCheck = null;
      const note = document.getElementById('dgScopeNote');
      if (note) note.style.display = scopeIsMissing() ? '' : 'none';
    });
    el.addEventListener('change', () => {
      const dst = document.getElementById(el.getAttribute('data-dg-field'));
      if (dst) { try { dst.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {} }
    });
  });

  q('#dgSaveFix')?.addEventListener('click', () => {
    /* Write straight into the real Chart Info fields so the values are
       saved with the project, not held only by this dialog.

       Each field is wrapped separately: those inputs carry autosave and
       history listeners, and an exception thrown by ANY of them would
       otherwise abort this handler before renderModal() — the button
       would appear to do nothing at all, which is exactly the symptom
       this replaced. */
    let wrote = 0;
    JOB_FIELDS.map(f => f.id).forEach(id => {
      try {
        const src = document.getElementById('dgFix_' + id);
        const dst = document.getElementById(id);
        if (!src || !dst || !src.value.trim()) return;
        dst.value = src.value.trim();
        try { dst.dispatchEvent(new Event('input',  { bubbles: true })); } catch (_) {}
        try { dst.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
        wrote++;
      } catch (err) {
        console.error('[draft] could not write ' + id, err);
      }
    });

    console.log('[draft] save & continue: wrote', wrote, 'field(s)');

    if (missingPrerequisites().length) {
      /* Occupation Title still empty. Say so INSIDE the dialog, next to
         the field — a status toast sits behind the modal overlay, which
         is why this button used to look as if it did nothing. */
      const occ = document.getElementById('dgFix_occupationTitle');
      if (occ) {
        occ.style.borderColor = '#dc2626';
        occ.style.boxShadow = '0 0 0 3px rgba(220,38,38,.15)';
        occ.setAttribute('aria-invalid', 'true');
        let msg = document.getElementById('dgOccRequiredMsg');
        if (!msg) {
          msg = document.createElement('p');
          msg.id = 'dgOccRequiredMsg';
          msg.setAttribute('role', 'alert');
          msg.style.cssText = 'margin:6px 0 0;font-size:.85em;font-weight:600;color:#dc2626;';
          occ.insertAdjacentElement('afterend', msg);
        }
        msg.textContent = '\u26A0\uFE0F ' + _t('dgOccRequiredMsg');
        occ.scrollIntoView({ block: 'center', behavior: 'smooth' });
        occ.focus();
        occ.addEventListener('input', function clr() {
          if (!occ.value.trim()) return;
          occ.style.borderColor = ''; occ.style.boxShadow = '';
          occ.removeAttribute('aria-invalid');
          document.getElementById('dgOccRequiredMsg')?.remove();
          occ.removeEventListener('input', clr);
        });
      }
      return;
    }
    renderModal();
  });

  /* Expand in place. The first version closed the dialog and jumped to
     Chart Info — which left the user somewhere they had not asked to be,
     having to find their way back and re-open a dialog whose settings
     they had already chosen. A field is a field; it can live here. */
  q('#dgAddScope')?.addEventListener('click', () => {
    _scopeOpen = true;
    renderModal();
    const ta = document.getElementById('dgScopeText');
    if (ta) ta.focus();
  });

  q('#dgScopeCancel')?.addEventListener('click', () => {
    _scopeOpen = false;
    renderModal();
  });

  q('#dgScopeSave')?.addEventListener('click', () => {
    const ta  = document.getElementById('dgScopeText');
    const dst = document.getElementById('scopeOfWork');
    const val = (ta && ta.value || '').trim();
    if (!val) { _scopeOpen = false; renderModal(); return; }

    /* Written into the real Chart Info field so it is saved with the
       project — not held only by this dialog, where closing the modal
       would lose a paragraph the user just wrote. Each dispatch is
       isolated: those inputs carry autosave and history listeners, and
       one throwing must not swallow the save. */
    try {
      if (dst) {
        dst.value = val;
        try { dst.dispatchEvent(new Event('input',  { bubbles: true })); } catch (_) {}
        try { dst.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
      }
      showStatus(_t('dgScopeSaved'), 'success');
    } catch (err) {
      console.error('[draft] could not save scope', err);
      showStatus(_t('dgSaveFailed'), 'error');
    }
    _scopeOpen = false;
    renderModal();
  });

  q('#dgStart')?.addEventListener('click', async () => {
    /* Verify the occupation title BEFORE spending anything.

       This is the highest-value place for the check in the whole app:
       the title is the root of a seven-stage chain, quotaCheck() has
       already reserved the entire day's allowance for the run, and each
       stage consumes the output of the one before it. A typo caught
       here costs one small call; the same typo caught after stage one
       costs the day and produces a chart for the wrong occupation. */
    if (missingPrerequisites().length) { renderModal(); return; }
    const title = (document.getElementById('occupationTitle')?.value || '').trim();
    if (title && !wasBypassed(title)) {
      const startBtn = q('#dgStart');
      if (startBtn) { startBtn.disabled = true; startBtn.textContent = _t('msgCheckingOccupation'); }

      _occCheck = await verifyOccupation(title);

      if (needsConfirmation(_occCheck)) {
        renderModal();   // repaints setup, now carrying the warning
        return;
      }
      _occCheck = null;
    }

    _phase = 'running'; _current = 0; _doneIds = new Set(); _failed = null;
    renderModal();
    const res = await runDraft(selectedIds());
    /* runDraft can refuse before emitting any progress event — quota,
       or a run already in flight. Without this the dialog would sit on
       "generating" forever with nothing happening behind it. */
    if (res && !res.ok && (res.reason === 'quota' || res.reason === 'already-running')) {
      _phase = 'setup';
      renderModal();
    }
  });

  /* Apply the suggestion — the only path that writes to the field, and
     only ever on an explicit click. Nothing corrects silently. */
  q('#dgOccApply')?.addEventListener('click', () => {
    const field = document.getElementById('occupationTitle');
    if (field && _occCheck) {
      clearBypass(field.value);
      field.value = _occCheck.suggestion;
      field.dispatchEvent(new Event('input',  { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      showStatus(_tf('msgOccupationCorrected', { v: _occCheck.suggestion }), 'success');
    }
    _occCheck = null;
    renderModal();
  });

  /* Sends the user to the field itself. The dialog CLOSES rather than
     staying open: they are going to Chart Info to retype the title, and
     a modal hanging in front of that is in the way, not helpful. */
  q('#dgOccEdit')?.addEventListener('click', () => {
    _occCheck = null;
    closeDraftModal();
    try { switchTab('info-tab'); } catch (_) {}
    setTimeout(() => {
      const field = document.getElementById('occupationTitle');
      if (field) { field.focus(); field.select(); }
    }, 80);
  });

  q('#dgOccAnyway')?.addEventListener('click', () => {
    if (_occCheck) markBypassed(_occCheck.title);
    _occCheck = null;
    renderModal();   // clean setup panel; Start now proceeds unchallenged
  });

  q('#dgStop')?.addEventListener('click', () => {
    cancelDraft();
    const el = document.querySelector('#dgOverlay .dg-run-hint');
    if (el) el.textContent = _t('dgStopping');
  });

  q('#dgRetry')?.addEventListener('click', () => {
    _phase = 'running'; _failed = null;
    renderModal();
    resumeDraft(selectedIds());
  });

  q('#dgReview')?.addEventListener('click', () => {
    closeDraftModal();
    switchTab('duties-tab');
  });
}

// ── Progress ─────────────────────────────────────────────────

function _onProgress(ev) {
  switch (ev.type) {
    case 'stage-start':   _current = ev.index; break;
    case 'stage-done':    _doneIds.add(ev.id); break;
    case 'stage-skipped': _doneIds.add(ev.id); break;
    case 'stage-error':   _failed = ev.id; _phase = 'error'; break;
    case 'cancelled':     _phase = 'done'; break;
    case 'complete':      _phase = 'done'; _current = -1; break;
    default: return;
  }
  if (document.getElementById('dgOverlay')) renderModal();
}

// ── Helpers ──────────────────────────────────────────────────

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Language change ──────────────────────────────────────────
//
// Both the card and the modal are innerHTML, so applyTranslations()
// cannot reach them. The modal is only rebuilt while idle: during a
// run the switcher is locked anyway, and a rebuild mid-stage would
// reset the progress list the user is watching.
window.addEventListener('dacum:langchange', () => {
  renderDraftCard();
  const overlay = document.getElementById('dgOverlay');
  if (overlay && !isDraftRunning()) {
    overlay.setAttribute('dir', (window.i18n && window.i18n.isRTL()) ? 'rtl' : 'ltr');
    renderModal();
  }
});
