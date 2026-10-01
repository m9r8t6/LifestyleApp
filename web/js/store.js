/* =========================================================
 *  LifeOS — Store  (store.js)
 *  Keeps every `lifeos_*` value in localStorage (instant,
 *  works offline) and mirrors it to the server. Modules keep
 *  using localStorage as before; this file watches the writes.
 * ========================================================= */

window.Store = (() => {
    'use strict';

    const META_KEY = 'lifeosync_meta';
    const PREFIX = 'lifeos_';
    // Stay on this device only: secrets, device tokens and per-device preferences.
    const LOCAL_ONLY = new Set([
        'lifeos_deepseek_key',
        'lifeos_hf_token',
        'lifeos_google_access_token',
        'lifeos_google_token_expiry',
        'lifeos_notified_events',
        'lifeos_theme',
    ]);
    const PUSH_DELAY_MS = 800;
    const POLL_MS = 60000;
    const KEEPALIVE_LIMIT = 60000;

    const rawSet = Storage.prototype.setItem;
    const rawRemove = Storage.prototype.removeItem;

    let meta = loadMeta();
    let status = 'idle';          // idle | syncing | pending | offline
    let inFlight = null;
    let pushTimer = null;
    let started = false;
    const listeners = { status: [], remote: [], auth: [] };

    // ── Meta (sync bookkeeping) ──────────────────────────

    function loadMeta() {
        try {
            const parsed = JSON.parse(localStorage.getItem(META_KEY));
            if (parsed && typeof parsed === 'object') {
                return { user: parsed.user || null, rev: parsed.rev || 0, revs: parsed.revs || {}, dirty: parsed.dirty || {}, lastSync: parsed.lastSync || 0 };
            }
        } catch (e) {}
        return { user: null, rev: 0, revs: {}, dirty: {}, lastSync: 0 };
    }

    function saveMeta() {
        try { rawSet.call(localStorage, META_KEY, JSON.stringify(meta)); } catch (e) {}
    }

    const isSynced = (key) => typeof key === 'string' && key.startsWith(PREFIX) && !LOCAL_ONLY.has(key);

    function syncedKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (isSynced(key)) keys.push(key);
        }
        return keys;
    }

    // ── Watch localStorage writes ────────────────────────

    function markDirty(key) {
        meta.dirty[key] = true;
        saveMeta();
        setStatus(navigator.onLine === false ? 'offline' : 'pending');
        if (!started) return;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => sync(), PUSH_DELAY_MS);
    }

    Storage.prototype.setItem = function (key, value) {
        const watched = this === localStorage && isSynced(key);
        const before = watched ? this.getItem(key) : null;
        rawSet.call(this, key, value);
        if (watched && before !== String(value)) markDirty(key);
    };

    Storage.prototype.removeItem = function (key) {
        const watched = this === localStorage && isSynced(key);
        const existed = watched && this.getItem(key) !== null;
        rawRemove.call(this, key);
        if (existed) markDirty(key);
    };

    // ── Events ───────────────────────────────────────────

    function emit(type, payload) {
        listeners[type].forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
    }

    function setStatus(next) {
        if (status === next) return;
        status = next;
        emit('status', status);
    }

    // ── HTTP ─────────────────────────────────────────────

    async function api(path, { method = 'GET', body, timeout = 15000, keepalive = false } = {}) {
        const res = await fetch(path, {
            method,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'lifeos' },
            body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
            keepalive,
            signal: keepalive ? undefined : AbortSignal.timeout(timeout),
        });
        let data = null;
        try { data = await res.json(); } catch (e) {}
        if (!res.ok) {
            const err = new Error((data && (data.error?.message || data.error)) || `HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return data;
    }

    // ── Sync ─────────────────────────────────────────────

    /** Push local changes and pull remote ones. Resolves to true when the server answered. */
    function sync(options = {}) {
        if (!meta.user) return Promise.resolve(false);
        if (inFlight) {
            // Run once more afterwards so writes made meanwhile are not left waiting.
            return inFlight.then(() => (Object.keys(meta.dirty).length ? sync(options) : true));
        }
        clearTimeout(pushTimer);
        inFlight = runSync(options).finally(() => { inFlight = null; });
        return inFlight;
    }

    async function runSync({ keepalive = false, timeout = 20000 } = {}) {
        const sent = {};
        const changes = Object.keys(meta.dirty).map(key => {
            const value = localStorage.getItem(key);
            sent[key] = value;
            return value === null
                ? { key, deleted: true, base: meta.revs[key] || 0 }
                : { key, value, base: meta.revs[key] || 0 };
        });
        const body = JSON.stringify({ since: meta.rev, changes });
        setStatus('syncing');

        let result;
        try {
            result = await api('/api/sync', {
                method: 'POST',
                body,
                timeout,
                keepalive: keepalive && body.length < KEEPALIVE_LIMIT,
            });
        } catch (err) {
            if (err.status === 401) {
                setStatus('pending');
                emit('auth', null);
            } else {
                setStatus(Object.keys(meta.dirty).length ? 'offline' : 'idle');
            }
            return false;
        }

        result.applied.forEach(({ key, rev }) => {
            meta.revs[key] = rev;
            // Only settled if nothing was written to the key while the request was running.
            if (localStorage.getItem(key) === sent[key]) delete meta.dirty[key];
        });

        const changedKeys = [];
        result.changes.forEach(change => {
            meta.revs[change.key] = change.rev;
            if (meta.dirty[change.key] || !isSynced(change.key)) return;
            const current = localStorage.getItem(change.key);
            if (change.deleted) {
                if (current !== null) { rawRemove.call(localStorage, change.key); changedKeys.push(change.key); }
            } else if (current !== change.value) {
                try {
                    rawSet.call(localStorage, change.key, change.value);
                    changedKeys.push(change.key);
                } catch (e) {
                    console.error('[Store] could not cache', change.key, e);
                }
            }
        });

        meta.rev = result.rev;
        meta.lastSync = Date.now();
        saveMeta();
        setStatus(Object.keys(meta.dirty).length ? 'pending' : 'idle');
        if (changedKeys.length) emit('remote', changedKeys);
        return true;
    }

    // ── Session ──────────────────────────────────────────

    function wipeLocal() {
        syncedKeys().forEach(key => rawRemove.call(localStorage, key));
        ['lifeos_notified_events']
            .forEach(key => rawRemove.call(localStorage, key));
        meta = { user: null, rev: 0, revs: {}, dirty: {}, lastSync: 0 };
        saveMeta();
    }

    /** Called once somebody is signed in. Makes sure the cache belongs to them. */
    function adoptUser(username) {
        if (meta.user && meta.user !== username) wipeLocal();
        if (!meta.user) {
            // Data that was already on this device (e.g. from the old version) joins the account.
            syncedKeys().forEach(key => { meta.dirty[key] = true; });
            // Old secrets have no place in the new setup.
            rawRemove.call(localStorage, 'lifeos_deepseek_key');
            rawRemove.call(localStorage, 'lifeos_hf_token');
            ['lifeos_drive_auto_connect', 'lifeos_google_access_token', 'lifeos_google_token_expiry', 'lifeos_google_client_id']
                .forEach(key => rawRemove.call(localStorage, key));
        }
        meta.user = username;
        saveMeta();
    }

    /**
     * First sync of a device: take the server's data before anything local is pushed,
     * so default values created on an empty device can never overwrite saved data.
     */
    async function firstSync() {
        const localKeys = Object.keys(meta.dirty);
        meta.dirty = {};
        const ok = await sync();
        if (!ok) {
            localKeys.forEach(key => { meta.dirty[key] = true; });
            saveMeta();
            return false;
        }
        // Whatever the server did not already have is uploaded.
        localKeys.forEach(key => { if (!meta.revs[key]) meta.dirty[key] = true; });
        saveMeta();
        if (Object.keys(meta.dirty).length) await sync();
        return true;
    }

    async function login(username, password, isSetup) {
        const data = await api(isSetup ? '/api/auth/setup' : '/api/auth/login', {
            method: 'POST',
            body: { username, password },
        });
        adoptUser(data.user.username);
        return data.user;
    }

    async function logout() {
        await sync({ timeout: 8000 });
        const unsaved = Object.keys(meta.dirty).length;
        if (unsaved && !confirm('Some changes could not be saved to the server yet and will be lost. Sign out anyway?')) return false;
        try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (e) {}
        wipeLocal();
        return true;
    }

    /** Start background syncing: after writes, when the app comes back, and periodically. */
    function start() {
        if (started) return;
        started = true;
        if (Object.keys(meta.dirty).length) sync();

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (Object.keys(meta.dirty).length) sync({ keepalive: true });
            } else {
                sync();
            }
        });
        window.addEventListener('pagehide', () => {
            if (Object.keys(meta.dirty).length) sync({ keepalive: true });
        });
        window.addEventListener('online', () => sync());
        window.addEventListener('offline', () => setStatus('offline'));
        setInterval(() => { if (!document.hidden) sync(); }, POLL_MS);
    }

    // ── Backup file export / import ──────────────────────

    function exportData() {
        const data = {};
        syncedKeys().forEach(key => { data[key] = localStorage.getItem(key); });
        return data;
    }

    /** Accepts a backup object ({ key: string }) as produced by exportData(). */
    async function importData(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Not a LifeOS backup file.');
        let count = 0;
        Object.keys(data).forEach(key => {
            if (!isSynced(key) || !/^lifeos_[a-z0-9_]{1,80}$/i.test(key)) return;
            const value = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
            localStorage.setItem(key, value);
            count++;
        });
        if (!count) throw new Error('No LifeOS data found in this file.');
        await sync();
        return count;
    }

    return {
        api,
        sync,
        firstSync,
        start,
        login,
        logout,
        adoptUser,
        exportData,
        importData,
        on: (type, fn) => listeners[type].push(fn),
        get user() { return meta.user; },
        get status() { return status; },
        get lastSync() { return meta.lastSync; },
        get hasCache() { return meta.rev > 0; },
        get pending() { return Object.keys(meta.dirty).length; },
    };
})();
