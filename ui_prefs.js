// ============================================================
// /ui_prefs.js — 3.103.0
// Interface preferences set in Settings → Misc (settings_misc.js).
// Stored in localStorage (every access in try/catch); a change fires
// `dacum:ui-prefs-changed` on window so the Helper chip and the AI
// cards follow at once.
//
//   helperChip: 'auto'   — shown at every launch; ✕ hides it for the session
//               'always' — shown at every launch; ✕ hides it until the
//                          next tab change or project load
//               'hidden' — not shown at launch; it appears only once the
//                          Helper is opened by hand (then as 'auto')
//   aiCards:    'auto'   — open while a tab is empty, folded once it has
//                          content; a click is remembered per tab
//               'open' / 'closed' — fixed; a click lasts for the session
//               'hidden' — no "✨ AI" button, cards folded
// ============================================================

const KEYS = {
  helperChip: { store: 'dacum_pref_helper_chip', values: ['auto', 'always', 'hidden'] },
  aiCards:    { store: 'dacum_pref_ai_cards',    values: ['auto', 'open', 'closed', 'hidden'] },
};

export function getPref(name) {
  const k = KEYS[name];
  if (!k) return undefined;
  try {
    const v = localStorage.getItem(k.store);
    if (k.values.includes(v)) return v;
  } catch (_) {}
  return k.values[0];
}

export function setPref(name, value) {
  const k = KEYS[name];
  if (!k || !k.values.includes(value)) return;
  try { localStorage.setItem(k.store, value); } catch (_) {}
  try {
    window.dispatchEvent(new CustomEvent('dacum:ui-prefs-changed', { detail: { name, value } }));
  } catch (_) {}
}

export const PREF_VALUES = Object.fromEntries(Object.entries(KEYS).map(([n, k]) => [n, k.values.slice()]));
