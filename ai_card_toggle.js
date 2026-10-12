// ============================================================
// /ai_card_toggle.js — 3.102.0
// The large blue AI cards (Duties & Tasks, Additional Information,
// Competency Clusters, Learning Outcomes, Module Mapping) fold away
// behind a small "✨ AI" button beside the tab's "?" help button.
//
// • Default: open while the tab is empty, folded once it has content.
// • A click on the button is the user's choice for that tab and is
//   remembered (localStorage, wrapped in try/catch); it then wins over
//   the default until changed again.
// • Re-evaluated on start-up, on every entry into one of these tabs,
//   after "Clear This Tab", and on dacum:project-loaded.
// • revealAICardFor(el) opens the card that holds `el` (used by the
//   Helper's "Go to this tab" before it spotlights a button) without
//   recording a choice.
// Markup (button + .ai-card-collapse wrapper) lives in index.html;
// styles in dacum-components.css.
// ============================================================

import { appState } from './state.js';

const _t = (k) => (window.i18n ? window.i18n.t(k) : k);

const STORE_KEY = 'dacum_ai_cards';
const ANIM_MS = 300;

const _val = (id) => {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
};

/* Same reading of "has content" as the Helper's status line. */
const _ADD_INFO_IDS = ['knowledgeInput', 'skillsInput', 'behaviorsInput', 'toolsInput',
                       'trendsInput', 'acronymsInput', 'careerPathInput'];

const HAS_CONTENT = {
  'duties-tab': () => (appState.dutiesData || []).some(d =>
    String(d.title || '').trim() ||
    (d.tasks || []).some(t => String(t.text || '').trim())),
  'additional-info-tab': () => {
    if (_ADD_INFO_IDS.some(id => _val(id))) return true;
    const tab = document.getElementById('additional-info-tab');
    if (!tab) return false;
    return [...tab.querySelectorAll('textarea')]
      .some(el => !_ADD_INFO_IDS.includes(el.id) &&
                  !/(^|\s)(mx-|sl-)/.test(el.className) &&
                  String(el.value || '').trim());
  },
  'clustering-tab':        () => ((appState.clusteringData || {}).clusters || []).length > 0,
  'learning-outcomes-tab': () => ((appState.learningOutcomesData || {}).outcomes || []).length > 0,
  'module-mapping-tab':    () => ((appState.moduleMappingData || {}).modules || []).length > 0,
};
const TABS = Object.keys(HAS_CONTENT);

// ── Stored choices ───────────────────────────────────────────
function _readStore() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (_) { return {}; }
}
function _writeChoice(tabId, open) {
  try {
    const o = _readStore();
    o[tabId] = open ? 'open' : 'closed';
    localStorage.setItem(STORE_KEY, JSON.stringify(o));
  } catch (_) {}
}

// ── DOM ──────────────────────────────────────────────────────
const _btn  = (tabId) => document.querySelector(`[data-ai-toggle="${tabId}"]`);
const _wrap = (tabId) => {
  const b = _btn(tabId);
  return b ? document.getElementById(b.getAttribute('aria-controls')) : null;
};

function _labelButton(btn, open) {
  const tip = _t(open ? 'aiToggleHide' : 'aiToggleShow');
  btn.title = tip;
}

function _apply(tabId, open, { animate = true } = {}) {
  const btn = _btn(tabId), wrap = _wrap(tabId);
  if (!btn || !wrap) return false;
  const was = !wrap.classList.contains('is-collapsed');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.classList.toggle('is-open', open);
  _labelButton(btn, open);
  const inner = wrap.firstElementChild;
  if (inner) inner.inert = !open;
  if (was === open) return false;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduce) {
    wrap.classList.add('no-anim');
    wrap.classList.toggle('is-collapsed', !open);
    void wrap.offsetHeight;
    wrap.classList.remove('no-anim', 'is-animating');
    return true;
  }
  wrap.classList.add('is-animating');
  wrap.classList.toggle('is-collapsed', !open);
  clearTimeout(wrap._aiAnimT);
  wrap._aiAnimT = setTimeout(() => wrap.classList.remove('is-animating'), ANIM_MS + 40);
  return true;
}

function _defaultOpen(tabId) {
  let has = false;
  try { has = HAS_CONTENT[tabId](); } catch (_) {}
  return !has;
}

/* Choice if the user made one, otherwise open-while-empty. */
function _refresh(tabId, opts) {
  if (!HAS_CONTENT[tabId]) return;
  const c = _readStore()[tabId];
  const open = c === 'open' ? true : c === 'closed' ? false : _defaultOpen(tabId);
  _apply(tabId, open, opts);
}

export function refreshAICards(opts = { animate: false }) {
  TABS.forEach(id => _refresh(id, opts));
}

/** Opens the AI card that contains `el`, if it is folded. No choice is
 *  stored. Returns true when the card had to be opened. */
export function revealAICardFor(el) {
  if (!el || !el.closest) return false;
  const wrap = el.closest('.ai-card-collapse');
  if (!wrap || !wrap.classList.contains('is-collapsed')) return false;
  const btn = document.querySelector(`[aria-controls="${wrap.id}"]`);
  const tabId = btn && btn.getAttribute('data-ai-toggle');
  return tabId ? _apply(tabId, true) : false;
}

// ── Init ─────────────────────────────────────────────────────
let _inited = false;
export function initAICardToggle() {
  if (_inited) return;
  _inited = true;

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-ai-toggle]');
    if (b) {
      const tabId = b.getAttribute('data-ai-toggle');
      const open = b.getAttribute('aria-expanded') !== 'true';
      _writeChoice(tabId, open);
      _apply(tabId, open);
      return;
    }
    const clr = e.target.closest && e.target.closest('[data-action="clear-tab"]');
    if (clr) {
      const tabId = clr.getAttribute('data-tab-id');
      if (HAS_CONTENT[tabId]) setTimeout(() => _refresh(tabId), 200);
    }
  });

  // Entering one of the tabs re-reads its content.
  const wrapSwitch = () => {
    const orig = window.switchTab;
    if (typeof orig !== 'function' || orig._aiCardWrapped) return typeof orig === 'function';
    const wrapped = function (tabId, ...rest) {
      const r = orig.call(this, tabId, ...rest);
      if (HAS_CONTENT[tabId]) _refresh(tabId, { animate: false });
      return r;
    };
    Object.keys(orig).forEach(k => { try { wrapped[k] = orig[k]; } catch (_) {} });
    wrapped._aiCardWrapped = true;
    window.switchTab = wrapped;
    return true;
  };
  if (!wrapSwitch()) setTimeout(wrapSwitch, 300);

  document.addEventListener('dacum:project-loaded', () => setTimeout(() => refreshAICards(), 0));
  window.addEventListener('dacum:langchange', () => {
    TABS.forEach(id => {
      const b = _btn(id);
      if (b) _labelButton(b, b.getAttribute('aria-expanded') === 'true');
    });
  });

  refreshAICards();
}
