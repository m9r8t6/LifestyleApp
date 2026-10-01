'use strict';

// Server-held Google connection (Gmail + Calendar).
// The user approves once; the long-lived refresh token is stored encrypted and
// never leaves the server. Signed-in browsers only receive short-lived access tokens.

const crypto = require('crypto');
const express = require('express');
const { pool } = require('./db');
const auth = require('./auth');

const CLIENT_ID = process.env.LIFESTYLE_GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.LIFESTYLE_GOOGLE_CLIENT_SECRET || '';
const PUBLIC_URL = (process.env.LIFESTYLE_PUBLIC_URL || '').replace(/\/+$/, '');
const TOKEN_KEY = /^[0-9a-f]{64}$/i.test(process.env.LIFESTYLE_TOKEN_KEY || '')
    ? Buffer.from(process.env.LIFESTYLE_TOKEN_KEY, 'hex')
    : null;

const SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.modify',
].join(' ');
const STATE_COOKIE = 'lifeos_gstate';
const REDIRECT_URI = `${PUBLIC_URL}/api/google/callback`;

const configured = Boolean(CLIENT_ID && CLIENT_SECRET && PUBLIC_URL && TOKEN_KEY);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS google_tokens (
    user_id        BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    refresh_token  TEXT NOT NULL,
    scope          TEXT,
    connected_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

// ── Encryption at rest (AES-256-GCM) ─────────────────────

function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', TOKEN_KEY, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}

function decrypt(stored) {
    const [iv, tag, data] = stored.split('.').map(part => Buffer.from(part, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', TOKEN_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// ── Google token endpoint ────────────────────────────────

async function tokenRequest(params) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
        signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || `google_${res.status}`);
        err.google = data.error;
        throw err;
    }
    return data;
}

// Access tokens live about an hour; reuse them instead of asking Google every time.
const accessCache = new Map();

async function accessTokenFor(userId) {
    const cached = accessCache.get(userId);
    if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached;

    const { rows } = await pool.query('SELECT refresh_token FROM google_tokens WHERE user_id = $1', [userId]);
    if (!rows.length) return null;

    try {
        const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(rows[0].refresh_token) });
        const entry = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
        accessCache.set(userId, entry);
        return entry;
    } catch (err) {
        // The user withdrew access at Google (or the token expired): forget the connection.
        if (err.google === 'invalid_grant') {
            await pool.query('DELETE FROM google_tokens WHERE user_id = $1', [userId]);
            accessCache.delete(userId);
            return null;
        }
        throw err;
    }
}

// ── Routes ───────────────────────────────────────────────

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const router = express.Router();

function stateCookie(req, res, value) {
    const attrs = [`${STATE_COOKIE}=${value}`, 'Path=/api/google', 'HttpOnly', 'SameSite=Lax', `Max-Age=${value ? 600 : 0}`];
    if (req.secure) attrs.push('Secure');
    res.append('Set-Cookie', attrs.join('; '));
}

router.get('/status', auth.requireUser, wrap(async (req, res) => {
    let connected = false;
    if (configured) {
        const { rows } = await pool.query('SELECT 1 FROM google_tokens WHERE user_id = $1', [req.user.id]);
        connected = rows.length > 0;
    }
    res.json({ configured, connected });
}));

// Step 1: send the browser to Google's consent page.
router.get('/connect', auth.requireUser, (req, res) => {
    if (!configured) return res.status(503).json({ error: 'google_not_configured' });
    const state = crypto.randomBytes(24).toString('base64url');
    stateCookie(req, res, state);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
    }).toString();
    res.redirect(url.toString());
});

// Step 2: Google sends the browser back with a one-time code.
router.get('/callback', auth.requireUser, wrap(async (req, res) => {
    const expected = auth.readCookie(req, STATE_COOKIE);
    stateCookie(req, res, '');
    const state = String(req.query.state || '');
    const stateOk = expected && state.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected));
    if (!configured || !stateOk || !req.query.code) return res.redirect('/?google=failed');

    try {
        const data = await tokenRequest({
            grant_type: 'authorization_code',
            code: String(req.query.code),
            redirect_uri: REDIRECT_URI,
        });
        if (!data.refresh_token) return res.redirect('/?google=failed');
        await pool.query(
            `INSERT INTO google_tokens (user_id, refresh_token, scope) VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE
               SET refresh_token = EXCLUDED.refresh_token, scope = EXCLUDED.scope, connected_at = now()`,
            [req.user.id, encrypt(data.refresh_token), data.scope || SCOPES]
        );
        accessCache.set(req.user.id, { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 });
        res.redirect('/?google=connected');
    } catch (err) {
        console.error('[google] code exchange failed:', err.message);
        res.redirect('/?google=failed');
    }
}));

// A short-lived access token for the signed-in browser to call Gmail / Calendar with.
router.get('/token', auth.requireUser, wrap(async (req, res) => {
    if (!configured) return res.status(503).json({ error: 'google_not_configured' });
    const entry = await accessTokenFor(req.user.id);
    if (!entry) return res.status(404).json({ error: 'google_not_connected' });
    res.json({ access_token: entry.token, expires_in: Math.floor((entry.expiresAt - Date.now()) / 1000) });
}));

router.post('/disconnect', auth.requireUser, wrap(async (req, res) => {
    const { rows } = await pool.query('DELETE FROM google_tokens WHERE user_id = $1 RETURNING refresh_token', [req.user.id]);
    accessCache.delete(req.user.id);
    if (rows.length && configured) {
        // Best effort: also withdraw the grant at Google.
        fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: decrypt(rows[0].refresh_token) }),
            signal: AbortSignal.timeout(10000),
        }).catch(() => {});
    }
    res.json({ ok: true });
}));

module.exports = { router, migrate: () => pool.query(SCHEMA), configured };
