/* =========================================================
 *  LifeOS — Main App Controller  (app.js)
 *  Orchestrates navigation, modals, toasts, module init,
 *  dashboard refresh, and day-change detection.
 * ========================================================= */

// ──────────────────────────────────────────────────────────
//  1. Global App object — available immediately so modules
//     loaded before this script can reference App.* helpers.
// ──────────────────────────────────────────────────────────

window.App = (() => {
    'use strict';

    // ── Section-name → header-title mapping ──────────────
    const SECTION_TITLES = {
        dashboard: 'Today',
        food:      'Food',
        sport:     'Sport',
        bodycare:  'Care',
        calendar:  'Calendar',
        chat:      'Assistant',
        todo:      'To-Do',
        mail:      'Mail',
        settings:  'Settings',
    };

    // Sections that live behind the "More" button of the bottom bar
    const MORE_SECTIONS = ['chat', 'todo', 'mail', 'calendar', 'settings'];

    const THEME_COLORS = { dark: '#151311', light: '#f5f0e6' };

    // ── Module registry (populated during init) ──────────
    const modules = {
        food:         null,
        sport:        null,
        bodycare:     null,
        calendar:     null,
        chat:         null,
        gamification: null,
        settings:     null,
    };

    // Tracks the current date so we can detect midnight rolls
    let currentDate = '';

    // ── Public API ───────────────────────────────────────

    /**
     * Show the bottom-sheet modal.
     * @param {string} title   - Modal heading text
     * @param {string} bodyHTML  - Inner HTML for the body
     * @param {string} [footerHTML=''] - Inner HTML for the footer
     */
    function showModal(title, bodyHTML, footerHTML = '') {
        const overlay = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const bodyEl  = document.getElementById('modal-body');
        const footerEl = document.getElementById('modal-footer');

        if (!overlay) return;

        titleEl.textContent = title;
        bodyEl.innerHTML    = bodyHTML;
        footerEl.innerHTML  = footerHTML;

        // Show / hide footer container when there's no content
        footerEl.style.display = footerHTML ? '' : 'none';

        overlay.classList.remove('hidden', 'closing');
        bodyEl.scrollTop = 0;
        document.body.classList.add('no-scroll');
    }

    /**
     * Ask a yes/no question in a dialog that matches the app (replaces the browser's own pop-up).
     * @param {string} message
     * @param {{title?:string, okLabel?:string, cancelLabel?:string, danger?:boolean}} [options]
     * @returns {Promise<boolean>}
     */
    function confirmDialog(message, options = {}) {
        return new Promise(resolve => {
            const overlay = document.getElementById('confirm-overlay');
            document.getElementById('confirm-title').textContent = options.title || '';
            document.getElementById('confirm-title').style.display = options.title ? '' : 'none';
            document.getElementById('confirm-message').textContent = message;
            const ok = document.getElementById('confirm-ok');
            const cancel = document.getElementById('confirm-cancel');
            ok.textContent = options.okLabel || 'OK';
            ok.className = options.danger ? 'btn btn-danger-solid' : 'btn btn-primary';
            cancel.textContent = options.cancelLabel || 'Cancel';

            const close = (answer) => {
                overlay.classList.add('hidden');
                ok.onclick = cancel.onclick = overlay.onclick = null;
                document.removeEventListener('keydown', onKey);
                resolve(answer);
            };
            const onKey = (e) => { if (e.key === 'Escape') close(false); };
            ok.onclick = () => close(true);
            cancel.onclick = () => close(false);
            overlay.onclick = (e) => { if (e.target === overlay) close(false); };
            document.addEventListener('keydown', onKey);
            overlay.classList.remove('hidden');
            ok.focus();
        });
    }

    /** Hide the modal overlay. */
    function hideModal() {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay || overlay.classList.contains('hidden')) return;
        overlay.classList.add('closing');
        document.body.classList.remove('no-scroll');
        setTimeout(() => {
            if (overlay.classList.contains('closing')) {
                overlay.classList.add('hidden');
                overlay.classList.remove('closing');
            }
        }, 180);
    }

    /**
     * Display a toast notification.
     * @param {string} message - Display text
     * @param {'success'|'error'|'info'} [type='info'] - Visual style
     */
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        // Trigger reflow so the entrance transition plays
        requestAnimationFrame(() => toast.classList.add('show'));

        // Auto-dismiss after 3 s
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
            // Safety fallback if transitionend never fires
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
        }, 3000);
    }

    /**
     * @returns {string} Today's date as 'YYYY-MM-DD'.
     */
    function getToday() {
        // Local calendar day (not UTC), so the day changes at midnight where the user is
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    /** Add days to a 'YYYY-MM-DD' string (pure calendar math, no time zones involved). */
    function addDays(dateStr, days) {
        const d = new Date(`${dateStr}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
    }

    /** Escape text before it is placed into HTML. */
    function esc(text) {
        return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /**
     * Ask the AI through the server. Returns the answer text.
     * @param {Array<{role:string, content:string}>} messages
     * @param {{temperature?:number, json?:boolean, max_tokens?:number}} [options]
     */
    async function ai(messages, options = {}) {
        const body = { messages };
        if (typeof options.temperature === 'number') body.temperature = options.temperature;
        if (options.max_tokens) body.max_tokens = options.max_tokens;
        if (options.json) body.response_format = { type: 'json_object' };
        let data;
        try {
            data = await window.Store.api('/api/ai/chat', { method: 'POST', body, timeout: 120000 });
        } catch (err) {
            throw new Error(err.status ? err.message : 'The assistant cannot be reached. Check your connection.');
        }
        const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!content) throw new Error('The assistant returned an empty answer.');
        return content.trim();
    }

    /** Parse JSON from an AI answer, tolerating code fences and surrounding text. */
    function parseAIJson(text) {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        let candidate = (fenced ? fenced[1] : text).trim();
        const start = candidate.search(/[\[{]/);
        const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
        if (start > -1 && end > start) candidate = candidate.slice(start, end + 1);
        return JSON.parse(candidate);
    }

    /**
     * @returns {number} Day of week 0-6 (Sunday = 0).
     */
    function getDayOfWeek() {
        return new Date().getDay();
    }

    /**
     * Refresh every dashboard block and recalculate gamification.
     */
    function refreshDashboard() {
        if (modules.food && typeof modules.food.renderDashboard === 'function') modules.food.renderDashboard();
        if (modules.sport && typeof modules.sport.renderDashboard === 'function') modules.sport.renderDashboard();
        if (modules.bodycare && typeof modules.bodycare.renderDashboard === 'function') modules.bodycare.renderDashboard();
        if (modules.calendar && typeof modules.calendar.renderDashboard === 'function') modules.calendar.renderDashboard();
        if (modules.todo && typeof modules.todo.renderDashboard === 'function') modules.todo.renderDashboard();
        if (modules.gamification && typeof modules.gamification.recalculate === 'function') modules.gamification.recalculate();
        if (window.Dashboard) window.Dashboard.render();
    }

    /**
     * Called by any module when a completion checkbox changes.
     * Updates XP / level in real-time.
     */
    function onCompletionChange() {
        if (modules.gamification) modules.gamification.recalculate();
        if (window.Dashboard && activeSection === 'dashboard') window.Dashboard.render();
    }

    // ── Private helpers ──────────────────────────────────

    // ── Navigation ───────────────────────────────────────

    let activeSection = 'dashboard';

    function _renderSection(target) {
        if (target === 'dashboard') {
            refreshDashboard();
        } else if (modules[target] && typeof modules[target].renderSection === 'function') {
            modules[target].renderSection();
        }
    }

    function switchTab(target) {
        const section = document.getElementById(`section-${target}`);
        if (!section) return;
        activeSection = target;

        document.querySelectorAll('#bottom-nav [data-section]').forEach(b => {
            b.classList.toggle('active', b.dataset.section === target);
        });
        const moreBtn = document.getElementById('nav-more');
        if (moreBtn) moreBtn.classList.toggle('active', MORE_SECTIONS.includes(target));
        document.querySelectorAll('.more-item').forEach(b => {
            b.classList.toggle('active', b.dataset.section === target);
        });

        document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active', 'entering'));
        section.classList.add('active', 'entering');
        // Entry animations only play when a section is opened, not on every re-render
        clearTimeout(section._enterTimer);
        section._enterTimer = setTimeout(() => section.classList.remove('entering'), 700);

        const titleEl = document.getElementById('header-title');
        if (titleEl) titleEl.textContent = SECTION_TITLES[target] || 'LifeOS';
        document.body.dataset.section = target;

        // Let the module reset what should start fresh each time it is opened
        if (modules[target] && typeof modules[target].onShow === 'function') modules[target].onShow();
        _renderSection(target);
        // A conversation is read from the bottom; everything else starts at the top
        if (target === 'chat') window.scrollTo(0, document.body.scrollHeight);
        else window.scrollTo(0, 0);
    }

    function _toggleMore(open) {
        const sheet = document.getElementById('more-sheet');
        if (!sheet) return;
        const show = open === undefined ? sheet.classList.contains('hidden') : open;
        sheet.classList.toggle('hidden', !show);
    }

    function _setupNavigation() {
        document.querySelectorAll('#bottom-nav [data-section], .more-item[data-section]').forEach(btn => {
            btn.addEventListener('click', () => {
                _toggleMore(false);
                switchTab(btn.dataset.section);
            });
        });

        const moreBtn = document.getElementById('nav-more');
        if (moreBtn) moreBtn.addEventListener('click', () => _toggleMore());
        const sheet = document.getElementById('more-sheet');
        if (sheet) sheet.addEventListener('click', (e) => { if (e.target === sheet) _toggleMore(false); });

        document.querySelector('#section-dashboard').classList.add('entering');
        document.body.dataset.section = 'dashboard';
    }

    // ── Theme ────────────────────────────────────────────

    /** @param {'system'|'light'|'dark'} mode */
    function setTheme(mode) {
        localStorage.setItem('lifeos_theme', mode);
        _applyTheme();
    }

    function getTheme() {
        return localStorage.getItem('lifeos_theme') || 'light';
    }

    function _applyTheme() {
        const mode = getTheme();
        const light = mode === 'light' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
        document.documentElement.classList.toggle('light-theme', light);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = light ? THEME_COLORS.light : THEME_COLORS.dark;
    }

    // ── Save status ──────────────────────────────────────

    const SYNC_LABELS = {
        idle: 'All changes saved',
        syncing: 'Saving…',
        pending: 'Saving…',
        offline: 'Offline — changes are kept on this device and saved once you are back online',
    };

    function _setupSyncIndicator() {
        const dot = document.getElementById('sync-indicator');
        if (!dot || !window.Store) return;
        const update = () => {
            dot.dataset.state = window.Store.status;
            dot.setAttribute('aria-label', SYNC_LABELS[window.Store.status]);
        };
        window.Store.on('status', update);
        update();
        dot.addEventListener('click', () => {
            let msg = SYNC_LABELS[window.Store.status];
            if (window.Store.status === 'idle' && window.Store.lastSync) {
                msg += ` · ${new Date(window.Store.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            }
            showToast(msg, window.Store.status === 'offline' ? 'error' : 'info');
            window.Store.sync();
        });
    }

    /** Re-read everything from storage after another device changed it. */
    function reloadData() {
        const busy = !document.getElementById('modal-overlay').classList.contains('hidden')
            || !document.getElementById('timer-overlay').classList.contains('hidden')
            || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName);
        if (busy) {
            // Do not pull the screen away from under the user; try again shortly.
            clearTimeout(reloadData._retry);
            reloadData._retry = setTimeout(reloadData, 4000);
            return;
        }
        ['food', 'sport', 'bodycare', 'calendar', 'chat', 'todo', 'gamification'].forEach(name => {
            const mod = modules[name];
            if (mod && typeof mod.init === 'function') {
                try { mod.init(); } catch (err) { console.error('[LifeOS] Module reload failed:', err); }
            }
        });
        if (window.FoodModule && window.FoodModule.updateDailyTargets) window.FoodModule.updateDailyTargets();
        if (window.i18n) window.i18n.reload();
        _renderSection(activeSection);
        if (activeSection !== 'dashboard') refreshDashboard();
    }

    // ── Modal system ─────────────────────────────────────

    function _setupModal() {
        const overlay   = document.getElementById('modal-overlay');
        const closeBtn  = document.getElementById('modal-close');
        const container = document.getElementById('modal-container');

        if (!overlay) return;

        // Close button
        if (closeBtn) {
            closeBtn.addEventListener('click', hideModal);
        }

        // Bottom sheet: swipe the header down to close
        const header = container.querySelector('.modal-header');
        let startY = null;
        header.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
        header.addEventListener('touchmove', (e) => {
            if (startY === null) return;
            const dy = Math.max(0, e.touches[0].clientY - startY);
            container.style.transform = `translateY(${dy}px)`;
            container.style.transition = 'none';
        }, { passive: true });
        header.addEventListener('touchend', (e) => {
            if (startY === null) return;
            const dy = e.changedTouches[0].clientY - startY;
            startY = null;
            container.style.transition = '';
            container.style.transform = '';
            if (dy > 90) hideModal();
        });

        // Click on overlay backdrop (but NOT the modal container itself)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) hideModal();
        });

        // Escape key closes modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !overlay.classList.contains('hidden') && document.getElementById('confirm-overlay').classList.contains('hidden')) {
                hideModal();
            }
        });
    }

    // ── Date display ─────────────────────────────────────

    function _setupDateDisplay() {
        const dateEl = document.getElementById('header-date');
        if (!dateEl) return;

        const now = new Date();
        const lang = window.i18n && window.i18n.getLang() === 'de' ? 'de-DE' : 'en-US';
        const formatted = now.toLocaleDateString(lang, {
            weekday: 'long',
            month:   'long',
            day:     'numeric',
        });
        dateEl.textContent = formatted;
    }

    // ── Day-change detection ─────────────────────────────

    function _setupDayChangeDetection() {
        currentDate = getToday();

        const check = () => {
            if (document.hidden) return;
            const newDate = getToday();
            if (newDate !== currentDate) {
                currentDate = newDate;
                _onNewDay();
            }
        };
        document.addEventListener('visibilitychange', check);
        setInterval(check, 60000);
    }

    /** Handle everything that needs to happen at midnight roll. */
    function _onNewDay() {
        // Update header date
        _setupDateDisplay();

        // Reload every module so daily checklists start fresh
        ['food', 'sport', 'bodycare', 'calendar', 'todo', 'gamification'].forEach(name => {
            const mod = modules[name];
            if (mod && typeof mod.init === 'function') {
                try { mod.init(); } catch (err) { console.error('[LifeOS] New-day reload failed:', err); }
            }
        });
        _renderSection(activeSection);
        refreshDashboard();

        showToast('New day — data refreshed', 'info');
    }

    // ── Service worker ───────────────────────────────────

    function _registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(() => {});
            // A new version took over: reload once so old and new files are not mixed
            let hadController = Boolean(navigator.serviceWorker.controller);
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (hadController) window.location.reload();
                hadController = true;
            });
        }
    }

    // ── Module initialization ────────────────────────────

    function _initModules() {
        // Grab module references from the global scope.
        // These are already defined because their <script> tags load before app.js.
        modules.food         = window.FoodModule         || null;
        modules.sport        = window.SportModule        || null;
        modules.bodycare     = window.BodycareModule     || null;
        modules.calendar     = window.CalendarModule     || null;
        modules.chat         = window.ChatModule         || null;
        modules.todo         = window.TodoModule         || null;
        modules.mail         = window.MailModule         || null;
        modules.gamification = window.GamificationModule || null;
        modules.settings     = window.SettingsModule     || null;
        modules.google       = window.GoogleModule       || null;

        // Initialize each module in the specified order
        const initOrder = [
            modules.food,
            modules.sport,
            modules.bodycare,
            modules.calendar,
            modules.chat,
            modules.todo,
            modules.mail,
            modules.settings,
            modules.gamification,
            modules.google,
        ];

        initOrder.forEach(mod => {
            if (mod && typeof mod.init === 'function') {
                try {
                    mod.init();
                } catch (err) {
                    console.error('[LifeOS] Module init failed:', err);
                }
            }
        });
    }

    // ── Boot sequence (called on DOMContentLoaded) ───────

    async function _boot() {
        _applyTheme();
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', _applyTheme);
        _registerServiceWorker();
        _setupNavigation();
        _setupModal();
        _setupDateDisplay();
        _setupSyncIndicator();

        // 1. Who is signed in? (shows the sign-in screen when needed)
        const session = await window.Auth.ensureSession();

        // 2. Load the saved data before any module touches it. A device that has
        //    synced before starts from its cache if the server is slow or offline.
        if (!session.offline) {
            if (window.Store.hasCache) {
                await window.Store.sync({ timeout: 3500 });
            } else {
                _setLoading('Loading your data…');
                while (!await window.Store.firstSync()) {
                    _setLoading('The server cannot be reached. Retrying…');
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
        }
        _setLoading(null);

        // 3. Start the app
        if (window.i18n) window.i18n.reload();
        _initModules();
        refreshDashboard();
        _setupDayChangeDetection();

        // Opened from a notification: go straight to the screen it was about
        const openSection = (url) => {
            const target = new URL(url, window.location.href).searchParams.get('open');
            if (target && document.getElementById(`section-${target}`)) switchTab(target);
        };
        if (new URLSearchParams(window.location.search).has('open')) {
            openSection(window.location.href);
            history.replaceState(null, '', window.location.pathname);
        }
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (e) => {
                if (e.data && e.data.type === 'open') openSection(e.data.url);
            });
        }

        // 4. Keep saving in the background
        window.Store.on('remote', reloadData);
        window.Store.on('auth', () => {
            window.Auth.prompt('login', 'Please sign in again.').then(() => window.Store.sync());
        });
        window.Store.start();
    }

    function _setLoading(message) {
        const el = document.getElementById('app-loading');
        if (!el) return;
        el.classList.toggle('hidden', !message);
        if (message) el.querySelector('.app-loading-text').textContent = message;
    }

    // ── DOMContentLoaded listener ────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _boot);
    } else {
        // DOM already parsed (unlikely since app.js is not deferred, but be safe)
        _boot();
    }

    // ── Return public API ────────────────────────────────

    return {
        showModal,
        hideModal,
        showToast,
        confirm: confirmDialog,
        getToday,
        addDays,
        esc,
        ai,
        parseAIJson,
        getDayOfWeek,
        refreshDashboard,
        onCompletionChange,
        switchTab,
        setTheme,
        getTheme,
        reloadData,
    };
})();
