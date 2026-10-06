// ============================================================
// /card_colors.js  (3.66.0)
// ------------------------------------------------------------
// Colours of the duty and task cards in Duties & Tasks → Card View.
// SCREEN ONLY (and its print-out): the Word / PDF exporters never
// read this module, so exported files keep their colours.
//
// Two layers:
//   • SAVED — chosen in ⚙️ Settings and kept with "Save". Stored in
//     localStorage (dacum_card_colors): it survives closing the tool.
//   • TEMPORARY — picked from the 🎨 button on the Card View bar.
//     Applies at once, lasts until the tab/app is closed
//     (sessionStorage dacum_card_colors_tmp), then the saved choice —
//     or the default blue / yellow — comes back.
// Saving in Settings clears the temporary pick, so what was saved is
// what shows.
//
// A pick is one of eight mid-depth colours (the DACUM Lite set). The
// card is drawn as a LIGHT tint of it — pale background, the colour
// on the border, a dark shade for the label and the text — so the
// text stays readable whichever colour is chosen. 'default' keeps the
// original blue duty / yellow task cards (no inline token at all).
// ============================================================

export const CARD_DEFAULT = 'default';

export const CARD_PALETTE = Object.freeze([
  { hex: '2563EB', key: 'ccBlue'   },
  { hex: '0D9488', key: 'ccTeal'   },
  { hex: '16A34A', key: 'ccGreen'  },
  { hex: 'D97706', key: 'ccAmber'  },
  { hex: 'EA580C', key: 'ccOrange' },
  { hex: 'E11D48', key: 'ccRose'   },
  { hex: '7C3AED', key: 'ccPurple' },
  { hex: '475569', key: 'ccSlate'  },
]);

const LS_SAVED = 'dacum_card_colors';
const SS_TEMP  = 'dacum_card_colors_tmp';
const _HEXES   = CARD_PALETTE.map(p => p.hex);

function _valid(v) {
  if (typeof v !== 'string') return CARD_DEFAULT;
  const h = v.replace('#', '').toUpperCase();
  return _HEXES.includes(h) ? h : CARD_DEFAULT;
}
function _norm(o) {
  const s = (o && typeof o === 'object') ? o : {};
  return { duty: _valid(s.duty), task: _valid(s.task) };
}
function _read(store, key) {
  try { return JSON.parse(store.getItem(key) || 'null'); } catch (_) { return null; }
}

/** The colours kept with Save in Settings (or the defaults). */
export function getSavedCardColors() {
  let raw = null;
  try { raw = _read(localStorage, LS_SAVED); } catch (_) {}
  return _norm(raw);
}

/** True while a temporary pick from the Card View bar is in force. */
export function hasTempCardColors() {
  try { return !!sessionStorage.getItem(SS_TEMP); } catch (_) { return false; }
}

/** What is on screen now: the temporary pick, else the saved one. */
export function getActiveCardColors() {
  let tmp = null;
  try { tmp = _read(sessionStorage, SS_TEMP); } catch (_) {}
  return tmp ? _norm(tmp) : getSavedCardColors();
}

/** Card View bar: change one group for this session only. */
export function setTempCardColor(group, hex) {
  if (group !== 'duty' && group !== 'task') return getActiveCardColors();
  const next = { ...getActiveCardColors(), [group]: _valid(hex) };
  const saved = getSavedCardColors();
  try {
    if (next.duty === saved.duty && next.task === saved.task) sessionStorage.removeItem(SS_TEMP);
    else sessionStorage.setItem(SS_TEMP, JSON.stringify(next));
  } catch (_) {}
  applyCardColors();
  return next;
}

/** Settings → Save: keep on this device; drop any temporary pick. */
export function saveCardColors(colors) {
  const next = _norm(colors);
  try {
    if (next.duty === CARD_DEFAULT && next.task === CARD_DEFAULT) localStorage.removeItem(LS_SAVED);
    else localStorage.setItem(LS_SAVED, JSON.stringify(next));
  } catch (e) { console.warn('[card-colors] could not persist:', e); }
  try { sessionStorage.removeItem(SS_TEMP); } catch (_) {}
  applyCardColors();
  return next;
}

/* ── Tokens ─────────────────────────────────────────────────────── */

function _rgb(hex) { return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)); }
function _hex(rgb) { return '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
/** pct of the colour over white (tint) */
function _tint(hex, pct) { return _hex(_rgb(hex).map(c => 255 + (c - 255) * pct)); }
/** keep pct of the colour, the rest black (shade) */
function _shade(hex, pct) { return _hex(_rgb(hex).map(c => c * pct)); }
function _alpha(hex, a) { const [r, g, b] = _rgb(hex.replace('#', '')); return `rgba(${r},${g},${b},${a})`; }

/** CSS custom properties for one card type. Exported for the previews. */
export function cardTokens(hex, kind) {
  const duty = kind === 'duty';
  const ink  = _shade(hex, 0.62);
  return {
    bg1:    _tint(hex, duty ? 0.20 : 0.08),
    bg2:    _tint(hex, duty ? 0.34 : 0.20),
    border: _tint(hex, duty ? 0.62 : 0.55),
    label:  ink,
    text:   _shade(hex, 0.45),
    soft:   _alpha(ink, 0.45),
  };
}

const _PROPS = ['bg1', 'bg2', 'border', 'label', 'text', 'soft'];

/** Push the active choice onto <html>. 'default' removes the tokens,
    leaving the page exactly as it was before this feature. */
export function applyCardColors() {
  const root = typeof document !== 'undefined' && document.documentElement;
  const c = getActiveCardColors();
  if (!root) return c;
  ['duty', 'task'].forEach(kind => {
    const pick = c[kind];
    if (pick === CARD_DEFAULT) {
      root.removeAttribute(`data-cc-${kind}`);
      _PROPS.forEach(p => root.style.removeProperty(`--cc-${kind}-${p}`));
    } else {
      const tk = cardTokens(pick, kind);
      root.setAttribute(`data-cc-${kind}`, pick);
      _PROPS.forEach(p => root.style.setProperty(`--cc-${kind}-${p}`, tk[p]));
    }
  });
  try { window.dispatchEvent(new CustomEvent('dacum:card-colors-changed', { detail: c })); } catch (_) {}
  return c;
}

/* ── Swatch row (shared by the Card View popover and Settings) ──── */

const _t = (k) => (window.i18n ? window.i18n.t(k) : k);

/** One row: the default chip, a divider, the eight colours.
    `attr` names the data attribute the caller listens for. */
export function cardSwatchRow(group, selected, attr) {
  const defOn = selected === CARD_DEFAULT;
  const def = `<button type="button" class="cc-swatch cc-swatch-def cc-def-${group}${defOn ? ' cc-on' : ''}"
      ${attr}-group="${group}" ${attr}-hex="${CARD_DEFAULT}"
      title="${_t('ccDefault')}" aria-label="${_t('ccDefault')}" aria-pressed="${defOn}"></button>`;
  const cols = CARD_PALETTE.map(p => {
    const on = p.hex === selected;
    return `<button type="button" class="cc-swatch${on ? ' cc-on' : ''}" style="background:#${p.hex}"
      ${attr}-group="${group}" ${attr}-hex="${p.hex}"
      title="${_t(p.key)}" aria-label="${_t(p.key)}" aria-pressed="${on}"></button>`;
  }).join('');
  return def + '<span class="cc-sep" aria-hidden="true"></span>' + cols;
}

/* Applied as soon as the module loads, so a saved choice is on screen
   before the first card is drawn. */
applyCardColors();
