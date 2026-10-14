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

const _t = (k) => (window.i18n ? window.i18n.t(k) : k);
const _esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
