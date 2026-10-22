/* =============================================================
   dacum-ui.js
   Non-module UI helpers loaded after DOM content.
   1. Textarea auto-resize polyfill (field-sizing: content)
   2. QR Modal: backdrop close, URL pill, Copy-to-Clipboard
   ============================================================= */

(function () {
  /* Only needed when CSS field-sizing:content isn't available — older
     browsers, e.g. Chrome on Windows 7 (stops at 109; the feature came in
     123). 3.134.5: asked through CSS.supports() — `'fieldSizing' in
     el.style` is true in browsers that know the name but not the value —
     and window.__dacumNoFieldSizing lets the tests run this path. */
  var native = !window.__dacumNoFieldSizing &&
    !!(window.CSS && CSS.supports && CSS.supports('field-sizing', 'content'));
  if (native) return;

  var SEL = '.dcv-duty-input, .dcv-task-input';
  /* The textareas are flex items with flex: 1 1 0% (dacum-styles.css):
     a 0 basis makes the browser ignore the height set below, so the
     card never grew. Here the basis is their own height. */
  document.documentElement.classList.add('dacum-no-field-sizing');
  var st = document.createElement('style');
  st.textContent = 'html.dacum-no-field-sizing .dcv-duty-input, html.dacum-no-field-sizing .dcv-task-input { flex: 1 0 auto !important; }';
  (document.head || document.documentElement).appendChild(st);

  /* A textarea on a hidden tab measures 0: it is left as it is and sized
     when it is seen (below) — sizing it then set it to its 72 px minimum
     and long saved text stayed cut off after the tab was opened. */
  function autoResize(el) {
    if (!el.getClientRects().length) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
  function resizeAll() {
    document.querySelectorAll(SEL).forEach(autoResize);
  }

  // Resize on every input event inside card containers
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches(SEL)) autoResize(t);
  });

  var timer = null;
  function soon() { clearTimeout(timer); timer = setTimeout(resizeAll, 60); }

  document.addEventListener('DOMContentLoaded', function () {
    resizeAll();
    var container = document.getElementById('dutiesContainer');
    if (!container) return;
    // after each render
    new MutationObserver(soon).observe(container, { childList: true, subtree: true });
    // when the Duties & Tasks tab is opened, and when the width changes
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries.some(function (en) { return en.isIntersecting; })) soon();
      }).observe(container);
    }
    window.addEventListener('resize', soon);
  });
})();

(function () {

  /* ── Populate URL pill when modal opens ──────────────────── */
  var _origShow = window._qrmObserverAttached;
  if (!_origShow) {
    window._qrmObserverAttached = true;

    /* Watch #lwQRModal display changes */
    var qrModal = document.getElementById('lwQRModal');
    if (qrModal) {
      new MutationObserver(function () {
        if (qrModal.style.display !== 'none') {
          var linkEl  = document.getElementById('lwParticipantLink');
          var urlSpan = document.getElementById('qrmUrlDisplay');
          if (urlSpan && linkEl) {
            var url = linkEl.getAttribute('data-full-url') || linkEl.textContent || '';
            urlSpan.textContent = url || '—';
          }
        }
      }).observe(qrModal, { attributes: true, attributeFilter: ['style'] });
    }
  }

  /* ── Backdrop click closes modal ─────────────────────────── */
  var backdrop = document.getElementById('qrModalBackdrop');
  if (backdrop) {
    backdrop.addEventListener('click', function () {
      var modal = document.getElementById('lwQRModal');
      if (modal) modal.style.display = 'none';
    });
  }

  /* ── Copy to Clipboard ───────────────────────────────────── */
  var copyBtn  = document.getElementById('btnQRCopy');
  var feedback = document.getElementById('qrmFeedback');
  var _feedbackTimer = null;

  function showFeedback(msg, isError) {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.style.color = isError ? '#ef4444' : '#16a34a';
    feedback.classList.add('visible');
    clearTimeout(_feedbackTimer);
    _feedbackTimer = setTimeout(function () {
      feedback.classList.remove('visible');
    }, 3000);
  }

  function getQRCanvas() {
    var container = document.getElementById('qrCodeContainer');
    if (!container) return null;
    var srcCanvas = container.querySelector('canvas');

    /* QRCode lib sometimes uses <img> — draw onto canvas first */
    if (!srcCanvas) {
      var img = container.querySelector('img');
      if (!img) return null;
      srcCanvas = document.createElement('canvas');
      srcCanvas.width  = img.naturalWidth  || img.width  || 340;
      srcCanvas.height = img.naturalHeight || img.height || 340;
      srcCanvas.getContext('2d').drawImage(img, 0, 0);
    }

    /* Add white border (matches lwDownloadQRPNG behaviour) */
    var border     = 32;
    var exportSize = srcCanvas.width + border * 2;
    var out        = document.createElement('canvas');
    out.width      = exportSize;
    out.height     = exportSize;
    var ctx        = out.getContext('2d');
    ctx.fillStyle  = '#ffffff';
    ctx.fillRect(0, 0, exportSize, exportSize);
    ctx.drawImage(srcCanvas, border, border);
    return out;
  }

  function copyQRToClipboard() {
    /* Try modern Clipboard API (image/png) */
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      var canvas = getQRCanvas();
      if (canvas) {
        canvas.toBlob(function (blob) {
          if (!blob) { fallbackCopyLink(); return; }
          navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]).then(function () {
            if (copyBtn) copyBtn.classList.add('copied');
            showFeedback('✅ QR Code copied to clipboard!');
            setTimeout(function () {
              if (copyBtn) copyBtn.classList.remove('copied');
            }, 2500);
          }).catch(function () {
            fallbackCopyLink();
          });
        }, 'image/png');
        return;
      }
    }
    fallbackCopyLink();
  }

  function fallbackCopyLink() {
    /* Fallback: copy the participant URL as text */
    var linkEl = document.getElementById('lwParticipantLink');
    var url    = (linkEl && linkEl.getAttribute('data-full-url')) || '';
    if (!url) { showFeedback('❌ Nothing to copy', true); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(function () { showFeedback('🔗 Session link copied to clipboard!'); })
        .catch(function () { showFeedback('❌ Copy failed — please copy the link manually', true); });
    } else {
      /* Legacy execCommand fallback */
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showFeedback('🔗 Session link copied to clipboard!');
      } catch (e) {
        showFeedback('❌ Copy failed — please copy the link manually', true);
      }
      document.body.removeChild(ta);
    }
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', copyQRToClipboard);
  }

})();
