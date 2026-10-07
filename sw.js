// ============================================================
// sw.js — DACUM Live Pro Service Worker  v104
// Path-agnostic: BASE is derived dynamically from scope.
// Works regardless of repository name (V3.0, V3.1, etc.)
// ============================================================

const CACHE_VERSION = 'v201';
const CACHE_NAME    = 'dacum-live-pro-' + CACHE_VERSION;
// Derive BASE from the SW scope so this file works in any repo path
const BASE          = self.registration ? self.registration.scope : '/';
const OFFLINE_URL   = BASE + 'index.html';

// These resource types are served network-first (fresh code always wins).
// Images/icons are still cache-first since they rarely change.
const NETWORK_FIRST_EXT = /\.(html|js|css|json)(\?.*)?$/i;

// Keep this list in sync with:
//   • every <script src> and <link rel="stylesheet"> in index.html
//   • every ES module reachable from app.js's import graph
// A module missing here still works online (network-first), but the
// app breaks offline at the point it is first imported.
const PRECACHE_URLS = [
  BASE + 'index.html',
  // Participants open this from a QR code, often on strained
  // conference wifi. Precaching it means the facilitator's own
  // device can serve it instantly and it survives a flaky network.
  BASE + 'DACUM_LiveWorkshop_Participant.html',
  // The user guide, opened from the Help tab. Same reasoning as the
  // participant page: a facilitator who needs it needs it in the room,
  // which is exactly where the network is worst. One file carries all
  // three languages, so this single entry covers EN, FR and AR — the
  // ?lang= query is stripped by networkFirst() before the cache lookup,
  // so every language variant resolves to this one cached response.
  // Its Arabic face is fonts/Cairo.woff2, already precached below.
  BASE + 'DACUM_Live_Pro_User_Guide.html',
  // QR image for the guide card. Listed before it exists on purpose:
  // precaching uses Promise.allSettled and skips a 404 with a warning,
  // so adding the PNG later needs no further change here.
  BASE + 'qr-code_DACUM_Live_Pro_User_Guide.png',

  // ── Fonts ────────────────────────────────────────────────
  // Precached, not lazily cached: the Arabic interface is unusable
  // in a fallback face, and this app is expected to run in training
  // rooms with no reliable network. 136 KB once, then never again.
  BASE + 'fonts/Cairo.woff2',
  // The TTF is a SEPARATE asset from the woff2 above: woff2 is for the
  // screen, and jsPDF can only embed a TTF. Caching the loader module
  // (pdf_arabic.js / arabic-font.js) without this file would only move
  // the offline failure one step later — the module would load, then
  // its fetch would fail and the Arabic PDF would refuse. Both have to
  // be precached together or neither is.
  BASE + 'fonts/Cairo-Regular.ttf',

  // ── Stylesheets ──────────────────────────────────────────
  BASE + 'dacum-styles.css',
  BASE + 'dacum-responsive.css',
  BASE + 'dacum-typography.css',
  BASE + 'dacum-components.css',
  // RTL mirroring + language switcher (loads last, see index.html).
  BASE + 'dacum-draft.css',
  // Module Curriculum tab + Standard export menu (3.33.0).
  BASE + 'dacum-curriculum.css',
  BASE + 'dacum-rtl.css',

  // ── Non-module scripts ───────────────────────────────────
  // translations.js is a plain IIFE that must be available before
  // app.js runs, so it is warmed with the critical set, not lazily.
  BASE + 'translations.js',

  // ── ES modules (app.js import graph) ─────────────────────
  BASE + 'app.js',
  BASE + 'state.js',
  BASE + 'renderer.js',
  BASE + 'duties.js',
  BASE + 'events.js',
  BASE + 'history.js',
  BASE + 'storage.js',
  BASE + 'tabs.js',
  BASE + 'tasks.js',
  BASE + 'task_analysis.js',
  BASE + 'task_analysis_ai.js',
  BASE + 'ai_client.js',
  BASE + 'ai_draft.js',
  BASE + 'i18n_defaults.js',
  BASE + 'codes.js',
  BASE + 'modules.js',
  BASE + 'modules_shared.js',
  BASE + 'clusters.js',
  BASE + 'learning_outcomes.js',
  BASE + 'module_mapping.js',
  BASE + 'projects.js',
  BASE + 'exports_shared.js',
  BASE + 'exports_docx.js',
  BASE + 'exports_docx_sections.js',
  BASE + 'exports_pdf.js',
  BASE + 'exports_pdf_sections.js',
  // Second DOCX layout: Occupational Profile + Occupational Standard.
  // Reached only from events.js (the toolbar button), never from
  // exports_docx.js, so nothing else would pull it into the cache. A
  // miss here is invisible online and fails only in the training room,
  // which is the one place the export is actually wanted.
  BASE + 'exports_os_docx.js',
  // Module Curriculum tab (3.33.0) and its CUR Word layout. Imported by
  // events.js / tabs.js / projects.js; the exporter only through it.
  BASE + 'module_curriculum.js',
  BASE + 'module_curriculum_text.js',
  // Traceability Map (3.48.0): imported on demand by events.js only.
  BASE + 'trace_map.js',
  BASE + 'exports_cur_docx.js',
  // Export Settings: the store + modal that both exporters read from.
  // Loaded lazily by the sidebar button and statically by the two
  // exporters, so an installed copy must carry it or a coloured
  // export would fail offline.
  BASE + 'export_settings.js',
  BASE + 'settings_languages.js',
  BASE + 'content_lang.js',
  BASE + 'content_translate.js',
  BASE + 'card_colors.js',
  // Arabic PDF support: the shaper/BiDi module and the jsPDF mirror
  // layer built on top of it. Reachable only from exports_pdf.js.
  BASE + 'arabic-font.js',
  BASE + 'pdf_arabic.js',
  BASE + 'snapshots.js',
  BASE + 'workshop.js',
  BASE + 'workshop_snapshots.js',
  BASE + 'dacum_projects.js',
  BASE + 'refine.js',
  BASE + 'drag_drop.js',
  BASE + 'additional_info_ai.js',
  BASE + 'module_mapping_ai.js',
  BASE + 'clustering_ai.js',
  // Full Draft orchestrator — imports every AI module above.
  BASE + 'draft_mode.js',
  // Occupation-title sanity gate. Imported by BOTH projects.js and
  // draft_ui.js, so a miss here breaks the duties tab and the Full
  // Draft dialog together.
  BASE + 'occupation_check.js',
  BASE + 'draft_agent.js',
  BASE + 'draft_ui.js',
  BASE + 'draft_regen.js',
  BASE + 'draft_unverified.js',
  BASE + 'draft_ratings.js',
  BASE + 'learning_outcomes_ai.js',
  BASE + 'image_store.js',
  // Occupational Standard: the shared model (read by the Word exporter
  // and the tab) and the tab itself (3.39.0).
  BASE + 'os_model.js',
  // Skills Level Matrix columns (3.40.0): read by the matrix and every export.
  BASE + 'skill_levels.js',
  BASE + 'occupational_standard.js',
  // Third-party libraries, self-hosted since 3.38.0 (were CDN, so Word
  // and PDF export failed offline). Versioned folders: a new version is
  // a new path, never an in-place change.
  BASE + 'vendor/jspdf-2.5.1/jspdf.umd.min.js',
  BASE + 'vendor/docx-7.8.2/index.js',
  BASE + 'vendor/sortablejs-1.15.3/Sortable.min.js',
  // Owner of the project list (localStorage by default, IndexedDB as
  // fallback). Imported by app.js, dacum_projects.js, autosave.js,
  // snapshots.js and tasks.js — the app cannot boot offline without it.
  BASE + 'project_store.js',
  BASE + 'autosave.js',
  BASE + 'verification_charts.js',
  BASE + 'supplementary_verification.js',
  BASE + 'task_selection.js',
  BASE + 'error-handler.js',

  // ── Classic scripts loaded directly by index.html ────────
  BASE + 'dacum-ui.js',
  BASE + 'dacum-mobile.js',
  BASE + 'dacum-fixes.js',
  BASE + 'qrcode.min.js',

  // ── PWA assets ───────────────────────────────────────────
  BASE + 'manifest.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
];

