/* ============================================================
   LifeOS — Gamification Module
   XP, levels, streaks and the progress card on the Today screen
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
    // A day counts towards the streak from this completion percentage
    const STREAK_THRESHOLD = 80;
    const CARE_CATEGORIES  = ['teeth', 'skincare', 'hair', 'eyebrows'];

    // ─── State ───
    const freshData = () => ({
        xp: 0,          // XP banked from finished days
        level: 1,
        streak: 0,
        todayDate: null,
        todayXP: 0,     // XP earned so far today (changes as things are ticked)
        history: {},    // { 'YYYY-MM-DD': { score: number } }
        achievements: []
    });
    let data = freshData();

    const ACHIEVEMENTS = [
        { id: 'streak_3', title: 'On Fire', desc: 'Reach a 3-day streak', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%; height:100%;"><path d="M8.5 14.5A2.5 2.5 0 0011 12c-1.1 0-2.4-.6-2.4-2.5S10.2 6.5 12 5c2.3 2 4 4.5 4 7 0 2-1 4-3 5.5"></path><path d="M12 22a9 9 0 100-18 9 9 0 000 18z"></path></svg>` },
        { id: 'streak_7', title: 'Consistent', desc: 'Reach a 7-day streak', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%; height:100%;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path><path d="M8 18h.01"></path><path d="M12 18h.01"></path><path d="M16 18h.01"></path></svg>` },
        { id: 'level_5', title: 'Rising Star', desc: 'Reach Level 5', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%; height:100%;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>` },
        { id: 'perfect_day', title: 'Flawless', desc: 'Complete 100% of all daily tasks', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%; height:100%;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>` }
    ];

    const esc = (text) => window.App.esc(text);

    // ─── Persistence ───

    function load() {
        data = freshData();
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                data = { ...data, ...parsed };
                // Older versions stored today's XP inside `xp` and forgot which day it belonged to
                if (parsed._todayXP !== undefined) {
                    data.xp = Math.max(0, (parsed.xp || 0) - (parsed._todayXP || 0));
                    data.todayXP = parsed._todayXP || 0;
                    data.todayDate = parsed.lastCompletedDate || null;
                    delete data._todayXP;
                    delete data.lastCompletedDate;
                }
            }
        } catch (e) {
            console.warn('[Gamification] Failed to load data:', e);
        }
        if (!data.history) data.history = {};
        if (!data.achievements) data.achievements = [];
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('[Gamification] Failed to save data:', e);
        }
    }

    // ─── XP & Level Helpers ───
    // Level L → L+1 costs L × 100 XP.

    function calcLevel(totalXP) {
        let level = 1;
        let cumulative = 0;
        while (cumulative + level * 100 <= totalXP) {
            cumulative += level * 100;
            level++;
        }
        return level;
    }

    function xpInCurrentLevel(totalXP) {
        const level = calcLevel(totalXP);
        let cumulative = 0;
        for (let k = 1; k < level; k++) cumulative += k * 100;
        return totalXP - cumulative;
    }

    const totalXP = () => data.xp + data.todayXP;

    // ─── Completion data ───

    function completionOf(moduleName, method = 'getCompletionData', arg) {
        try {
            const mod = window[moduleName];
            if (mod && typeof mod[method] === 'function') {
                const result = mod[method](arg);
                return { completed: result?.completed ?? 0, total: result?.total ?? 0 };
            }
        } catch (e) {
            console.warn(`[Gamification] Error reading ${moduleName}.${method}():`, e);
        }
        return { completed: 0, total: 0 };
    }

    /** Everything that counts today, as one list of categories. */
    function gather() {
        const cats = [
            { key: 'food',  label: 'Nutrition', grad: 'grad-primary', section: 'food',  ...completionOf('FoodModule') },
            { key: 'sport', label: 'Sport',     grad: 'grad-accent',  section: 'sport', ...completionOf('SportModule') },
        ];
        const careLabels = { teeth: 'Teeth', skincare: 'Skincare', hair: 'Hair', eyebrows: 'Eyebrows' };
        CARE_CATEGORIES.forEach((cat, i) => {
            cats.push({
                key: cat, label: careLabels[cat], section: 'bodycare',
                grad: ['grad-success', 'grad-warm', 'grad-accent', 'grad-primary'][i],
                ...completionOf('BodycareModule', 'getCategoryCompletion', cat),
            });
        });
        const completed = cats.reduce((sum, c) => sum + c.completed, 0);
        const total = cats.reduce((sum, c) => sum + c.total, 0);
        return { cats, completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
    }

    // ─── Day roll-over & streak ───

    /** When a new day starts, bank yesterday's XP so it is never lost. */
    function rollOver() {
        const today = App.getToday();
        if (data.todayDate === today) return;
        data.xp += data.todayXP || 0;
        data.todayXP = 0;
        data.todayDate = today;
    }

    /** Consecutive days (ending yesterday, plus today once it qualifies) at or above the threshold. */
    function calcStreak() {
        const today = App.getToday();
        const good = (date) => data.history[date] && data.history[date].score >= STREAK_THRESHOLD;
        let streak = 0;
        let day = App.addDays(today, -1);
        while (good(day)) {
            streak++;
            day = App.addDays(day, -1);
        }
        if (good(today)) streak++;
        return streak;
    }

    // ─── Recalculation ───

    function recalculate() {
        const today = App.getToday();
        rollOver();

        const state = gather();
        const care = state.cats.filter(c => CARE_CATEGORIES.includes(c.key)).reduce((sum, c) => sum + c.completed, 0);
        const food = state.cats.find(c => c.key === 'food');
        const sport = state.cats.find(c => c.key === 'sport');

        data.history[today] = { score: state.pct };
        data.streak = calcStreak();

        let todayXP = food.completed * XP_PER_MEAL + sport.completed * XP_PER_EXERCISE + care * XP_PER_ROUTINE;
        if (state.total > 0 && state.pct === 100) todayXP += XP_FULL_DAY + data.streak * XP_STREAK_MULT;
        data.todayXP = todayXP;

        const oldLevel = data.level;
        data.level = calcLevel(totalXP());
        if (data.level > oldLevel && window.App) {
            setTimeout(() => window.App.showToast(`Level up! You reached level ${data.level}`, 'success'), 300);
        }

        const unlock = (id) => {
            if (data.achievements.includes(id)) return;
            data.achievements.push(id);
            const ach = ACHIEVEMENTS.find(a => a.id === id);
            if (ach && window.App) setTimeout(() => window.App.showToast(`Achievement unlocked: ${ach.title}`, 'success'), 800);
        };
        if (data.streak >= 3) unlock('streak_3');
        if (data.streak >= 7) unlock('streak_7');
        if (data.level >= 5) unlock('level_5');
        if (state.total > 0 && state.pct === 100) unlock('perfect_day');

        save();
        updateHeaderXP();
        renderDashboard(state);
    }

    // ─── Header XP Bar ───

    function updateHeaderXP() {
        const xpFill = document.getElementById('header-xp-fill');
        const levelText = document.getElementById('level-text');
        const inLevel = xpInCurrentLevel(totalXP());
        if (xpFill) xpFill.style.width = `${Math.min(100, Math.round((inLevel / (data.level * 100)) * 100))}%`;
        if (levelText) levelText.textContent = `Lvl ${data.level}`;
    }

    // ─── Dashboard Rendering ───

    function renderDashboard(state) {
        const container = document.getElementById('dashboard-progress');
        if (!container) return;
        if (!state || !state.cats) state = gather();

        const flame = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 0-4 4-4 9s3 6 3 9c0 0 2-2 2-4s2 1 2 4c0-3 3-6 3-9s-4-9-4-9z"/></svg>`;
        const bolt = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
        const circumference = 2 * Math.PI * 52;
        const today = App.getToday();

        const week = [];
        for (let i = 6; i >= 0; i--) {
            const date = App.addDays(today, -i);
            const weekday = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
            week.push({ day: weekday, score: data.history[date] ? data.history[date].score : 0, isToday: i === 0 });
        }

        // Only categories that have something due today get a bar
        const activeCats = state.cats.filter(c => c.total > 0);

        container.innerHTML = `
            <div class="glass-card hero-card">
                <div class="hero-row">
                    <div class="hero-ring">
                        <svg viewBox="0 0 120 120">
                            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-active)" stroke-width="9"/>
                            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--primary)" stroke-width="9"
                                    stroke-linecap="round"
                                    stroke-dasharray="${circumference}"
                                    stroke-dashoffset="${circumference * (1 - state.pct / 100)}"
                                    style="transition: stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1);"/>
                        </svg>
                        <div class="hero-ring-label">
                            <span class="hero-pct">${state.pct}<small>%</small></span>
                        </div>
                    </div>
                    <div class="hero-meta">
                        <div class="hero-title">${state.total === 0 ? 'Nothing due today' : state.pct === 100 ? 'Day complete' : `${state.total - state.completed} left today`}</div>
                        <div class="hero-badges">
                            <span class="streak-badge" ${data.streak > 0 ? '' : 'style="opacity:0.6"'}>${flame} ${data.streak > 0 ? `${data.streak} day streak` : 'No streak yet'}</span>
                            <span class="xp-badge">${bolt} ${xpInCurrentLevel(totalXP())} / ${data.level * 100} XP</span>
                        </div>
                    </div>
                </div>

                ${activeCats.length ? `<div class="divider"></div>` : ''}
                ${activeCats.map(row => `
                    <button type="button" class="progress-row progress-link" onclick="App.switchTab('${row.section}')">
                        <div class="progress-info">
                            <div class="progress-label">
                                <span>${esc(row.label)}</span>
                                <span class="progress-pct">${row.completed}/${row.total}</span>
                            </div>
                            <div class="progress-track">
                                <div class="progress-fill ${row.grad}" style="width:${Math.round((row.completed / row.total) * 100)}%;"></div>
                            </div>
                        </div>
                    </button>
                `).join('')}

                <div class="week-chart" aria-label="Last 7 days">
                    ${week.map(d => `
                        <div class="week-day ${d.isToday ? 'today' : ''}">
                            <div class="week-bar"><div style="height:${d.score}%;" class="${d.score >= STREAK_THRESHOLD ? 'good' : ''}"></div></div>
                            <span>${d.day}</span>
                        </div>
                    `).join('')}
                </div>

                <div class="achievements">
                    ${ACHIEVEMENTS.map(ach => `
                        <div class="achievement ${data.achievements.includes(ach.id) ? 'unlocked' : ''}" title="${esc(ach.desc)}">
                            <div class="achievement-icon">${ach.svg}</div>
                            <div class="achievement-title">${esc(ach.title)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // ─── Public API ───

    return {
        init() {
            load();
            rollOver();
            data.streak = calcStreak();
            data.level = calcLevel(totalXP());
            updateHeaderXP();
        },
        renderDashboard,
        recalculate,
        getLevel() { return data.level; },
        getStreak() { return data.streak; }
    };
})();
