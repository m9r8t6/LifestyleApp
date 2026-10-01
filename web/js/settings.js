(function() {
    'use strict';

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ── Push notifications (this device) ──
    const NOTIFY_KEY = 'lifeos_notify';

    function loadNotify() {
        let stored = {};
        try { stored = JSON.parse(localStorage.getItem(NOTIFY_KEY)) || {}; } catch (e) {}
        return { events: stored.events !== false, nudge: stored.nudge !== false, nudgeTime: /^\d{2}:\d{2}$/.test(stored.nudgeTime || '') ? stored.nudgeTime : '19:00' };
    }

    const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    async function currentSubscription() {
        if (!pushSupported()) return null;
        const registration = await navigator.serviceWorker.getRegistration();
        return registration ? registration.pushManager.getSubscription() : null;
    }

    async function pushEnabledHere() {
        try { return Boolean(await currentSubscription()) && Notification.permission === 'granted'; } catch (e) { return false; }
    }

    function keyToBytes(base64Url) {
        const base64 = (base64Url + '='.repeat((4 - base64Url.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
        return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }

    async function refreshPushStatus() {
        const status = document.getElementById('push-status');
        const toggle = document.getElementById('btn-push-toggle');
        const test = document.getElementById('btn-push-test');
        if (!status || !toggle) return;

        if (!pushSupported()) {
            const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
            status.textContent = ios
                ? 'On an iPhone, add LifeOS to the home screen first (Share → Add to Home Screen) and open it from there.'
                : (window.isSecureContext ? 'This browser does not support notifications.' : 'Notifications need the https address of the app.');
            return;
        }
        if (Notification.permission === 'denied') {
            status.textContent = 'Notifications are blocked for LifeOS in this browser. Allow them in the browser\'s site settings, then come back.';
            return;
        }
        const on = await pushEnabledHere();
        status.textContent = on
            ? 'On for this device. Reminders arrive even when the app is closed.'
            : 'Off on this device. Turn them on to get reminders when the app is closed.';
        toggle.textContent = on ? 'Turn off' : 'Turn on';
        toggle.className = on ? 'btn btn-ghost' : 'btn btn-primary';
        toggle.disabled = false;
        if (test) test.disabled = !on;
    }

    async function togglePush() {
        const toggle = document.getElementById('btn-push-toggle');
        toggle.disabled = true;
        try {
            const existing = await currentSubscription();
            if (existing) {
                await window.Store.api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: existing.endpoint } }).catch(() => {});
                await existing.unsubscribe();
            } else {
                if (await Notification.requestPermission() !== 'granted') {
                    window.App.showToast('Notifications were not allowed.', 'error');
                    return;
                }
                const { publicKey } = await window.Store.api('/api/push/key');
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
                await window.Store.api('/api/push/subscribe', {
                    method: 'POST',
                    body: { subscription: subscription.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                });
                // Make sure the server knows the current preferences
                localStorage.setItem(NOTIFY_KEY, JSON.stringify(loadNotify()));
                window.App.showToast('Notifications are on for this device', 'success');
            }
        } catch (err) {
            console.error('Push setup failed:', err);
            window.App.showToast('Notifications could not be switched. Please try again.', 'error');
        } finally {
            refreshPushStatus();
        }
    }

    function init() {
        // Just bind some events, rendering is done when section is active?
        // Let's render once on init
        renderSection();
    }

    function renderSection() {
        const container = document.getElementById('settings-container');
        if (!container) return;

        const lang = window.i18n ? window.i18n.getLang() : 'en';
        const t = window.i18n ? window.i18n.t : (k) => k;
        
        const soundOn = localStorage.getItem('lifeos_sound') !== 'off'; // default on
        const theme = window.App ? window.App.getTheme() : 'light';
        const store = window.Store;
        const googleReady = Boolean(window.GoogleModule && window.GoogleModule.isReady);
        const googleConfigured = Boolean(window.GoogleModule && window.GoogleModule.configured);
        const lastSync = store && store.lastSync
            ? new Date(store.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '';

        const defaultProfile = { sex: 'male', age: 25, weight: 75, height: 180, diet: 'vegetarian', goals: { muscle: false, skin: false, hair: false } };
        let profile = defaultProfile;
        try {
            const stored = localStorage.getItem('lifeos_profile');
            if (stored) profile = JSON.parse(stored);
        } catch(e) {}

        const notify = loadNotify();

        const html = `
            <div class="card-header-row">
                <div class="section-title" style="margin:0">
                    <div class="section-title-icon" style="background:var(--glass-border); color:var(--text);">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </div>
                    <h2>${t('settings_title')}</h2>
                </div>
            </div>

            <div class="glass-card stagger-item">
                <div class="form-group" style="margin-bottom: 24px;">
                    <label class="form-label">${t('language')}</label>
                    <div class="time-toggle">
                        <button type="button" class="time-toggle-btn ${lang === 'en' ? 'active' : ''}" id="btn-lang-en">${t('english')}</button>
                        <button type="button" class="time-toggle-btn ${lang === 'de' ? 'active' : ''}" id="btn-lang-de">${t('german')}</button>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 24px;">
                    <label class="form-label">${t('theme')}</label>
                    <div class="time-toggle">
                        <button type="button" class="time-toggle-btn ${theme === 'light' ? 'active' : ''}" data-theme="light">${t('light_mode')}</button>
                        <button type="button" class="time-toggle-btn ${theme === 'system' ? 'active' : ''}" data-theme="system">Auto</button>
                        <button type="button" class="time-toggle-btn ${theme === 'dark' ? 'active' : ''}" data-theme="dark">${t('dark_mode')}</button>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label">${t('timer_sound')}</label>
                    <div class="time-toggle" style="margin-bottom:0;">
                        <button type="button" class="time-toggle-btn ${soundOn ? 'active' : ''}" id="btn-sound-on">${t('on')}</button>
                        <button type="button" class="time-toggle-btn ${!soundOn ? 'active' : ''}" id="btn-sound-off">${t('off')}</button>
                    </div>
                </div>
            </div>

            <div class="glass-card stagger-item" style="margin-top: 24px;">
                <h3 style="margin-top:0; font-size:1rem; color:var(--text);">Notifications</h3>
                <p id="push-status" class="form-hint" style="margin:4px 0 14px;">Checking…</p>
                <div class="settings-actions" style="margin-bottom:16px;">
                    <button class="btn btn-primary" id="btn-push-toggle" disabled>Turn on</button>
                    <button class="btn btn-ghost" id="btn-push-test" disabled>Send a test</button>
                </div>
                <label class="switch-row"><input type="checkbox" id="notify-events" ${notify.events ? 'checked' : ''}> <span>Reminders for calendar events</span></label>
                <label class="switch-row"><input type="checkbox" id="notify-nudge" ${notify.nudge ? 'checked' : ''}> <span>Evening nudge if nothing is ticked off</span></label>
                <div class="form-group" style="margin:10px 0 0;">
                    <label class="form-label" for="notify-time">Nudge time</label>
                    <input type="time" id="notify-time" class="form-input" value="${escapeHtml(notify.nudgeTime)}" style="max-width:160px;">
                </div>
            </div>

            <div class="glass-card stagger-item" style="margin-top: 24px;">
                <h3 style="margin-top:0; font-size:1rem; color:var(--text);">Account &amp; Data</h3>
                <p style="font-size:0.8rem; color:var(--text-muted); margin:4px 0 16px;">
                    Signed in as <strong style="color:var(--text);">${escapeHtml(store ? store.user || '' : '')}</strong>.
                    Everything is saved on your server automatically${lastSync ? ` (last saved ${lastSync})` : ''}.
                </p>
                <div class="settings-actions">
                    <button class="btn btn-ghost" id="btn-export-data">Download backup</button>
                    <button class="btn btn-ghost" id="btn-import-data">Import backup file</button>
                    <button class="btn btn-ghost" id="btn-change-password">Change password</button>
                    <button class="btn btn-ghost" id="btn-logout" style="color:var(--error);">Sign out</button>
                </div>
                <input type="file" id="input-import-file" accept="application/json,.json" style="display:none;">
            </div>

            <div class="glass-card stagger-item" style="margin-top: 24px;">
                <h3 style="margin-top:0; font-size:1rem; color:var(--text);">Google (Mail &amp; Calendar)</h3>
                <p style="font-size:0.8rem; color:var(--text-muted); margin:4px 0 16px;">
                    ${!googleConfigured ? 'Not set up on the server yet.'
                        : googleReady ? 'Connected. The server keeps the connection, so you do not have to sign in again.'
                        : 'Approve access once; the server keeps the connection for all your devices.'}
                </p>
                <div class="settings-actions">
                    <button class="btn btn-ghost" id="btn-auth-google" style="color:var(--accent);">${googleReady ? 'Google connected ✓' : 'Connect Google'}</button>
                    ${googleReady ? '<button class="btn btn-ghost" id="btn-disconnect-google">Disconnect</button>' : ''}
                </div>
            </div>

            <div class="glass-card stagger-item" style="margin-top: 24px; margin-bottom: 24px;">
                <h3 style="margin-top:0; font-size:1rem; color:var(--text);">Personal Profile</h3>
                <p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:16px;">Used to dynamically calculate your daily nutritional targets.</p>
                
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Sex</label>
                        <select id="profile-sex" class="form-input" style="font-size:0.9rem;">
                            <option value="male" ${profile.sex==='male'?'selected':''}>Male</option>
                            <option value="female" ${profile.sex==='female'?'selected':''}>Female</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Age</label>
                        <input type="number" id="profile-age" class="form-input" value="${profile.age}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Weight (kg)</label>
                        <input type="number" step="0.1" id="profile-weight" class="form-input" value="${profile.weight}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Height (cm)</label>
                        <input type="number" id="profile-height" class="form-input" value="${profile.height}">
                    </div>
                </div>
                <div class="form-row" style="margin-top: 12px;">
                    <div class="form-group">
                        <label class="form-label">Dietary Restrictions</label>
                        <div id="diet-chips" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;"></div>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="diet-input" class="form-input" style="font-size:0.9rem;" placeholder="e.g. No Milk">
                            <button id="btn-add-diet" class="btn btn-secondary" style="padding:0 12px; font-weight:bold; background:var(--surface); border:1px solid var(--glass-border); color:var(--text); border-radius:var(--r-md); cursor:pointer; min-width:44px;">+</button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Budget</label>
                        <select id="profile-budget" class="form-input" style="font-size:0.9rem;">
                            <option value="standard" ${profile.budget!=='cheap'?'selected':''}>Standard</option>
                            <option value="cheap" ${profile.budget==='cheap'?'selected':''}>Budget-Friendly</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-group" style="margin-top: 16px; margin-bottom: 0;">
                    <label class="form-label">Goals</label>
                    <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text);">
                            <input type="checkbox" id="goal-muscle" ${profile.goals.muscle?'checked':''} style="width: 18px; height: 18px; accent-color: var(--primary);"> Muscle Gain
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text);">
                            <input type="checkbox" id="goal-skin" ${profile.goals.skin?'checked':''} style="width: 18px; height: 18px; accent-color: var(--primary);"> Better Skin (Acne)
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text);">
                            <input type="checkbox" id="goal-hair" ${profile.goals.hair?'checked':''} style="width: 18px; height: 18px; accent-color: var(--primary);"> Hair/Eyebrow Growth
                        </label>
                    </div>
                </div>
                <div class="form-group" style="margin-top: 16px; margin-bottom: 0;">
                    <label class="form-label">Meal Prep Strategy</label>
                    <select id="profile-meal-prep" class="form-input" style="font-size:0.9rem;">
                        <option value="none" ${profile.meal_prep==='none'?'selected':''}>Standard (Different meals daily)</option>
                        <option value="2days" ${profile.meal_prep==='2days'?'selected':''}>Cook for 2 Days (Duplicate Dinners to Lunches)</option>
                        <option value="3days" ${profile.meal_prep==='3days'?'selected':''}>Cook for 3 Days (Same meals for 3 days)</option>
                    </select>
                </div>
                
                
                <button class="btn btn-primary" id="btn-save-profile" style="width:100%; margin-top:24px;">Save Profile</button>
            </div>
        `;
        container.innerHTML = html;

        // Initialize Diet Chips
        const savedDiet = profile.dietRestrictions || [];
        const dietChipsContainer = document.getElementById('diet-chips');
        const dietInput = document.getElementById('diet-input');
        
        window.removeDiet = (idx) => {
            savedDiet.splice(idx, 1);
            renderDietChips();
        };

        const renderDietChips = () => {
            if (!dietChipsContainer) return;
            dietChipsContainer.innerHTML = savedDiet.map((d, i) => `
                <div style="background:var(--text); color:var(--bg-primary); padding:4px 10px; border-radius:12px; font-size:0.75rem; display:flex; align-items:center; gap:6px;">
                    ${escapeHtml(d)} <span style="cursor:pointer; font-weight:bold; padding:0 4px;" onclick="window.removeDiet(${i})">×</span>
                </div>
            `).join('');
        };

        renderDietChips();

        document.getElementById('btn-add-diet')?.addEventListener('click', () => {
            const val = dietInput.value.trim();
            if (val && !savedDiet.includes(val)) {
                savedDiet.push(val);
                dietInput.value = '';
                renderDietChips();
            }
        });

        document.getElementById('btn-lang-en')?.addEventListener('click', () => { window.i18n.setLang('en'); renderSection(); });
        document.getElementById('btn-lang-de')?.addEventListener('click', () => { window.i18n.setLang('de'); renderSection(); });

        container.querySelectorAll('[data-theme]').forEach(btn => {
            btn.addEventListener('click', () => {
                window.App.setTheme(btn.dataset.theme);
                renderSection();
            });
        });

        document.getElementById('btn-sound-on')?.addEventListener('click', () => { 
            localStorage.setItem('lifeos_sound', 'on'); 
            renderSection(); 
        });
        document.getElementById('btn-sound-off')?.addEventListener('click', () => { 
            localStorage.setItem('lifeos_sound', 'off'); 
            renderSection(); 
        });

        document.getElementById('btn-auth-google')?.addEventListener('click', () => {
            if (window.GoogleModule) window.GoogleModule.authGoogle();
        });
        document.getElementById('btn-disconnect-google')?.addEventListener('click', () => {
            if (window.GoogleModule) window.GoogleModule.disconnect();
        });

        // ── Notifications ──
        const saveNotify = () => {
            localStorage.setItem(NOTIFY_KEY, JSON.stringify({
                events: document.getElementById('notify-events').checked,
                nudge: document.getElementById('notify-nudge').checked,
                nudgeTime: document.getElementById('notify-time').value || '19:00',
            }));
        };
        ['notify-events', 'notify-nudge', 'notify-time'].forEach(id => document.getElementById(id)?.addEventListener('change', saveNotify));
        document.getElementById('btn-push-toggle')?.addEventListener('click', togglePush);
        document.getElementById('btn-push-test')?.addEventListener('click', async () => {
            try {
                await window.Store.api('/api/push/test', { method: 'POST', body: {} });
                window.App.showToast('Test sent. It should appear in a moment.', 'success');
            } catch (err) {
                window.App.showToast(err.message === 'no_device_subscribed' ? 'Turn notifications on first.' : 'The test could not be sent.', 'error');
            }
        });
        refreshPushStatus();

        // ── Account & data ──
        document.getElementById('btn-export-data')?.addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(window.Store.exportData(), null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `lifeos-backup-${window.App.getToday()}.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        });

        const runImport = async (data, label) => {
            if (!confirm(`Import ${label}? Entries with the same name are replaced by the imported ones.`)) return;
            try {
                const count = await window.Store.importData(data);
                window.App.showToast(`Imported ${count} data sets`, 'success');
                window.App.reloadData();
            } catch (err) {
                window.App.showToast(err.message, 'error');
            }
        };

        const fileInput = document.getElementById('input-import-file');
        document.getElementById('btn-import-data')?.addEventListener('click', () => fileInput.click());
        fileInput?.addEventListener('change', async () => {
            const file = fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            try {
                await runImport(JSON.parse(await file.text()), `"${file.name}"`);
            } catch (err) {
                window.App.showToast('This file could not be read as a backup.', 'error');
            }
        });

        document.getElementById('btn-change-password')?.addEventListener('click', () => {
            window.App.showModal('Change password', `
                <div class="form-group">
                    <label class="form-label">Current password</label>
                    <input type="password" id="pw-current" class="form-input" autocomplete="current-password">
                </div>
                <div class="form-group">
                    <label class="form-label">New password (min. 8 characters)</label>
                    <input type="password" id="pw-next" class="form-input" autocomplete="new-password">
                </div>
            `, '<button class="btn btn-primary" id="btn-save-password">Save password</button>');
            document.getElementById('btn-save-password').addEventListener('click', async () => {
                try {
                    await window.Store.api('/api/auth/password', {
                        method: 'POST',
                        body: {
                            current: document.getElementById('pw-current').value,
                            next: document.getElementById('pw-next').value,
                        },
                    });
                    window.App.hideModal();
                    window.App.showToast('Password changed. Other devices were signed out.', 'success');
                } catch (err) {
                    const msg = err.message === 'invalid_credentials' ? 'The current password is wrong.'
                        : err.message === 'weak_password' ? 'The new password needs at least 8 characters.'
                        : 'Could not change the password.';
                    window.App.showToast(msg, 'error');
                }
            });
        });

        document.getElementById('btn-logout')?.addEventListener('click', async () => {
            if (await window.Store.logout()) window.location.reload();
        });

        document.getElementById('btn-save-profile')?.addEventListener('click', () => {
            const newProfile = {
                sex: document.getElementById('profile-sex').value,
                age: parseInt(document.getElementById('profile-age').value) || 25,
                weight: parseFloat(document.getElementById('profile-weight').value) || 75,
                height: parseInt(document.getElementById('profile-height').value) || 180,
                dietRestrictions: savedDiet,
                budget: document.getElementById('profile-budget').value,
                meal_prep: document.getElementById('profile-meal-prep').value,
                goals: {
                    muscle: document.getElementById('goal-muscle').checked,
                    skin: document.getElementById('goal-skin').checked,
                    hair: document.getElementById('goal-hair').checked
                }
            };
            localStorage.setItem('lifeos_profile', JSON.stringify(newProfile));
            if(window.App) window.App.showToast('Profile saved! Nutrition dynamically updated.', 'success');
            
            // If food module is initialized and we want to refresh its UI, we can trigger a re-render.
            // A simple page reload is also extremely clean for PWA settings changes.
            if(window.FoodModule && window.FoodModule.updateDailyTargets) {
                window.FoodModule.updateDailyTargets();
            }
        });
    }

    window.SettingsModule = { init, renderSection, pushEnabledHere };

})();
