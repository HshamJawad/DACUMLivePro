// ============================================================
// /ai_draft.js  (3.75.0)
// The pieces every AI card shares once it writes into content the
// user may already have:
//
//   1. openAIPartsDialog() — "choose what to generate". A part that
//      already has content starts unticked and says it will be replaced
//      when ticked; notes can appear only for certain ticks.
//   2. writeAIDraft() / clearAIDraft() / restoreAIDraft() — the AI-draft
//      mark and the kept previous value, on any holder object:
//          holder._aiDraft[key] = true      generated, not yet edited
//          holder._aiPrev[key]  = <value>   what it replaced
//      This is the format Task Analysis records (3.70.0) and clusters
//      (3.71.0) already save, so existing projects keep their marks.
//   3. aiMarkHTML() — "✨ AI draft — review" + "↶ Restore previous".
//
// Before this, Task Analysis and Competency Clusters each carried their
// own copy of all three, and Additional Info had none.
// ============================================================

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);
const _tf = (k, v) => (window.i18n ? window.i18n.tf(k, v) : k);

const _esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const _clone = (v) => JSON.parse(JSON.stringify(v));

// ── 2 · Draft state on a holder ───────────────────────────────

function _ensure(holder) {
  if (!holder._aiDraft || typeof holder._aiDraft !== 'object') holder._aiDraft = {};
  if (!holder._aiPrev || typeof holder._aiPrev !== 'object' || Array.isArray(holder._aiPrev)) holder._aiPrev = {};
}
function _tidy(holder) {
  if (holder._aiPrev && !Object.keys(holder._aiPrev).length) delete holder._aiPrev;
}

/**
 * Write a generated value and mark it as an AI draft.
 * @param {object} holder  record / cluster / store that owns the marks
 * @param {string} key     part key
 * @param {*}      value   new value (copied)
 * @param {{get:Function, set:Function, filled:Function}} io
 *        get(key) current value · set(key, value) write · filled(key) has content
 * A part that had content keeps it as the restore value. A second run
 * keeps the user's ORIGINAL, not the first draft.
 */
export function writeAIDraft(holder, key, value, io) {
  _ensure(holder);
  if (io.filled(key)) {
    if (!(holder._aiDraft[key] && holder._aiPrev[key] != null)) {
      holder._aiPrev[key] = _clone(io.get(key));
    }
  } else {
    delete holder._aiPrev[key];
  }
  io.set(key, Array.isArray(value) ? value.slice() : value);
  holder._aiDraft[key] = true;
  _tidy(holder);
}

/** Drop the mark and the kept value (the user edited or cleared it). Returns true if it was marked. */
export function clearAIDraft(holder, key) {
  if (!holder) return false;
  const had = !!(holder._aiDraft && holder._aiDraft[key]);
  if (had) delete holder._aiDraft[key];
  if (holder._aiPrev && key in holder._aiPrev) { delete holder._aiPrev[key]; _tidy(holder); }
  return had;
}

/** Put the kept value back. Returns true when there was one. */
export function restoreAIDraft(holder, key, set) {
  if (!holder || !holder._aiPrev || holder._aiPrev[key] == null) return false;
  set(key, _clone(holder._aiPrev[key]));
  if (holder._aiDraft) delete holder._aiDraft[key];
  delete holder._aiPrev[key];
  _tidy(holder);
  return true;
}

export const isAIDraft    = (holder, key) => !!(holder && holder._aiDraft && holder._aiDraft[key]);
export const canRestoreAI = (holder, key) => !!(holder && holder._aiPrev && holder._aiPrev[key] != null);

/** Remove every mark element for one id from the page. */
export function removeAIMark(markId) {
  document.querySelectorAll('[data-ai-mark]').forEach(el => {
    if (el.getAttribute('data-ai-mark') === markId) el.remove();
  });
}

// ── 3 · The mark ──────────────────────────────────────────────

/**
 * "✨ AI draft — review" (+ "↶ Restore previous" when restorable).
 * @param {object} o
 *   markId   unique id for removeAIMark()
 *   restore  show the restore button
 *   action   data-action of the restore button
 *   data     extra data-* attributes for it, e.g. { field: 'range' }
 */
export function aiMarkHTML(o) {
  const attrs = Object.entries(o.data || {})
    .map(([k, v]) => ` data-${k}="${_esc(v)}"`).join('');
  const restore = o.restore ? `
      <button type="button" class="ai-draft-restore" data-action="${_esc(o.action)}"${attrs}
              title="${_esc(_t('taAiRestoreTip'))}">↶ ${_esc(_t('taAiRestore'))}</button>` : '';
  return ` <span class="ai-draft-mark" data-ai-mark="${_esc(o.markId)}"><span class="ai-draft-badge">✨ ${_esc(_t('taAiBadge'))}</span>${restore}</span>`;
}

// ── 1 · The dialog ────────────────────────────────────────────

const TONES = {
  info:    'color:#475569;',
  warn:    'color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;',
  link:    'color:#9a3412;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px 10px;',
  restore: 'color:#075985;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:8px 10px;',
};

/**
 * "Choose what to generate". Resolves to the ticked keys, or null when
 * cancelled (Escape, backdrop, Cancel).
 * @param {object} o
 *   id        element id (an open one with the same id is replaced)
 *   title     header line · subtitle  second header line (plain text)
 *   intro     text above the list
 *   parts     [{ key, label, filled, group? }] — a new `group` value
 *             starts a small heading before that part
 *   notes     [{ icon, text, tone, when? }] — when(checkedSet, filledOf)
 *             decides visibility; omitted = always. A note with
 *             tone 'restore' and no `when` is shown while any ticked
 *             part is filled.
 */
