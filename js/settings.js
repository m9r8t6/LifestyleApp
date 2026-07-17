(function() {
    'use strict';

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
        const isLight = document.body.classList.contains('light-theme');

        const defaultProfile = { sex: 'male', age: 25, weight: 75, height: 180, goals: { muscle: false, skin: false, hair: false } };
        let profile = defaultProfile;
        try {
            const stored = localStorage.getItem('lifeos_profile');
            if (stored) profile = JSON.parse(stored);
        } catch(e) {}

        const html = `
            <div class="card-header-row">
                <div class="section-title" style="margin:0">
                    <div class="section-title-icon" style="background:rgba(255,255,255,0.1); color:var(--text);">
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
                        <button type="button" class="time-toggle-btn ${!isLight ? 'active' : ''}" id="btn-theme-dark">${t('dark_mode')}</button>
                        <button type="button" class="time-toggle-btn ${isLight ? 'active' : ''}" id="btn-theme-light">${t('light_mode')}</button>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label">${t('timer_sound')}</label>
                    <div class="time-toggle">
                        <button type="button" class="time-toggle-btn ${soundOn ? 'active' : ''}" id="btn-sound-on">${t('on')}</button>
                        <button type="button" class="time-toggle-btn ${!soundOn ? 'active' : ''}" id="btn-sound-off">${t('off')}</button>
                    </div>
                </div>

                <div class="form-group" style="margin-top: 24px; margin-bottom: 0;">
                    <label class="form-label">DeepSeek API Key (AI Recipe Macros)</label>
                    <input type="password" id="input-api-key" class="form-input" value="${localStorage.getItem('lifeos_deepseek_key') || ''}" placeholder="sk-..." style="font-family: monospace;">
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Stored locally in your browser. Never synced or shared.</p>
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
                
                <button class="btn btn-primary" id="btn-save-profile" style="width:100%; margin-top:24px;">Save Profile</button>
            </div>
        `;

        container.innerHTML = html;

        document.getElementById('btn-lang-en')?.addEventListener('click', () => { window.i18n.setLang('en'); renderSection(); });
        document.getElementById('btn-lang-de')?.addEventListener('click', () => { window.i18n.setLang('de'); renderSection(); });

        document.getElementById('btn-theme-light')?.addEventListener('click', () => { 
            document.body.classList.add('light-theme'); 
            localStorage.setItem('lifeos_theme', 'light');
            renderSection(); 
        });
        document.getElementById('btn-theme-dark')?.addEventListener('click', () => { 
            document.body.classList.remove('light-theme'); 
            localStorage.setItem('lifeos_theme', 'dark');
            renderSection(); 
        });

        document.getElementById('btn-sound-on')?.addEventListener('click', () => { 
            localStorage.setItem('lifeos_sound', 'on'); 
            renderSection(); 
        });
        document.getElementById('btn-sound-off')?.addEventListener('click', () => { 
            localStorage.setItem('lifeos_sound', 'off'); 
            renderSection(); 
        });

        document.getElementById('input-api-key')?.addEventListener('change', (e) => {
            localStorage.setItem('lifeos_deepseek_key', e.target.value.trim());
            if(window.App) window.App.showToast('API Key saved securely', 'success');
        });

        document.getElementById('btn-save-profile')?.addEventListener('click', () => {
            const newProfile = {
                sex: document.getElementById('profile-sex').value,
                age: parseInt(document.getElementById('profile-age').value) || 25,
                weight: parseFloat(document.getElementById('profile-weight').value) || 75,
                height: parseInt(document.getElementById('profile-height').value) || 180,
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

    // Apply theme on load
    if (localStorage.getItem('lifeos_theme') === 'light') {
        document.body.classList.add('light-theme');
    }

    window.SettingsModule = { init, renderSection };

})();
