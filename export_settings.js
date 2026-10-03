// ============================================================
// /export_settings.js
// ------------------------------------------------------------
// Export Settings — a cosmetic layer over the EXPORTED FILES only
// (.docx and .pdf). Nothing here touches the application UI.
//
// Design constraints this file exists to satisfy:
//
//  1. DEFAULTS REPRODUCE TODAY'S OUTPUT BYTE FOR BYTE.
//     Every accessor below returns a sentinel-checked value, and the
//     export modules are written so that a default value emits NO new
//     instruction at all — not a `color` property, not a setTextColor
//     call. That is why `isHeadingColorDefault()` and
//     `isTableHeaderDefault()` are exported rather than left implicit:
//     the callers branch on them instead of writing a redundant black.
//
//  2. SIZES ARE A RELATIVE OFFSET, NOT AN ABSOLUTE POINT VALUE.
//     The Word exporter renders the "section heading" role at three
//     different sizes today (24, 28 and 32 half-points). A single
//     absolute "secondary heading size" field therefore has no default
//     that could reproduce the current document — any value collapses
//     three levels into one and changes the export for every existing
//     user on first update. An offset of 0 is exactly the current
//     document; +2 pt enlarges every explicitly-sized run while
//     preserving the hierarchy that is already there.
//
//  3. VALIDATION HAPPENS ON READ, PER FIELD.
//     A hand-edited or corrupted localStorage entry falls back to the
//     default for THAT FIELD ONLY. It never disables an export.
//
//  4. SETTINGS ARE READ AT EXPORT TIME, NOT AT PAGE LOAD.
//     Nothing is cached in a module-level variable, so a change takes
//     effect on the very next export with no reload.
//
// Scope of application (decided in review, recorded here so it is not
// re-litigated by inspection later):
//   • exports_docx.js  — colours AND sizes.
//   • exports_pdf.js   — colours ONLY. Both PDF paths are hand-drawn
//                        with fixed coordinates and numeric line
//                        heights (LINE_H_TASK 4.9 mm, CELL_PAD_T
//                        4.6 mm, rowHeight floor 15 mm, DUTY_GAP 5 mm
//                        and ~25 literal `yPos +=` steps). Enlarging
//                        the font without recomputing that geometry
//                        overlaps lines inside cells and breaks the
//                        page-break comparison.
//   • workshop.js      — EXCLUDED entirely. lwExportVerifiedPDF() and
//                        lwExportVerifiedDOCX() are separate writers
//                        that use Word's built-in Heading1/Heading2
//                        styles instead of explicit runs; applying
//                        sizes there would mean restructuring existing
//                        output rather than adding to it.
// ============================================================

const LS_KEY = 'dacum_export_settings';

const _t = (k) => (window.i18n ? window.i18n.t(k) : k);

/* ── Defaults ────────────────────────────────────────────────────────
   Chosen by reading the exporters, not by taste:
     headingColor  → no run in either exporter sets a text colour
                     (the single exception is the coverage warning,
                     which is left alone), so black is what Word and
                     jsPDF produce today.
     tableHeader   → DCDCDC = RGB(220,220,220), the ONLY shading value
                     in exports_docx.js, used at 30 sites, and the same
                     grey the PDF fills duty bars with. It is not one
                     of the eight preset colours, which is exactly why
                     it is offered as a ninth swatch. */
export const DEFAULTS = Object.freeze({
  sizeOffset:       0,
  headingColor:     '000000',
  tableHeaderColor: 'DCDCDC',
});

/* Presets. `current` is the ninth swatch: the grey already in the code. */
export const PALETTE = Object.freeze([
  { hex: '0070C0', key: 'esColBlue' },
  { hex: '1F3864', key: 'esColNavy' },
  { hex: '375623', key: 'esColDarkGreen' },
  { hex: '7B241C', key: 'esColMaroon' },
  { hex: '5B2C6F', key: 'esColPurple' },
  { hex: '3F464D', key: 'esColDarkGray' },
  { hex: '0F6674', key: 'esColTeal' },
  { hex: '000000', key: 'esColBlack' },
  { hex: 'DCDCDC', key: 'esColCurrent' },
]);

/* Offset range, in whole Word points. Negative is allowed but bounded:
   below -2 pt the 8 pt runs in the module-mapping tables stop being
   legible in print. */
