// ============================================================
// /settings_misc.js — 3.103.0
// Settings → Misc: interface preferences that act at once (no Save):
// the Helper button and the AI cards (ui_prefs.js), plus "Reset to
// automatic" — both groups back to Automatic and the per-tab choices of
// the "✨ AI" button forgotten (3.103.1). Rendered by
// export_settings.js like the Languages tab.
// ============================================================

import { getPref, setPref, PREF_VALUES } from './ui_prefs.js';
import { resetAICardChoices, hasAICardChoices } from './ai_card_toggle.js';
import { getChartTerms, setChartTerms } from './chart_terms.js';
import { getClusterLabelPref, setClusterLabelPref, formatClusterLabel } from './cluster_labels.js';
import { getLoLabelPref, setLoLabelPref, formatLoLabel } from './lo_labels.js';
import { esc as _esc } from './escape.js';

const _t = (k) => (window.i18n ? window.i18n.t(k) : k);

const LABELS = {
  helperChip: { auto: 'msHelperAuto', always: 'msHelperAlways', hidden: 'msHelperHidden' },
  aiCards:    { auto: 'msAiAuto', open: 'msAiOpen', closed: 'msAiClosed', hidden: 'msAiHidden' },
  followProjectLang: { on: 'msFollowOn', off: 'msFollowOff' },
  codeLetters: { auto: 'msCodesAuto', latin: 'msCodesLatin' },
};

function _group(name, legendKey, icon) {
  const cur = getPref(name);
  const opts = PREF_VALUES[name].map(v => `
      <label class="ms-opt${v === cur ? ' ms-on' : ''}">
        <input type="radio" name="ms_${name}" value="${v}" data-ms-pref="${name}"${v === cur ? ' checked' : ''}>
        <span>${_esc(_t(LABELS[name][v]))}</span>
      </label>`).join('');
  return `
    <section class="es-section ms-group">
      <div class="es-sec-head" id="msHead_${name}"><span>${icon} ${_esc(_t(legendKey))}</span></div>
      <div class="ms-opts" role="radiogroup" aria-labelledby="msHead_${name}">${opts}</div>`;
}

function _termsGroup() {
  const t = getChartTerms();
  const custom = t.mode === 'custom';
  const opt = (v, key) => `
      <label class="ms-opt${(v === 'custom') === custom ? ' ms-on' : ''}">
        <input type="radio" name="ms_terms" value="${v}"${(v === 'custom') === custom ? ' checked' : ''}>
        <span>${_esc(_t(key))}</span>
      </label>`;
  return `
    <section class="es-section ms-group">
      <div class="es-sec-head" id="msHead_terms"><span>🏷️ ${_esc(_t('msTermsTitle'))}</span></div>
      <div class="ms-opts" role="radiogroup" aria-labelledby="msHead_terms">${opt('dacum', 'msTermsDacum')}${opt('custom', 'msTermsCustom')}</div>
      <div class="ms-terms"${custom ? '' : ' hidden'}>
        <label>${_esc(_t('msTermDuty'))} <input type="text" data-ms-term="duty" maxlength="60" dir="auto" value="${_esc(t.duty)}" placeholder="${_esc(_t('msTermDutyPh'))}"></label>
        <label>${_esc(_t('msTermTask'))} <input type="text" data-ms-term="task" maxlength="60" dir="auto" value="${_esc(t.task)}" placeholder="${_esc(_t('msTermTaskPh'))}"></label>
      </div>
      <p class="es-note">${_esc(_t('msTermsNote'))}</p>
    </section>`;
}

/* 3.123.1: the quick pick matching the pattern stays highlighted
   (not only on hover), so the choice made is visible. */