export function openAIPartsDialog(o) {
  return new Promise(resolve => {
    document.getElementById(o.id)?.remove();
    const overlay = document.createElement('div');
    overlay.id = o.id;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('dir', (window.i18n && window.i18n.isRTL()) ? 'rtl' : 'ltr');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;' +
      'justify-content:center;padding:16px;background:rgba(0,0,0,0.55);';

    const filledOf = {};
    let lastGroup;
    const rows = o.parts.map((p, i) => {
      filledOf[p.key] = !!p.filled;
      const head = (p.group && p.group !== lastGroup)
        ? `<p style="margin:12px 0 2px;font-size:.74em;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#0369a1;">${_esc(p.group)}</p>` : '';
      lastGroup = p.group;
      const k = _esc(p.key);
      return `${head}
      <label style="display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid #f1f5f9;cursor:pointer;">
        <input type="checkbox" data-ai-part="${k}" ${p.filled ? '' : 'checked'}
               style="width:18px;height:18px;flex-shrink:0;accent-color:#0284c7;">
        <span style="flex:1;min-width:0;font-size:.9em;color:#334155;overflow-wrap:anywhere;"><span dir="auto">${_esc(p.label)}</span></span>
        ${p.filled ? `<span data-ai-tag="${k}" style="font-size:.72em;font-weight:700;color:#64748b;background:#f1f5f9;border-radius:999px;padding:2px 8px;white-space:nowrap;">${_esc(_t('taAiFilled'))}</span>` : ''}
      </label>`;
    }).join('');

    const notes = (o.notes || []).map((n, i) => `
        <p data-ai-note="${i}" style="margin:12px 0 0;font-size:.8em;line-height:1.55;${TONES[n.tone] || TONES.info}">${
          n.icon ? n.icon + ' ' : ''}${_esc(n.text)}</p>`).join('');

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:520px;width:100%;
           box-shadow:0 24px 60px rgba(0,0,0,0.35);overflow:hidden;font-family:inherit;
           max-height:88vh;display:flex;flex-direction:column;">
        <div style="padding:16px 20px;display:flex;align-items:center;gap:10px;
             background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border-bottom:1px solid #bae6fd;flex-shrink:0;">
          <span style="font-size:1.3em;line-height:1;">✨</span>
          <div style="min-width:0;">
            <p style="margin:0;font-size:.98em;font-weight:800;color:#075985;">${_esc(o.title)}</p>
            ${o.subtitle ? `<p style="margin:2px 0 0;font-size:.8em;color:#0369a1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><span dir="auto">${_esc(o.subtitle)}</span></p>` : ''}
          </div>
        </div>
        <div style="padding:14px 20px;overflow-y:auto;flex:1;">
          ${o.intro ? `<p style="margin:0 0 8px;font-size:.85em;color:#475569;line-height:1.6;">${_esc(o.intro)}</p>` : ''}
          <div>${rows}</div>
          ${notes}
        </div>
        <div style="padding:12px 20px;border-top:1px solid #eef0f4;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;flex-wrap:wrap;">
          <button type="button" data-ai-cancel style="padding:9px 18px;background:#f1f5f9;color:#334155;border:none;
                  border-radius:8px;font-size:.88em;font-weight:600;cursor:pointer;font-family:inherit;">${_esc(_t('btnCancel'))}</button>
          <button type="button" data-ai-go style="padding:9px 20px;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;border:none;
                  border-radius:8px;font-size:.88em;font-weight:700;cursor:pointer;font-family:inherit;">${_esc(_t('taAiGenerate'))}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(null); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(null); });
    overlay.querySelector('[data-ai-cancel]').addEventListener('click', () => finish(null));

    const boxes = [...overlay.querySelectorAll('input[data-ai-part]')];
    const checked = () => new Set(boxes.filter(b => b.checked).map(b => b.getAttribute('data-ai-part')));
    const sync = () => {
      const on = checked();
      (o.notes || []).forEach((n, i) => {
        const el = overlay.querySelector(`[data-ai-note="${i}"]`);
        if (!el) return;
        const show = n.when ? n.when(on, filledOf)
                   : n.tone === 'restore' ? [...on].some(k => filledOf[k]) : true;
        el.style.display = show ? '' : 'none';
      });
      boxes.forEach(b => {
        const key = b.getAttribute('data-ai-part');
        const tag = [...overlay.querySelectorAll('[data-ai-tag]')].find(t => t.getAttribute('data-ai-tag') === key);
        if (!tag) return;
        tag.textContent = _t(b.checked ? 'taAiWillReplace' : 'taAiFilled');
        tag.style.color = b.checked ? '#b45309' : '#64748b';
        tag.style.background = b.checked ? '#fef3c7' : '#f1f5f9';
      });
    };
    boxes.forEach(b => b.addEventListener('change', sync));
    sync();

    overlay.querySelector('[data-ai-go]').addEventListener('click', () => {
      const keys = [...checked()];
      if (!keys.length) {
        try { import('./renderer.js').then(m => m.showStatus(_t('taAiNoneSelected'), 'error')); } catch (_) {}
        return;
      }
      finish(o.parts.map(p => p.key).filter(k => keys.includes(k)));
    });
    overlay.querySelector('[data-ai-go]').focus();
  });
}