// ── Install: precache all assets, activate immediately ────────
self.addEventListener('install', function (event) {
  console.log('[SW ' + CACHE_VERSION + '] Installing...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.allSettled(
        PRECACHE_URLS.map(function (url) {
          // Fetch with no-cache to bypass any HTTP cache — gets fresh files
          return fetch(url, { cache: 'no-store' })
            .then(function (res) {
              if (res && res.status === 200) return cache.put(url, res);
            })
            .catch(function (err) {
              console.warn('[SW] Precache skipped:', url, err.message);
            });
        })
      );
    }).then(function () {
      console.log('[SW ' + CACHE_VERSION + '] Precache complete');
    })
  );
});

// ── Activate: claim clients, purge old caches, warm cache, notify to reload
self.addEventListener('activate', function (event) {
  console.log('[SW ' + CACHE_VERSION + '] Activating...');
  event.waitUntil(
    self.clients.claim()
      .then(function () {
        // Delete ALL old version caches
        return caches.keys().then(function (keys) {
          return Promise.all(
            keys.filter(function (k) { return k !== CACHE_NAME; })
                .map(function (k) {
                  console.log('[SW] Deleting old cache:', k);
                  return caches.delete(k);
                })
          );
        });
      })
      .then(function () {
        // Pre-fetch the critical files fresh from network RIGHT NOW,
        // before notifying clients to reload. This ensures that when
        // old-HTML pages reload, they immediately get the new HTML/JS/CSS
        // instead of waiting for the next fetch cycle.
        var criticalUrls = [
          BASE + 'index.html',
          BASE + 'dacum_projects.js',
          // Imported by dacum_projects.js; must update in step with it.
          BASE + 'project_store.js',
          BASE + 'dacum-mobile.js',
          BASE + 'dacum-styles.css',
          BASE + 'dacum-responsive.css',
          // Added in Phase 1: index.html no longer carries its own
          // <style> block, so it is useless without this file. It has to
          // be warmed alongside the HTML or an updated page would paint
          // unstyled until the next fetch cycle.
          BASE + 'dacum-components.css',
          // Added by preflight: index.html has no inline <style> of its
          // own, so every stylesheet it links has to be warmed alongside
          // the HTML or an updated page paints unstyled for one cycle.
          BASE + 'dacum-typography.css',
          BASE + 'dacum-rtl.css',
          // 3.33.0: the curriculum tab's own stylesheet, linked by
          // index.html like the others.
          BASE + 'dacum-curriculum.css',
          // Flagged by preflight (pre-existing): linked by index.html too.
          BASE + 'dacum-draft.css',
          // Without this the Arabic UI repaints in a fallback face for
          // one cycle after every update.
          BASE + 'fonts/Cairo.woff2',
          // Without this the page repaints in English for one cycle
          // after an update, which is jarring for an Arabic user.
          BASE + 'translations.js',
          BASE + 'app.js',
        ];
        return caches.open(CACHE_NAME).then(function (cache) {
          return Promise.allSettled(
            criticalUrls.map(function (url) {
              return fetch(url, { cache: 'no-store' }).then(function (res) {
                if (res && res.status === 200) {
                  cache.put(url, res.clone());
                  console.log('[SW] Warmed cache:', url);
                }
                return res;
              }).catch(function (err) {
                console.warn('[SW] Warm failed:', url, err.message);
              });
            })
          );
        });
      })
      .then(function () {
        // NOW notify all clients to reload — fresh files are ready
        console.log('[SW ' + CACHE_VERSION + '] Cache warm complete — notifying clients');
        return self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        }).then(function (clients) {
          clients.forEach(function (client) {
            client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
          });
        });
      })
  );
});

