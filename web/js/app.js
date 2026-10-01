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

    const THEME_COLORS = { dark: '#07071a', light: '#f4f6fb' };

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
        return new Date().toISOString().slice(0, 10);
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
        if (modules.settings && typeof modules.settings.renderDashboard === 'function') modules.settings.renderDashboard();
    }

    /**
     * Called by any module when a completion checkbox changes.
     * Updates XP / level in real-time.
     */
    function onCompletionChange() {
        if (modules.gamification) modules.gamification.recalculate();

        // Also update header XP bar in case gamification exposes data
        _refreshHeaderXP();
    }

    // ── Private helpers ──────────────────────────────────

    /** Update the small XP bar shown in the header. */
    function _refreshHeaderXP() {
        if (!modules.gamification) return;

        // GamificationModule is expected to keep #header-xp-fill
        // and #level-text up-to-date inside recalculate(), but we
        // invoke it again here in case the call came from outside.
        if (typeof modules.gamification.recalculate === 'function') {
            modules.gamification.recalculate();
        }
    }

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

        _renderSection(target);
        window.scrollTo(0, 0);
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
            if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
                hideModal();
            }
        });
    }

    // ── Date display ─────────────────────────────────────

    function _setupDateDisplay() {
        const dateEl = document.getElementById('header-date');
        if (!dateEl) return;

        const now = new Date();
        const formatted = now.toLocaleDateString('en-US', {
            weekday: 'long',
            month:   'long',
            day:     'numeric',
        });
        dateEl.textContent = formatted;
    }

    // ── Day-change detection ─────────────────────────────

    function _setupDayChangeDetection() {
        currentDate = getToday();

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return;

            const newDate = getToday();
            if (newDate !== currentDate) {
                currentDate = newDate;
                _onNewDay();
            }
        });
    }

    /** Handle everything that needs to happen at midnight roll. */
    function _onNewDay() {
        // Update header date
        _setupDateDisplay();

        // Regenerate today's meals if FoodModule supports it
        if (modules.food && typeof modules.food.generateDailyMeals === 'function') {
            modules.food.generateDailyMeals();
        }

        // Re-render all module sections so data is fresh
        if (modules.food)     modules.food.renderSection();
        if (modules.sport)    modules.sport.renderSection();
        if (modules.bodycare) modules.bodycare.renderSection();
        if (modules.calendar) modules.calendar.renderSection();
        if (modules.todo)     modules.todo.renderSection();
        if (modules.mail)     modules.mail.renderSection();

        // Refresh dashboard
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

    // ── SVG gradient for timer ring ──────────────────────

    function _injectTimerGradient() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.style.position = 'absolute';

        svg.innerHTML = `
            <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#6366f1"/>
                    <stop offset="100%" stop-color="#06b6d4"/>
                </linearGradient>
            </defs>
        `;

        document.body.appendChild(svg);
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
        _injectTimerGradient();
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
        getToday,
        getDayOfWeek,
        refreshDashboard,
        onCompletionChange,
        switchTab,
        setTheme,
        getTheme,
        reloadData,
    };
})();