export const SIZE_OFFSETS = Object.freeze([-2, -1, 0, 1, 2, 3, 4]);

const _HEX_RE = /^[0-9A-Fa-f]{6}$/;

function _readRaw() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (!s) return {};
    const o = JSON.parse(s);
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (e) {
    /* Corrupt JSON is not an export failure. */
    console.warn('[export-settings] unreadable, using defaults:', e);
    return {};
  }
}

/** Full settings object, every field validated independently. */
export function getSettings() {
  const raw = _readRaw();

  let offset = Number(raw.sizeOffset);
  if (!Number.isFinite(offset) || SIZE_OFFSETS.indexOf(offset) === -1) {
    offset = DEFAULTS.sizeOffset;
  }

  const norm = (v, fallback) => {
    const s = String(v || '').replace(/^#/, '').toUpperCase();
    return _HEX_RE.test(s) ? s : fallback;
  };

  return {
    sizeOffset:       offset,
    headingColor:     norm(raw.headingColor,     DEFAULTS.headingColor),
    tableHeaderColor: norm(raw.tableHeaderColor, DEFAULTS.tableHeaderColor),
  };
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...(patch || {}) };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[export-settings] could not persist:', e);
  }
  // Screens that preview these colours (the Skills Level Matrix) repaint.
  try { window.dispatchEvent(new CustomEvent('dacum:export-settings-changed')); } catch (_) {}
  return next;
}

export function resetSettings() {
  try { localStorage.removeItem(LS_KEY); } catch (e) { /* nothing to undo */ }
  try { window.dispatchEvent(new CustomEvent('dacum:export-settings-changed')); } catch (_) {}
  return getSettings();
}


/* ── Accessors used by the exporters ─────────────────────────────── */

export const sizeOffsetPt   = () => getSettings().sizeOffset;
export const headingColor   = () => getSettings().headingColor;
export const tableHeaderHex = () => getSettings().tableHeaderColor;

export const isSizeDefault         = () => getSettings().sizeOffset === DEFAULTS.sizeOffset;
export const isHeadingColorDefault = () => getSettings().headingColor === DEFAULTS.headingColor;
export const isTableHeaderDefault  = () => getSettings().tableHeaderColor === DEFAULTS.tableHeaderColor;

/** docx stores HALF-points, so a +1 pt offset is +2 in the file. */
export function docxSize(half) {
  const n = Number(half);
  if (!Number.isFinite(n)) return half;
  const off = sizeOffsetPt();
  if (off === 0) return n;
  /* Floor at 6 pt. Below that Word renders a line no reader can use,
     and the negative side of the range is a convenience, not a licence
     to produce an unreadable document. */
  return Math.max(12, n + off * 2);
}