// ── Message: handle SKIP_WAITING + GET_VERSION from page ────────
self.addEventListener('message', function (event) {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received');
    self.skipWaiting();
  }
  // Version query — page checks if controller is up to date
  if (event.data.type === 'GET_VERSION') {
    var port = event.ports && event.ports[0];
    var reply = { type: 'VERSION_REPLY', version: CACHE_VERSION };
    if (port) {
      port.postMessage(reply);
    } else if (event.source) {
      event.source.postMessage(reply);
    }
  }
});

// ── Fetch: route each request to the right strategy ──────────
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // External API → network only
  if (url.hostname.includes('railway.app') || url.pathname.includes('/api/')) {
    event.respondWith(fetch(req));
    return;
  }

  // Cross-origin CDN → network-first with cache fallback
  if (url.hostname !== self.location.hostname) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Same-origin HTML, JS, CSS, JSON → network-first
  // This ensures new sidebar code always loads, even after install
  if (NETWORK_FIRST_EXT.test(url.pathname)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Images and other static assets → cache-first
  event.respondWith(cacheFirst(req));
});

// ── Network-first: try network, cache on success, fallback to cache
async function networkFirst(request) {
  var canonical = request.url.split('?')[0]; // strip query for consistent cache key
  try {
    var res = await fetch(canonical, { cache: 'no-cache' });
    if (res && res.status === 200 && res.type !== 'opaque') {
      var cache = await caches.open(CACHE_NAME);
      cache.put(canonical, res.clone());
    }
    return res;
  } catch (_) {
    // Offline: serve from cache (any query variant accepted)
    var cached = await caches.match(canonical) ||
                 await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return (await caches.match(OFFLINE_URL)) ||
             new Response(
               '<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:60px">' +
               '<h2>\uD83D\uDCF6 You are offline</h2>' +
               '<p>DACUM Live Pro will reload when reconnected.</p>' +
               '</body></html>',
               { status: 503, headers: { 'Content-Type': 'text/html' } }
             );
    }
    return new Response('Offline', { status: 503 });
  }
}

// ── Cache-first: serve cache, refresh in background
async function cacheFirst(request) {
  var cached = await caches.match(request);
  if (cached) {
    // Background refresh
    fetch(request).then(function (res) {
      if (res && res.status === 200 && res.type !== 'opaque') {
        caches.open(CACHE_NAME).then(function (c) { c.put(request, res); });
      }
    }).catch(function () {});
    return cached;
  }
  try {
    var res = await fetch(request);
    if (res && res.status === 200 && res.type !== 'opaque') {
      var cache = await caches.open(CACHE_NAME);
      cache.put(request, res.clone());
    }
    return res;
  } catch (_) {
    return new Response('Offline', { status: 503 });
  }
}
