// ============================================================
//  draft_unverified.js — generated task ratings, quarantined
//  DACUM Live Pro
// ------------------------------------------------------------
//  THE ONE RULE
//
//  Generated Importance / Frequency / Difficulty scores look
//  exactly like collected ones. On a chart, in a Word table, in a
//  CSV handed to a ministry, there is nothing to tell them apart —
//  and the entire authority of a DACUM chart rests on those numbers
//  having come from a panel of practitioners.
//
//  So a generated draft is allowed to exist, because it genuinely
//  helps a facilitator walk into a workshop with something to react
//  to instead of a blank grid. But it is:
//
//    • tagged in state           (appState.tvUnverified)
//    • banner-marked on screen   (renderUnverifiedBanner)
//    • excluded from EVERY export until accepted
//    • accepted only by an explicit human click, with a dialog that
//      says plainly what acceptance means
//
//  The export exclusion is the part that matters. A banner can be
//  ignored; a file that leaves the building cannot be recalled.
// ============================================================

import { appState }   from './state.js';
import { showStatus } from './renderer.js';
import { esc as _esc } from './escape.js';

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

// ── State ────────────────────────────────────────────────────

/** True when the current ratings were generated and not yet accepted. */
export function isUnverified() {
  return appState.tvUnverified === true;
}

/** Called by the pipeline after generating draft ratings. */
export function markUnverified() {
  appState.tvUnverified = true;
  renderUnverifiedBanner();
}

/** Human acceptance. The ONLY path from draft to usable data. */
export function acceptAsVerified() {
  if (!confirm(_t('uvConfirmAccept'))) return false;
  appState.tvUnverified = false;
  renderUnverifiedBanner();
  showStatus(_t('uvAccepted'), 'success');
  window.dispatchEvent(new CustomEvent('dacum:tvverified'));
  return true;
}

export function discardDraftRatings() {
  if (!confirm(_t('uvConfirmDiscard'))) return false;
  appState.verificationRatings = {};
  appState.workshopResults     = {};
  appState.tvUnverified        = false;
  renderUnverifiedBanner();
  showStatus(_t('uvDiscarded'), 'success');
  window.dispatchEvent(new CustomEvent('dacum:tvdiscarded'));
  return true;
}

// ── Export gate ──────────────────────────────────────────────

/**
 * Every exporter asks this before including verification data.
 *
 * Fails CLOSED: anything other than an explicit accepted state
 * withholds the data. A bug that wrongly omits a verification
 * appendix is an inconvenience; one that wrongly ships generated
 * numbers as panel findings is not recoverable.
 */
export function mayExportVerification() {
  return appState.tvUnverified !== true;
}

/** Tell the user why an appendix is missing, rather than silently omitting it. */
export function noteExportExclusion() {
  if (mayExportVerification()) return;
  showStatus(_t('uvExportBlocked'), 'error');
}

// ── Banner ───────────────────────────────────────────────────

export function renderUnverifiedBanner() {
  const host = document.getElementById('tvUnverifiedBanner');
  if (!host) return;

  if (!isUnverified()) { host.innerHTML = ''; return; }

  host.innerHTML = `
    <div class="uv-banner">
      <span class="uv-banner-icon">\u26A0\uFE0F</span>
      <div class="uv-banner-text">
        <strong>${_esc(_t('uvBannerTitle'))}</strong>
        <p>${_esc(_t('uvBannerBody'))}</p>
      </div>
      <div class="uv-banner-actions">
        <button type="button" class="uv-btn uv-btn-accept" id="uvAccept"
                title="${_esc(_t('uvAcceptTip'))}">${_esc(_t('uvAccept'))}</button>
        <button type="button" class="uv-btn uv-btn-discard" id="uvDiscard">${_esc(_t('uvDiscard'))}</button>
      </div>
    </div>`;

  host.querySelector('#uvAccept') .addEventListener('click', acceptAsVerified);
  host.querySelector('#uvDiscard').addEventListener('click', discardDraftRatings);
}


window.addEventListener('dacum:langchange', renderUnverifiedBanner);
