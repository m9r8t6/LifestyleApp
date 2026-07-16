/* ============================================================
   LifeOS — Gamification Module
   XP system, leveling, streaks, and dashboard progress display
   ============================================================ */

window.GamificationModule = (() => {
    'use strict';

    // ─── Constants ───
    const STORAGE_KEY = 'lifeos_gamification';
    const XP_PER_MEAL      = 10;
    const XP_PER_EXERCISE  = 5;
    const XP_PER_ROUTINE   = 5;
    const XP_FULL_DAY      = 50;
    const XP_STREAK_MULT   = 5;

    // ─── State ───
    let data = {
        xp: 0,
        level: 1,
        streak: 0,
        lastCompletedDate: null,
        history: {} // { 'YYYY-MM-DD': { score: number } }
    };

    // ─── Persistence ───

    /** Load gamification data from localStorage */
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                data = { ...data, ...parsed };
            }
        } catch (e) {
            console.warn('[Gamification] Failed to load data:', e);
        }
    }

    /** Save gamification data to localStorage */
    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('[Gamification] Failed to save data:', e);
        }
    }

    // ─── XP & Level Helpers ───

    /**
     * Calculate cumulative XP required to reach a given level.
     * Level N requires N × 100 XP, so cumulative = sum(1..N) × 100 = N(N+1)/2 × 100
     * But we consider levels 1-based: to BE level L you need sum(1..L-1) × 100
     * Actually per spec: Level 1 requires 100 XP, Level 2 requires 200 XP, etc.
     * So cumulative XP to reach level L = sum(k=1 to L-1) of k×100
     */
    function cumulativeXPForLevel(level) {
        // XP needed to have completed all levels up to `level`
        // i.e., total XP thresholds for levels 1 through level-1
        // Level 1 threshold: 100, Level 2: 200, ...
        let total = 0;
        for (let k = 1; k < level; k++) {
            total += k * 100;
        }
        return total;
    }

    /** XP required to go from current level to next level */
    function xpForNextLevel(level) {
        return level * 100;
    }

    /** Calculate level from total XP */
    function calcLevel(totalXP) {
        let level = 1;
        let cumulative = 0;
        while (cumulative + level * 100 <= totalXP) {
            cumulative += level * 100;
            level++;
        }
        return level;
    }

    /** XP progress within current level (0 to xpForNextLevel) */
    function xpInCurrentLevel(totalXP) {
        const level = calcLevel(totalXP);
        const cum = cumulativeXPForLevel(level);
        return totalXP - cum;
    }

    /** XP progress percentage within current level */
    function xpProgressPercent(totalXP) {
        const level = calcLevel(totalXP);
        const inLevel = xpInCurrentLevel(totalXP);
        const needed = xpForNextLevel(level);
        return Math.min(100, Math.round((inLevel / needed) * 100));
    }

    // ─── Completion Data Helpers ───

    /** Safely get completion data from a module, returns {completed, total} */
    function safeGetCompletion(moduleName, method = 'getCompletionData') {
        try {
            if (window[moduleName] && typeof window[moduleName][method] === 'function') {
                const result = window[moduleName][method]();
                return {
                    completed: result?.completed ?? 0,
                    total: result?.total ?? 0
                };
            }
        } catch (e) {
            console.warn(`[Gamification] Error reading ${moduleName}.${method}():`, e);
        }
        return { completed: 0, total: 0 };
    }

    /** Get category-specific completion from BodycareModule */
    function safeGetCategoryCompletion(category) {
        try {
            if (window.BodycareModule && typeof window.BodycareModule.getCategoryCompletion === 'function') {
                const result = window.BodycareModule.getCategoryCompletion(category);
                return {
                    completed: result?.completed ?? 0,
                    total: result?.total ?? 0
                };
            }
        } catch (e) {
            console.warn(`[Gamification] Error reading BodycareModule.getCategoryCompletion('${category}'):`, e);
        }
        return { completed: 0, total: 0 };
    }

    /** Calculate completion percentage from {completed, total} */
    function pct(data) {
        if (!data.total || data.total === 0) return 0;
        return Math.round((data.completed / data.total) * 100);
    }

    // ─── Streak Logic ───

    /** Check and update streak based on yesterday's completion */
    function checkStreak() {
        const today = App.getToday();
        const yesterday = getYesterday();

        // If we already checked today, skip
        if (data.lastCompletedDate === today) return;

        // Check if yesterday was fully completed
        if (data.history[yesterday] && data.history[yesterday].score === 100) {
            data.streak = (data.streak || 0) + 1;
        } else if (data.lastCompletedDate !== yesterday) {
            // Yesterday wasn't recorded at all — reset streak
            data.streak = 0;
        }

        data.lastCompletedDate = today;
        save();
    }

    /** Get yesterday's date string */
    function getYesterday() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    // ─── Recalculation ───

    /** Recalculate XP, level, and update all displays */
    function recalculate() {
        const today = App.getToday();

        // Gather completion data from all modules
        const food = safeGetCompletion('FoodModule');
        const sport = safeGetCompletion('SportModule');
        const teeth = safeGetCategoryCompletion('teeth');
        const skincare = safeGetCategoryCompletion('skincare');
        const hair = safeGetCategoryCompletion('hair');

        // Calculate today's XP earnings
        let todayXP = 0;
        todayXP += food.completed * XP_PER_MEAL;
        todayXP += sport.completed * XP_PER_EXERCISE;
        todayXP += (teeth.completed + skincare.completed + hair.completed) * XP_PER_ROUTINE;

        // Calculate overall completion for full-day bonus
        const totalCompleted = food.completed + sport.completed + teeth.completed + skincare.completed + hair.completed;
        const totalItems = food.total + sport.total + teeth.total + skincare.total + hair.total;
        const overallPct = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;

        // Full day completion bonus
        if (overallPct === 100 && totalItems > 0) {
            todayXP += XP_FULL_DAY;
        }

        // Streak bonus
        if (data.streak > 0) {
            todayXP += data.streak * XP_STREAK_MULT;
        }

        // Store today's score in history
        if (!data.history) data.history = {};
        data.history[today] = { score: overallPct };

        // Calculate base XP (sum of all history days except today)
        let historicalXP = 0;
        for (const [date, entry] of Object.entries(data.history)) {
            if (date !== today && entry.score !== undefined) {
                // Approximate: award some XP based on historical score
                // We keep it simple — the persistent XP is tracked cumulatively
            }
        }

        // Update XP: we only add today's XP on top of previously saved base
        const previousTodayXP = data._todayXP || 0;
        const baseXP = data.xp - previousTodayXP;
        data.xp = Math.max(0, baseXP) + todayXP;
        data._todayXP = todayXP;

        // Check for level up
        const oldLevel = data.level;
        const newLevel = calcLevel(data.xp);
        data.level = newLevel;

        if (newLevel > oldLevel) {
            // Level up! 🎉
            setTimeout(() => {
                App.showToast(`🎉 Level Up! You reached Level ${newLevel}!`, 'success');
            }, 300);
        }

        save();
        updateHeaderXP();
        renderDashboard();
    }

    // ─── Header XP Bar ───

    /** Update the XP bar and level text in the header */
    function updateHeaderXP() {
        const xpFill = document.getElementById('header-xp-fill');
        const levelText = document.getElementById('level-text');

        if (xpFill) {
            xpFill.style.width = `${xpProgressPercent(data.xp)}%`;
        }
        if (levelText) {
            levelText.textContent = `Lvl ${data.level}`;
        }
    }

    // ─── Dashboard Rendering ───

    /** Render the progress section on the dashboard */
    function renderDashboard() {
        const container = document.getElementById('dashboard-progress');
        if (!container) return;

        // Gather all completion data
        const food = safeGetCompletion('FoodModule');
        const sport = safeGetCompletion('SportModule');
        const teeth = safeGetCategoryCompletion('teeth');
        const skincare = safeGetCategoryCompletion('skincare');
        const hair = safeGetCategoryCompletion('hair');

        // Compute percentages
        const foodPct = pct(food);
        const sportPct = pct(sport);
        const teethPct = pct(teeth);
        const skincarePct = pct(skincare);
        const hairPct = pct(hair);

        // Overall: average of all individual percentages
        const categories = [foodPct, sportPct, teethPct, skincarePct, hairPct];
        const activeCats = categories.length;
        const overallPct = activeCats > 0
            ? Math.round(categories.reduce((a, b) => a + b, 0) / activeCats)
            : 0;

        // Determine streak display
        const streakHTML = data.streak > 0
            ? `<div class="streak-badge">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c0 0-4 4-4 9s3 6 3 9c0 0 2-2 2-4s2 1 2 4c0-3 3-6 3-9s-4-9-4-9z"/></svg>
                   ${data.streak} day streak
               </div>`
            : `<div class="streak-badge" style="opacity:0.5">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c0 0-4 4-4 9s3 6 3 9c0 0 2-2 2-4s2 1 2 4c0-3 3-6 3-9s-4-9-4-9z"/></svg>
                   No streak yet
               </div>`;

        // XP info for display
        const currentLevelXP = xpInCurrentLevel(data.xp);
        const neededXP = xpForNextLevel(data.level);

        // SVG Icons
        const svgFood = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`;
        const svgSport = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 000 20 14.5 14.5 0 000-20"/><path d="M2 12h20"/></svg>`;
        const svgCare = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`;
        const svgOverall = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;

        // Build progress rows config
        const rows = [
            { emoji: svgFood, label: 'Nutrition',  pct: foodPct,     grad: 'grad-primary', detail: `${food.completed}/${food.total}` },
            { emoji: svgSport, label: 'Sport',      pct: sportPct,    grad: 'grad-accent',  detail: `${sport.completed}/${sport.total}` },
            { emoji: svgCare, label: 'Teeth',      pct: teethPct,    grad: 'grad-success', detail: `${teeth.completed}/${teeth.total}` },
            { emoji: svgCare, label: 'Skincare',   pct: skincarePct, grad: 'grad-warm',    detail: `${skincare.completed}/${skincare.total}` },
            { emoji: svgCare, label: 'Hair',       pct: hairPct,     grad: 'grad-accent',  detail: `${hair.completed}/${hair.total}` },
            { emoji: svgOverall, label: 'Overall',    pct: overallPct,  grad: 'grad-success', detail: '' },
        ];

        container.innerHTML = `
            <div class="glass-card">
                <!-- Hero: Overall Percentage -->
                <div style="text-align:center; margin-bottom:20px;">
                    <div style="position:relative; display:inline-block; width:120px; height:120px; margin-bottom:12px;">
                        <svg viewBox="0 0 120 120" style="width:120px; height:120px; transform:rotate(-90deg);">
                            <circle cx="60" cy="60" r="52" fill="none"
                                    stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
                            <circle cx="60" cy="60" r="52" fill="none"
                                    stroke="url(#progressGrad)" stroke-width="8"
                                    stroke-linecap="round"
                                    stroke-dasharray="${2 * Math.PI * 52}"
                                    stroke-dashoffset="${2 * Math.PI * 52 * (1 - overallPct / 100)}"
                                    style="transition: stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1);"/>
                            <defs>
                                <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stop-color="#6366f1"/>
                                    <stop offset="100%" stop-color="#06b6d4"/>
                                </linearGradient>
                            </defs>
                        </svg>
                        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column;">
                            <span style="font-size:2rem; font-weight:800; letter-spacing:-0.02em; line-height:1;">
                                ${overallPct}%
                            </span>
                            <span style="font-size:0.65rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em;">
                                complete
                            </span>
                        </div>
                    </div>

                    <!-- Streak & XP Info Row -->
                    <div style="display:flex; align-items:center; justify-content:center; gap:12px; flex-wrap:wrap;">
                        ${streakHTML}
                        <div style="display:inline-flex; align-items:center; gap:6px; padding:6px 14px;
                                    background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.25);
                                    border-radius:9999px; font-size:0.82rem; font-weight:700; color:var(--primary-light);">
                            <span>⚡</span>
                            ${currentLevelXP} / ${neededXP} XP
                        </div>
                    </div>
                </div>

                <!-- Divider -->
                <div class="divider"></div>

                <!-- Category Progress Bars -->
                ${rows.map((row, i) => `
                    <div class="progress-row stagger-item" style="animation-delay:${i * 60}ms;">
                        <span class="progress-emoji">${row.emoji}</span>
                        <div class="progress-info">
                            <div class="progress-label">
                                <span>${row.label}</span>
                                <span class="progress-pct">${row.pct}%${row.detail ? ` (${row.detail})` : ''}</span>
                            </div>
                            <div class="progress-track">
                                <div class="progress-fill ${row.grad}" style="width:${row.pct}%;"></div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ─── Public API ───

    return {
        /** Initialize: load persisted data, check streak, update header */
        init() {
            load();
            checkStreak();
            updateHeaderXP();
        },

        /** Render the dashboard progress section */
        renderDashboard,

        /** Recalculate XP from all modules and update displays */
        recalculate,

        /** Get current player level */
        getLevel() {
            return data.level;
        },

        /** Get current streak count */
        getStreak() {
            return data.streak;
        }
    };
})();
