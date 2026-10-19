// ============================================================
// /error-handler.js  v2.0
// DACUM Live Pro — Error Handling & Reporting System
//
// Architecture: matches Module Builder's proven approach.
//   • Modal and Toast are created fresh on each call (no
//     pre-injected HTML needed — nothing can go missing).
//   • reportError(err, context) always shows the full modal.
//   • window.onerror / unhandledrejection show modal or toast
//     based on severity.
//   • Exports: initErrorHandler, reportError, getLastError
// ============================================================

// ── Constants ─────────────────────────────────────────────────

const LS_LAST_ERROR = 'app_last_error';

// ── Per-category counters (reset on page load) ────────────────

const _counters = {
  UI: 0, EXPORT: 0, STATE: 0, TABLE: 0,
  NETWORK: 0, WORKSHOP: 0, STORAGE: 0, RENDER: 0, GENERAL: 0,
};

// ── Category detection ────────────────────────────────────────

function _detectCategory(msg, stack) {
  const h = ((msg || '') + ' ' + (stack || '')).toLowerCase();
  if (/export|docx|pdf|blob|download|saveas/i.test(h))            return 'EXPORT';
  if (/appstate|dutiesdata|syncall|renderduties|history/i.test(h)) return 'STATE';
  if (/fetch|xhr|network|railway|api\//i.test(h))                  return 'NETWORK';
  if (/workshop|lwsession|participant|snapshot/i.test(h))          return 'WORKSHOP';
  if (/localstorage|indexeddb|storage|quota/i.test(h))             return 'STORAGE';
  if (/render|innerhtml|queryselector|cannot set prop/i.test(h))   return 'RENDER';
  if (/table|duty|task|addduty|addtask/i.test(h))                  return 'TABLE';
  if (/click|button|input|event|ui/i.test(h))                      return 'UI';
  return 'GENERAL';
}

function _generateCode(category) {
  _counters[category] = (_counters[category] || 0) + 1;
  const seq = String(_counters[category]).padStart(3, '0');
  return 'ERR-' + category + '-' + seq;
}

// ── Persist ───────────────────────────────────────────────────

function _persist(payload) {
  try {
    localStorage.setItem(LS_LAST_ERROR, JSON.stringify({
      code: payload.code, message: payload.message,
      time: payload.time, source: payload.source,
    }));
  } catch (_) {}
}

// ── Console logger ────────────────────────────────────────────

function _log(payload) {
  console.group(
    '%c DACUM Error ' + payload.code + ' ',
    'background:#1e293b;color:#f87171;font-weight:bold;padding:2px 6px;border-radius:4px;'
  );
  console.error('Code    :', payload.code);
  console.error('Message :', payload.message);
  console.error('Source  :', payload.source);
  console.error('Time    :', payload.time);
  if (payload.stack) console.error('Stack   :\n', payload.stack);
  console.groupEnd();
}

// ── CSS injection (once) ──────────────────────────────────────

function _injectCSS() {
  if (document.getElementById('errh-css')) return;
  const s = document.createElement('style');
  s.id = 'errh-css';
  s.textContent = `
    /* ── Error overlay ─────────────────────────────────── */
    #errh-overlay {
      position: fixed; inset: 0;
      background: rgba(15,23,42,0.62);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 2147483640;
      display: flex; align-items: center;
      justify-content: center; padding: 20px;
      animation: errh-bg-in .2s ease;
    }
    @keyframes errh-bg-in { from{opacity:0} to{opacity:1} }

    #errh-dialog {
      background: #fff; border-radius: 18px;
      box-shadow: 0 32px 80px rgba(0,0,0,.28), 0 0 0 1px rgba(0,0,0,.04);
      width: 100%; max-width: 430px;
      padding: 30px 30px 24px;
      font-family: inherit;
      animation: errh-dlg-in .25s cubic-bezier(.22,.68,0,1.2);
    }
    @keyframes errh-dlg-in {
      from { opacity:0; transform:translateY(20px) scale(.96) }
      to   { opacity:1; transform:translateY(0)    scale(1)   }
    }

    .errh-icon {
      width:52px; height:52px; border-radius:14px;
      background:linear-gradient(135deg,#fff1f2,#fee2e2);
      border:1.5px solid #fecaca;
      display:flex; align-items:center; justify-content:center;
      margin-bottom:18px;
    }
    #errh-dialog h2 {
      font-size:1.12rem; font-weight:700;
      color:#111827; margin:0 0 6px; line-height:1.3;
    }
    #errh-dialog .errh-sub {
      font-size:.87rem; color:#6b7280;
      line-height:1.55; margin:0 0 20px;
    }
    .errh-pill {
      background:#f8fafc; border:1.5px solid #e2e8f0;
      border-radius:10px; padding:11px 16px;
      display:flex; align-items:center;
      justify-content:space-between; margin-bottom:22px;
    }
    .errh-pill-label {
      font-size:.76rem; font-weight:600;
      color:#94a3b8; letter-spacing:.07em;
      text-transform:uppercase;
    }
    .errh-pill-code {
      font-family:'Consolas','Courier New',monospace;
      font-size:.95rem; font-weight:700; color:#dc2626;
      letter-spacing:.06em; background:#fff5f5;
      padding:3px 10px; border-radius:6px;
      border:1px solid #fecaca;
    }
    .errh-btns { display:flex; gap:10px; }
    .errh-btn {
      flex:1; padding:10px 16px; border-radius:9px; border:none;
      font-size:.88rem; font-weight:600; cursor:pointer;
      display:inline-flex; align-items:center;
      justify-content:center; gap:7px;
      transition:background .15s, transform .1s, box-shadow .15s;
    }
    .errh-btn:active { transform:scale(.97); }
    .errh-btn-copy {
      background:linear-gradient(135deg,#667eea,#764ba2);
      color:#fff; box-shadow:0 3px 10px rgba(102,126,234,.35);
    }
    .errh-btn-copy:hover { box-shadow:0 5px 14px rgba(102,126,234,.45); }
    .errh-btn-copy.errh-copied {
      background:linear-gradient(135deg,#10b981,#059669);
      box-shadow:0 3px 10px rgba(16,185,129,.3);
    }
    .errh-btn-close { background:#f3f4f6; color:#374151; }
    .errh-btn-close:hover { background:#e5e7eb; }

    /* ── Toast ──────────────────────────────────────────── */
    #errh-toast {
      position:fixed; bottom:28px; left:50%;
      transform:translateX(-50%) translateY(110px);
      background:#1e293b; color:#e2e8f0;
      padding:13px 18px; border-radius:13px;
      box-shadow:0 10px 40px rgba(0,0,0,.28),
                 0 0 0 1px rgba(255,255,255,.06);
      font-family:inherit;
      font-size:.87rem;
      display:flex; align-items:center; gap:12px;
      z-index:2147483641;
      transition:transform .38s cubic-bezier(.22,.68,0,1.2);
      max-width:480px; width:calc(100% - 40px);
      box-sizing:border-box;
    }
    #errh-toast.errh-visible {
      transform:translateX(-50%) translateY(0);
    }
    .errh-toast-code {
      font-family:monospace; font-size:.82rem;
      color:#f87171; font-weight:700; white-space:nowrap;
    }
    .errh-toast-x {
      background:transparent; border:none; color:#64748b;
      cursor:pointer; font-size:1rem; margin-left:auto;
      padding:0 2px; line-height:1; flex-shrink:0;
    }
    .errh-toast-x:hover { color:#f87171; }
  `;
  document.head.appendChild(s);
}

// ── HTML escape ───────────────────────────────────────────────

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Clipboard ─────────────────────────────────────────────────

async function _copy(text, btn) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (btn) {
      btn.textContent = '✅ Copied!';
      btn.classList.add('errh-copied');
      setTimeout(() => {
        btn.textContent = 'Copy Error';
        btn.classList.remove('errh-copied');
      }, 2500);
    }
  } catch (_) {}
}

