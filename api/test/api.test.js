'use strict';

// Integration tests. Needs a throwaway Postgres:
//   docker run -d --rm -e POSTGRES_PASSWORD=test -e POSTGRES_DB=lifestyle_db -p 127.0.0.1:55432:5432 postgres:15
//   LIFESTYLE_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/lifestyle_db npm test

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PORT = '0';
const { start } = require('../src/server');
const { pool } = require('../src/db');

let base;
let server;

function client() {
    let cookie = '';
    return async function call(method, path, body, headers = {}) {
        const res = await fetch(base + path, {
            method,
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'lifeos', Cookie: cookie, ...headers },
            body: body ? JSON.stringify(body) : undefined,
        });
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: res.status, body: await res.json(), setCookie };
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
