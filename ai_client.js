// ============================================================
// /ai_client.js
// One place that explains AI-service failures to the user.
//
// Every AI card calls the same backend route. When it fails, the user
// used to see a raw technical line ("Backend request failed: 400").
// This module turns the failure into a clear, translated warning that
// says WHAT happened and WHAT to do:
//
//   offline     – backend/network unreachable
//   credit      – the AI account has run out of credit (billing)
//   rate        – too many requests in a short time (HTTP 429)
//   busy        – AI service overloaded / temporary server error (5xx)
//   auth        – server-side API key missing or invalid (401/403/500
//                 "API key not configured")
//   incomplete  – reply arrived but was cut off or not valid JSON
//   failed      – anything else
//
// Usage in a generator:
//   const res = await fetch(...);
//   await throwIfAIError(res);            // instead of `if (!res.ok) throw`
//   ...
//   catch (err) { showAIServiceError(err, { safeKey, tipKeys }); }
// ============================================================

const _t  = (k)    => (window.i18n ? window.i18n.t(k)     : k);

export class AIServiceError extends Error {
  constructor(kind, message, detail) {
    super(message || kind);
    this.name   = 'AIServiceError';
    this.aiKind = kind;
    this.detail = detail || '';
  }
}

/** Reads a failed backend response and throws a classified error. */
export async function throwIfAIError(response) {
  if (response.ok) return;
  let body = '';
  try { body = await response.text(); } catch (_) {}
  const s = response.status;
  const b = body.toLowerCase();

  let kind = 'failed';
  if (b.includes('credit balance') || b.includes('billing') || b.includes('insufficient') || s === 402) kind = 'credit';
  else if (b.includes('api key not configured') || b.includes('authentication') || b.includes('invalid x-api-key') || s === 401 || s === 403) kind = 'auth';
  else if (s === 429 || b.includes('rate_limit') || b.includes('rate limit')) kind = 'rate';
  else if (s === 529 || b.includes('overloaded') || s === 502 || s === 503 || s === 504 || s >= 500) kind = 'busy';
  else if (s === 404) kind = 'offline';

  throw new AIServiceError(kind, `HTTP ${s}`, body.slice(0, 300));
}

/** Best-effort classification of any error thrown during generation. */
export function classifyAIError(err) {
  if (err && err.aiKind) return err.aiKind;
  const m = String((err && err.message) || err || '');
  if (/Failed to fetch|NetworkError|Load failed|network|ECONNREFUSED|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/i.test(m)) return 'offline';
  if (/JSON|parse|Unexpected token|no content|Invalid response|contained no|could be built|did not match/i.test(m)) return 'incomplete';
  if (/\b429\b/.test(m)) return 'rate';
  if (/\b(5\d\d)\b/.test(m)) return 'busy';
  return 'failed';
}

const KIND = {
  offline:    { icon: '\u{1F50C}', title: 'aiSvcOfflineTitle',    body: 'aiSvcOfflineBody',    tone: 'amber' },
  credit:     { icon: '\u{1F4B3}', title: 'aiSvcCreditTitle',     body: 'aiSvcCreditBody',     tone: 'red'   },
  rate:       { icon: '⏳',    title: 'aiSvcRateTitle',       body: 'aiSvcRateBody',       tone: 'amber' },
  busy:       { icon: '\u{1F6A7}', title: 'aiSvcBusyTitle',       body: 'aiSvcBusyBody',       tone: 'amber' },
  auth:       { icon: '\u{1F511}', title: 'aiSvcAuthTitle',       body: 'aiSvcAuthBody',       tone: 'red'   },
  incomplete: { icon: '✂️', title: 'aiSvcIncompleteTitle', body: 'aiSvcIncompleteBody', tone: 'amber' },
  failed:     { icon: '⚠️', title: 'aiSvcFailedTitle',   body: 'aiSvcFailedBody',     tone: 'red'   },
};

const _esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Show the unified warning.
 * @param {Error}  err
 * @param {object} opts  safeKey — "your data was not changed" line for this card
 *                       tipKeys — optional "what you can do instead" lines
 */
export function showAIServiceError(err, opts = {}) {
  const kind = classifyAIError(err);
  const k    = KIND[kind] || KIND.failed;
  console.error('[ai-service]', kind, err);

  document.getElementById('aiServiceErrorModal')?.remove();

  const red = k.tone === 'red';
  const hdrBg  = red ? 'linear-gradient(135deg,#fef2f2,#fee2e2)' : 'linear-gradient(135deg,#fff7ed,#ffedd5)';
  const hdrBdr = red ? '#fecaca' : '#fed7aa';
  const hdrClr = red ? '#991b1b' : '#9a3412';

  const detail = [err && err.message, err && err.detail].filter(Boolean).join(' — ');
  const tips = (opts.tipKeys || []).filter(Boolean);

  const modal = document.createElement('div');
  modal.id = 'aiServiceErrorModal';
  modal.setAttribute('role', 'alertdialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('dir', (window.i18n && window.i18n.isRTL()) ? 'rtl' : 'ltr');
  modal.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;' +
    'justify-content:center;padding:16px;background:rgba(0,0,0,0.55);';

  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;max-width:440px;width:100%;
         box-shadow:0 24px 60px rgba(0,0,0,0.35);overflow:hidden;font-family:inherit;
         max-height:88vh;display:flex;flex-direction:column;">
      <div style="padding:18px 20px 14px;display:flex;align-items:center;gap:12px;
           background:${hdrBg};border-bottom:1px solid ${hdrBdr};flex-shrink:0;">
        <span style="font-size:1.7em;line-height:1;">${k.icon}</span>
        <p style="margin:0;font-size:1em;font-weight:800;color:${hdrClr};">${_esc(_t(k.title))}</p>
      </div>
      <div style="padding:16px 20px;overflow-y:auto;">
        <p style="margin:0 0 12px;font-size:.9em;color:#374151;line-height:1.65;">${_esc(_t(k.body))}</p>
        ${opts.safeKey ? `<p style="margin:0 0 12px;font-size:.85em;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;
            border-radius:8px;padding:8px 10px;line-height:1.55;">✅ ${_esc(_t(opts.safeKey))}</p>` : ''}
        ${tips.length ? `<p style="margin:0 0 4px;font-size:.82em;font-weight:700;color:#334155;">${_esc(_t('aiErrWhatInstead'))}</p>
          <ul style="margin:0 0 12px;padding-inline-start:18px;font-size:.82em;color:#475569;line-height:1.8;">
            ${tips.map(tk => `<li>${_esc(_t(tk))}</li>`).join('')}</ul>` : ''}
        ${detail ? `<details style="font-size:.78em;color:#64748b;"><summary style="cursor:pointer;">${_esc(_t('aiSvcDetails'))}</summary>
          <code style="display:block;margin-top:6px;background:#f1f5f9;padding:6px 8px;border-radius:4px;
                word-break:break-all;direction:ltr;unicode-bidi:isolate;">${_esc(detail)}</code></details>` : ''}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #eef0f4;display:flex;justify-content:flex-end;flex-shrink:0;">
        <button type="button" id="aiServiceErrorClose" style="padding:9px 22px;background:#667eea;color:#fff;border:none;
                border-radius:8px;font-size:.9em;font-weight:700;cursor:pointer;font-family:inherit;">${_esc(_t('btnGotIt'))}</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelector('#aiServiceErrorClose').addEventListener('click', close);
  return kind;
}
