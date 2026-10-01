/* =========================================================
 *  LifeOS — Google connection  (google.js)
 *  Signs in to Google for Gmail and Calendar. App data is no
 *  longer stored in Drive; the only Drive code left fetches
 *  the old backup once so it can be imported.
 * ========================================================= */

(function() {
    'use strict';

    const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.modify';
    const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
    const AUTO_CONNECT = 'lifeos_google_auto_connect';

    let accessToken = null;

    function init() {
        if (accessToken || localStorage.getItem(AUTO_CONNECT) !== 'true') return;

        const cachedToken = localStorage.getItem('lifeos_google_access_token');
        const tokenExpiry = localStorage.getItem('lifeos_google_token_expiry');

        // Reuse the cached token while it is valid (with a 5 minute buffer)
        if (cachedToken && tokenExpiry && Date.now() < (parseInt(tokenExpiry) - 300000)) {
            accessToken = cachedToken;
            setTimeout(() => onAuthSuccess(), 500);
        } else {
            setTimeout(() => {
                if (localStorage.getItem('lifeos_google_client_id')) authGoogle(true);
            }, 1000);
        }
    }

    function onAuthSuccess() {
        if (window.SettingsModule) window.SettingsModule.renderSection();
        if (window.MailModule && window.MailModule.fetchEmails) window.MailModule.fetchEmails();
    }

    function requestToken(scope, silent) {
        return new Promise((resolve, reject) => {
            const clientId = localStorage.getItem('lifeos_google_client_id');
            if (!clientId) return reject(new Error('Please set your Google Client ID first.'));
            if (!window.google || !google.accounts || !google.accounts.oauth2) {
                return reject(new Error('Google sign-in could not be loaded.'));
            }
            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope,
                callback: (response) => {
                    if (response.error !== undefined) return reject(new Error(response.error));
                    resolve(response);
                },
                error_callback: (err) => reject(new Error(err && err.type ? err.type : 'Sign-in was cancelled.')),
            });
            client.requestAccessToken(silent ? { prompt: '' } : undefined);
        });
    }

    async function authGoogle(isAuto = false) {
        try {
            const response = await requestToken(SCOPES, isAuto);
            accessToken = response.access_token;
            localStorage.setItem('lifeos_google_access_token', accessToken);
            localStorage.setItem('lifeos_google_token_expiry', Date.now() + ((response.expires_in || 3599) * 1000));
            localStorage.setItem(AUTO_CONNECT, 'true');
            if (!isAuto && window.App) window.App.showToast('Connected to Google', 'success');
            onAuthSuccess();
        } catch (err) {
            if (isAuto) console.warn('Google auto-connect failed:', err.message);
            else if (window.App) window.App.showToast(err.message, 'error');
        }
    }

    function disconnect() {
        accessToken = null;
        localStorage.removeItem('lifeos_google_access_token');
        localStorage.removeItem('lifeos_google_token_expiry');
        localStorage.removeItem(AUTO_CONNECT);
        if (window.SettingsModule) window.SettingsModule.renderSection();
    }

    /** One-time migration: read `LifeOS_Data/lifeos_backup.json` written by the old version. */
    async function fetchDriveBackup() {
        const { access_token: token } = await requestToken(DRIVE_SCOPE, false);
        const drive = async (path) => {
            const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`Google Drive answered with an error (${res.status}).`);
            return res.json();
        };

        const folderQuery = encodeURIComponent(`name='LifeOS_Data' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        const folders = await drive(`/files?q=${folderQuery}&fields=files(id)`);
        if (!folders.files || !folders.files.length) throw new Error('No LifeOS folder found in this Google Drive.');

        const fileQuery = encodeURIComponent(`name='lifeos_backup.json' and '${folders.files[0].id}' in parents and trashed=false`);
        const files = await drive(`/files?q=${fileQuery}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
        if (!files.files || !files.files.length) throw new Error('No backup found in Google Drive.');

        return {
            modifiedTime: files.files[0].modifiedTime,
            data: await drive(`/files/${files.files[0].id}?alt=media`),
        };
    }

    window.GoogleModule = {
        init,
        authGoogle,
        disconnect,
        fetchDriveBackup,
        getAccessToken: () => accessToken,
        get isReady() { return accessToken !== null; },
    };
    // Mail and Calendar still look the connection up under its old name.
    window.RAGModule = window.GoogleModule;

})();