// ── Show modal (created fresh every call) ─────────────────────

function _showModal(payload) {
  _injectCSS();

  // Remove any stale overlay
  document.getElementById('errh-overlay')?.remove();

  const clipText = [
    '=== DACUM Live Pro — Error Report ===',
    'Code    : ' + payload.code,
    'Message : ' + payload.message,
    'Source  : ' + payload.source,
    'Time    : ' + payload.time,
    '',
    'Stack Trace:',
    payload.stack || '(not available)',
  ].join('\n');

  const overlay = document.createElement('div');
  overlay.id = 'errh-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML =
    '<div id="errh-dialog">' +
      '<div class="errh-icon">' +
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"' +
        ' stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<circle cx="12" cy="12" r="10"/>' +
          '<line x1="12" y1="8" x2="12" y2="12"/>' +
          '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
        '</svg>' +
      '</div>' +
      '<h2>Something went wrong</h2>' +
      '<p class="errh-sub">An unexpected error occurred. Your work may have been auto-saved. Please try again or reload the page.</p>' +
      '<div class="errh-pill">' +
        '<span class="errh-pill-label">Error Code</span>' +
        '<span class="errh-pill-code">' + _esc(payload.code) + '</span>' +
      '</div>' +
      '<div class="errh-btns">' +
        '<button class="errh-btn errh-btn-copy" id="errh-copy-btn">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
          ' stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
            '<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>' +
          '</svg>' +
          'Copy Error' +
        '</button>' +
        '<button class="errh-btn errh-btn-close" id="errh-close-btn">Close</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  const copyBtn  = document.getElementById('errh-copy-btn');
  const closeBtn = document.getElementById('errh-close-btn');
  const dialog   = document.getElementById('errh-dialog');

  copyBtn?.addEventListener('click', () => _copy(clipText, copyBtn));

  function _close() {
    overlay.style.animation = 'errh-bg-in .15s ease reverse forwards';
    setTimeout(() => overlay?.remove(), 160);
  }

  closeBtn?.addEventListener('click', _close);
  overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });
  dialog?.addEventListener('click',  e => e.stopPropagation());

  function _onKey(e) {
    if (e.key === 'Escape') { _close(); document.removeEventListener('keydown', _onKey); }
  }
  document.addEventListener('keydown', _onKey);

  setTimeout(() => copyBtn?.focus(), 60);
}

