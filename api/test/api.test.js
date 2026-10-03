'use strict';

// Integration tests. Needs a throwaway Postgres:
//   docker run -d --rm -e POSTGRES_PASSWORD=test -e POSTGRES_DB=lifestyle_db -p 127.0.0.1:55432:5432 postgres:15
//   LIFESTYLE_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/lifestyle_db npm test

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PORT = '0';
process.env.LIFESTYLE_GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.LIFESTYLE_GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.LIFESTYLE_PUBLIC_URL = 'https://life.example.test';
process.env.LIFESTYLE_TOKEN_KEY = 'ab'.repeat(32);

// Google's token endpoint is faked; everything else uses the real network stack.
const realFetch = global.fetch;
const googleCalls = [];
global.fetch = async (url, options) => {
    if (!String(url).startsWith('https://oauth2.googleapis.com/')) return realFetch(url, options);
    const params = Object.fromEntries(new URLSearchParams(options.body));
    googleCalls.push({ url: String(url), params });
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (String(url).endsWith('/revoke')) return json(200, {});
    if (params.grant_type === 'authorization_code') {
        return params.code === 'good-code'
            ? json(200, { access_token: 'access-1', refresh_token: 'refresh-secret', expires_in: 3600, scope: 'x' })
            : json(400, { error: 'invalid_grant' });
    }
    return params.refresh_token === 'refresh-secret'
        ? json(200, { access_token: 'access-2', expires_in: 3600 })
        : json(400, { error: 'invalid_grant' });
};
const { start } = require('../src/server');
const { pool } = require('../src/db');

let base;
let server;

function client() {
    let cookie = '';
    const jar = {};
    return async function call(method, path, body, headers = {}) {
        const res = await fetch(base + path, {
            method,
            redirect: 'manual',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'lifeos', Cookie: cookie, ...headers },
            body: body ? JSON.stringify(body) : undefined,
        });
        const setCookie = res.headers.get('set-cookie');
        for (const line of res.headers.getSetCookie()) {
            const [pair] = line.split(';');
            const name = pair.split('=')[0];
            jar[name] = pair.slice(name.length + 1);
        }
        cookie = Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
        const text = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (e) {}
        return { status: res.status, body: parsed, setCookie, location: res.headers.get('location') };
    };
}

test.before(async () => {
    server = await start();
    base = `http://127.0.0.1:${server.address().port}`;
    await pool.query('TRUNCATE users CASCADE');
});

test.after(async () => {
    server.close();
    await pool.end();
});

test('account setup, login and lock-down', async () => {
    const phone = client();

    let r = await phone('GET', '/api/auth/status');
    assert.equal(r.body.setupRequired, true);
    assert.equal(r.body.user, null);

    r = await phone('POST', '/api/sync', { since: 0, changes: [] });
    assert.equal(r.status, 401);

    r = await phone('POST', '/api/auth/setup', { username: 'Tester', password: 'short' });
    assert.equal(r.status, 400);

    r = await phone('POST', '/api/auth/setup', { username: 'Tester', password: 'correct horse battery' });
    assert.equal(r.status, 200);
    assert.match(r.setCookie, /HttpOnly/);
    assert.match(r.setCookie, /SameSite=Lax/);

    // Once an account exists nobody else can create one.
    r = await client()('POST', '/api/auth/setup', { username: 'intruder', password: 'whatever123' });
    assert.equal(r.status, 403);

    r = await client()('POST', '/api/auth/login', { username: 'tester', password: 'wrong password' });
    assert.equal(r.status, 401);

    // Requests without the custom header are rejected (CSRF protection).
    r = await phone('POST', '/api/sync', { since: 0, changes: [] }, { 'X-Requested-With': '' });
    assert.equal(r.status, 403);

    r = await phone('GET', '/api/auth/status');
    assert.equal(r.body.user.username, 'tester');
});

