/* =========================================================
 *  LifeOS — Mail  (mail.js)
 *  One inbox view for several mailboxes: Gmail (through the
 *  server-held Google connection) and IMAP mailboxes such as
 *  all-inkl (read by the server). Every message is sorted into
 *  Important / Updates / Filtered so that advertising and
 *  social-network notices stay out of the way.
 *  Reading never changes anything on the mail server. Replies can
 *  be sent once the user allows it for a mailbox; every send waits
 *  ten seconds so it can be taken back.
 * ========================================================= */

(function() {
    'use strict';

    const ACTIVE_KEY = 'lifeos_mail_account';
    const CLASS_CACHE_KEY = 'lifeos_mail_classes';   // stays on this device
    const CLASS_CACHE_MAX = 600;
    const GMAIL_LIMIT = 30;
    const GMAIL_SEND_KEY = 'lifeos_mail_gmail_send';   // 'yes' once the user allowed sending from Gmail
    const UNDO_SECONDS = 10;

    const TABS = [
        { key: 'important', label: 'Important' },
        { key: 'update', label: 'Updates' },
        { key: 'filtered', label: 'Filtered' },
    ];

    // Notification senders of social networks: never important
    const SOCIAL_DOMAINS = ['instagram.com', 'facebookmail.com', 'facebook.com', 'linkedin.com', 'twitter.com', 'x.com',
        'tiktok.com', 'pinterest.com', 'xing.com', 'youtube.com', 'snapchat.com', 'reddit.com', 'redditmail.com',
        'discord.com', 'twitch.tv', 'medium.com', 'quora.com', 'threads.net', 'nextdoor.com', 'nextdoor.de', 'tumblr.com'];
    const PROMO_LOCAL_PARTS = /^(newsletter|news|marketing|promo|promotion|promotions|deals|offers|angebote|werbung|mailing|campaign)s?([._+-]|$)/i;

    // Everything in an email comes from strangers: always escape before showing it
    const esc = (text) => window.App.esc(text);

    let imapAccounts = [];        // [{ id, email, host }]
    let activeId = null;
    let activeTab = 'important';
    let accountsLoaded = false;
    const boxes = {};             // per mailbox: { messages, loading, error, loadedAt, summary }

    // ── Accounts ─────────────────────────────────────────

    const gmailAvailable = () => Boolean(window.GoogleModule && window.GoogleModule.configured);
    const gmailReady = () => Boolean(window.GoogleModule && window.GoogleModule.isReady);

    function accounts() {
        const list = imapAccounts.map(a => ({ id: a.id, label: a.email, type: 'imap', canSend: a.canSend }));
        if (gmailAvailable()) list.unshift({ id: 'gmail', label: 'Gmail', type: 'gmail', canSend: localStorage.getItem(GMAIL_SEND_KEY) === 'yes' });
        return list;
    }

    function box(id) {
        if (!boxes[id]) boxes[id] = { messages: null, loading: false, error: '', loadedAt: 0, summary: '' };
        return boxes[id];
    }

    async function loadAccounts() {
        try {
            const data = await window.Store.api('/api/mail/accounts');
            imapAccounts = data.accounts || [];
        } catch (err) {
            imapAccounts = [];
        }
        accountsLoaded = true;
        const all = accounts();
        const stored = localStorage.getItem(ACTIVE_KEY);
        activeId = all.some(a => a.id === stored) ? stored : (all[0] ? all[0].id : null);
    }

    function init() {
        // Accounts are loaded when the Mail screen is opened for the first time
    }

    // ── Sender helpers ───────────────────────────────────

    function splitSender(from) {
        const match = /^\s*"?([^"<]*)"?\s*<([^>]+)>/.exec(from || '');
        const email = (match ? match[2] : (from || '')).trim().toLowerCase();
        const name = (match && match[1].trim()) || email.split('@')[0] || 'Unknown';
        return { name, email, domain: email.split('@')[1] || '' };
    }

    const domainMatches = (domain, list) => list.some(d => domain === d || domain.endsWith('.' + d));

    function formatWhen(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return '';
        const lang = window.i18n && window.i18n.getLang() === 'de' ? 'de-DE' : 'en-GB';
        const sameDay = d.toDateString() === new Date().toDateString();
        return sameDay
            ? d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
    }

    // ── Sorting mail into categories ─────────────────────

    function loadClassCache() {
        try { return JSON.parse(localStorage.getItem(CLASS_CACHE_KEY)) || {}; } catch (e) { return {}; }
    }

    function saveClassCache(cache) {
        const keys = Object.keys(cache);
        if (keys.length > CLASS_CACHE_MAX) keys.slice(0, keys.length - CLASS_CACHE_MAX).forEach(k => delete cache[k]);
        try { localStorage.setItem(CLASS_CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
    }

    /** Rules that are certain enough to decide without the AI. Returns a category or null. */
    function ruleCategory(msg) {
        const sender = splitSender(msg.from);
        const labels = msg.signals.gmailLabels || [];
        if (domainMatches(sender.domain, SOCIAL_DOMAINS) || labels.includes('CATEGORY_SOCIAL')) return 'social';
        if (labels.includes('CATEGORY_PROMOTIONS') || labels.includes('CATEGORY_FORUMS')) return 'promo';
        if (PROMO_LOCAL_PARTS.test(sender.email.split('@')[0])) return 'promo';
        return null;
    }

    const looksBulk = (msg) => msg.signals.listUnsubscribe || msg.signals.listId
        || ['bulk', 'list', 'junk'].includes(msg.signals.precedence);

    /** Used when the AI cannot be reached. */
    function fallbackCategory(msg) {
        if (looksBulk(msg)) return 'promo';
        if (/no-?reply|do-?not-?reply|notification|mailer-daemon/i.test(splitSender(msg.from).email)) return 'update';
        return 'important';
    }

    async function classify(accountId, messages) {
        const cache = loadClassCache();
        const undecided = [];
        messages.forEach(msg => {
            const key = `${accountId}:${msg.id}`;
            msg.category = ruleCategory(msg) || cache[key] || null;
            if (!msg.category) undecided.push(msg);
        });
        if (undecided.length === 0) return;

        try {
            const list = undecided.map((m, i) => {
                const sender = splitSender(m.from);
                return `${i + 1} | from: ${sender.name} <${sender.email}> | bulk-mail headers: ${looksBulk(m) ? 'yes' : 'no'} | subject: ${m.subject} | preview: ${m.snippet.slice(0, 140)}`;
            }).join('\n');
            const answer = await window.App.ai([
                {
                    role: 'system',
                    content: `You sort a person's inbox. Assign every email exactly one category:
- "important": written by a real person to this recipient, or something the recipient must act on or would be upset to miss: customers, colleagues, friends, invoices and payment problems, contracts, appointments, deadlines, authorities, job-related mail, replies in an ongoing conversation.
- "update": automatic but useful: order and shipping confirmations, receipts, bookings, security alerts, password resets, account or service notices.
- "promo": advertising, newsletters, sales, product news, surveys, digests, invitations to webinars, cold sales outreach.
- "social": notifications from social networks or communities (likes, follows, messages on a platform, connection requests).
"bulk-mail headers: yes" means the mail was sent through a mailing system; that is usually promo or update, and only important if it clearly demands action from the recipient (e.g. an unpaid invoice).
When unsure between important and update, choose important. When unsure between update and promo, choose promo.
Answer ONLY with JSON: {"categories": [{"n": 1, "category": "important"}, ...]} with one entry per email.`
                },
                { role: 'user', content: list }
            ], { temperature: 0, json: true });
            const result = window.App.parseAIJson(answer);
            (result.categories || []).forEach(entry => {
                const msg = undecided[Number(entry.n) - 1];
                const category = String(entry.category || '').toLowerCase();
                if (msg && ['important', 'update', 'promo', 'social'].includes(category)) msg.category = category;
            });
        } catch (err) {
            console.error('Mail sorting failed, using simple rules:', err);
        }

        undecided.forEach(msg => {
            if (msg.category) cache[`${accountId}:${msg.id}`] = msg.category;
            else msg.category = fallbackCategory(msg);   // not cached, so the AI is asked again next time
        });
        saveClassCache(cache);
    }

    const tabOf = (msg) => (msg.category === 'promo' || msg.category === 'social') ? 'filtered' : msg.category;

    // ── Loading mail ─────────────────────────────────────

    function decodeBase64Url(base64UrlStr) {
        if (!base64UrlStr) return '';
        let base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        try {
            return new TextDecoder().decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
        } catch (e) {
            return '';
        }
    }

    function extractBody(payload) {
        if (!payload) return '';
        if (payload.mimeType === 'text/plain') return decodeBase64Url(payload.body && payload.body.data);
        if (payload.mimeType === 'text/html') {
            // Parse in a detached document so nothing in the mail can run or load
            const doc = new DOMParser().parseFromString(decodeBase64Url(payload.body && payload.body.data), 'text/html');
            doc.querySelectorAll('script, style, head').forEach(el => el.remove());
            return (doc.body ? doc.body.textContent : '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        }
        if (payload.parts && payload.parts.length > 0) {
            const plain = payload.parts.find(p => p.mimeType === 'text/plain');
            if (plain) return extractBody(plain);
            const html = payload.parts.find(p => p.mimeType === 'text/html');
            if (html) return extractBody(html);
            return extractBody(payload.parts[0]);
        }
        return '';
    }

    async function fetchGmail() {
        const token = window.GoogleModule.getAccessToken();
        const headers = { Authorization: `Bearer ${token}` };
        const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${GMAIL_LIMIT}&q=in:inbox`, { headers });
        if (!listRes.ok) throw new Error('Gmail could not be loaded. Please reconnect Google in Settings.');
        const listData = await listRes.json();
        const details = await Promise.all((listData.messages || []).map(m =>
            fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers }).then(r => r.json())
        ));
        return details.filter(d => d && d.payload).map(d => {
            const h = (name) => (d.payload.headers.find(x => x.name.toLowerCase() === name) || {}).value || '';
            const date = new Date(h('date'));
            return {
                id: d.id,
                from: h('from') || 'Unknown sender',
                subject: h('subject') || '(no subject)',
                date: isNaN(date) ? new Date(Number(d.internalDate) || Date.now()).toISOString() : date.toISOString(),
                unread: (d.labelIds || []).includes('UNREAD'),
                snippet: d.snippet || '',
                body: extractBody(d.payload),
                threadId: d.threadId,
                replyTo: splitSender(h('reply-to') || h('from')).email,
                messageId: h('message-id'),
                references: h('references'),
                signals: {
                    listUnsubscribe: Boolean(h('list-unsubscribe')),
                    listId: Boolean(h('list-id')),
                    precedence: h('precedence').toLowerCase(),
                    autoSubmitted: h('auto-submitted').toLowerCase(),
                    gmailLabels: d.labelIds || [],
                },
            };
        });
    }

    async function fetchImap(accountId, refresh) {
        const data = await window.Store.api(`/api/mail/accounts/${accountId}/messages${refresh ? '?refresh=1' : ''}`, { timeout: 60000 });
        return data.messages || [];
    }

    const ERROR_TEXT = {
        login_failed: 'The mail server refused the login. Check the login name and password.',
        mail_server_unreachable: 'The mail server could not be reached.',
        mail_not_configured: 'Mailboxes are not set up on the server yet.',
        invalid_host: 'That does not look like a mail server name.',
        invalid_email: 'Please enter a valid email address.',
        invalid_credentials: 'Please enter the login name and password.',
        sending_not_allowed: 'Sending is not switched on for this mailbox.',
        invalid_recipient: 'The recipient address is not valid.',
        invalid_message: 'The reply needs a subject and some text.',
        mail_rejected: 'The mail server did not accept the message.',
        too_many_mails: 'Too many mails in a short time. Please wait a little.',
    };
    const errorText = (err) => ERROR_TEXT[err.message] || err.message || 'Something went wrong.';

    async function loadMessages(refresh) {
        const id = activeId;
        if (!id) return;
        const state = box(id);
        if (state.loading) return;
        if (id === 'gmail' && !gmailReady()) return;

        state.loading = true;
        state.error = '';
        renderSection();
        try {
            const messages = id === 'gmail' ? await fetchGmail() : await fetchImap(id, refresh);
            await classify(id, messages);
            // A refresh must not throw away a reply that is being written
            const previous = new Map((state.messages || []).map(m => [m.id, m]));
            messages.forEach(m => {
                const old = previous.get(m.id);
                if (!old) return;
                ['aiDraft', 'draftTo', 'aiSummary', 'answered'].forEach(key => { if (old[key] !== undefined) m[key] = old[key]; });
            });
            state.messages = messages;
            state.loadedAt = Date.now();
            state.summary = '';
        } catch (err) {
            console.error('Mail load failed:', err);
            state.error = errorText(err);
        } finally {
            state.loading = false;
            renderSection();
        }
    }

    // Called by the Google module once Gmail becomes available
    function fetchEmails() {
        if (activeId === 'gmail' && document.body.dataset.section === 'mail') loadMessages(true);
    }

    function switchAccount(id) {
        activeId = id;
        localStorage.setItem(ACTIVE_KEY, id);
        activeTab = 'important';
        renderSection();
        const state = box(id);
        if (!state.messages && !state.loading) loadMessages(false);
    }

    function setTab(tab) {
        activeTab = tab;
        renderSection();
    }

    // ── Rendering: inbox ─────────────────────────────────

    function rowHtml(msg) {
        const sender = splitSender(msg.from);
        return `
            <button type="button" class="mail-row ${msg.unread ? 'unread' : ''}" onclick="MailModule.openMessage('${esc(msg.id)}')">
                <span class="mail-avatar" aria-hidden="true">${esc((sender.name[0] || '?').toUpperCase())}</span>
                <span class="mail-main">
                    <span class="mail-top">
                        <span class="mail-sender">${esc(sender.name)}</span>
                        <span class="mail-time">${esc(formatWhen(msg.date))}</span>
                    </span>
                    <span class="mail-subject">${msg.answered ? '<span class="mail-answered">answered</span> ' : ''}${esc(msg.subject)}</span>
                    <span class="mail-snippet">${esc(msg.snippet)}</span>
                </span>
            </button>
        `;
    }

    function renderSection() {
        const container = document.getElementById('mail-container');
        if (!container) return;

        if (!accountsLoaded) {
            container.innerHTML = `<div class="empty-state"><div class="empty-state-text">Loading…</div></div>`;
            loadAccounts().then(() => {
                renderSection();
                if (activeId && !box(activeId).messages) loadMessages(false);
            });
            return;
        }

        const all = accounts();
        const switcher = `
            <div class="mail-accounts">
                ${all.map(a => `<button type="button" class="tab-pill ${a.id === activeId ? 'active' : ''}" onclick="MailModule.switchAccount('${esc(a.id)}')">${esc(a.label)}</button>`).join('')}
                <button type="button" class="tab-pill mail-add" onclick="MailModule.showAccounts()" aria-label="Manage mailboxes">${all.length ? 'Manage' : '+ Add mailbox'}</button>
            </div>
        `;

        if (!activeId) {
            container.innerHTML = switcher + `
                <div class="glass-card" style="text-align:center; padding:28px 16px;">
                    <h3 style="margin-bottom:8px;">No mailbox yet</h3>
                    <p class="form-hint" style="margin-bottom:20px;">Add a mailbox (for example from all-inkl) to read it here, sorted and without advertising.</p>
                    <button class="btn btn-primary" onclick="MailModule.showAddAccount()">Add mailbox</button>
                </div>`;
            return;
        }

        const state = box(activeId);
        let body = '';

        if (activeId === 'gmail' && !gmailReady()) {
            body = `
                <div class="glass-card" style="text-align:center; padding:28px 16px;">
                    <h3 style="margin-bottom:8px;">Connect Gmail</h3>
                    <p class="form-hint" style="margin-bottom:20px;">Approve access once; the server keeps the connection.</p>
                    <button class="btn btn-primary" onclick="window.GoogleModule.authGoogle()">Connect Google</button>
                </div>`;
        } else if (state.loading && !state.messages) {
            body = `<div class="empty-state"><div class="app-loading-spinner" style="margin:0 auto 14px;"></div><div class="empty-state-text">Loading and sorting your mail…</div></div>`;
        } else if (state.error && !state.messages) {
            body = `<div class="glass-card-sm supplement-box"><p style="font-size:0.9rem;">${esc(state.error)}</p><button class="btn btn-sm btn-ghost" style="margin-top:10px;" onclick="MailModule.refresh()">Try again</button></div>`;
        } else if (state.messages) {
            const counts = {};
            TABS.forEach(t => { counts[t.key] = { total: 0, unread: 0 }; });
            state.messages.forEach(m => { const c = counts[tabOf(m)]; c.total++; if (m.unread) c.unread++; });
            const visible = state.messages.filter(m => tabOf(m) === activeTab);
            const unreadVisible = visible.filter(m => m.unread).length;

            body = `
                <div class="mail-tabs">
                    ${TABS.map(t => `
                        <button type="button" class="mail-tab ${t.key === activeTab ? 'active' : ''}" onclick="MailModule.setTab('${t.key}')">
                            ${t.label}${t.key === 'filtered'
                                ? `<span class="mail-count muted">${counts[t.key].total}</span>`
                                : (counts[t.key].unread ? `<span class="mail-count">${counts[t.key].unread}</span>` : '')}
                        </button>`).join('')}
                </div>
                ${state.error ? `<p class="form-hint" style="color:var(--error); margin-bottom:8px;">${esc(state.error)}</p>` : ''}
                ${activeTab === 'filtered' ? `<p class="form-hint" style="margin:0 2px 10px;">Advertising, newsletters and social-network notices. Nothing is deleted; it is only kept out of your way.</p>` : ''}
                ${activeTab !== 'filtered' && unreadVisible > 1 ? `<button class="btn btn-sm btn-ai" style="margin-bottom:10px;" id="btn-mail-summary" onclick="MailModule.summarizeUnread()">Summarise ${unreadVisible} unread</button>` : ''}
                ${state.summary && activeTab !== 'filtered' ? `<div class="glass-card-sm mail-summary"><h4 class="detail-heading">Unread in short</h4><div class="detail-text">${esc(state.summary)}</div></div>` : ''}
                ${visible.length
                    ? `<div class="mail-list">${visible.map(rowHtml).join('')}</div>`
                    : `<div class="empty-state"><div class="empty-state-text">${activeTab === 'important' ? 'Nothing important waiting.' : 'Nothing here.'}</div></div>`}
            `;
        }

        container.innerHTML = `
            <div class="card-header-row" style="margin-bottom:10px;">
                <h2 style="margin:0;">Inbox</h2>
                <button class="btn btn-ghost btn-sm" onclick="MailModule.refresh()" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Loading…' : 'Refresh'}</button>
            </div>
            ${switcher}
            ${body}
        `;
    }

    function refresh() {
        loadMessages(true);
    }

    // ── Reading one message ──────────────────────────────

    function findMessage(id) {
        const state = box(activeId);
        return (state.messages || []).find(m => m.id === id);
    }

    function readerHtml(msg) {
        const sender = splitSender(msg.from);
        return `
            <div class="mail-reader-head">
                <span class="mail-avatar" aria-hidden="true">${esc((sender.name[0] || '?').toUpperCase())}</span>
                <div style="min-width:0;">
                    <div class="mail-sender">${esc(sender.name)}</div>
                    <div class="form-hint" style="margin:0; overflow-wrap:anywhere;">${esc(sender.email)} · ${esc(new Date(msg.date).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div>
                </div>
            </div>
            <div class="mail-actions">
                <button class="btn btn-sm btn-ai" id="btn-mail-sum">Summarise</button>
                <button class="btn btn-sm btn-ai" id="btn-mail-reply">Draft a reply</button>
                <button class="btn btn-sm btn-ghost" id="btn-mail-write">Write reply</button>
            </div>
            <div id="mail-ai-out"></div>
            <div class="mail-body" id="mail-body">${msg.body === undefined ? '<span class="form-hint">Loading message…</span>' : esc(msg.body || '(This message has no text.)')}</div>
            ${msg.attachments && msg.attachments.length ? `<p class="form-hint" style="margin-top:12px;">Attachments (open them in your mail program): ${msg.attachments.map(esc).join(', ')}</p>` : ''}
        `;
    }

    function renderAiOut(msg) {
        const out = document.getElementById('mail-ai-out');
        if (!out) return;
        out.innerHTML = `
            ${msg.aiSummary ? `<div class="glass-card-sm mail-summary"><h4 class="detail-heading">Summary</h4><div class="detail-text">${esc(msg.aiSummary)}</div></div>` : ''}
            ${msg.aiDraft !== undefined ? `
                <div class="glass-card-sm mail-summary mail-compose">
                    <h4 class="detail-heading">Your reply</h4>
                    <label class="form-label" for="mail-draft-to">To</label>
                    <input type="email" id="mail-draft-to" class="form-input" autocapitalize="none" spellcheck="false" value="${esc(msg.draftTo !== undefined ? msg.draftTo : (msg.replyTo || splitSender(msg.from).email))}">
                    <textarea class="form-input" id="mail-draft" style="min-height:160px; margin-top:8px;" placeholder="Write your reply…">${esc(msg.aiDraft)}</textarea>
                    <div class="mail-rewrite">
                        <input type="text" id="mail-draft-inst" class="form-input" placeholder="Let the AI change it: 'say yes, but next week'">
                        <button class="btn btn-sm btn-ai" id="btn-mail-redraft">Rewrite</button>
                    </div>
                    <div class="mail-send-row">
                        <button class="btn btn-sm btn-ghost" id="btn-mail-copy">Copy</button>
                        <button class="btn btn-primary" id="btn-mail-send">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            Send
                        </button>
                    </div>
                </div>` : ''}
        `;
        const keepDraft = () => {
            const area = document.getElementById('mail-draft');
            if (area) { msg.aiDraft = area.value; msg.draftTo = document.getElementById('mail-draft-to').value.trim(); }
        };
        document.getElementById('mail-draft')?.addEventListener('input', keepDraft);
        document.getElementById('mail-draft-to')?.addEventListener('input', keepDraft);
        document.getElementById('btn-mail-redraft')?.addEventListener('click', () => { keepDraft(); draftReply(msg); });
        document.getElementById('btn-mail-send')?.addEventListener('click', () => { keepDraft(); startSend(msg); });
        document.getElementById('btn-mail-copy')?.addEventListener('click', async () => {
            const area = document.getElementById('mail-draft');
            try {
                await navigator.clipboard.writeText(area.value);
                window.App.showToast('Reply copied', 'success');
            } catch (e) {
                area.select();
                window.App.showToast('Select and copy the text manually.', 'info');
            }
        });
    }

    async function ensureBody(msg) {
        if (msg.body !== undefined) return;
        const data = await window.Store.api(`/api/mail/accounts/${activeId}/messages/${msg.id}`, { timeout: 60000 });
        msg.body = data.message.body || '';
        msg.attachments = data.message.attachments || [];
        msg.replyTo = data.message.replyTo || '';
        msg.messageId = data.message.messageId || '';
        msg.references = data.message.references || '';
    }

    async function openMessage(id) {
        const msg = findMessage(id);
        if (!msg) return;
        window.App.showModal(msg.subject, readerHtml(msg), '');
        const bind = () => {
            document.getElementById('btn-mail-sum')?.addEventListener('click', () => summarize(msg));
            document.getElementById('btn-mail-reply')?.addEventListener('click', () => draftReply(msg));
            document.getElementById('btn-mail-write')?.addEventListener('click', () => {
                if (msg.aiDraft === undefined) msg.aiDraft = '';
                renderAiOut(msg);
                document.getElementById('mail-draft')?.focus();
            });
            renderAiOut(msg);
        };
        bind();
        if (msg.body === undefined) {
            try {
                await ensureBody(msg);
            } catch (err) {
                const el = document.getElementById('mail-body');
                if (el) el.innerHTML = `<span style="color:var(--error);">${esc(errorText(err))}</span>`;
                return;
            }
            // Only redraw if this message is still the one on screen
            if (document.getElementById('modal-title').textContent === msg.subject) {
                document.getElementById('modal-body').innerHTML = readerHtml(msg);
                bind();
            }
        }
    }

    async function withButton(id, busyLabel, work) {
        const btn = document.getElementById(id);
        const label = btn ? btn.textContent : '';
        if (btn) { btn.textContent = busyLabel; btn.disabled = true; }
        try {
            await work();
        } catch (err) {
            console.error(err);
            window.App.showToast(errorText(err), 'error');
        } finally {
            const again = document.getElementById(id);
            if (again) { again.textContent = label; again.disabled = false; }
        }
    }

    function summarize(msg) {
        return withButton('btn-mail-sum', 'Thinking…', async () => {
            await ensureBody(msg);
            msg.aiSummary = await window.App.ai([
                { role: 'system', content: 'Summarise the following email in 2-3 short lines: the core message and anything the recipient has to do. Write in the language of the email. Plain text, no Markdown.' },
                { role: 'user', content: `Subject: ${msg.subject}\nFrom: ${msg.from}\n\n${(msg.body || msg.snippet).slice(0, 12000)}` }
            ], { temperature: 0.3 });
            renderAiOut(msg);
        });
    }

    function draftReply(msg) {
        const instructions = (document.getElementById('mail-draft-inst')?.value || '').trim();
        const current = msg.aiDraft || '';
        return withButton(msg.aiDraft === undefined ? 'btn-mail-reply' : 'btn-mail-redraft', 'Writing…', async () => {
            await ensureBody(msg);
            msg.aiDraft = await window.App.ai([
                { role: 'system', content: 'Write a polite, concise reply to the email below, in the language of the email. If information is needed that you do not have, put a clear placeholder in square brackets. Output only the reply text, no subject line, no Markdown.' },
                { role: 'user', content: `Email from: ${msg.from}\nSubject: ${msg.subject}\n\n${(msg.body || msg.snippet).slice(0, 12000)}\n\n${current.trim() ? `Current draft of the reply:\n${current}\n\n` : ''}${instructions ? `Instructions for the reply: ${instructions}` : ''}` }
            ], { temperature: 0.6 });
            renderAiOut(msg);
        });
    }

    // ── Sending with a ten-second undo ───────────────────

    let pendingSend = null;   // { timer, tick, accountId, msg, mail }

    function utf8Base64(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        return btoa(binary);
    }

    async function sendViaGmail(msg, mail) {
        const subject = /^[\x20-\x7e]*$/.test(mail.subject) ? mail.subject : `=?UTF-8?B?${utf8Base64(mail.subject)}?=`;
        const lines = [
            `To: ${mail.to}`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
        ];
        if (mail.inReplyTo) lines.push(`In-Reply-To: ${mail.inReplyTo}`, `References: ${mail.references}`);
        const raw = utf8Base64(lines.join('\r\n') + '\r\n\r\n' + utf8Base64(mail.body).replace(/(.{76})/g, '$1\r\n'))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${window.GoogleModule.getAccessToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw, threadId: msg.threadId }),
        });
        if (!res.ok) throw new Error('Gmail did not accept the message.');
    }

    async function allowSending(account) {
        if (account.canSend) return true;
        if (!confirm(`Allow LifeOS to send email from ${account.label}?\n\nNothing is sent without you tapping Send, and every mail can be taken back for ${UNDO_SECONDS} seconds. You can switch this off again under Manage.`)) return false;
        if (account.type === 'gmail') {
            localStorage.setItem(GMAIL_SEND_KEY, 'yes');
        } else {
            await window.Store.api(`/api/mail/accounts/${account.id}/sending`, { method: 'POST', body: { allow: true } });
            const stored = imapAccounts.find(a => a.id === account.id);
            if (stored) stored.canSend = true;
        }
        return true;
    }

    async function startSend(msg) {
        if (pendingSend) {
            window.App.showToast('Another mail is still waiting to be sent.', 'info');
            return;
        }
        const account = accounts().find(a => a.id === activeId);
        const to = (msg.draftTo !== undefined ? msg.draftTo : (msg.replyTo || splitSender(msg.from).email)).trim();
        const body = (msg.aiDraft || '').trim();
        if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to)) return window.App.showToast(ERROR_TEXT.invalid_recipient, 'error');
        if (!body) return window.App.showToast('The reply is empty.', 'error');
        if (/\[[^\]\n]{2,60}\]/.test(body) && !confirm('The reply still contains a placeholder in [brackets]. Send anyway?')) return;

        try {
            if (!await allowSending(account)) return;
        } catch (err) {
            return window.App.showToast(errorText(err), 'error');
        }

        const references = [msg.references, msg.messageId].filter(Boolean).join(' ').trim();
        const mail = {
            to,
            subject: /^re:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject}`,
            body,
            inReplyTo: msg.messageId || '',
            references,
        };
        window.App.hideModal();

        pendingSend = { msg, mail, accountId: activeId, timer: null, tick: null };
        runCountdown();
    }

    /** Show the undo bar and send when it has run out. Nothing leaves the app before that. */
    function runCountdown() {
        const { mail } = pendingSend;
        const bar = document.getElementById('undo-bar');
        let remaining = UNDO_SECONDS;
        bar.innerHTML = `
            <span class="undo-text">Sending to ${esc(mail.to)} in ${remaining} s</span>
            <button type="button" class="undo-btn" id="btn-undo-send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
                Undo
            </button>
            <span class="undo-progress" style="animation-duration:${UNDO_SECONDS}s;"></span>`;
        bar.classList.remove('hidden');
        document.getElementById('btn-undo-send').addEventListener('click', undoSend);
        clearTimeout(pendingSend.timer);
        clearInterval(pendingSend.tick);
        pendingSend.tick = setInterval(() => {
            remaining--;
            const text = bar.querySelector('.undo-text');
            if (text && remaining > 0) text.textContent = `Sending to ${mail.to} in ${remaining} s`;
        }, 1000);
        pendingSend.timer = setTimeout(finishSend, UNDO_SECONDS * 1000);
    }

    function clearPending() {
        if (!pendingSend) return null;
        clearTimeout(pendingSend.timer);
        clearInterval(pendingSend.tick);
        const done = pendingSend;
        pendingSend = null;
        document.getElementById('undo-bar').classList.add('hidden');
        return done;
    }

    function undoSend() {
        const pending = clearPending();
        if (!pending) return;
        window.App.showToast('Not sent. Your reply is still there.', 'info');
        if (pending.accountId === activeId) openMessage(pending.msg.id);
    }

    async function finishSend() {
        const pending = clearPending();
        if (!pending) return;
        const { msg, mail, accountId } = pending;
        try {
            if (accountId === 'gmail') await sendViaGmail(msg, mail);
            else await window.Store.api(`/api/mail/accounts/${accountId}/send`, { method: 'POST', body: mail, timeout: 60000 });
            msg.aiDraft = undefined;
            msg.draftTo = undefined;
            msg.answered = true;
            window.App.showToast(`Sent to ${mail.to}`, 'success');
        } catch (err) {
            console.error('Send failed:', err);
            window.App.showToast(`Not sent: ${errorText(err)} Your reply is kept.`, 'error');
        }
    }

    // A mail is never sent while the app is in the background: the countdown stops
    // there and starts again, visibly, when the app is back. Closing the app drops it.
    document.addEventListener('visibilitychange', () => {
        if (!pendingSend) return;
        if (document.hidden) {
            clearTimeout(pendingSend.timer);
            clearInterval(pendingSend.tick);
        } else {
            runCountdown();
        }
    });
    window.addEventListener('pagehide', clearPending);

    async function setSending(id, allow) {
        try {
            if (id === 'gmail') {
                if (allow) localStorage.setItem(GMAIL_SEND_KEY, 'yes'); else localStorage.removeItem(GMAIL_SEND_KEY);
            } else {
                await window.Store.api(`/api/mail/accounts/${id}/sending`, { method: 'POST', body: { allow } });
                const stored = imapAccounts.find(a => a.id === id);
                if (stored) stored.canSend = allow;
            }
        } catch (err) {
            window.App.showToast(errorText(err), 'error');
        }
        showAccounts();
    }

    /** Important unread mail of the mailboxes that are loaded, for the assistant. */
    function getContextForAI() {
        const lines = [];
        accounts().forEach(account => {
            const state = boxes[account.id];
            if (!state || !state.messages) return;
            state.messages.filter(m => m.category === 'important' && m.unread).slice(0, 8).forEach(m => {
                lines.push(`[${account.label}] ${splitSender(m.from).name}: ${m.subject} — ${m.snippet.slice(0, 120)}`);
            });
        });
        return lines;
    }

    function summarizeUnread() {
        const state = box(activeId);
        const unread = (state.messages || []).filter(m => tabOf(m) === activeTab && m.unread);
        if (unread.length === 0) return;
        return withButton('btn-mail-summary', 'Thinking…', async () => {
            state.summary = await window.App.ai([
                { role: 'system', content: 'Summarise these unread emails for their recipient in 3-6 short lines. Name who wants what and what needs an answer or action first. Write in the language most of the emails use. Plain text, no Markdown.' },
                { role: 'user', content: unread.map(m => `From: ${m.from}\nSubject: ${m.subject}\n${m.snippet}`).join('\n\n---\n\n') }
            ], { temperature: 0.3 });
            renderSection();
        });
    }

    // ── Managing mailboxes ───────────────────────────────

    function showAccounts() {
        const all = accounts();
        if (all.length === 0) return showAddAccount();
        const rows = all.map(a => {
            const imap = imapAccounts.find(x => x.id === a.id);
            return `
            <div class="exercise-item" style="flex-wrap:wrap;">
                <div class="exercise-info">
                    <div class="exercise-name">${esc(a.label)}</div>
                    <div class="exercise-detail">${imap ? esc(imap.host) : 'connected through Google (Settings)'}</div>
                </div>
                ${imap ? `<button class="btn btn-sm btn-danger" onclick="MailModule.removeAccount('${esc(a.id)}')">Remove</button>` : ''}
                <div class="mail-send-switch">
                    <span>Sending ${a.canSend ? 'allowed' : 'off'}</span>
                    <button class="btn btn-sm btn-ghost" onclick="MailModule.setSending('${esc(a.id)}', ${a.canSend ? 'false' : 'true'})">${a.canSend ? 'Switch off' : 'Allow'}</button>
                </div>
            </div>`;
        }).join('');
        window.App.showModal('Mailboxes', rows, `<button class="btn btn-primary" onclick="MailModule.showAddAccount()">Add mailbox</button>`);
    }

    function showAddAccount() {
        window.App.showModal('Add mailbox', `
            <p class="form-hint" style="margin-bottom:14px;">Your password is sent to your own server, stored there encrypted and used only to read this inbox.</p>
            <div class="form-group">
                <label class="form-label" for="mail-acc-email">Email address</label>
                <input id="mail-acc-email" class="form-input" type="email" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="info@example.com">
            </div>
            <div class="form-group">
                <label class="form-label" for="mail-acc-host">Mail server (IMAP)</label>
                <input id="mail-acc-host" class="form-input" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="w01234ab.kasserver.com">
                <p class="form-hint">all-inkl: shown in KAS under E-Mail → Postfächer.</p>
            </div>
            <div class="form-group">
                <label class="form-label" for="mail-acc-user">Login name</label>
                <input id="mail-acc-user" class="form-input" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="m0123456 (or the email address)">
            </div>
            <div class="form-group">
                <label class="form-label" for="mail-acc-pass">Mailbox password</label>
                <input id="mail-acc-pass" class="form-input" type="password" autocomplete="new-password">
            </div>
            <p id="mail-acc-error" class="auth-error" role="alert"></p>
        `, `<button class="btn btn-primary" id="btn-mail-acc-save">Connect mailbox</button>`);

        document.getElementById('btn-mail-acc-save').addEventListener('click', async () => {
            const btn = document.getElementById('btn-mail-acc-save');
            const errorEl = document.getElementById('mail-acc-error');
            errorEl.textContent = '';
            btn.disabled = true;
            btn.textContent = 'Checking the login…';
            try {
                const data = await window.Store.api('/api/mail/accounts', {
                    method: 'POST',
                    timeout: 60000,
                    body: {
                        email: document.getElementById('mail-acc-email').value,
                        host: document.getElementById('mail-acc-host').value,
                        username: document.getElementById('mail-acc-user').value,
                        password: document.getElementById('mail-acc-pass').value,
                    },
                });
                await loadAccounts();
                window.App.hideModal();
                window.App.showToast('Mailbox connected', 'success');
                switchAccount(data.account.id);
            } catch (err) {
                errorEl.textContent = errorText(err);
                btn.disabled = false;
                btn.textContent = 'Connect mailbox';
            }
        });
    }

    async function removeAccount(id) {
        const account = imapAccounts.find(a => a.id === id);
        if (!account || !confirm(`Remove ${account.email} from LifeOS? The mailbox itself is not touched.`)) return;
        try {
            await window.Store.api(`/api/mail/accounts/${id}`, { method: 'DELETE' });
        } catch (err) {
            window.App.showToast(errorText(err), 'error');
            return;
        }
        delete boxes[id];
        await loadAccounts();
        window.App.hideModal();
        renderSection();
    }

    function renderDashboard() {}

    window.MailModule = {
        init, renderSection, renderDashboard, fetchEmails, refresh, switchAccount, setTab, openMessage,
        summarizeUnread, showAccounts, showAddAccount, removeAccount, setSending, getContextForAI,
    };

})();
