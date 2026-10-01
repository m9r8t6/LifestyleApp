'use strict';

// Encryption at rest (AES-256-GCM) for secrets the server has to keep:
// the Google refresh token and mailbox passwords.

const crypto = require('crypto');

const KEY = /^[0-9a-f]{64}$/i.test(process.env.LIFESTYLE_TOKEN_KEY || '')
    ? Buffer.from(process.env.LIFESTYLE_TOKEN_KEY, 'hex')
    : null;

function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}

function decrypt(stored) {
    const [iv, tag, data] = stored.split('.').map(part => Buffer.from(part, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt, available: Boolean(KEY) };
