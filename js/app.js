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
    };

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

        overlay.classList.remove('hidden');
    }

    /** Hide the modal overlay. */
    function hideModal() {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) overlay.classList.add('hidden');
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

    function _setupNavigation() {
        const navBtns   = Array.from(document.querySelectorAll('.nav-btn[data-section], .nav-btn-today[data-section]'));
        const sections  = document.querySelectorAll('.app-section');
        const titleEl   = document.getElementById('header-title');

        function switchTab(btn) {
            const target = btn.dataset.section;

            // Toggle active class on nav buttons
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Toggle active class on sections
            sections.forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(`section-${target}`);
            if (targetSection) targetSection.classList.add('active');

            // Update header title
            if (titleEl) titleEl.textContent = SECTION_TITLES[target] || 'LifeOS';

            // Re-render the target module's section for fresh data
            if (target === 'dashboard') {
                refreshDashboard();
            } else if (target === 'food' && modules.food) {
                modules.food.renderSection();
            } else if (target === 'sport' && modules.sport) {
                modules.sport.renderSection();
            } else if (target === 'bodycare' && modules.bodycare) {
                modules.bodycare.renderSection();
            } else if (target === 'calendar' && modules.calendar) {
                modules.calendar.renderSection();
            } else if (target === 'chat' && modules.chat) {
                modules.chat.renderSection();
            } else if (target === 'settings' && modules.settings) {
                modules.settings.renderSection();
            }
        }

        navBtns.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn));
        });

        // Swipe Navigation
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            let touchStartX = 0;
            let touchEndX = 0;

            mainContent.addEventListener('touchstart', e => {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });

            mainContent.addEventListener('touchend', e => {
                touchEndX = e.changedTouches[0].screenX;
                
                const threshold = 50; 
                const dx = touchEndX - touchStartX;
                
                // Check if it's a horizontal swipe (skip if too small)
                if (Math.abs(dx) < threshold) return;

                const activeIdx = navBtns.findIndex(b => b.classList.contains('active'));
                if (activeIdx === -1) return;

                if (dx < 0 && activeIdx < navBtns.length - 1) {
                    // Swiped left -> next tab
                    switchTab(navBtns[activeIdx + 1]);
                } else if (dx > 0 && activeIdx > 0) {
                    // Swiped right -> prev tab
                    switchTab(navBtns[activeIdx - 1]);
                }
            }, { passive: true });
        }
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

        // Refresh dashboard
        refreshDashboard();

        showToast('🌅 New day — data refreshed!', 'info');
    }

    // ── Service worker ───────────────────────────────────

    function _registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(() => {});
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
        modules.gamification = window.GamificationModule || null;
        modules.settings     = window.SettingsModule     || null;
        modules.rag          = window.RAGModule          || null;

        // Initialize each module in the specified order
        const initOrder = [
            modules.food,
            modules.sport,
            modules.bodycare,
            modules.calendar,
            modules.chat,
            modules.settings,
            modules.gamification,
            modules.rag,
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

    function _boot() {
        // 1. Register service worker
        _registerServiceWorker();

        // 2. Navigation
        _setupNavigation();

        // 3. Modal system
        _setupModal();

        // 4. Date display
        _setupDateDisplay();

        // 5. Inject SVG gradient for the timer ring
        _injectTimerGradient();

        // 6. Initialize all modules
        _initModules();

        // 7. Render dashboard widgets from each module
        refreshDashboard();

        // 8. Day-change detection (visibility API)
        _setupDayChangeDetection();
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
    };
})();
