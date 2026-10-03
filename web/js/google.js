/* =========================================================
 *  LifeOS — Google connection  (google.js)
 *  Gmail and Calendar access. The server holds the Google
 *  connection (approved once, stored there encrypted); this
 *  file only asks it for short-lived access tokens.
 * ========================================================= */

(function() {
    'use strict';

    let accessToken = null;
    let server = { configured: false, connected: false };
    let refreshTimer = null;
    let started = false;

    async function init() {
        if (started) return;
        started = true;

        try {
            server = await window.Store.api('/api/google/status');
        } catch (e) {}
        if (!server.configured) return;

        const outcome = new URLSearchParams(window.location.search).get('google');
        if (outcome) {
            history.replaceState(null, '', window.location.pathname);
            if (window.App) {
                const ok = outcome === 'connected';
                window.App.showToast(ok ? 'Google connected' : 'Google could not be connected', ok ? 'success' : 'error');
            }
        }
        if (server.connected) await loadToken();
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && server.connected) loadToken();
        });
    }

    /** Fetch a fresh access token and renew it before it runs out. */
    async function loadToken() {
        clearTimeout(refreshTimer);
        try {
            const data = await window.Store.api('/api/google/token');
            const first = accessToken === null;
            accessToken = data.access_token;
            refreshTimer = setTimeout(loadToken, Math.max(60, data.expires_in - 300) * 1000);
            if (first) {
                if (window.SettingsModule) window.SettingsModule.renderSection();
                if (window.MailModule && window.MailModule.fetchEmails) window.MailModule.fetchEmails();
            }
        } catch (err) {
            if (err.status === 404) {
                // Access was withdrawn at Google
                accessToken = null;
                server.connected = false;
                if (window.SettingsModule) window.SettingsModule.renderSection();
            } else {
                refreshTimer = setTimeout(loadToken, 60000);
            }
        }
    }

    /** Approve once at Google; the server keeps the connection from then on. */
    function authGoogle() {
        if (!server.configured) {
            if (window.App) window.App.showToast('Google is not set up on the server yet.', 'error');
            return;
        }
        window.location.href = '/api/google/connect';
    }

    async function disconnect() {
        try { await window.Store.api('/api/google/disconnect', { method: 'POST', body: {} }); } catch (e) {}
        server.connected = false;
        clearTimeout(refreshTimer);
        accessToken = null;
        if (window.SettingsModule) window.SettingsModule.renderSection();
    }

    window.GoogleModule = {
        init,
        authGoogle,
        disconnect,
        getAccessToken: () => accessToken,
        get isReady() { return accessToken !== null; },
        get configured() { return server.configured; },
    };
    // Mail and Calendar still look the connection up under its old name.
    window.RAGModule = window.GoogleModule;

})();
