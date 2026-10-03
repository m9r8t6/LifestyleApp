'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const { pool } = require('./db');

const scrypt = promisify(crypto.scrypt);

const COOKIE_NAME = 'lifeos_session';
const SESSION_DAYS = 90;
const SCRYPT_N = 16384;
const KEY_LEN = 64;

// ── Passwords ────────────────────────────────────────────

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, KEY_LEN, { N: SCRYPT_N });
    return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
    const [scheme, n, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n) });
    return crypto.timingSafeEqual(actual, expected);
}

// ── Sessions ─────────────────────────────────────────────

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function readCookie(req, name) {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx > -1 && part.slice(0, idx).trim() === name) {
            return decodeURIComponent(part.slice(idx + 1).trim());
        }
    }
    return null;
}

function setSessionCookie(req, res, token) {
    const attrs = [
        `${COOKIE_NAME}=${token}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`,
    ];
    // The app is reachable over plain HTTP on the LAN and over HTTPS through the tunnel.
    if (req.secure) attrs.push('Secure');
    res.append('Set-Cookie', attrs.join('; '));
}

async function createSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query(
        `INSERT INTO sessions (token_hash, user_id, user_agent, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
        [hashToken(token), userId, String(req.headers['user-agent'] || '').slice(0, 300), SESSION_DAYS]
    );
    setSessionCookie(req, res, token);
}

async function destroySession(req, res) {
    const token = readCookie(req, COOKIE_NAME);
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    setSessionCookie(req, res, '');
}

/** Resolves the logged-in user for a request, or null. Keeps active sessions alive. */
async function currentUser(req, res) {
    const token = readCookie(req, COOKIE_NAME);
    if (!token) return null;
    const { rows } = await pool.query(
        `SELECT u.id, u.username, u.is_admin, s.last_seen
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [hashToken(token)]
    );
    if (!rows.length) return null;

    if (Date.now() - new Date(rows[0].last_seen).getTime() > 86400000) {
        await pool.query(
            `UPDATE sessions SET last_seen = now(), expires_at = now() + make_interval(days => $2)
              WHERE token_hash = $1`,
            [hashToken(token), SESSION_DAYS]
        );
        setSessionCookie(req, res, token);
    }
    return { id: rows[0].id, username: rows[0].username, isAdmin: rows[0].is_admin };
}

function requireUser(req, res, next) {
    currentUser(req, res).then(user => {
        if (!user) return res.status(401).json({ error: 'not_authenticated' });
        req.user = user;
        next();
    }).catch(next);
}

// ── Login throttling ─────────────────────────────────────

const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

function throttleKey(req, username) {
    return `${req.ip}|${username}`;
}

function isThrottled(key) {
    const entry = failures.get(key);
    if (!entry) return false;
    if (Date.now() - entry.first > WINDOW_MS) {
        failures.delete(key);
        return false;
    }
    return entry.count >= MAX_FAILURES;
}

function recordFailure(key) {
    const entry = failures.get(key);
    if (!entry || Date.now() - entry.first > WINDOW_MS) {
        failures.set(key, { first: Date.now(), count: 1 });
    } else {
        entry.count++;
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of failures) {
        if (now - entry.first > WINDOW_MS) failures.delete(key);
    }
}, WINDOW_MS).unref();

module.exports = {
    hashPassword,
    verifyPassword,
    createSession,
    destroySession,
    currentUser,
    requireUser,
    readCookie,
    throttleKey,
    isThrottled,
    recordFailure,
    clearFailures: (key) => failures.delete(key),
};
