'use strict';

const express = require('express');
const { pool, migrate, tx } = require('./db');
const auth = require('./auth');
const google = require('./google');
const mail = require('./mail');
const push = require('./push');
const food = require('./food');

const PORT = Number(process.env.PORT || 3000);
const ALLOW_SIGNUP = process.env.LIFESTYLE_ALLOW_SIGNUP === 'true';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

const KEY_PATTERN = /^lifeos_[a-z0-9_]{1,80}$/i;
// Secrets and device tokens must never be stored, even if an old client sends them.
const BLOCKED_KEYS = new Set([
    'lifeos_deepseek_key',
    'lifeos_hf_token',
    'lifeos_google_access_token',
    'lifeos_google_token_expiry',
]);
const MAX_VALUE_BYTES = 4 * 1024 * 1024;
const MAX_CHANGES = 300;
const HISTORY_PER_KEY = 30;
const HISTORY_MIN_GAP_MIN = 10;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '12mb' }));

// Browsers cannot add this header to a cross-site form post, which blocks CSRF.
app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-requested-with'] !== 'lifeos') {
        return res.status(403).json({ error: 'bad_request_origin' });
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
});

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

app.get('/api/health', wrap(async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
}));

// ── Accounts ─────────────────────────────────────────────

async function signupOpen() {
    if (ALLOW_SIGNUP) return true;
    const { rows } = await pool.query('SELECT 1 FROM users LIMIT 1');
    return rows.length === 0;
}

function readCredentials(body) {
    const username = String(body?.username || '').trim().toLowerCase();
    const password = String(body?.password || '');
    return { username, password };
}

app.get('/api/auth/status', wrap(async (req, res) => {
    const user = await auth.currentUser(req, res);
    res.json({
        user: user ? { username: user.username, admin: user.isAdmin } : null,
        setupRequired: !user && await signupOpen(),
        ai: Boolean(DEEPSEEK_API_KEY),
    });
}));

// Creates the account. Only open while no account exists (or when explicitly enabled).
app.post('/api/auth/setup', wrap(async (req, res) => {
    if (!await signupOpen()) return res.status(403).json({ error: 'signup_closed' });

    const { username, password } = readCredentials(req.body);
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'invalid_username' });
    if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'weak_password' });

    const passHash = await auth.hashPassword(password);
    let userId;
    try {
        const { rows } = await pool.query(
            // Whoever creates the very first account manages the others
            `INSERT INTO users (username, pass_hash, is_admin)
             VALUES ($1, $2, NOT EXISTS (SELECT 1 FROM users)) RETURNING id`,
            [username, passHash]
        );
        userId = rows[0].id;
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'username_taken' });
        throw err;
    }
    await auth.createSession(req, res, userId);
    res.json({ user: { username } });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
    const { username, password } = readCredentials(req.body);
    const throttleKey = auth.throttleKey(req, username);
    if (auth.isThrottled(throttleKey)) return res.status(429).json({ error: 'too_many_attempts' });

    const { rows } = await pool.query('SELECT id, pass_hash FROM users WHERE username = $1', [username]);
    const ok = rows.length > 0 && await auth.verifyPassword(password, rows[0].pass_hash);
    if (!ok) {
        auth.recordFailure(throttleKey);
        return res.status(401).json({ error: 'invalid_credentials' });
    }
    auth.clearFailures(throttleKey);
    await auth.createSession(req, res, rows[0].id);
    res.json({ user: { username } });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
    await auth.destroySession(req, res);
    res.json({ ok: true });
}));

app.post('/api/auth/password', auth.requireUser, wrap(async (req, res) => {
    const current = String(req.body?.current || '');
    const next = String(req.body?.next || '');
    if (next.length < 8 || next.length > 200) return res.status(400).json({ error: 'weak_password' });

    const { rows } = await pool.query('SELECT pass_hash FROM users WHERE id = $1', [req.user.id]);
    if (!await auth.verifyPassword(current, rows[0].pass_hash)) {
        return res.status(401).json({ error: 'invalid_credentials' });
    }
    await pool.query('UPDATE users SET pass_hash = $2 WHERE id = $1', [req.user.id, await auth.hashPassword(next)]);
    // Sign out every device, then sign this one back in.
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [req.user.id]);
    await auth.createSession(req, res, req.user.id);
    res.json({ ok: true });
}));

// ── More people (managed by the first account) ───────────

function requireAdmin(req, res, next) {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'not_allowed' });
    next();
}

app.get('/api/users', auth.requireUser, requireAdmin, wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT id, username, is_admin, created_at FROM users ORDER BY id');
    res.json({ users: rows.map(r => ({ id: String(r.id), username: r.username, admin: r.is_admin, createdAt: r.created_at })) });
}));

