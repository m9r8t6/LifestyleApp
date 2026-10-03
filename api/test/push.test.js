'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PORT = '0';
process.env.LIFESTYLE_TOKEN_KEY = process.env.LIFESTYLE_TOKEN_KEY || 'ab'.repeat(32);

const { start } = require('../src/server');
const { pool } = require('../src/db');
const push = require('../src/push');

const TZ = 'Europe/Berlin';
const at = (date, time) => push.zonedToUtc(date, time, TZ);
const kv = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, JSON.stringify(v)]));

test('wall-clock times are converted in the user\'s time zone, across daylight saving', () => {
    assert.equal(new Date(at('2026-10-01', '19:00')).toISOString(), '2026-10-01T17:00:00.000Z');   // summer time, UTC+2
    assert.equal(new Date(at('2026-12-01', '19:00')).toISOString(), '2026-12-01T18:00:00.000Z');   // winter time, UTC+1
    assert.equal(new Date(at('2026-10-25', '12:00')).toISOString(), '2026-10-25T11:00:00.000Z');   // day of the change
});

test('event reminders fire at the chosen lead time and only then', () => {
    const data = kv({ lifeos_calendar_events: [
        { id: 'a', title: 'Hautarzt', date: '2026-10-02', time: '15:00', reminder: '1h' },
        { id: 'b', title: 'Kein Reminder', date: '2026-10-02', time: '15:00', reminder: 'none' },
        { id: 'c', title: 'Morgen', date: '2026-10-03', time: '09:30', reminder: '1d' },
        { id: 'd', title: 'Gleich', date: '2026-10-02', time: '14:15', reminder: '15m' },
    ] });
    const titles = (time) => push.dueNotifications(data, TZ, at('2026-10-02', time)).map(n => n.title);

    assert.deepEqual(titles('13:59'), []);
    assert.deepEqual(titles('14:00'), ['Hautarzt', 'Gleich']);
    assert.deepEqual(titles('14:09'), ['Hautarzt', 'Gleich']);
    assert.deepEqual(titles('14:11'), []);                 // window is over
    assert.deepEqual(titles('09:30'), ['Morgen']);
    assert.match(push.dueNotifications(data, TZ, at('2026-10-02', '14:00'))[0].body, /in 60 min \(15:00\)/);

    // Switched off in the settings
    const off = { ...data, ...kv({ lifeos_notify: { events: false, nudge: false } }) };
    assert.deepEqual(push.dueNotifications(off, TZ, at('2026-10-02', '14:00')), []);
});

test('the evening nudge only comes when nothing was ticked off that day', () => {
    const nudges = (data, time) => push.dueNotifications(kv(data), TZ, at('2026-10-02', time)).filter(n => n.tag.startsWith('nudge'));

    assert.equal(nudges({}, '18:59').length, 0);
    assert.equal(nudges({}, '19:00').length, 1);
    assert.equal(nudges({}, '19:20').length, 0);
    // Yesterday's ticks do not count
    assert.equal(nudges({ lifeos_meal_completion: { date: '2026-10-01', completed: ['r1'] } }, '19:00').length, 1);
    // One tick today is enough
    assert.equal(nudges({ lifeos_bodycare_completion: { date: '2026-10-02', completed: ['bc_m1'] } }, '19:00').length, 0);
    // Own time
    assert.equal(nudges({ lifeos_notify: { nudgeTime: '21:30' } }, '19:00').length, 0);
    assert.equal(nudges({ lifeos_notify: { nudgeTime: '21:30' } }, '21:31').length, 1);
    assert.equal(nudges({ lifeos_notify: { nudge: false } }, '19:00').length, 0);
});

test('scheduler sends each notification once per device and drops dead subscriptions', async (t) => {
    const server = await start();
    t.after(async () => { server.close(); await pool.end(); });
    const base = `http://127.0.0.1:${server.address().port}`;
    await pool.query('TRUNCATE users CASCADE');

    let cookie = '';
    const call = async (method, path, body) => {
        const res = await fetch(base + path, {
            method,
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'lifeos', Cookie: cookie },
            body: body ? JSON.stringify(body) : undefined,
        });
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: res.status, body: await res.json() };
    };
    await call('POST', '/api/auth/setup', { username: 'pushtester', password: 'correct horse battery' });

    let r = await call('GET', '/api/push/key');
    assert.match(r.body.publicKey, /^[A-Za-z0-9_-]{80,}$/);
    r = await call('POST', '/api/push/test');
    assert.equal(r.body.error, 'no_device_subscribed');
    r = await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://insecure.test/x', keys: { p256dh: 'a', auth: 'b' } } });
    assert.equal(r.body.error, 'invalid_subscription');

    const keys = { p256dh: 'BKey'.padEnd(87, 'x'), auth: 'authsecret' };
    await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.test/phone-0001', keys }, timezone: TZ });
    await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://push.test/gone-00001', keys }, timezone: TZ });
    await call('POST', '/api/sync', { since: 0, changes: [
        { key: 'lifeos_calendar_events', value: JSON.stringify([{ id: 'a', title: 'Hautarzt', date: '2026-10-02', time: '15:00', reminder: '1h' }]), base: 0 },
    ] });

    const delivered = [];
    const sender = async (sub, payload) => {
        if (sub.endpoint.includes('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
        delivered.push({ endpoint: sub.endpoint, title: payload.title });
    };
    assert.equal(await push.runOnce(at('2026-10-02', '14:00'), sender), 1);
    assert.equal(await push.runOnce(at('2026-10-02', '14:01'), sender), 0);   // not twice
    assert.deepEqual(delivered, [{ endpoint: 'https://push.test/phone-0001', title: 'Hautarzt' }]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM push_subscriptions')).rows[0].n, 1);

    // 19:00 with nothing ticked: the nudge goes out
    assert.equal(await push.runOnce(at('2026-10-02', '19:00'), sender), 1);
    assert.equal(delivered[1].title, 'Nothing ticked off yet today');
});
