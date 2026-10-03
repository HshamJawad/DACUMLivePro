// ============================================================
// /project_store.js
// Single owner of the project list (`dacum_projects`).
//
// WHY:
//   localStorage tops out around 5 MB for the whole origin. A few large
//   DACUM charts (long task lists, workshop results, curricula) can fill
//   it, and a full quota means a save that fails mid-workshop. IndexedDB
//   offers a quota measured in hundreds of megabytes.
//
//   localStorage stays the DEFAULT. Nothing changes for users whose data
//   fits: in 'local' mode every read goes straight to localStorage, just
//   as before, so cross-tab behaviour is identical to earlier versions.
//
// THE 'idb' BACKEND — same pattern as image_store.js:
//   • initProjectStore() — called once at boot (awaited in app.js before
//                          any project is loaded). Loads the list into
//                          memory.
//   • readProjects()     — synchronous, from memory. Always returns a
//                          freshly parsed copy, so callers may mutate it
//                          freely (exactly like JSON.parse(localStorage…)).
//   • writeProjects()    — synchronous memory update; the durable
//                          IndexedDB write happens in the background and
//                          is coalesced (only the latest payload is
//                          written).
//
// MIGRATION RULES (both directions):
//   copy → read back and verify → flip the backend flag → only THEN
//   remove the source. If any step fails the old backend stays active
//   and its data is untouched.
//
// FLAG:
//   localStorage 'dacum_store_backend' = 'local' | 'idb' (absent = local).
//
// SAFETY:
//   If the flag says 'idb' but IndexedDB cannot be opened, the store is
//   LOCKED: nothing is loaded destructively and every write is refused,
//   so an empty list can never overwrite the real one.
// ============================================================

export const LS_PROJECTS   = 'dacum_projects';
export const LS_BACKEND    = 'dacum_store_backend';

const DB_NAME    = 'dacum_projects_db';
const DB_VERSION = 1;
const STORE      = 'kv';
const KEY        = 'projects';
const CHANNEL    = 'dacum_projects_store';
const FLUSH_MS   = 120;

let _backend      = 'local';   // 'local' | 'idb'
let _locked       = false;     // flag = idb but IndexedDB will not open
let _db           = null;
let _idbFailed    = false;     // an open attempt failed this session
let _str          = '[]';      // idb mode: the source of truth for reads
let _override     = null;      // local mode: payload held during migration
let _migrating    = false;
let _queued       = null;      // payload written while migrating
let _pending      = null;      // idb: payload waiting to be flushed
let _flushTimer   = null;
let _writing      = null;      // Promise of the in-flight IDB write
let _channel      = null;
let _errorHandler = null;

// ── Low-level IndexedDB ───────────────────────────────────────

function _idbSupported() {
  try { return typeof indexedDB !== 'undefined' && indexedDB !== null; }
  catch { return false; }
}

function _openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    if (!_idbSupported()) { reject(new Error('IndexedDB unavailable')); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      _db = req.result;
      // Another tab upgrading the schema must not be blocked by us.
      _db.onversionchange = () => { try { _db.close(); } catch {} _db = null; };
      resolve(_db);
    };
    req.onerror   = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

function _idbGet() {
  return new Promise((resolve, reject) => {
    try {
      const req = _db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error || new Error('IndexedDB read failed'));
    } catch (e) { reject(e); }
  });
}

function _idbPut(value) {
  return new Promise((resolve, reject) => {
    try {
      const tx = _db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onabort    = () => reject(tx.error || new Error('IndexedDB write aborted'));
      tx.onerror    = () => reject(tx.error || new Error('IndexedDB write failed'));
    } catch (e) { reject(e); }
  });
}