test('two devices stay in sync', async () => {
    const phone = client();
    const laptop = client();
    await phone('POST', '/api/auth/login', { username: 'tester', password: 'correct horse battery' });
    await laptop('POST', '/api/auth/login', { username: 'tester', password: 'correct horse battery' });

    let r = await phone('POST', '/api/sync', {
        since: 0,
        changes: [
            { key: 'lifeos_todos', value: '[{"id":"a"}]', base: 0 },
            { key: 'lifeos_timer_duration', value: '180', base: 0 },
            { key: 'lifeos_deepseek_key', value: 'sk-secret', base: 0 },
        ],
    });
    assert.equal(r.status, 200);
    const phoneRev = r.body.rev;
    assert.deepEqual(r.body.applied.map(a => a.key).sort(), ['lifeos_timer_duration', 'lifeos_todos']);
    assert.deepEqual(r.body.changes, []);

    // The laptop pulls everything, and secrets were never stored.
    r = await laptop('POST', '/api/sync', { since: 0, changes: [] });
    assert.equal(r.body.rev, phoneRev);
    assert.deepEqual(r.body.changes.map(c => c.key).sort(), ['lifeos_timer_duration', 'lifeos_todos']);

    // The laptop edits and deletes; the phone receives both.
    r = await laptop('POST', '/api/sync', {
        since: phoneRev,
        changes: [
            { key: 'lifeos_todos', value: '[{"id":"a"},{"id":"b"}]', base: phoneRev },
            { key: 'lifeos_timer_duration', deleted: true, base: phoneRev },
        ],
    });
    assert.equal(r.body.rev, phoneRev + 1);

    r = await phone('POST', '/api/sync', { since: phoneRev, changes: [] });
    const byKey = Object.fromEntries(r.body.changes.map(c => [c.key, c]));
    assert.equal(byKey.lifeos_todos.value, '[{"id":"a"},{"id":"b"}]');
    assert.equal(byKey.lifeos_timer_duration.deleted, true);

    // Nothing new: nothing comes back and the revision does not move.
    r = await phone('POST', '/api/sync', { since: r.body.rev, changes: [] });
    assert.deepEqual(r.body.changes, []);
    assert.equal(r.body.rev, phoneRev + 1);

    // Re-sending an unchanged value is a no-op.
    r = await phone('POST', '/api/sync', {
        since: r.body.rev,
        changes: [{ key: 'lifeos_todos', value: '[{"id":"a"},{"id":"b"}]', base: phoneRev + 1 }],
    });
    assert.equal(r.body.rev, phoneRev + 1);
});

test('overwritten values can be restored from history', async () => {
    const phone = client();
    await phone('POST', '/api/auth/login', { username: 'tester', password: 'correct horse battery' });

    let r = await phone('POST', '/api/sync', { since: 0, changes: [{ key: 'lifeos_recipes', value: 'v1', base: 0 }] });
    // A stale device (base 0) overwrites it: the replaced value must survive in history.
    r = await phone('POST', '/api/sync', { since: 0, changes: [{ key: 'lifeos_recipes', value: 'v2', base: 0 }] });

    r = await phone('GET', '/api/history?key=lifeos_recipes');
    assert.equal(r.body.versions.length, 1);

    r = await phone('POST', '/api/history/restore', { id: Number(r.body.versions[0].id) });
    assert.equal(r.status, 200);

    r = await phone('POST', '/api/sync', { since: 0, changes: [] });
    assert.equal(r.body.changes.find(c => c.key === 'lifeos_recipes').value, 'v1');
});

