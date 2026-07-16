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
    }

    // Apply theme on load
    if (localStorage.getItem('lifeos_theme') === 'light') {
        document.body.classList.add('light-theme');
    }

    window.SettingsModule = { init, renderSection };

})();
