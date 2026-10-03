'use strict';

// Extra mailboxes (for example all-inkl). The mailbox password is stored encrypted.
// Reading never changes anything on the mail server. Sending is switched on per
// mailbox by the user, goes out over the provider's SMTP server and puts a copy
// into the mailbox's Sent folder.

const express = require('express');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { pool } = require('./db');
const auth = require('./auth');
const { encrypt, decrypt, available: canEncrypt } = require('./secretbox');

// Test servers use self-signed certificates; real mail servers must present a valid one.
const TLS_INSECURE = process.env.LIFESTYLE_MAIL_TLS_INSECURE === 'true';
const LIST_LIMIT = 40;
const LIST_CACHE_MS = 60 * 1000;
const MAX_BODY_CHARS = 60000;
const SMTP_PORT = Number(process.env.LIFESTYLE_MAIL_SMTP_PORT) || 465;   // SMTP over TLS
const SENDS_PER_HOUR = 30;
const EMAIL_PATTERN = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const HOST_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mail_accounts (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    imap_host   TEXT NOT NULL,
    imap_port   INTEGER NOT NULL DEFAULT 993,
    username    TEXT NOT NULL,
    password    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, email)
);
ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS can_send BOOLEAN NOT NULL DEFAULT false;
`;

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });

function connect(account, password) {
    return new ImapFlow({
        host: account.imap_host,
        port: account.imap_port,
        secure: true,
        auth: { user: account.username, pass: password },
        logger: false,
        tls: TLS_INSECURE ? { rejectUnauthorized: false } : undefined,
        socketTimeout: 30000,
        greetingTimeout: 15000,
    });
}

/** Run `work` with an open, read-only INBOX and always close the connection. */
async function withInbox(account, password, work) {
    const client = connect(account, password);
    // imapflow reports dropped connections through an event; without a listener they would crash the process
    client.on('error', () => {});
    try {
        await client.connect();
    } catch (err) {
        if (err.authenticationFailed) throw fail(400, 'login_failed');
        throw fail(502, 'mail_server_unreachable');
    }
    try {
        const mailbox = await client.mailboxOpen('INBOX', { readOnly: true });
        return await work(client, mailbox);
    } finally {
        client.logout().catch(() => {});
    }
}

const address = (list) => {
    const a = list && list[0];
    if (!a) return '';
    return a.name ? `${a.name} <${a.address || ''}>` : (a.address || '');
};

const header = (headers, name) => {
    const value = headers.get(name);
    if (!value) return '';
    return typeof value === 'string' ? value : (value.text || value.value || JSON.stringify(value));
};

async function listMessages(account, password) {
    return withInbox(account, password, async (client, mailbox) => {
        if (!mailbox.exists) return [];
        const from = Math.max(1, mailbox.exists - LIST_LIMIT + 1);
        const messages = [];
        for await (const msg of client.fetch(`${from}:*`, {
            uid: true, envelope: true, flags: true, internalDate: true,
            source: { start: 0, maxLength: 12000 },
        })) {
            let parsed = null;
            try { parsed = await simpleParser(msg.source, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true }); } catch (e) {}
            const headers = parsed ? parsed.headers : new Map();
            // mailparser gathers all List-* headers under one "list" entry
            const list = headers.get('list') || {};
            messages.push({
                id: String(msg.uid),
                from: address(msg.envelope.from),
                subject: msg.envelope.subject || '(no subject)',
                date: (msg.envelope.date || msg.internalDate || new Date()).toISOString(),
                unread: !msg.flags.has('\\Seen'),
                snippet: parsed && parsed.text ? parsed.text.replace(/\s+/g, ' ').trim().slice(0, 200) : '',
                // What the filter needs to tell newsletters and notifications from real mail
                signals: {
                    listUnsubscribe: Boolean(list.unsubscribe),
                    listId: Boolean(list.id),
                    precedence: header(headers, 'precedence').toLowerCase(),
                    autoSubmitted: header(headers, 'auto-submitted').toLowerCase(),
                },
            });
        }
        return messages.reverse();
    });
}

async function readMessage(account, password, uid) {
    return withInbox(account, password, async (client) => {
        const msg = await client.fetchOne(String(uid), { uid: true, source: { start: 0, maxLength: 3 * 1024 * 1024 } }, { uid: true });
        if (!msg || !msg.source) throw fail(404, 'message_not_found');
        const parsed = await simpleParser(msg.source, { skipTextToHtml: true, skipImageLinks: true });
        return {
            id: String(uid),
            from: parsed.from ? parsed.from.text : '',
            to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map(t => t.text).join(', ') : parsed.to.text) : '',
            subject: parsed.subject || '(no subject)',
            date: (parsed.date || new Date()).toISOString(),
            // Where a reply goes, and what it needs to stay in the same conversation
            replyTo: ((parsed.replyTo || parsed.from || {}).value || [])[0]?.address || '',
            messageId: parsed.messageId || '',
            references: [].concat(parsed.references || []).join(' '),
            // Plain text only: nothing from the mail is ever rendered as HTML
            body: (parsed.text || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_BODY_CHARS),
            attachments: (parsed.attachments || []).map(a => a.filename).filter(Boolean).slice(0, 20),
        };
    });
}

// ── Sending ──────────────────────────────────────────────

const sendLog = new Map();

function sendAllowed(userId) {
    const now = Date.now();
    const recent = (sendLog.get(userId) || []).filter(t => now - t < 3600000);
    if (recent.length >= SENDS_PER_HOUR) return false;
    recent.push(now);
    sendLog.set(userId, recent);
    return true;
}

/** Best effort: file the sent mail where the user's mail program expects it. */
async function saveToSent(account, password, raw) {
    const client = connect(account, password);
    client.on('error', () => {});
    try {
        await client.connect();
        const folders = await client.list();
        const sent = folders.find(f => f.specialUse === '\\Sent')
            || folders.find(f => /^(inbox[./])?(sent|sent items|sent messages|gesendet|gesendete objekte|gesendete elemente)$/i.test(f.path));
        if (!sent) return false;
        await client.append(sent.path, raw, ['\\Seen']);
        return true;
    } catch (err) {
        console.error('[mail] could not save to Sent:', err.message);
        return false;
    } finally {
        client.logout().catch(() => {});
    }
}

async function sendMessage(account, password, mail) {
    const raw = await new MailComposer({
        from: account.email,
        to: mail.to,
        subject: mail.subject,
        text: mail.body,
        inReplyTo: mail.inReplyTo || undefined,
        references: mail.references || undefined,
    }).compile().build();

    const transport = nodemailer.createTransport({
        host: account.imap_host,
        port: SMTP_PORT,
        secure: true,
        auth: { user: account.username, pass: password },
        tls: TLS_INSECURE ? { rejectUnauthorized: false } : undefined,
        connectionTimeout: 20000,
        socketTimeout: 30000,
    });
    try {
        await transport.sendMail({ envelope: { from: account.email, to: [mail.to] }, raw });
    } catch (err) {
        console.error('[mail] send failed:', err.message);
        if (err.code === 'EAUTH') throw fail(400, 'login_failed');
        if (err.responseCode >= 500) throw fail(400, 'mail_rejected');
        throw fail(502, 'mail_server_unreachable');
    }
    return { savedToSent: await saveToSent(account, password, raw) };
}

// ── Routes ───────────────────────────────────────────────

const router = express.Router();
router.use(auth.requireUser);
router.use((req, res, next) => {
    if (!canEncrypt) return res.status(503).json({ error: 'mail_not_configured' });
    next();
});

const listCache = new Map();

async function loadAccount(req) {
    const { rows } = await pool.query(
        'SELECT * FROM mail_accounts WHERE id = $1 AND user_id = $2',
        [Number(req.params.id) || 0, req.user.id]
    );
    if (!rows.length) throw fail(404, 'account_not_found');
    return rows[0];
}

router.get('/accounts', wrap(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT id, email, imap_host, can_send FROM mail_accounts WHERE user_id = $1 ORDER BY id',
        [req.user.id]
    );
    res.json({ accounts: rows.map(r => ({ id: String(r.id), email: r.email, host: r.imap_host, canSend: r.can_send })) });
}));

// Add a mailbox. The login is tried first, so a wrong password is reported right away.
router.post('/accounts', wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const host = String(req.body?.host || '').trim().toLowerCase();
    const username = String(req.body?.username || '').trim() || email;
    const password = String(req.body?.password || '');
    const port = Number(req.body?.port) || 993;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw fail(400, 'invalid_email');
    if (!HOST_PATTERN.test(host)) throw fail(400, 'invalid_host');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw fail(400, 'invalid_port');
    if (!password || password.length > 500 || username.length > 200) throw fail(400, 'invalid_credentials');

    const account = { imap_host: host, imap_port: port, username };
    await withInbox(account, password, async () => true);

    const { rows } = await pool.query(
        `INSERT INTO mail_accounts (user_id, email, imap_host, imap_port, username, password)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, email) DO UPDATE
           SET imap_host = EXCLUDED.imap_host, imap_port = EXCLUDED.imap_port,
               username = EXCLUDED.username, password = EXCLUDED.password
         RETURNING id`,
        [req.user.id, email, host, port, username, encrypt(password)]
    );
    listCache.delete(String(rows[0].id));
    res.json({ account: { id: String(rows[0].id), email, host, canSend: false } });
}));

router.delete('/accounts/:id', wrap(async (req, res) => {
    const account = await loadAccount(req);
    await pool.query('DELETE FROM mail_accounts WHERE id = $1', [account.id]);
    listCache.delete(String(account.id));
    res.json({ ok: true });
}));

router.get('/accounts/:id/messages', wrap(async (req, res) => {
    const account = await loadAccount(req);
    const key = String(account.id);
    const cached = listCache.get(key);
    if (cached && req.query.refresh !== '1' && Date.now() - cached.at < LIST_CACHE_MS) {
        return res.json({ messages: cached.messages });
    }
    const messages = await listMessages(account, decrypt(account.password));
    listCache.set(key, { at: Date.now(), messages });
    res.json({ messages });
}));

router.get('/accounts/:id/messages/:uid', wrap(async (req, res) => {
    const account = await loadAccount(req);
    const uid = Number(req.params.uid);
    if (!Number.isInteger(uid) || uid < 1) throw fail(400, 'invalid_message');
    res.json({ message: await readMessage(account, decrypt(account.password), uid) });
}));

// The user switches sending on (or off) for one mailbox.
router.post('/accounts/:id/sending', wrap(async (req, res) => {
    const account = await loadAccount(req);
    const allow = req.body?.allow === true;
    await pool.query('UPDATE mail_accounts SET can_send = $2 WHERE id = $1', [account.id, allow]);
    res.json({ canSend: allow });
}));

router.post('/accounts/:id/send', wrap(async (req, res) => {
    const account = await loadAccount(req);
    if (!account.can_send) throw fail(403, 'sending_not_allowed');

    const to = String(req.body?.to || '').trim();
    const subject = String(req.body?.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
    const body = String(req.body?.body || '');
    const headerValue = (value) => String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 2000);

    if (!EMAIL_PATTERN.test(to) || to.length > 254) throw fail(400, 'invalid_recipient');
    if (!subject || !body.trim() || body.length > 100000) throw fail(400, 'invalid_message');
    if (!sendAllowed(req.user.id)) throw fail(429, 'too_many_mails');

    const result = await sendMessage(account, decrypt(account.password), {
        to, subject, body,
        inReplyTo: headerValue(req.body?.inReplyTo),
        references: headerValue(req.body?.references),
    });
    res.json({ ok: true, savedToSent: result.savedToSent });
}));

module.exports = { router, migrate: () => pool.query(SCHEMA) };