// Each person gets their own, separate data. The password is only stored hashed.
app.post('/api/users', auth.requireUser, requireAdmin, wrap(async (req, res) => {
    const { username, password } = readCredentials(req.body);
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'invalid_username' });
    if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'weak_password' });
    try {
        const { rows } = await pool.query(
            'INSERT INTO users (username, pass_hash) VALUES ($1, $2) RETURNING id',
            [username, await auth.hashPassword(password)]
        );
        res.json({ user: { id: String(rows[0].id), username, admin: false } });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'username_taken' });
        throw err;
    }
}));

// Removes the person and everything saved for them.
app.delete('/api/users/:id', auth.requireUser, requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id) || 0;
    if (id === Number(req.user.id)) return res.status(400).json({ error: 'cannot_remove_yourself' });
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1 AND NOT is_admin', [id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
}));

// ── Data sync ────────────────────────────────────────────

function parseChanges(body) {
    const raw = Array.isArray(body?.changes) ? body.changes : [];
    if (raw.length > MAX_CHANGES) throw Object.assign(new Error('too_many_changes'), { status: 413 });

    const changes = [];
    for (const c of raw) {
        const key = String(c?.key || '');
        if (!KEY_PATTERN.test(key)) throw Object.assign(new Error('invalid_key'), { status: 400 });
        if (BLOCKED_KEYS.has(key)) continue;

        const deleted = c.deleted === true;
        if (!deleted && typeof c.value !== 'string') throw Object.assign(new Error('invalid_value'), { status: 400 });
        if (!deleted && Buffer.byteLength(c.value) > MAX_VALUE_BYTES) {
            throw Object.assign(new Error('value_too_large'), { status: 413 });
        }
        changes.push({ key, value: deleted ? null : c.value, deleted, base: Number(c.base) || 0 });
    }
    return changes;
}

async function keepHistory(client, userId, row, force) {
    if (row.deleted || row.value === null) return;
    if (!force) {
        const recent = await client.query(
            `SELECT 1 FROM kv_history
              WHERE user_id = $1 AND key = $2 AND saved_at > now() - make_interval(mins => $3) LIMIT 1`,
            [userId, row.key, HISTORY_MIN_GAP_MIN]
        );
        if (recent.rows.length) return;
    }
    await client.query(
        'INSERT INTO kv_history (user_id, key, value, rev) VALUES ($1, $2, $3, $4)',
        [userId, row.key, row.value, row.rev]
    );
    await client.query(
        `DELETE FROM kv_history WHERE id IN (
            SELECT id FROM kv_history WHERE user_id = $1 AND key = $2 ORDER BY id DESC OFFSET $3)`,
        [userId, row.key, HISTORY_PER_KEY]
    );
}

/**
 * One round trip does both directions: the client sends what it changed and the
 * last revision it has seen, and gets back everything that changed elsewhere.
 * When two devices changed the same key, the latest write wins and the value it
 * replaced is kept in the history.
 */
app.post('/api/sync', auth.requireUser, wrap(async (req, res) => {
    const since = Math.max(0, Number(req.body?.since) || 0);
    const changes = parseChanges(req.body);
    const userId = req.user.id;

    const result = await tx(async (client) => {
        const locked = await client.query('SELECT rev FROM users WHERE id = $1 FOR UPDATE', [userId]);
        let rev = Number(locked.rows[0].rev);
        const newRev = rev + 1;
        const applied = [];

        for (const change of changes) {
            const existing = (await client.query(
                'SELECT key, value, deleted, rev FROM kv WHERE user_id = $1 AND key = $2',
                [userId, change.key]
            )).rows[0];

            if (existing && existing.deleted === change.deleted && existing.value === change.value) {
                applied.push({ key: change.key, rev: Number(existing.rev) });
                continue;
            }
            if (existing) {
                const conflict = Number(existing.rev) > change.base;
                await keepHistory(client, userId, existing, conflict);
            }
            await client.query(
                `INSERT INTO kv (user_id, key, value, deleted, rev, updated_at)
                 VALUES ($1, $2, $3, $4, $5, now())
                 ON CONFLICT (user_id, key)
                 DO UPDATE SET value = EXCLUDED.value, deleted = EXCLUDED.deleted,
                               rev = EXCLUDED.rev, updated_at = now()`,
                [userId, change.key, change.value, change.deleted, newRev]
            );
            applied.push({ key: change.key, rev: newRev });
        }

        if (applied.some(a => a.rev === newRev)) {
            await client.query('UPDATE users SET rev = $2 WHERE id = $1', [userId, newRev]);
            rev = newRev;
        }

        const appliedKeys = applied.map(a => a.key);
        const remote = await client.query(
            `SELECT key, value, deleted, rev FROM kv
              WHERE user_id = $1 AND rev > $2 AND NOT (key = ANY($3::text[]))
              ORDER BY rev`,
            [userId, since, appliedKeys]
        );
        return {
            rev,
            applied,
            changes: remote.rows.map(r => ({ key: r.key, value: r.value, deleted: r.deleted, rev: Number(r.rev) })),
        };
    });

    res.json(result);
}));

