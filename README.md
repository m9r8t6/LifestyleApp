# LifestyleApp (LifeOS)

LifeOS is a personal lifestyle hub for nutrition, fitness, self-care, to-dos, mail and calendar,
built as a mobile-first web app that can be installed on the phone's home screen.

## How it is built

| Folder    | What it is |
|-----------|------------|
| `web/`    | The app itself: static HTML, CSS and JavaScript, served by nginx. |
| `api/`    | Node.js backend: account, sessions, data sync, AI proxy. Stores data in PostgreSQL. |
| `deploy/` | Compose file and scripts for the home server (`~/ai-backend`). |

### Saving

Every module reads and writes `localStorage` (instant, works offline). `web/js/store.js` watches
those writes and mirrors every `lifeos_*` value to the server within a second, and pulls changes
made on other devices when the app starts, comes back to the foreground, or once a minute.
Offline changes are kept on the device and sent when the connection returns. The dot in the
header shows the state (green: saved, orange: saving, red: offline).

If two devices change the same value, the latest write wins and the replaced value is kept in
the `kv_history` table (the last 30 versions per value).

### Security

- One account, created on first visit; afterwards sign-up is closed (`LIFESTYLE_ALLOW_SIGNUP=true` reopens it).
- Passwords are hashed with scrypt; sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie.
- The DeepSeek API key lives only in the server's `.env`; the browser calls `/api/ai/chat`.
- The database user and password are created by `deploy/server-setup.sh` on the server and never leave it.

## Deploy

```bash
./deploy/deploy.sh
```

Copies `api/` and `web/` to `~/ai-backend/apps/lifestyle-api` and `lifestyle-web`, creates the
`lifestyle_db` database on first run and rebuilds the two containers. The app then runs on port 3110.

### Public address and Google

`lifestyle-tunnel` is the app's own Cloudflare tunnel (`LIFESTYLE_TUNNEL_TOKEN` in the server's `.env`).
In the Cloudflare dashboard the tunnel needs a public hostname with the service `http://lifestyle-web:80`.

With these three values in the server's `.env` the server holds the Google connection (Gmail, Calendar):
the user approves once, the refresh token is stored encrypted (`LIFESTYLE_TOKEN_KEY`) and browsers only
get short-lived access tokens.

```
LIFESTYLE_PUBLIC_URL=https://<your hostname>
LIFESTYLE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
LIFESTYLE_GOOGLE_CLIENT_SECRET=...
```

The Google OAuth client needs `https://<your hostname>/api/google/callback` as an authorised redirect URI.
Without these values Mail and Calendar stay switched off.

### Mailboxes

Besides Gmail, IMAP mailboxes (for example all-inkl) can be added in the Mail screen. The login is
checked, the password is stored encrypted, and the server reads the inbox read-only (nothing is
marked as read, moved or deleted). Mail is sorted into Important / Updates / Filtered: fixed rules
catch social-network senders and obvious advertising, the AI decides the rest, and the result is
remembered per message on the device.

### Notifications

Web Push: the API checks the saved data once a minute and sends event reminders (15 minutes, 1 hour
or 1 day before) and one evening nudge when nothing was ticked off. Each device switches them on in
Settings. The server's key pair is created on first start and stored encrypted in `app_secrets`.

## Local development

```bash
docker compose -f docker-compose.dev.yml up -d --build   # http://localhost:8099
cd api && LIFESTYLE_DATABASE_URL=postgres://postgres:dev@127.0.0.1:55432/lifestyle_db npm test
# the dev stack includes a test mail server: mailbox info@ainstein.test / secret, IMAP host mail.dev.test, port 3993
```

Note: `npm test` empties the tables of the database it points at.