function _idbDelete() {
  return new Promise((resolve) => {
    try {
      const tx = _db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve(true);
      tx.onabort = tx.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}

/** Does the projects database exist? Avoids creating it just to look. */
async function _idbExists() {
  if (!_idbSupported()) return false;
  try {
    if (typeof indexedDB.databases === 'function') {
      const list = await indexedDB.databases();
      return list.some(d => d && d.name === DB_NAME);
    }
  } catch { /* fall through to a real open */ }
  return true;   // cannot tell — let the caller try opening it
}

// ── Small helpers ─────────────────────────────────────────────

function _lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function _readFlag() {
  return _lsGet(LS_BACKEND) === 'idb' ? 'idb' : 'local';
}

function _writeFlag(value) {
  try { localStorage.setItem(LS_BACKEND, value); return true; }
  catch { return false; }
}

function _parse(str) {
  try {
    const v = JSON.parse(str || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function _report(kind, err) {
  try { if (_errorHandler) _errorHandler(kind, err); } catch {}
}

function _broadcast(type) {
  try { if (_channel) _channel.postMessage({ type, at: Date.now() }); } catch {}
}

function _emitExternalChange() {
  try { window.dispatchEvent(new CustomEvent('dacum:projects-external-change')); } catch {}
}

// ── Cross-tab sync ────────────────────────────────────────────
// In 'local' mode tabs already share localStorage. In 'idb' mode each tab
// holds its own memory copy, so a write in one tab tells the others to
// reload theirs. A backend switch in another tab re-initialises this one.

function _setupChannel() {
  if (_channel || typeof BroadcastChannel === 'undefined') return;
  try {
    _channel = new BroadcastChannel(CHANNEL);
    _channel.onmessage = async (ev) => {
      const type = ev && ev.data && ev.data.type;
      if (type === 'backend') {
        await _loadForFlag();
        _emitExternalChange();
      } else if (type === 'changed' && _backend === 'idb' && _db && !_pending) {
        try {
          const v = await _idbGet();
          if (typeof v === 'string' && v !== _str) { _str = v; _emitExternalChange(); }
        } catch {}
      }
    };
  } catch { _channel = null; }
}

// ── Boot ──────────────────────────────────────────────────────

async function _loadForFlag() {
  _locked  = false;
  _backend = _readFlag();

  if (_backend === 'idb') {
    try {
      await _openDB();
    } catch (err) {
      console.warn('[project_store] flag is idb but IndexedDB will not open:', err && err.message);
      _idbFailed = true;
      _locked    = true;
      // Read-only view of anything still in localStorage (a migration
      // that never removed its source). Never written back.
      _str = _lsGet(LS_PROJECTS) || '[]';
      return;
    }
    let stored;
    try { stored = await _idbGet(); } catch (err) {
      console.warn('[project_store] IndexedDB read failed:', err);
      _locked = true;
      _str = _lsGet(LS_PROJECTS) || '[]';
      return;
    }
    if (typeof stored === 'string') {
      _str = stored;
      return;
    }
    // Flag says idb but nothing there: fall back to whatever localStorage
    // still holds and return to the local backend — never invent data.
    const ls = _lsGet(LS_PROJECTS);
    if (ls !== null) {
      _writeFlag('local');
      _backend = 'local';
      return;
    }
    _str = '[]';
    return;
  }

  // 'local' (the default). Recovery path: a migration that verified its
  // copy and removed the source but could not write the flag (storage
  // was completely full) leaves localStorage empty and the data in IDB.
  if (_lsGet(LS_PROJECTS) === null && await _idbExists()) {
    try {
      await _openDB();
      const stored = await _idbGet();
      if (typeof stored === 'string' && stored !== '[]') {
        console.warn('[project_store] recovered projects from IndexedDB (flag was missing)');
        _backend = 'idb';
        _str = stored;
        _writeFlag('idb');
      }
    } catch { /* nothing to recover */ }
  }
}

/**
 * Load the project list into the store. Resolves in every case.
 * @returns {Promise<{backend:string, locked:boolean}>}
 */
export async function initProjectStore() {
  try { await _loadForFlag(); }
  catch (err) { console.warn('[project_store] init:', err); }

  _setupChannel();

  // Push any queued IDB write out before the page goes away.
  const flushOnHide = () => { if (_pending !== null) _flush(); };
  try {
    window.addEventListener('pagehide', flushOnHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    });
  } catch {}

  // A backend switch made by another tab on an older build that lacks
  // BroadcastChannel still shows up as a storage event on the flag.
  try {
    window.addEventListener('storage', async (e) => {
      if (e.key === LS_BACKEND && _readFlag() !== _backend) {
        await _loadForFlag();
        _emitExternalChange();
      }
    });
  } catch {}

  return { backend: _backend, locked: _locked };
}

// ── Reads ─────────────────────────────────────────────────────

function _currentString() {
  if (_backend === 'idb' || _locked) return _str;
  if (_override !== null) return _override;
  return _lsGet(LS_PROJECTS) || '[]';
}

/** The project list — a fresh copy the caller may mutate. */
export function readProjects() {
  return _parse(_currentString());
}

// ── Writes ────────────────────────────────────────────────────

function _scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => { _flushTimer = null; _flush(); }, FLUSH_MS);
}

function _flush() {
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  if (_pending === null || !_db) return _writing || Promise.resolve();
  if (_writing) {
    // One write at a time; the latest payload goes out next.
    return _writing.then(() => _flush());
  }
  const payload = _pending;
  _pending = null;
  _writing = _idbPut(payload)
    .then(() => { _broadcast('changed'); })
    .catch((err) => {
      console.warn('[project_store] IndexedDB write failed:', err);
      if (_pending === null) _pending = payload;   // keep it for a retry
      _report('idb-write', err);
    })
    .finally(() => {
      _writing = null;
      if (_pending !== null) _scheduleFlush();
    });
  return _writing;
}

/**
 * Persist a serialised project list.
 * • local mode: synchronous localStorage write — THROWS on failure
 *   (quota etc.) exactly like localStorage.setItem, so the caller keeps
 *   its existing error handling.
 * • idb mode: memory updated now, IndexedDB write coalesced.
 * • locked: throws an Error with name 'StoreLockedError'.
 */
export function writeProjectsPayload(payload) {
  if (_locked) {
    const e = new Error('Project store is locked (IndexedDB unavailable)');
    e.name = 'StoreLockedError';
    throw e;
  }

  // Another tab may have switched backends since we booted.
  if (!_migrating && _backend === 'local' && _readFlag() === 'idb') {
    _backend = 'idb';
    _str = payload;
    _pending = payload;
    _openDB().then(() => _scheduleFlush()).catch((err) => {
      _locked = true; _report('idb-write', err);
    });
    return;
  }

  if (_migrating) {
    // Migration in flight: hold the newest payload in memory; it is
    // written to whichever backend wins once the migration settles.
    _override = payload;
    _str      = payload;
    _queued   = payload;
    return;
  }

  if (_backend === 'idb') {
    _str = payload;
    _pending = payload;
    _scheduleFlush();
    return;
  }

  localStorage.setItem(LS_PROJECTS, payload);   // may throw — by design
}

/** Convenience wrapper: serialise and persist. Same throwing contract. */
export function writeProjects(list) {
  writeProjectsPayload(JSON.stringify(list));
}

/** Wait for any queued IndexedDB write to finish (tests, migrations). */
export function flushProjectStore() {
  if (_pending !== null) return _flush();
  return _writing || Promise.resolve();
}

// ── State queries ─────────────────────────────────────────────

export function getStorageBackend()     { return _backend; }
export function isProjectStoreLocked()  { return _locked; }
export function isMigrating()           { return _migrating; }
/** True when moving to IndexedDB is worth attempting. */
export function canUseLargeStorage()    { return _idbSupported() && !_idbFailed; }
/** Serialised size of the project list, in bytes (UTF-16 length). */
export function getProjectsBytes()      { return _currentString().length; }

/** Register a callback(kind, error) for background write failures. */
export function onProjectStoreError(fn) { _errorHandler = typeof fn === 'function' ? fn : null; }

/**
 * @returns {Promise<{backend, bytes, quotaEstimate, idbSupported, locked}>}
 * quotaEstimate is { usage, quota } from navigator.storage.estimate(),
 * or null when the browser does not report it.
 */
export async function getStorageInfo() {
  let quotaEstimate = null;
  try {
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      if (est && typeof est.quota === 'number') {
        quotaEstimate = { usage: est.usage || 0, quota: est.quota };
      }
    }
  } catch {}
  return {
    backend: _backend,
    bytes: getProjectsBytes(),
    quotaEstimate,
    idbSupported: canUseLargeStorage(),
    locked: _locked,
  };
}

// ── Migrations ────────────────────────────────────────────────

/**
 * Move the project list to IndexedDB.
 * @param {string} [payloadOverride] the serialised list to move — used by
 *        the quota path, where the newest list could not be written to
 *        localStorage and so exists only in memory.
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function migrateToIdb(payloadOverride) {
  if (_locked)              return { ok: false, reason: 'locked' };
  if (_backend === 'idb')   return { ok: true, reason: 'already' };
  if (_migrating)           return { ok: false, reason: 'busy' };
  if (!_idbSupported())     return { ok: false, reason: 'unavailable' };

  const payload = typeof payloadOverride === 'string'
    ? payloadOverride
    : (_lsGet(LS_PROJECTS) || '[]');

  // From here on reads see the payload being moved.
  _migrating = true;
  _override  = payload;
  _str       = payload;
  _queued    = null;

  const fail = (reason, err) => {
    if (err) console.warn('[project_store] migration to IndexedDB failed:', reason, err);
    _migrating = false;
    const latest = _queued;
    _queued = null;
    _override = null;
    // Still on localStorage. Give it the newest data if it fits; if not,
    // the caller's quota handling takes over on its next save.
    if (latest !== null) {
      try { localStorage.setItem(LS_PROJECTS, latest); } catch {}
    }
    return { ok: false, reason };
  };

  try { await _openDB(); }
  catch (err) { _idbFailed = true; return fail('unavailable', err); }

  // 1. Copy
  try { await _idbPut(payload); }
  catch (err) { return fail('write', err); }

  // 2. Verify by reading it back
  let check;
  try { check = await _idbGet(); }
  catch (err) { return fail('verify', err); }
  if (check !== payload) return fail('verify');

  // 3. Flip the flag. When localStorage is completely full even this
  //    tiny write can fail: the copy is verified, so removing the source
  //    first is safe — and boot recovers from IDB if the flag is missing.
  if (!_writeFlag('idb')) {
    try { localStorage.removeItem(LS_PROJECTS); } catch {}
    _writeFlag('idb');   // best effort; see recovery in _loadForFlag
  }

  // 4. Switch over, then remove the source.
  _backend   = 'idb';
  _str       = payload;
  _override  = null;
  _migrating = false;
  try { localStorage.removeItem(LS_PROJECTS); } catch {}

  // Anything saved while we were copying goes out now.
  if (_queued !== null && _queued !== payload) {
    _str = _queued;
    _pending = _queued;
    _scheduleFlush();
  }
  _queued = null;

  // Ask the browser not to evict this origin's data under pressure.
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(() => {});
    }
  } catch {}

  _broadcast('backend');
  return { ok: true };
}

/**
 * Move the project list back to localStorage.
 * @param {number} maxBytes refuse when the data is larger than this, so
 *        it does not immediately bounce back to IndexedDB.
 * @returns {Promise<{ok:boolean, reason?:string, bytes?:number}>}
 */
export async function migrateToLocal(maxBytes = Infinity) {
  if (_locked)              return { ok: false, reason: 'locked' };
  if (_backend === 'local') return { ok: true, reason: 'already' };
  if (_migrating)           return { ok: false, reason: 'busy' };

  await flushProjectStore();
  const payload = _str;
  if (payload.length > maxBytes) return { ok: false, reason: 'too-big', bytes: payload.length };

  _migrating = true;
  _queued = null;
  const finish = (res) => { _migrating = false; return res; };

  // 1. Copy (a quota error here means it does not fit)
  try { localStorage.setItem(LS_PROJECTS, payload); }
  catch (err) {
    try { localStorage.removeItem(LS_PROJECTS); } catch {}
    const q = err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);
    _flushQueuedIdb();
    return finish({ ok: false, reason: q ? 'too-big' : 'write', bytes: payload.length });
  }

  // 2. Verify
  if (_lsGet(LS_PROJECTS) !== payload) {
    try { localStorage.removeItem(LS_PROJECTS); } catch {}
    _flushQueuedIdb();
    return finish({ ok: false, reason: 'verify' });
  }

  // 3. Flip the flag
  if (!_writeFlag('local')) {
    try { localStorage.removeItem(LS_PROJECTS); } catch {}
    _flushQueuedIdb();
    return finish({ ok: false, reason: 'flag' });
  }

  // 4. Switch over, then remove the IndexedDB copy.
  _backend = 'local';
  _migrating = false;
  const latest = _queued;
  _queued = null;
  _override = null;
  if (latest !== null && latest !== payload) {
    try { localStorage.setItem(LS_PROJECTS, latest); } catch {}
  }
  if (_db) await _idbDelete();

  _broadcast('backend');
  return { ok: true };
}

function _flushQueuedIdb() {
  // A failed move back leaves us on IndexedDB; persist anything saved
  // during the attempt.
  if (_queued !== null) {
    _str = _queued;
    _pending = _queued;
    _queued = null;
    _scheduleFlush();
  }
  _override = null;
}