app.get('/api/history', auth.requireUser, wrap(async (req, res) => {
    const key = String(req.query.key || '');
    if (!KEY_PATTERN.test(key)) return res.status(400).json({ error: 'invalid_key' });
    const { rows } = await pool.query(
        `SELECT id, saved_at, length(value) AS size FROM kv_history
          WHERE user_id = $1 AND key = $2 ORDER BY id DESC`,
        [req.user.id, key]
    );
    res.json({ versions: rows });
}));

app.post('/api/history/restore', auth.requireUser, wrap(async (req, res) => {
    const id = Number(req.body?.id);
    const restored = await tx(async (client) => {
        const version = (await client.query(
            'SELECT key, value FROM kv_history WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        )).rows[0];
        if (!version) return null;

        const locked = await client.query('SELECT rev FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
        const newRev = Number(locked.rows[0].rev) + 1;
        const existing = (await client.query(
            'SELECT key, value, deleted, rev FROM kv WHERE user_id = $1 AND key = $2',
            [req.user.id, version.key]
        )).rows[0];
        if (existing) await keepHistory(client, req.user.id, existing, true);

        await client.query(
            `INSERT INTO kv (user_id, key, value, deleted, rev, updated_at)
             VALUES ($1, $2, $3, false, $4, now())
             ON CONFLICT (user_id, key)
             DO UPDATE SET value = EXCLUDED.value, deleted = false, rev = EXCLUDED.rev, updated_at = now()`,
            [req.user.id, version.key, version.value, newRev]
        );
        await client.query('UPDATE users SET rev = $2 WHERE id = $1', [req.user.id, newRev]);
        return { key: version.key, rev: newRev };
    });
    if (!restored) return res.status(404).json({ error: 'not_found' });
    res.json(restored);
}));

// ── AI proxy ─────────────────────────────────────────────
// The DeepSeek key stays on the server; the browser never sees it.

const AI_PER_MINUTE = 30;
const aiCalls = new Map();

function aiAllowed(userId) {
    const now = Date.now();
    const recent = (aiCalls.get(userId) || []).filter(t => now - t < 60000);
    if (recent.length >= AI_PER_MINUTE) return false;
    recent.push(now);
    aiCalls.set(userId, recent);
    return true;
}

app.post('/api/ai/chat', auth.requireUser, wrap(async (req, res) => {
    if (!DEEPSEEK_API_KEY) {
        return res.status(503).json({ error: { message: 'AI is not configured on the server.' } });
    }
    if (!aiAllowed(req.user.id)) {
        return res.status(429).json({ error: { message: 'Too many AI requests, try again in a minute.' } });
    }
    const body = req.body || {};
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return res.status(400).json({ error: { message: 'messages required' } });
    }

    const payload = { model: 'deepseek-chat', messages: body.messages };
    if (typeof body.temperature === 'number') payload.temperature = body.temperature;
    if (typeof body.max_tokens === 'number') payload.max_tokens = Math.min(body.max_tokens, 8000);
    if (body.response_format?.type === 'json_object') payload.response_format = { type: 'json_object' };

    try {
        const upstream = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120000),
        });
        const data = await upstream.json();
        res.status(upstream.ok ? 200 : 502).json(data);
    } catch (err) {
        console.error('[ai] upstream failed:', err.message);
        res.status(502).json({ error: { message: 'The AI service did not respond.' } });
    }
}));

app.use('/api/google', google.router);
app.use('/api/mail', mail.router);
app.use('/api/push', push.router);
app.use('/api/food', food.router);

// ── Errors ───────────────────────────────────────────────

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
    // Errors raised on purpose carry a status and a short code that is safe to show
    const expected = Boolean(err.status);
    if (!expected) console.error('[api]', err);
    res.status(status).json({ error: expected || status < 500 ? err.message : 'server_error' });
});

async function start() {
    await migrate();
    await google.migrate();
    await mail.migrate();
    await push.migrate();
    await pool.query('DELETE FROM sessions WHERE expires_at < now()');
    push.startScheduler();
    return app.listen(PORT, () => console.log(`[lifestyle-api] listening on ${PORT}`));
}

if (require.main === module) {
    start().catch(err => {
        console.error('[lifestyle-api] failed to start:', err);
        process.exit(1);
    });
}

module.exports = { app, start };