const _picked = (k, pattern) => (k === String(pattern || '').trim() ? ' ms-pick-on' : '');
function _markPicks(box, attr, value) {
  box.querySelectorAll(`[${attr}]`).forEach(b => {
    const on = b.getAttribute(attr) === String(value || '').trim();
    b.classList.toggle('ms-pick-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

/* 3.120.0: what the Clustering tab calls each competency in the Arabic
   interface: C1 (default) or the user's pattern. */
const CL_PICKS = ['الكفاءة {n}', 'الكفاءة {ord}'];
function _clPreview(pattern) {
  return [1, 2, 3].map(n => formatClusterLabel(pattern, n)).join('، ') + '…';
}
function _clLabelGroup() {
  const p = getClusterLabelPref();
  const custom = p.mode === 'custom';
  const opt = (v, key) => `
      <label class="ms-opt${(v === 'custom') === custom ? ' ms-on' : ''}">
        <input type="radio" name="ms_cllabel" value="${v}"${(v === 'custom') === custom ? ' checked' : ''}>
        <span>${_esc(_t(key))}</span>
      </label>`;
  return `
    <section class="es-section ms-group">
      <div class="es-sec-head" id="msHead_cllabel"><span>🔖 ${_esc(_t('msClTitle'))}</span></div>
      <div class="ms-opts" role="radiogroup" aria-labelledby="msHead_cllabel">${opt('code', 'msClCode')}${opt('custom', 'msClCustom')}</div>
      <div class="ms-terms"${custom ? '' : ' hidden'}>
        <label>${_esc(_t('msClPattern'))} <input type="text" data-ms-cl-pattern maxlength="60" dir="rtl" lang="ar" value="${_esc(p.pattern)}" placeholder="الكفاءة {n}"></label>
      </div>
      <div class="ms-cl-picks"${custom ? '' : ' hidden'}>${CL_PICKS.map(k => `<button type="button" class="cl-btn${_picked(k, p.pattern)}" data-ms-cl-pick="${_esc(k)}" aria-pressed="${k === p.pattern.trim()}" dir="rtl">${_esc(formatClusterLabel(k, 1))}</button>`).join('')}</div>
      <p class="es-note ms-cl-preview" dir="rtl"${custom ? '' : ' hidden'}>${_esc(_t('msClPreview'))} <bdi>${_esc(_clPreview(p.pattern))}</bdi></p>
      <p class="es-note">${_esc(_t('msClNote'))}</p>
    </section>`;
}

/* 3.123.0: what each learning outcome is called in the Arabic interface
   and its exports: LO1 (default) or the user's pattern. */
const LO_PICKS = ['محصلة التعلم {n}', 'محصلة التعلم {ord}'];
function _loPreview(pattern) {
  return [1, 2, 3].map(n => formatLoLabel(pattern, n)).join('، ') + '…';
}
function _loLabelGroup() {
  const p = getLoLabelPref();
  const custom = p.mode === 'custom';
  const opt = (v, key) => `
      <label class="ms-opt${(v === 'custom') === custom ? ' ms-on' : ''}">
        <input type="radio" name="ms_lolabel" value="${v}"${(v === 'custom') === custom ? ' checked' : ''}>
        <span>${_esc(_t(key))}</span>
      </label>`;
  return `
    <section class="es-section ms-group">
      <div class="es-sec-head" id="msHead_lolabel"><span>🎯 ${_esc(_t('msLoTitle'))}</span></div>
      <div class="ms-opts" role="radiogroup" aria-labelledby="msHead_lolabel">${opt('code', 'msLoCode')}${opt('custom', 'msLoCustom')}</div>
      <div class="ms-terms"${custom ? '' : ' hidden'}>
        <label>${_esc(_t('msClPattern'))} <input type="text" data-ms-lo-pattern maxlength="60" dir="rtl" lang="ar" value="${_esc(p.pattern)}" placeholder="محصلة التعلم {n}"></label>
      </div>
      <div class="ms-cl-picks"${custom ? '' : ' hidden'}>${LO_PICKS.map(k => `<button type="button" class="cl-btn${_picked(k, p.pattern)}" data-ms-lo-pick="${_esc(k)}" aria-pressed="${k === p.pattern.trim()}" dir="rtl">${_esc(formatLoLabel(k, 1))}</button>`).join('')}</div>
      <p class="es-note ms-lo-preview" dir="rtl"${custom ? '' : ' hidden'}>${_esc(_t('msClPreview'))} <bdi>${_esc(_loPreview(p.pattern))}</bdi></p>
      <p class="es-note">${_esc(_t('msLoNote'))}</p>
    </section>`;
}

function _isDefault() {
  return getPref('helperChip') === 'auto' && getPref('aiCards') === 'auto' && !hasAICardChoices();
}

export function renderMiscTab(box, { justReset = false } = {}) {
  if (!box) return;
  const off = _isDefault();
  box.innerHTML = `
    <p class="es-intro">🧰 ${_esc(_t('msIntro'))}</p>
    ${_group('helperChip', 'msHelperTitle', '🧭')}
      <p class="es-note">${_esc(_t('msHelperNote'))}</p>
    </section>
    ${_group('aiCards', 'msAiTitle', '✨')}
      <p class="es-note">${_esc(_t('msAiNote'))}</p>
    </section>
    ${_group('followProjectLang', 'msFollowTitle', '🌐')}
      <p class="es-note">${_esc(_t('msFollowNote'))}</p>
    </section>
    ${_group('codeLetters', 'msCodesTitle', '🔤')}
      <p class="es-note">${_esc(_t('msCodesNote'))}</p>
    </section>
    ${_termsGroup()}
    ${_clLabelGroup()}
    ${_loLabelGroup()}
    <div class="ms-reset-row">
      <button type="button" class="cl-btn" data-ms-reset${off ? ' disabled' : ''}>↺ ${_esc(_t('msAiReset'))}</button>
      <span class="es-note ms-reset-msg" aria-live="polite">${justReset ? '✓ ' + _esc(_t('msAiResetDone')) : ''}</span>
    </div>`;

  /* 3.111.0: chart terms — applied as they are typed. */
  const terms = () => {
    const custom = box.querySelector('input[name="ms_terms"][value="custom"]').checked;
    setChartTerms({ mode: custom ? 'custom' : 'dacum',
      duty: box.querySelector('[data-ms-term="duty"]').value, task: box.querySelector('[data-ms-term="task"]').value });
  };
  box.querySelectorAll('input[name="ms_terms"]').forEach(r => r.addEventListener('change', () => { terms(); renderMiscTab(box); }));
  box.querySelectorAll('[data-ms-term]').forEach(i => i.addEventListener('input', terms));

  /* 3.120.0: competency labels — applied as they are typed. */
  const clInput = box.querySelector('[data-ms-cl-pattern]');
  const clPrev = box.querySelector('.ms-cl-preview bdi');
  const clSave = () => {
    const custom = box.querySelector('input[name="ms_cllabel"][value="custom"]').checked;
    setClusterLabelPref({ mode: custom ? 'custom' : 'code', pattern: clInput.value });
    if (clPrev) clPrev.textContent = _clPreview(clInput.value);
    _markPicks(box, 'data-ms-cl-pick', clInput.value);
  };
  box.querySelectorAll('input[name="ms_cllabel"]').forEach(r => r.addEventListener('change', () => {
    if (r.value === 'custom' && !clInput.value.trim()) clInput.value = CL_PICKS[0];
    clSave(); renderMiscTab(box);
  }));
  clInput.addEventListener('input', clSave);
  box.querySelectorAll('[data-ms-cl-pick]').forEach(b => b.addEventListener('click', () => {
    clInput.value = b.getAttribute('data-ms-cl-pick'); clSave();
  }));

  /* 3.123.0: learning outcome labels — applied as they are typed. */
  const loInput = box.querySelector('[data-ms-lo-pattern]');
  const loPrev = box.querySelector('.ms-lo-preview bdi');
  const loSave = () => {
    const custom = box.querySelector('input[name="ms_lolabel"][value="custom"]').checked;
    setLoLabelPref({ mode: custom ? 'custom' : 'code', pattern: loInput.value });
    if (loPrev) loPrev.textContent = _loPreview(loInput.value);
    _markPicks(box, 'data-ms-lo-pick', loInput.value);
  };
  box.querySelectorAll('input[name="ms_lolabel"]').forEach(r => r.addEventListener('change', () => {
    if (r.value === 'custom' && !loInput.value.trim()) loInput.value = LO_PICKS[0];
    loSave(); renderMiscTab(box);
  }));
  loInput.addEventListener('input', loSave);
  box.querySelectorAll('[data-ms-lo-pick]').forEach(b => b.addEventListener('click', () => {
    loInput.value = b.getAttribute('data-ms-lo-pick'); loSave();
  }));

  box.querySelectorAll('[data-ms-pref]').forEach(r => r.addEventListener('change', () => {
    setPref(r.getAttribute('data-ms-pref'), r.value);
    renderMiscTab(box);
  }));
  const reset = box.querySelector('[data-ms-reset]');
  if (reset) reset.addEventListener('click', () => {
    setPref('helperChip', 'auto');
    setPref('aiCards', 'auto');
    resetAICardChoices();
    renderMiscTab(box, { justReset: true });
  });
}