/** '0070C0' → [0, 112, 192], for jsPDF's numeric colour setters. */
export function rgb(hex) {
  const s = String(hex || '000000').replace(/^#/, '');
  return [
    parseInt(s.slice(0, 2), 16) || 0,
    parseInt(s.slice(2, 4), 16) || 0,
    parseInt(s.slice(4, 6), 16) || 0,
  ];
}

/* ── WCAG relative luminance ─────────────────────────────────────────
   Text sitting on a filled cell or bar takes black or white by
   MEASUREMENT, never by guess. Computed per background, because a
   lighter tint of the same hue can flip the answer. */
function _luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Returns '000000' or 'FFFFFF' — whichever contrasts more with `hex`. */
export function contrastOn(hex) {
  const L = _luminance(hex);
  const onWhite = 1.05 / (L + 0.05);
  const onBlack = (L + 0.05) / 0.05;
  return onBlack >= onWhite ? '000000' : 'FFFFFF';
}

/** True when shaded-cell text is black, i.e. the current behaviour. */
export const isShadedTextDefault = () => contrastOn(tableHeaderHex()) === '000000';


/* ══════════════════════════════════════════════════════════════════
   MODAL
   ══════════════════════════════════════════════════════════════════ */

const MODAL_ID = 'esModal';

/* The panel edits a DRAFT, not the stored settings.
   Every control used to write to localStorage the instant it was
   touched, which left no answer to "I was only looking" — there was
   nothing to press, and nothing to back out of. Now the swatches and
   the size list move `_draft`, the preview reflects `_draft`, and only
   Save writes. Since both exporters read the STORED value at export
   time, an unsaved draft cannot reach a document. */
let _draft = null;

const _stored = () => getSettings();
const _isDirty = () =>
  !!_draft && JSON.stringify(_draft) !== JSON.stringify(_stored());

function _swatchRow(field, current) {
  return PALETTE.map((p) => {
    const on  = p.hex === current;
    const chk = contrastOn(p.hex);
    return `<button type="button" class="es-swatch${on ? ' es-on' : ''}"
              data-es-field="${field}" data-es-hex="${p.hex}"
              title="${_t(p.key)}" aria-label="${_t(p.key)}"
              style="background:#${p.hex};color:#${chk};">${on ? '✓' : ''}</button>`;
  }).join('');
}

function _sizeOptions(current) {
  return SIZE_OFFSETS.map((o) => {
    const label = o === 0 ? _t('esSizeNone') : (o > 0 ? `+${o} pt` : `${o} pt`);
    return `<option value="${o}"${o === current ? ' selected' : ''}>${label}</option>`;
  }).join('');
}

function _previewHTML(s) {
  const head  = '#' + s.headingColor;
  const fill  = '#' + s.tableHeaderColor;
  const onFill = '#' + contrastOn(s.tableHeaderColor);
  const px = (pt) => (pt + s.sizeOffset) + 'pt';
  return `
    <div class="es-prev-card">
      <div class="es-prev-cap">${_t('esPreviewWord')}</div>
      <div class="es-prev-page">
        <div style="color:${head};font-weight:700;font-size:${px(16)};margin-bottom:6px;">${_t('esSampleH1')}</div>
        <div style="color:${head};font-weight:700;font-size:${px(14)};margin-bottom:4px;">${_t('esSampleH2')}</div>
        <div style="font-size:${px(11)};margin-bottom:8px;">${_t('esSampleBody')}</div>
        <table class="es-prev-tbl">
          <tr><th style="background:${fill};color:${onFill};font-size:${px(11)};">${_t('esSampleCol1')}</th>
              <th style="background:${fill};color:${onFill};font-size:${px(11)};">${_t('esSampleCol2')}</th></tr>
          <tr><td style="font-size:${px(11)};">A1</td><td style="font-size:${px(11)};">${_t('esSampleCell')}</td></tr>
        </table>
      </div>
    </div>
    <div class="es-prev-card">
      <div class="es-prev-cap">${_t('esPreviewPdf')}</div>
      <div class="es-prev-page">
        <div style="color:${head};font-weight:700;font-size:16pt;margin-bottom:6px;">${_t('esSampleH1')}</div>
        <div style="background:${fill};color:${onFill};font-weight:700;font-size:12pt;padding:3px 6px;margin-bottom:4px;">${_t('esSampleH2')}</div>
        <div style="font-size:11pt;">${_t('esSampleBody')}</div>
      </div>
    </div>`;
}

function _render() {
  const box = document.getElementById('esModalBody');
  if (!box) return;
  const s = _draft || (_draft = getSettings());

  box.innerHTML = `
    <p class="es-intro">ℹ️ ${_t('esIntro')}</p>

    <section class="es-section">
      <div class="es-sec-head">
        <span>🎨 ${_t('esColors')}</span>
        <span class="es-badges"><i class="es-badge">Word</i><i class="es-badge">PDF</i></span>
      </div>

      <div class="es-field">
        <label>${_t('esHeadingColor')}</label>
        <div class="es-swatches">${_swatchRow('headingColor', s.headingColor)}</div>
      </div>

      <div class="es-field">
        <label>${_t('esTableHeaderColor')}</label>
        <div class="es-swatches">${_swatchRow('tableHeaderColor', s.tableHeaderColor)}</div>
      </div>

    </section>

    <section class="es-section">
      <div class="es-sec-head">
        <span>🔤 ${_t('esSizes')}</span>
        <span class="es-badges"><i class="es-badge">Word</i></span>
      </div>

      <div class="es-field">
        <label for="esSizeOffset">${_t('esSizeOffset')}</label>
        <select id="esSizeOffset" class="es-select">${_sizeOptions(s.sizeOffset)}</select>
      </div>

    </section>

    <section class="es-section">
      <div class="es-sec-head"><span>👁️ ${_t('esPreview')}</span></div>
      <div class="es-preview">${_previewHTML(s)}</div>
    </section>

    <p class="es-note es-scope">ℹ️ ${_t('esScopeNote')}</p>
  `;

  const sel = document.getElementById('esSizeOffset');
  if (sel) sel.addEventListener('change', function () {
    _draft = { ..._draft, sizeOffset: Number(this.value) };
    _render();
  });

  box.querySelectorAll('.es-swatch').forEach((b) => {
    b.addEventListener('click', function () {
      _draft = { ..._draft, [this.getAttribute('data-es-field')]: this.getAttribute('data-es-hex') };
      _render();
    });
  });

  _syncFooter();
}

/* Save is enabled only when there is something to save, so the button
   states the panel's condition instead of the user having to guess
   whether a click registered. */
function _syncFooter() {
  const save = document.getElementById('esModalSave');
  const flag = document.getElementById('esDirtyFlag');
  const dirty = _isDirty();
  if (save) {
    save.disabled = !dirty;
    save.classList.toggle('es-armed', dirty);
  }
  if (flag) flag.textContent = dirty ? _t('esUnsaved') : '';
}

function _ensureModal() {
  let m = document.getElementById(MODAL_ID);
  if (m) return m;

  m = document.createElement('div');
  m.id = MODAL_ID;
  m.style.display = 'none';
  m.innerHTML = `
    <div id="esModalOverlay"></div>
    <div id="esModalBox" role="dialog" aria-modal="true" aria-labelledby="esModalTitle">
      <div id="esModalHeader">
        <span id="esModalTitle">⚙️ ${_t('esTitle')}</span>
        <button id="esModalClose" type="button" aria-label="${_t('esClose')}">✕</button>
      </div>
      <div id="esModalBody"></div>
      <div id="esModalFoot">
        <button id="esModalReset" type="button">↺ ${_t('esReset')}</button>
        <span id="esDirtyFlag" class="es-dirty"></span>
        <button id="esModalCancel" type="button">${_t('esCancel')}</button>
        <button id="esModalSave" type="button" disabled>\u{1F4BE} ${_t('esSave')}</button>
      </div>
    </div>`;
  document.body.appendChild(m);

  const hide = () => { m.style.display = 'none'; _draft = null; };

  /* Leaving with unsaved edits asks first. Discarding someone's colour
     choices silently is the kind of small loss that erodes trust in a
     panel they will open again. */
  const dismiss = () => {
    if (_isDirty() && !window.confirm(_t('esDiscardConfirm'))) return;
    hide();
  };

  const commit = () => {
    if (!_draft) return;
    saveSettings(_draft);
    _draft = getSettings();
    _render();
    const flag = document.getElementById('esDirtyFlag');
    if (flag) {
      flag.textContent = '\u2713 ' + _t('esSaved');
      flag.classList.add('es-saved');
      setTimeout(() => { flag.classList.remove('es-saved'); _syncFooter(); }, 2200);
    }
  };

  m.querySelector('#esModalOverlay').addEventListener('click', dismiss);
  m.querySelector('#esModalClose').addEventListener('click', dismiss);
  m.querySelector('#esModalCancel').addEventListener('click', dismiss);
  m.querySelector('#esModalSave').addEventListener('click', commit);

  /* Reset stages the defaults; it does not write. The user still has to
     press Save, so Reset behaves like every other control here and can
     be backed out of with Cancel. */
  m.querySelector('#esModalReset').addEventListener('click', () => {
    _draft = { ...DEFAULTS };
    _render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && m.style.display !== 'none') dismiss();
  });

  /* Labels are rebuilt on a language change like every other generated
     block. The <aside> is not re-created, so no listener is lost. */
  window.addEventListener('dacum:langchange', () => {
    const title = m.querySelector('#esModalTitle');
    if (title) title.textContent = '⚙️ ' + _t('esTitle');
    const reset = m.querySelector('#esModalReset');
    if (reset) reset.textContent = '↺ ' + _t('esReset');
    const cancel = m.querySelector('#esModalCancel');
    if (cancel) cancel.textContent = _t('esCancel');
    const save = m.querySelector('#esModalSave');
    if (save) save.textContent = '\u{1F4BE} ' + _t('esSave');
    if (m.style.display !== 'none') _render();
  });

  return m;
}

export function openExportSettings() {
  const m = _ensureModal();
  _draft = getSettings();
  _render();
  m.style.display = 'block';
}

/* Exposed for anything outside the module graph (and for manual QA). */
window.openExportSettings = openExportSettings;