// ── Show toast (created fresh every call) ─────────────────────

function _showToast(payload) {
  _injectCSS();

  document.getElementById('errh-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'errh-toast';
  toast.setAttribute('role', 'alert');
  toast.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"' +
    ' stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
    ' style="flex-shrink:0">' +
      '<circle cx="12" cy="12" r="10"/>' +
      '<line x1="12" y1="8" x2="12" y2="12"/>' +
      '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
    '</svg>' +
    '<span style="flex:1;font-weight:600;">Something went wrong</span>' +
    '<span class="errh-toast-code">' + _esc(payload.code) + '</span>' +
    '<button class="errh-toast-x" title="Dismiss">✕</button>';

  document.body.appendChild(toast);

  requestAnimationFrame(() => requestAnimationFrame(() =>
    toast.classList.add('errh-visible')
  ));

  function _dismiss() {
    toast.classList.remove('errh-visible');
    setTimeout(() => toast?.remove(), 420);
  }

  toast.querySelector('.errh-toast-x')?.addEventListener('click', _dismiss);
  setTimeout(_dismiss, 7000);
}

// ── Noise filter ──────────────────────────────────────────────

const IGNORE = [
  /ResizeObserver loop/i,
  /Script error\./i,
  /Non-Error promise rejection/i,
  /Extension context invalidated/i,
  /cdn-cgi|cloudflare|gtag|analytics/i,
];
function _shouldIgnore(msg) {
  return IGNORE.some(p => p.test(msg || ''));
}

// ── Core handler ──────────────────────────────────────────────

function _handle(message, stack, source, forceModal) {
  if (_shouldIgnore(message)) return;

  const category = _detectCategory(message, stack);
  const code     = _generateCode(category);
  const payload  = {
    code,
    message: String(message || 'Unknown error'),
    stack:   stack  || '(not available)',
    source:  source || window.location.href,
    time:    new Date().toISOString(),
  };

  _log(payload);
  _persist(payload);

  // forceModal=true  → always show blocking modal (manual reportError calls)
  // unhandledrejection (forceModal='promise') → toast
  // everything else  → modal
  if (forceModal === 'promise') {
    _showToast(payload);
  } else {
    _showModal(payload);
  }
}

// ── Public API ────────────────────────────────────────────────

/**
 * initErrorHandler()
 * Call once from app.js. Registers global error listeners.
 */
export function initErrorHandler() {
  _injectCSS();

  window.onerror = function (message, source, lineno, colno, errObj) {
    _handle(
      String(message),
      errObj?.stack || ('at ' + source + ':' + lineno + ':' + colno),
      source + ':' + lineno,
      true   // sync JS errors → always modal
    );
    return false;
  };

  window.addEventListener('unhandledrejection', function (ev) {
    const reason  = ev.reason;
    const message = reason instanceof Error ? reason.message : String(reason || '');
    const stack   = reason instanceof Error ? reason.stack   : '(async rejection)';
    _handle(message, stack, 'Promise', 'promise');  // → toast
  });

  console.info(
    '%c[ErrorHandler] ✓ DACUM Live Pro Error Reporting v2.0',
    'color:#10b981;font-weight:600'
  );
}

/**
 * reportError(error, contextLabel)
 * Call from any catch block. Always shows the blocking modal.
 */
export function reportError(error, contextLabel) {
  const message = error?.message || String(error);
  const stack   = error?.stack   || '';
  const source  = contextLabel   || 'manual';
  if (_shouldIgnore(message)) return;
  _handle(message, stack, source, true);  // forceModal=true → always modal
}

/**
 * getLastError()
 * Returns the last persisted error from localStorage, or null.
 */
export function getLastError() {
  try {
    const raw = localStorage.getItem(LS_LAST_ERROR);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
