'use strict';

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.LIFESTYLE_DATABASE_URL || process.env.DATABASE_URL,
    max: 5,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,
    pass_hash   TEXT NOT NULL,
    rev         BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The first account manages the others.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
UPDATE users SET is_admin = true
 WHERE id = (SELECT min(id) FROM users) AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

-- One row per saved key. Deletions stay as tombstones so other devices learn about them.
CREATE TABLE IF NOT EXISTS kv (
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    value       TEXT,
    deleted     BOOLEAN NOT NULL DEFAULT false,
    rev         BIGINT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS kv_user_rev_idx ON kv(user_id, rev);

-- Earlier versions of each key, so an overwritten value can be brought back.
CREATE TABLE IF NOT EXISTS kv_history (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    value       TEXT,
    rev         BIGINT NOT NULL,
    saved_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kv_history_key_idx ON kv_history(user_id, key, id DESC);
`;

async function migrate() {
    // The database container may still be starting when the API boots.
    for (let attempt = 1; ; attempt++) {
        try {
            await pool.query(SCHEMA);
            return;
        } catch (err) {
            if (attempt >= 15) throw err;
            console.warn(`[db] not ready (${err.code || err.message}), retrying…`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function tx(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { pool, migrate, tx };
