/* =========================================================
 *  LifeOS — Sign-in screen  (auth.js)
 *  Blocks the app until somebody is signed in. On a fresh
 *  server the first visit creates the account.
 * ========================================================= */

window.Auth = (() => {
    'use strict';

    const ERRORS = {
        invalid_credentials: 'Wrong username or password.',
        too_many_attempts: 'Too many attempts. Please wait 15 minutes.',
        invalid_username: 'Username: 3–32 characters (letters, numbers, . _ -).',
        weak_password: 'The password needs at least 8 characters.',
        username_taken: 'This username already exists.',
        signup_closed: 'An account already exists. Please sign in.',
    };

    const el = (id) => document.getElementById(id);

    function show(mode, message) {
        const isSetup = mode === 'setup';
        el('auth-screen').classList.remove('hidden');
        el('auth-screen').dataset.mode = mode;
        el('auth-title').textContent = isSetup ? 'Create your account' : 'Welcome back';
        el('auth-subtitle').textContent = isSetup
            ? 'Your data is saved on your own server. Choose a username and password.'
            : 'Sign in to load your data.';
        el('auth-confirm-group').style.display = isSetup ? '' : 'none';
        el('auth-submit').textContent = isSetup ? 'Create account' : 'Sign in';
        el('auth-password').autocomplete = isSetup ? 'new-password' : 'current-password';
        el('auth-error').textContent = message || '';
    }

    function hide() {
        el('auth-screen').classList.add('hidden');
        el('auth-password').value = '';
        el('auth-confirm').value = '';
    }

    /** Shows the form and resolves once sign-in succeeded. */
    function prompt(mode, message) {
        show(mode, message);
        el('auth-submit').disabled = false;
        return new Promise(resolve => {
            const form = el('auth-form');
            form.onsubmit = async (e) => {
                e.preventDefault();
                const isSetup = el('auth-screen').dataset.mode === 'setup';
                const username = el('auth-username').value.trim();
                const password = el('auth-password').value;
                if (isSetup && password !== el('auth-confirm').value) {
                    el('auth-error').textContent = 'The passwords do not match.';
                    return;
                }
                const btn = el('auth-submit');
                btn.disabled = true;
                el('auth-error').textContent = '';
                try {
                    await window.Store.login(username, password, isSetup);
                    hide();
                    form.onsubmit = () => false;
                    resolve();
                } catch (err) {
                    el('auth-error').textContent = ERRORS[err.message]
                        || (err.status ? 'Something went wrong. Please try again.' : 'The server cannot be reached.');
                } finally {
                    btn.disabled = false;
                }
            };
        });
    }

    /** Ask the server who is signed in, retrying until it answers (or the cache can be used). */
    async function ensureSession() {
        const Store = window.Store;
        for (;;) {
            let status;
            try {
                status = await Store.api('/api/auth/status', { timeout: Store.hasCache ? 3500 : 10000 });
            } catch (err) {
                // Offline: carry on with the data cached on this device.
                if (Store.user && Store.hasCache) return { offline: true };
                show('login', 'The server cannot be reached. Retrying…');
                // Nothing can be submitted until the server answers
                el('auth-submit').disabled = true;
                el('auth-form').onsubmit = () => false;
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
            if (status.user) {
                Store.adoptUser(status.user.username);
                return { offline: false };
            }
            await prompt(status.setupRequired ? 'setup' : 'login');
            return { offline: false };
        }
    }

    return { ensureSession, prompt };
})();
