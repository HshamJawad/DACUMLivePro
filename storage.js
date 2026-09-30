// ============================================================
// /storage.js
// Image upload, AI usage limiting, loading modal
// ============================================================

import { appState } from './state.js';
import { showStatus } from './renderer.js';
import { isBatchRun } from './draft_mode.js';

/* i18n access — resolved lazily; see duties.js for why. alert(),
   confirm() and showStatus() never enter the DOM, so applyTranslations()
   cannot reach them: each call has to look its own key up at call time. */
const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);


// ── Constants ─────────────────────────────────────────────────
/* Raised from 10 when the Full Draft generator landed: a single full
   run costs 6, so the old ceiling meant a facilitator was out of
   generations after one run and a couple of retries.

   This counter lives in this browser's localStorage. It is a courtesy
   brake on request volume, NOT a cost control — clearing site data
   resets it, and real spend is metered by token on the API key held by
   the Railway backend. Enforce budget there, not here. */
export const DAILY_LIMIT  = 30;
export const STORAGE_KEY  = 'dacum_ai_usage';

// ── Usage Limiting ────────────────────────────────────────────

export function getUsageData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return { count: 0, date: new Date().toDateString() };
  return JSON.parse(stored);
}

export function checkUsageLimit() {
  /* No daily ceiling any more — every AI action is always allowed.
     The call sites (and the Full Draft quota check) are kept unchanged
     and simply always see an unlimited allowance. The counter below
     still records how many generations ran today, for information
     only; it never blocks anything. */
  const usage = getUsageData();
  const today = new Date().toDateString();
  const count = usage.date === today ? (usage.count || 0) : 0;
  return { allowed: true, remaining: Infinity, count };
}

export function incrementUsage() {
  const usage = getUsageData();
  const today = new Date().toDateString();
  if (usage.date !== today) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ count: 1, date: today }));
  } else {
    usage.count++;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  }
  updateUsageBadge();
}

// FIX 1: New AI card (refine.js) is the single source of truth.
// updateUsageBadge() is kept for API compatibility but no longer
// renders the old badge DOM — the #usageBadge element is removed
// from index.html in the new layout.
export function updateUsageBadge() {
  // Guard: if old badge element still exists in DOM (legacy),
  // keep it hidden to prevent the old UI from reappearing.
  const badge = document.getElementById('usageBadge');
  if (badge) badge.style.display = 'none';

  // Disable the generate button only when limit is reached.
  const status = checkUsageLimit();
  const btn    = document.getElementById('aiGenerateBtn');
  if (!btn) return;
  if (status.remaining <= 0) {
    btn.disabled     = true;
    btn.style.opacity  = '0.5';
    btn.style.cursor   = 'not-allowed';
    btn.title          = _t('ttDailyLimitReached');
  } else {
    btn.disabled     = false;
    btn.style.opacity  = '';
    btn.style.cursor   = '';
    btn.title          = '';
  }
}

// ── Loading Modal ─────────────────────────────────────────────

export function showLoadingModal() {
  /* Suppressed during a Full Draft run. Each stage would otherwise
     throw this full-screen overlay up and tear it down again — five
     or six times in a row, on top of the progress dialog that is
     already telling the user exactly which stage is running. The
     flicker reads as the app crashing and reloading. */
  if (isBatchRun()) return;
  const modal = document.getElementById('loadingModal');
  if (modal) modal.style.display = 'block';
}

export function hideLoadingModal() {
  /* Not guarded by isBatchRun(): hiding must always work, so that a
     modal left open by a stage that started before the flag was set
     can still be cleared. */
  const modal = document.getElementById('loadingModal');
  if (modal) modal.style.display = 'none';
}

// ── Image Upload ──────────────────────────────────────────────

