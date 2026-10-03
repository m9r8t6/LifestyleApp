'use strict';

// Notifications that reach the phone while the app is closed (Web Push).
// The server looks at the saved data once a minute and sends:
//   - reminders for calendar events (as chosen on the event)
//   - one evening nudge if nothing has been ticked off that day
// Preferences live in the synced key `lifeos_notify`.

const express = require('express');
const webpush = require('web-push');
const { pool } = require('./db');
const auth = require('./auth');
const { encrypt, decrypt, available: canEncrypt } = require('./secretbox');

const SUBJECT = (process.env.LIFESTYLE_PUBLIC_URL || '').startsWith('https://')
    ? process.env.LIFESTYLE_PUBLIC_URL
    : 'https://lifeos.invalid';
const WINDOW_MS = 10 * 60 * 1000;   // a reminder is still sent up to 10 minutes late (e.g. after a restart)
const REMINDER_MS = { '15m': 15 * 60000, '1h': 60 * 60000, '1d': 24 * 60 * 60000 };
const DEFAULT_PREFS = { events: true, nudge: true, nudgeTime: '19:00' };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_secrets (
    name   TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    timezone    TEXT NOT NULL DEFAULT 'Europe/Berlin',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One row per notification that went out, so nothing is sent twice.
CREATE TABLE IF NOT EXISTS push_sent (
    user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag      TEXT NOT NULL,
    sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tag)
);
`;

let vapid = null;

/** The key pair that identifies this server to the push services; created once. */
async function loadVapid() {
    if (!canEncrypt) return null;
    const read = async () => {
        const { rows } = await pool.query("SELECT value FROM app_secrets WHERE name = 'vapid'");
        if (!rows.length) return null;
        try {
            return JSON.parse(decrypt(rows[0].value));
        } catch (err) {
            // The encryption key was changed: the old pair is unreadable. Start over;
            // devices have to turn notifications on again.
            console.warn('[push] stored key pair could not be read, creating a new one');
            await pool.query("DELETE FROM app_secrets WHERE name = 'vapid'");
            await pool.query('DELETE FROM push_subscriptions');
            return null;
        }
    };
    vapid = await read();
    if (!vapid) {
        await pool.query(
            "INSERT INTO app_secrets (name, value) VALUES ('vapid', $1) ON CONFLICT (name) DO NOTHING",
            [encrypt(JSON.stringify(webpush.generateVAPIDKeys()))]
        );
        vapid = await read();   // another instance may have been first
    }
    return vapid;
}

// ── Time helpers (the user's time zone, not the server's) ─

function zoneParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(date);
    const get = (type) => parts.find(p => p.type === type).value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** 'YYYY-MM-DD' + 'HH:MM' on the wall clock of `timeZone` → epoch milliseconds. */
function zonedToUtc(dateStr, timeStr, timeZone) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = timeStr.split(':').map(Number);
    const wanted = Date.UTC(y, m - 1, d, h, min);
    let guess = wanted;
    // Two rounds are enough, also across a daylight-saving change
    for (let i = 0; i < 2; i++) {
        const shown = zoneParts(new Date(guess), timeZone);
        const [sy, sm, sd] = shown.date.split('-').map(Number);
        const [sh, smin] = shown.time.split(':').map(Number);
        guess -= Date.UTC(sy, sm - 1, sd, sh, smin) - wanted;
    }
    return guess;
}

function safeTimeZone(timeZone) {
    try {
        new Intl.DateTimeFormat('en', { timeZone });
        return timeZone;
    } catch (e) {
        return 'Europe/Berlin';
    }
}

// ── Deciding what is due ─────────────────────────────────

const parse = (text, fallback) => {
    try { const value = JSON.parse(text); return value ?? fallback; } catch (e) { return fallback; }
};

/**
 * @param {Object<string,string>} data - the user's saved values (key → JSON text)
 * @returns {Array<{tag:string, title:string, body:string, url:string}>}
 */
function dueNotifications(data, timeZone, now) {
    const prefs = { ...DEFAULT_PREFS, ...parse(data.lifeos_notify, {}) };
    const local = zoneParts(new Date(now), timeZone);
    const due = [];

    if (prefs.events) {
        parse(data.lifeos_calendar_events, []).forEach(ev => {
            const lead = REMINDER_MS[ev && ev.reminder];
            if (!lead || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date || '') || !/^\d{2}:\d{2}$/.test(ev.time || '')) return;
            const start = zonedToUtc(ev.date, ev.time, timeZone);
            const remindAt = start - lead;
            if (now < remindAt || now >= remindAt + WINDOW_MS || now >= start) return;
            const minutes = Math.round((start - now) / 60000);
            const when = minutes >= 20 * 60 ? `tomorrow at ${ev.time}` : minutes >= 90 ? `at ${ev.time}` : `in ${minutes} min (${ev.time})`;
            due.push({
                tag: `event:${ev.id}:${ev.reminder}:${ev.date}T${ev.time}`,
                title: String(ev.title || 'Event').slice(0, 120),
                body: `Starts ${when}`,
                url: '/?open=calendar',
            });
        });
    }

    if (prefs.nudge && /^\d{2}:\d{2}$/.test(prefs.nudgeTime || '')) {
        const nudgeAt = zonedToUtc(local.date, prefs.nudgeTime, timeZone);
        if (now >= nudgeAt && now < nudgeAt + WINDOW_MS) {
            const tickedToday = ['lifeos_meal_completion', 'lifeos_workout_completion', 'lifeos_bodycare_completion'].some(key => {
                const c = parse(data[key], null);
                return c && c.date === local.date && Array.isArray(c.completed) && c.completed.length > 0;
            });
            if (!tickedToday) {
                due.push({
                    tag: `nudge:${local.date}`,
                    title: 'Nothing ticked off yet today',
                    body: 'A few minutes are enough: open your list and start with the quickest item.',
                    url: '/?open=dashboard',
                });
            }
        }
    }
    return due;
}

// ── Sending ──────────────────────────────────────────────

async function deliver(subscription, payload) {
    await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        { vapidDetails: { subject: SUBJECT, publicKey: vapid.publicKey, privateKey: vapid.privateKey }, TTL: 3600 }
    );
}

async function sendToUser(userId, payload, sender = deliver) {
    const { rows } = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);
    let delivered = 0;
    for (const sub of rows) {
        try {
            await sender(sub, payload);
            delivered++;
        } catch (err) {
            // The browser dropped this subscription (app removed, permission withdrawn)
            if (err.statusCode === 404 || err.statusCode === 410) {
                await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
            } else {
                console.error('[push] delivery failed:', err.statusCode || err.message);
            }
        }
    }
    return delivered;
}

/** One pass of the scheduler. `sender` can be replaced in tests. */
async function runOnce(now = Date.now(), sender = deliver) {
    const users = await pool.query(
        `SELECT user_id, (array_agg(timezone ORDER BY id DESC))[1] AS timezone
           FROM push_subscriptions GROUP BY user_id`
    );
    let sent = 0;
    for (const user of users.rows) {
        const kv = await pool.query(
            `SELECT key, value FROM kv
              WHERE user_id = $1 AND NOT deleted AND key = ANY($2::text[])`,
            [user.user_id, ['lifeos_notify', 'lifeos_calendar_events', 'lifeos_meal_completion', 'lifeos_workout_completion', 'lifeos_bodycare_completion']]
        );
        const data = Object.fromEntries(kv.rows.map(r => [r.key, r.value]));
        for (const note of dueNotifications(data, safeTimeZone(user.timezone), now)) {
            // Claim the tag first so a second run (or instance) cannot send it again
            const claim = await pool.query(
                'INSERT INTO push_sent (user_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING tag',
                [user.user_id, note.tag]
            );
            if (!claim.rows.length) continue;
            sent += await sendToUser(user.user_id, note, sender);
        }
    }
    return sent;
}

function startScheduler() {
    if (!vapid) return;
    const tick = () => runOnce().catch(err => console.error('[push] scheduler:', err.message));
    setInterval(tick, 60 * 1000).unref();
    setInterval(() => {
        pool.query("DELETE FROM push_sent WHERE sent_at < now() - interval '14 days'").catch(() => {});
    }, 6 * 60 * 60 * 1000).unref();
}

// ── Routes ───────────────────────────────────────────────

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });

const router = express.Router();
router.use(auth.requireUser);
router.use((req, res, next) => {
    if (!vapid) return res.status(503).json({ error: 'push_not_configured' });
    next();
});

router.get('/key', (req, res) => res.json({ publicKey: vapid.publicKey }));

router.post('/subscribe', wrap(async (req, res) => {
    const sub = req.body?.subscription || {};
    const endpoint = String(sub.endpoint || '');
    const p256dh = String(sub.keys?.p256dh || '');
    const authKey = String(sub.keys?.auth || '');
    if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint) || !p256dh || !authKey || p256dh.length > 200 || authKey.length > 100) {
        throw fail(400, 'invalid_subscription');
    }
    await pool.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, timezone)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE
           SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, timezone = EXCLUDED.timezone`,
        [req.user.id, endpoint, p256dh, authKey, safeTimeZone(String(req.body?.timezone || ''))]
    );
    res.json({ ok: true });
}));

router.post('/unsubscribe', wrap(async (req, res) => {
    await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user.id, String(req.body?.endpoint || '')]);
    res.json({ ok: true });
}));

router.post('/test', wrap(async (req, res) => {
    const delivered = await sendToUser(req.user.id, {
        tag: `test:${Date.now()}`,
        title: 'LifeOS notifications work',
        body: 'This is how reminders will look.',
        url: '/?open=settings',
    });
    if (!delivered) throw fail(400, 'no_device_subscribed');
    res.json({ delivered });
}));

module.exports = {
    router,
    migrate: async () => { await pool.query(SCHEMA); await loadVapid(); },
    startScheduler,
    runOnce,
    dueNotifications,
    zonedToUtc,
};
