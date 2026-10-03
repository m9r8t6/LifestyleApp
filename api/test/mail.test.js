'use strict';

// Mailbox tests against the GreenMail test server from docker-compose.dev.yml.
// Skipped when it is not running.

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

process.env.PORT = '0';
process.env.LIFESTYLE_TOKEN_KEY = process.env.LIFESTYLE_TOKEN_KEY || 'ab'.repeat(32);
process.env.LIFESTYLE_MAIL_TLS_INSECURE = 'true';
process.env.LIFESTYLE_MAIL_SMTP_PORT = '3465';

const nodemailer = require('nodemailer');
const { start } = require('../src/server');
const { pool } = require('../src/db');

const MAILBOX = { email: 'info@ainstein.test', host: 'imap.localhost', port: 3993, username: 'info@ainstein.test', password: 'secret' };

const reachable = (port) => new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 1500 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
});

let base, server, cookie = '';
async function call(method, path, body) {
    const res = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'lifeos', Cookie: cookie },
        body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, body: await res.json() };
}

test('mailboxes: add, list, read, remove', async (t) => {
    if (!await reachable(3993) || !await reachable(3025)) return t.skip('GreenMail is not running');

    server = await start();
    base = `http://127.0.0.1:${server.address().port}`;
    t.after(async () => { server.close(); await pool.end(); });
    await pool.query('TRUNCATE users CASCADE');
    await call('POST', '/api/auth/setup', { username: 'mailtester', password: 'correct horse battery' });

    const smtp = nodemailer.createTransport({ host: '127.0.0.1', port: 3025, secure: false, tls: { rejectUnauthorized: false } });
    await smtp.sendMail({ from: '"Anna Kunde" <anna@kunde.test>', to: MAILBOX.email, subject: 'Angebot für das Projekt', text: 'Hallo Moritz,\nkönnen wir Donnerstag telefonieren?\nViele Grüße\nAnna' });
    await smtp.sendMail({ from: '"Shop News" <news@shop.test>', to: MAILBOX.email, subject: '20% auf alles', text: 'Nur heute!', headers: { 'List-Unsubscribe': '<https://shop.test/unsub>', Precedence: 'bulk' } });
    await smtp.sendMail({ from: 'tracker@evil.test', to: MAILBOX.email, subject: 'Only HTML', html: '<p>Hello <b>there</b></p><script>alert(1)</script><img src="https://evil.test/pixel.gif">' });

    let r = await call('POST', '/api/mail/accounts', { ...MAILBOX, password: 'wrong' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'login_failed');

    r = await call('POST', '/api/mail/accounts', { ...MAILBOX, host: 'not a host' });
    assert.equal(r.body.error, 'invalid_host');

    r = await call('POST', '/api/mail/accounts', MAILBOX);
    assert.equal(r.status, 200);
    const id = r.body.account.id;

    // The password is stored encrypted and never returned
    const stored = (await pool.query('SELECT password FROM mail_accounts')).rows[0].password;
    assert.ok(!stored.includes('secret'));
    r = await call('GET', '/api/mail/accounts');
    assert.deepEqual(r.body.accounts, [{ id, email: MAILBOX.email, host: MAILBOX.host, canSend: false }]);

    r = await call('GET', `/api/mail/accounts/${id}/messages`);
    assert.equal(r.status, 200);
    assert.ok(r.body.messages.length >= 3);   // earlier runs may have left mail behind
    const [html, news, personal] = r.body.messages;   // newest first
    assert.equal(personal.subject, 'Angebot für das Projekt');
    assert.match(personal.from, /Anna Kunde/);
    assert.equal(personal.unread, true);
    assert.match(personal.snippet, /Donnerstag/);
    assert.equal(personal.signals.listUnsubscribe, false);
    assert.equal(news.signals.listUnsubscribe, true);
    assert.equal(news.signals.precedence, 'bulk');

    r = await call('GET', `/api/mail/accounts/${id}/messages/${html.id}`);
    assert.match(r.body.message.body, /Hello/);
    assert.ok(!r.body.message.body.includes('<script>'));

    // Reading must not mark anything as read on the mail server
    r = await call('GET', `/api/mail/accounts/${id}/messages?refresh=1`);
    assert.ok(r.body.messages.every(m => m.unread));

    // Sending is off until the user switches it on for this mailbox
    const reply = { to: 'anna@kunde.test', subject: 'Re: Angebot für das Projekt', body: 'Hallo Anna,\nDonnerstag passt.\nMoritz', inReplyTo: '<abc@kunde.test>' };
    r = await call('POST', `/api/mail/accounts/${id}/send`, reply);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'sending_not_allowed');

    r = await call('POST', `/api/mail/accounts/${id}/sending`, { allow: true });
    assert.equal(r.body.canSend, true);
    r = await call('POST', `/api/mail/accounts/${id}/send`, { ...reply, to: 'not-an-address' });
    assert.equal(r.body.error, 'invalid_recipient');
    r = await call('POST', `/api/mail/accounts/${id}/send`, { ...reply, subject: 'Re: x\r\nBcc: victim@evil.test' });
    assert.equal(r.status, 200);   // header injection is flattened into the subject text

    // Send to our own test mailbox so the delivery can be checked
    r = await call('POST', `/api/mail/accounts/${id}/send`, { ...reply, to: MAILBOX.email });
    assert.equal(r.status, 200);
    r = await call('GET', `/api/mail/accounts/${id}/messages?refresh=1`);
    const delivered = r.body.messages[0];
    assert.equal(delivered.subject, 'Re: Angebot für das Projekt');
    assert.match(delivered.from, /info@ainstein\.test/);
    r = await call('GET', `/api/mail/accounts/${id}/messages/${delivered.id}`);
    assert.match(r.body.message.body, /Donnerstag passt/);
    assert.equal(r.body.message.replyTo, MAILBOX.email);

    // Another user cannot reach this mailbox
    const other = cookie; cookie = '';
    r = await call('GET', `/api/mail/accounts/${id}/messages`);
    assert.equal(r.status, 401);
    cookie = other;

    r = await call('DELETE', `/api/mail/accounts/${id}`);
    assert.equal(r.status, 200);
    r = await call('GET', '/api/mail/accounts');
    assert.deepEqual(r.body.accounts, []);
});