// ── Logo compression ──────────────────────────────────────────
//
// Logos are stored as base64 data URLs INSIDE each project's state in
// localStorage, and base64 inflates binary by roughly a third. A single
// 2 MB camera-resolution logo therefore costs ~2.7 MB of a 5 MB origin
// quota — and it is duplicated into the session backup as well. Two
// such uploads can fill the quota, at which point _saveProjects() in
// dacum_projects.js starts DELETING the oldest project to make room.
//
// Nothing in the app displays a logo larger than a few hundred pixels
// (chart header, PDF/Word title block), so the full-resolution original
// buys nothing and risks real data loss. Downscaling on upload removes
// the problem at its source.

const LOGO_MAX_DIM = 400;   // px on the longest side
const LOGO_QUALITY = 0.82;  // JPEG quality — visually lossless at this size

/**
 * Downscale an image file and return a compact data URL.
 *
 * Transparency is preserved by re-encoding as PNG when the source
 * actually uses it; everything else becomes JPEG, which is far smaller.
 * Encoding a transparent logo as JPEG would fill its background with
 * black, so this check is not optional.
 *
 * Falls back to the untouched original on any failure — a slightly
 * oversized logo is a much better outcome than a failed upload.
 */
function _compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const original = e.target.result;
      const img = new Image();

      img.onload = () => {
        try {
          const scale = Math.min(1, LOGO_MAX_DIM / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width  * scale));
          const h = Math.max(1, Math.round(img.height * scale));

          const canvas = document.createElement('canvas');
          canvas.width  = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);

          let hasAlpha = false;
          try {
            const data = ctx.getImageData(0, 0, w, h).data;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] < 250) { hasAlpha = true; break; }
            }
          } catch (_) {
            // Tainted canvas (shouldn't happen for a local file) —
            // assume alpha so we never flatten a transparent logo.
            hasAlpha = true;
          }

          const out = hasAlpha
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', LOGO_QUALITY);

          // Keep whichever is actually smaller. A tiny flat-colour logo
          // can compress better as the original PNG than as our JPEG.
          resolve(out.length < original.length ? out : original);
        } catch (err) {
          console.warn('[storage] logo compression failed, using original:', err);
          resolve(original);
        }
      };

      img.onerror = () => resolve(original);
      img.src = original;
    };

    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export async function handleImageUpload(event, imageType) {
  const file = event.target.files[0];
  if (!file) return;

  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp'];
  if (!validTypes.includes(file.type)) {
    showStatus(_t('msgInvalidImageType'), 'error');
    return;
  }

  const imageData = await _compressImage(file);
  if (!imageData) {
    showStatus(_t('msgImageUnreadable'), 'error');
    return;
  }

  if (imageType === 'producedFor') appState.producedForImage = imageData;
  else if (imageType === 'producedBy') appState.producedByImage = imageData;

  const previewDiv = document.getElementById(`${imageType}ImagePreview`);
  if (previewDiv) {
    previewDiv.innerHTML = `<img src="${imageData}" alt="${imageType} logo">`;
    previewDiv.classList.add('has-image');
  }

  const cap = imageType.charAt(0).toUpperCase() + imageType.slice(1);
  const removeBtn = document.getElementById(`remove${cap}Image`);
  if (removeBtn) removeBtn.style.display = 'inline-block';

  const kb = Math.round((imageData.length * 0.75) / 1024);
  showStatus(_tf('msgImageUploaded', { kb }), 'success');
}

export function removeImage(imageType) {
  if (!confirm(_t('confirmRemoveLogo'))) return;

  if (imageType === 'producedFor') appState.producedForImage = null;
  else if (imageType === 'producedBy') appState.producedByImage = null;

  const previewDiv = document.getElementById(`${imageType}ImagePreview`);
  previewDiv.innerHTML =
    `<span style="color:#999;font-size:0.9em;">${_t('msgNoImage')}</span>`;
  previewDiv.classList.remove('has-image');

  const cap = imageType.charAt(0).toUpperCase() + imageType.slice(1);
  document.getElementById(`remove${cap}Image`).style.display = 'none';
  document.getElementById(`${imageType}ImageInput`).value = '';
  showStatus(_t('msgImageRemoved'), 'success');
}
