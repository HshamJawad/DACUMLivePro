/* ============================================================
   dacum-mobile.js  v9
   Button #btnSidebarToggle is hardcoded in index.html.

   Desktop (>1100px): sidebar push-layout, always starts visible.
                      Toggle uses dps-collapsed / dps-is-collapsed (68px rail).
   Mobile (≤1100px):  sidebar is hidden on load (translateX -100%).
                      Toggle adds/removes dps-mobile-open.
   ============================================================ */
(function () {
  'use strict';

  if (window.__SIDEBAR_INIT__) return;
  window.__SIDEBAR_INIT__ = true;

  var BREAKPOINT = 1100;

  /* ── Inject supplemental CSS ────────────────────────────── */
  function _injectMobileCSS() {
    if (document.getElementById('dps-mobile-styles-v8')) return;
    var _old = document.getElementById('dps-mobile-styles');
    if (_old) _old.remove();
    var s = document.createElement('style');
    s.id = 'dps-mobile-styles-v8';
    s.textContent =
      /* ── Toolbar hamburger: hidden on desktop, shown on mobile ── */
      '#btnSidebarToggle { display: none; }' +
      '@media (max-width:1100px){' +
        '#btnSidebarToggle{' +
          'display:inline-flex!important;' +
          'align-items:center!important;' +
          'justify-content:center!important;' +
          'background:rgba(255,255,255,0.06)!important;' +
          'border:1.5px solid rgba(255,255,255,0.2)!important;' +
          'border-radius:8px!important;' +
          'padding:7px 9px!important;' +
          'cursor:pointer!important;' +
          'color:#e2e8f0!important;' +
          'transition:background 0.15s!important;' +
          'flex-shrink:0!important;' +
        '}' +
        '#btnSidebarToggle:hover{background:rgba(255,255,255,0.14)!important;}' +
        '#btnSidebarToggle svg{display:block!important;flex-shrink:0;}' +
      '}' +

      /* ── Sidebar scroll: one unit, all content scrolls together ── *
       * .dps-projects-section must NOT have overflow:hidden or flex:1 *
       * (fixed in dacum_projects.js _injectCSS).                     *
       * This rule only ensures the sidebar itself is scrollable.      */
      '.dps-sidebar{overflow-y:auto!important;overflow-x:hidden!important;}' +
      '.dps-sidebar.dps-collapsed{overflow-x:hidden!important;overflow-y:auto!important;}' +   /* 3.126.0: the rail scrolls */

      /* ── Smooth transitions per context ── */
      '@media (min-width:1101px){' +
        '.dps-sidebar{transition:width 0.25s cubic-bezier(.4,0,.2,1)!important;}' +
      '}' +
      '@media (max-width:1100px){' +
        '.dps-sidebar{' +
          'transition:transform 0.28s cubic-bezier(.4,0,.2,1)!important;' +
          'overflow-y:auto!important;' /* keep scrollable in overlay too */ +
        '}' +
      '}';
    document.head.appendChild(s);
  }

  /* ── Set hamburger icon on toolbar toggle button ────────── */
  function _setToggleIcon() {
    var btn = document.getElementById('btnSidebarToggle');
    if (!btn) return;
    /* Always set icon — idempotent, harmless on re-call */
    btn.innerHTML =
      '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">' +
        '<rect x="2" y="4"   width="16" height="2" rx="1" fill="currentColor"/>' +
        '<rect x="2" y="9"   width="16" height="2" rx="1" fill="currentColor"/>' +
        '<rect x="2" y="14"  width="16" height="2" rx="1" fill="currentColor"/>' +
      '</svg>';
  }

  /* ── Backdrop ───────────────────────────────────────────── */
  function _backdrop() {
    var el = document.getElementById('dpsMobileBackdrop');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dpsMobileBackdrop';
      document.body.appendChild(el);
    }
    return el;
  }

  function _isMobile() { return window.innerWidth <= BREAKPOINT; }

  /* ── Open ───────────────────────────────────────────────── */
  function openSidebar() {
    var sb = document.getElementById('dacumProjectsSidebar');
    if (!sb) return;
    if (_isMobile()) {
      sb.classList.add('dps-mobile-open');
      _backdrop().classList.add('dps-backdrop-visible');
      document.body.style.overflow = 'hidden';
    } else {
      /* Desktop: uncollapse from 68px icon rail → 260px */
      sb.classList.remove('dps-collapsed');
      var w = document.getElementById('dacumAppWrapper');
      if (w) w.classList.remove('dps-is-collapsed');
      try { localStorage.setItem('dps_sidebar_collapsed', '0'); } catch(e) {}
    }
  }

  /* ── Close ──────────────────────────────────────────────── */
  function closeSidebar() {
    var sb = document.getElementById('dacumProjectsSidebar');
    if (!sb) return;
    if (_isMobile()) {
      sb.classList.remove('dps-mobile-open');
      _backdrop().classList.remove('dps-backdrop-visible');
      document.body.style.overflow = '';
    } else {
      /* Desktop: collapse to 68px icon rail */
      sb.classList.add('dps-collapsed');
      var w = document.getElementById('dacumAppWrapper');
      if (w) w.classList.add('dps-is-collapsed');
      try { localStorage.setItem('dps_sidebar_collapsed', '1'); } catch(e) {}
    }
  }

  /* ── Toggle ─────────────────────────────────────────────── */
  function toggleSidebar() {
    var sb = document.getElementById('dacumProjectsSidebar');
    if (!sb) return;
    var isOpen = _isMobile()
      ? sb.classList.contains('dps-mobile-open')
      : !sb.classList.contains('dps-collapsed');   /* updated: 68px rail check */
    isOpen ? closeSidebar() : openSidebar();
  }

  /* ── Set correct initial state ──────────────────────────── */
  function _setInitialState() {
    var sb = document.getElementById('dacumProjectsSidebar');
    if (!sb) return;
    var w = document.getElementById('dacumAppWrapper');
    if (_isMobile()) {
      /* Mobile: sidebar hidden off-screen; strip desktop-only classes */
      sb.classList.remove('dps-mobile-open');
      sb.classList.remove('dps-force-hidden');   /* irrelevant on mobile */
      sb.classList.remove('dps-collapsed');       /* no icon rail on mobile */
      _backdrop().classList.remove('dps-backdrop-visible');
      document.body.style.overflow = '';
      if (w) { w.classList.remove('dps-force-hidden-wrapper'); w.classList.remove('dps-is-collapsed'); }
    } else {
      /* Desktop: strip mobile-only classes, restore persisted collapse state */
      sb.classList.remove('dps-mobile-open');
      sb.classList.remove('dps-force-hidden');
      _backdrop().classList.remove('dps-backdrop-visible');
      document.body.style.overflow = '';
      if (w) w.classList.remove('dps-force-hidden-wrapper');
      try {
        var wasCollapsed = localStorage.getItem('dps_sidebar_collapsed') === '1';
        sb.classList.toggle('dps-collapsed', wasCollapsed);
        if (w) w.classList.toggle('dps-is-collapsed', wasCollapsed);
      } catch(e) {
        sb.classList.remove('dps-collapsed');
        if (w) w.classList.remove('dps-is-collapsed');
      }
    }
  }

  /* ── Swipe support (mobile open/close) ─────────────────── */
  function _addSwipe() {
    var _tx = null, _ty = null;

    document.addEventListener('touchstart', function (e) {
      if (!_isMobile()) return;
      var t = e.touches[0];
      _tx = t.clientX;
      _ty = t.clientY;
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (!_isMobile() || _tx === null) return;
      var t   = e.changedTouches[0];
      var dx  = t.clientX - _tx;
      var dy  = t.clientY - _ty;
      var startX = _tx;
      _tx = null; _ty = null;

      /* Ignore primarily-vertical swipes */
      if (Math.abs(dy) > Math.abs(dx)) return;
      /* Require at least 50 px horizontal travel */
      if (Math.abs(dx) < 50) return;

      var sb = document.getElementById('dacumProjectsSidebar');
      if (!sb) return;
      var isOpen = sb.classList.contains('dps-mobile-open');

      if (dx > 0 && !isOpen && startX <= 30) {
        /* Swipe-right from left edge → open */
        openSidebar();
      } else if (dx < 0 && isOpen) {
        /* Swipe-left while open → close */
        closeSidebar();
      }
    }, { passive: true });
  }

  /* ── Wire ───────────────────────────────────────────────── */
  var _wired = false;
  function _wire() {
    if (_wired) return;
    _wired = true;

    _injectMobileCSS();
    _setToggleIcon();
    _setInitialState();

    /* Toggle button (toolbar — visible on mobile via injected CSS) */
    var btn = document.getElementById('btnSidebarToggle');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleSidebar();
      });
    }

    /* Backdrop click — close unless rename is active */
    _backdrop().addEventListener('click', function () {
      var activeInput = document.querySelector('.dps-card-name-input[style*="block"]');
      if (activeInput) return;
      closeSidebar();
    });

    /* Project card click on mobile → close sidebar (unless rename is active) */
    document.addEventListener('click', function (e) {
      if (!_isMobile()) return;
      if (!e.target.closest('.dps-card-body')) return;
      /* Do NOT close if a rename input in this card is focused/visible */
      var card = e.target.closest('.dps-card');
      if (card && card.classList.contains('dps-editing')) return;
      var activeInput = document.querySelector('.dps-card-name-input[style*="block"]');
      if (activeInput) return;
      setTimeout(closeSidebar, 80);
    });

    /* Nav item click on mobile → close sidebar after tab switches */
    document.addEventListener('click', function (e) {
      if (!_isMobile()) return;
      if (e.target.closest('.dps-nav-item[data-target-tab]')) setTimeout(closeSidebar, 120);
    });

    /* Escape — close sidebar unless rename input is active */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var activeInput = document.querySelector('.dps-card-name-input[style*="block"]');
        if (activeInput) return;   /* let rename handle its own Escape */
        closeSidebar();
      }
    });

    /* Touch swipe */
    _addSwipe();

    /* Resize: re-apply correct initial state when crossing breakpoint */
    var _rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(_rt);
      _rt = setTimeout(_setInitialState, 150);
    });
  }

  /* ── Expose the viewport-aware API ──────────────────────
     dacum_projects.js owns the collapse chevron INSIDE the sidebar
     header, and it had its own _toggleSidebar() that only knew about
     the desktop icon rail. Publishing these lets that button — and
     any future caller — route through the one implementation that
     knows the difference between a drawer and a rail, instead of
     each file maintaining its own idea of what "collapsed" means. */
  window.DacumSidebar = {
    open:     openSidebar,
    close:    closeSidebar,
    toggle:   toggleSidebar,
    isMobile: _isMobile
  };

  /* ── Bootstrap ──────────────────────────────────────────── */
  function _boot() {
    if (document.getElementById('dacumProjectsSidebar')) { _wire(); return; }
    var _n = 0;
    var _p = setInterval(function () {
      _n++;
      if (document.getElementById('dacumProjectsSidebar') || _n > 60) {
        clearInterval(_p);
        _wire();
      }
    }, 80);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

})();