test('invalid input is rejected', async () => {
    const phone = client();
    await phone('POST', '/api/auth/login', { username: 'tester', password: 'correct horse battery' });

    let r = await phone('POST', '/api/sync', { since: 0, changes: [{ key: 'other_key', value: 'x' }] });
    assert.equal(r.status, 400);
    r = await phone('POST', '/api/sync', { since: 0, changes: [{ key: 'lifeos_x', value: { not: 'a string' } }] });
    assert.equal(r.status, 400);
    r = await phone('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(r.status, 503); // no key configured in tests
});

test('google connection is held by the server', async () => {
    const phone = client();
    await phone('POST', '/api/auth/login', { username: 'tester', password: 'correct horse battery' });

    let r = await phone('GET', '/api/google/status');
    assert.deepEqual(r.body, { configured: true, connected: false });
    r = await phone('GET', '/api/google/token');
    assert.equal(r.status, 404);

    r = await phone('GET', '/api/google/connect');
    assert.equal(r.status, 302);
    const consent = new URL(r.location);
    assert.equal(consent.hostname, 'accounts.google.com');
    assert.equal(consent.searchParams.get('redirect_uri'), 'https://life.example.test/api/google/callback');
    assert.equal(consent.searchParams.get('access_type'), 'offline');
    const state = consent.searchParams.get('state');

    // A forged state is refused and nothing is stored.
    r = await phone('GET', '/api/google/callback?code=good-code&state=forged');
    assert.equal(r.location, '/?google=failed');

    r = await phone('GET', '/api/google/connect');
    const state2 = new URL(r.location).searchParams.get('state');
    assert.notEqual(state2, state);
    r = await phone('GET', `/api/google/callback?code=good-code&state=${state2}`);
    assert.equal(r.location, '/?google=connected');

    // Stored encrypted, not in plain text.
    const { rows } = await pool.query('SELECT refresh_token FROM google_tokens');
    assert.equal(rows.length, 1);
    assert.ok(!rows[0].refresh_token.includes('refresh-secret'));

    r = await phone('GET', '/api/google/token');
    assert.equal(r.body.access_token, 'access-1');

    // Somebody who is not signed in gets nothing.
    r = await client()('GET', '/api/google/token');
    assert.equal(r.status, 401);

    r = await phone('POST', '/api/google/disconnect', {});
    assert.equal(r.status, 200);
    assert.equal(googleCalls.at(-1).params.token, 'refresh-secret');
    r = await phone('GET', '/api/google/status');
    assert.equal(r.body.connected, false);
});

test('the first account can add and remove other people; their data is separate', async () => {
    const owner = client();
    await owner('POST', '/api/auth/login', { username: 'tester', password: 'correct horse battery' });
    let r = await owner('GET', '/api/auth/status');
    assert.equal(r.body.user.admin, true);

    r = await owner('POST', '/api/users', { username: 'Guest One', password: 'guest password 1' });
    assert.equal(r.body.error, 'invalid_username');
    r = await owner('POST', '/api/users', { username: 'Guest', password: 'short' });
    assert.equal(r.body.error, 'weak_password');
    r = await owner('POST', '/api/users', { username: 'Guest', password: 'guest password 1' });
    assert.equal(r.status, 200);
    const guestId = r.body.user.id;
    r = await owner('POST', '/api/users', { username: 'guest', password: 'guest password 2' });
    assert.equal(r.status, 409);

    const stored = (await pool.query('SELECT pass_hash FROM users WHERE username = $1', ['guest'])).rows[0].pass_hash;
    assert.ok(stored.startsWith('scrypt$') && !stored.includes('guest password'));

    const guest = client();
    r = await guest('POST', '/api/auth/login', { username: 'guest', password: 'guest password 1' });
    assert.equal(r.status, 200);
    r = await guest('GET', '/api/auth/status');
    assert.equal(r.body.user.admin, false);
    // Starts empty: nothing of the owner's data is visible
    r = await guest('POST', '/api/sync', { since: 0, changes: [{ key: 'lifeos_todos', value: '["guest"]', base: 0 }] });
    assert.deepEqual(r.body.changes, []);
    r = await owner('POST', '/api/sync', { since: 0, changes: [] });
    assert.ok(!r.body.changes.some(c => c.value === '["guest"]'));

    // A normal account cannot manage people
    r = await guest('GET', '/api/users');
    assert.equal(r.status, 403);
    r = await guest('POST', '/api/users', { username: 'another', password: 'another password' });
    assert.equal(r.status, 403);

    r = await owner('GET', '/api/users');
    assert.deepEqual(r.body.users.map(u => [u.username, u.admin]), [['tester', true], ['guest', false]]);
    r = await owner('DELETE', `/api/users/${r.body.users[0].id}`);
    assert.equal(r.body.error, 'cannot_remove_yourself');
    r = await owner('DELETE', `/api/users/${guestId}`);
    assert.equal(r.status, 200);
    r = await guest('POST', '/api/sync', { since: 0, changes: [] });
    assert.equal(r.status, 401);
});

test('changing the password signs out other devices; logout ends the session', async () => {
    const phone = client();
    const laptop = client();
    await phone('POST', '/api/auth/login', { username: 'tester', password: 'correct horse battery' });
    await laptop('POST', '/api/auth/login', { username: 'tester', password: 'correct horse battery' });

    let r = await phone('POST', '/api/auth/password', { current: 'nope', next: 'another long password' });
    assert.equal(r.status, 401);
    r = await phone('POST', '/api/auth/password', { current: 'correct horse battery', next: 'another long password' });
    assert.equal(r.status, 200);

    r = await laptop('POST', '/api/sync', { since: 0, changes: [] });
    assert.equal(r.status, 401);
    r = await phone('POST', '/api/sync', { since: 0, changes: [] });
    assert.equal(r.status, 200);

    await phone('POST', '/api/auth/logout');
    r = await phone('POST', '/api/sync', { since: 0, changes: [] });
    assert.equal(r.status, 401);
});
