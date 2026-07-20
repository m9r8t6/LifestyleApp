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

        const defaultProfile = { sex: 'male', age: 25, weight: 75, height: 180, diet: 'vegetarian', goals: { muscle: false, skin: false, hair: false } };
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
                    <label class="form-label">DeepSeek API Key (AI Recipe Macros & Chat)</label>
                    <input type="password" id="input-api-key" class="form-input" value="${localStorage.getItem('lifeos_deepseek_key') || ''}" placeholder="sk-..." style="font-family: monospace;">
                </div>
                
                <div class="form-group" style="margin-top: 12px; margin-bottom: 0;">
                    <label class="form-label">HuggingFace API Token (For RAG Embeddings)</label>
                    <input type="password" id="input-hf-key" class="form-input" value="${localStorage.getItem('lifeos_hf_token') || ''}" placeholder="hf_..." style="font-family: monospace;">
                </div>

                <div class="form-group" style="margin-top: 12px; margin-bottom: 0;">
                    <label class="form-label">Google Cloud Client ID (For Drive RAG)</label>
                    <input type="text" id="input-google-client" class="form-input" value="${localStorage.getItem('lifeos_google_client_id') || ''}" placeholder="...apps.googleusercontent.com" style="font-family: monospace;">
                </div>

                <div style="margin-top: 16px; display:flex; gap:8px;">
                    <button class="btn btn-secondary btn-sm" id="btn-auth-drive" style="flex:1; border:1px dashed var(--accent); color:var(--accent);">${window.RAGModule && window.RAGModule.isReady ? 'Drive Connected ✅' : 'Connect Google Drive'}</button>
                    <button class="btn btn-secondary btn-sm" id="btn-sync-drive" style="flex:1; border:1px dashed var(--primary-light); color:var(--primary-light); display:${window.RAGModule && window.RAGModule.isReady ? 'block' : 'none'};">Sync to Drive</button>
                    <button class="btn btn-secondary btn-sm" id="btn-restore-drive" style="flex:1; border:1px dashed var(--warning, #f59e0b); color:var(--warning, #f59e0b); display:${window.RAGModule && window.RAGModule.isReady ? 'block' : 'none'};">Restore from Drive</button>
                </div>
                <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 8px;">Keys are stored locally in your browser. Never synced or shared.</p>
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
                            <button id="btn-add-diet" class="btn btn-secondary" style="padding:0 12px; font-weight:bold; background:var(--bg-glass); border:1px solid rgba(255,255,255,0.1); color:var(--text); border-radius:6px; cursor:pointer;">+</button>
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
                
                <div class="form-group" style="margin-top: 24px; margin-bottom: 0;">
                    <label class="form-label">Custom Big 3 Lifts & Multipliers</label>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">Define your primary lifts to track community standing (Multiplier × Bodyweight).</div>
                    ${(() => {
                        const b3 = profile.big3 || [
                            { name: 'Bench Press', int: 1.0, adv: 1.5 },
                            { name: 'Squat', int: 1.3, adv: 1.8 },
                            { name: 'Deadlift', int: 1.5, adv: 2.0 }
                        ];
                        return b3.map((lift, i) => `
                            <div style="background:rgba(255,255,255,0.03); padding:8px; border-radius:8px; margin-bottom:8px; display:flex; flex-direction:column; gap:6px;">
                                <input type="text" id="b3-name-${i}" class="form-input" style="font-size:0.8rem; padding:6px;" placeholder="Lift Name" value="${lift.name}">
                                <div style="display:flex; gap:8px;">
                                    <div style="flex:1;"><div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:2px;">Intermediate (xBW)</div><input type="number" step="0.1" id="b3-int-${i}" class="form-input" style="font-size:0.8rem; padding:6px;" value="${lift.int}"></div>
                                    <div style="flex:1;"><div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:2px;">Advanced (xBW)</div><input type="number" step="0.1" id="b3-adv-${i}" class="form-input" style="font-size:0.8rem; padding:6px;" value="${lift.adv}"></div>
                                </div>
                            </div>
                        `).join('');
                    })()}
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
                <div style="background:var(--primary-light); color:white; padding:4px 10px; border-radius:12px; font-size:0.75rem; display:flex; align-items:center; gap:6px;">
                    ${d} <span style="cursor:pointer; font-weight:bold;" onclick="window.removeDiet(${i})">×</span>
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
            if(window.App) window.App.showToast('DeepSeek API Key saved', 'success');
        });
        
        document.getElementById('input-hf-key')?.addEventListener('change', (e) => {
            localStorage.setItem('lifeos_hf_token', e.target.value.trim());
            if(window.App) window.App.showToast('HuggingFace Token saved', 'success');
        });

        document.getElementById('input-google-client')?.addEventListener('change', (e) => {
            localStorage.setItem('lifeos_google_client_id', e.target.value.trim());
            if(window.App) window.App.showToast('Google Client ID saved', 'success');
        });

        document.getElementById('btn-auth-drive')?.addEventListener('click', () => {
            if (window.RAGModule) window.RAGModule.authGoogle();
        });

        document.getElementById('btn-sync-drive')?.addEventListener('click', () => {
            if (window.RAGModule) window.RAGModule.syncToDrive();
        });

        document.getElementById('btn-restore-drive')?.addEventListener('click', () => {
            if (window.RAGModule) window.RAGModule.restoreFromDrive();
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
                big3: [
                    { name: document.getElementById('b3-name-0').value.trim(), int: parseFloat(document.getElementById('b3-int-0').value) || 1.0, adv: parseFloat(document.getElementById('b3-adv-0').value) || 1.5 },
                    { name: document.getElementById('b3-name-1').value.trim(), int: parseFloat(document.getElementById('b3-int-1').value) || 1.3, adv: parseFloat(document.getElementById('b3-adv-1').value) || 1.8 },
                    { name: document.getElementById('b3-name-2').value.trim(), int: parseFloat(document.getElementById('b3-int-2').value) || 1.5, adv: parseFloat(document.getElementById('b3-adv-2').value) || 2.0 }
                ],
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
