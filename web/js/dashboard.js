/* =========================================================
 *  LifeOS — Today screen  (dashboard.js)
 *  One list with everything that is due today, so the whole
 *  day can be ticked off without visiting each section.
 * ========================================================= */

window.Dashboard = (() => {
    'use strict';

    const esc = (text) => window.App.esc(text);

    // How each group reads its items and ticks one off
    const GROUPS = {
        morning: { title: 'Morning care', section: 'bodycare', items: () => window.BodycareModule.getTodayItems('morning'), toggle: (id) => window.BodycareModule.toggleItem(id) },
        meals:   { title: 'Meals',        section: 'food',     items: () => window.FoodModule.getTodayItems(),            toggle: (id) => window.FoodModule.toggleCompletion(id) },
        workout: { title: 'Workout',      section: 'sport',    items: () => window.SportModule.getTodayItems(),           toggle: (id) => window.SportModule.toggleExercise(id) },
        evening: { title: 'Evening care', section: 'bodycare', items: () => window.BodycareModule.getTodayItems('evening'), toggle: (id) => window.BodycareModule.toggleItem(id) },
        todos:   { title: 'To-dos',       section: 'todo',     items: () => window.TodoModule.getPending().slice(0, 5).map(t => ({ id: t.id, label: t.title, sub: t.description || '', done: false })), toggle: (id) => window.TodoModule.toggleTask(id) },
    };

    function groupHtml(key) {
        const group = GROUPS[key];
        let items = [];
        try { items = group.items(); } catch (err) { console.error('[Dashboard]', key, err); }
        if (items.length === 0) return '';
        const open = items.filter(i => !i.done).length;

        return `
            <div class="agenda-group ${open === 0 ? 'all-done' : ''}">
                <button type="button" class="agenda-head" onclick="App.switchTab('${group.section}')">
                    <span class="agenda-title">${group.title}</span>
                    <span class="count-pill">${open === 0 ? 'done' : `${open} left`}</span>
                </button>
                ${items.map(item => `
                    <div class="checklist-item compact ${item.done ? 'checked' : ''}" onclick="Dashboard.toggle('${key}', '${esc(item.id)}')">
                        <div class="checklist-check">✓</div>
                        <div class="checklist-content">
                            <div class="checklist-text">${esc(item.label)}</div>
                            ${item.sub ? `<div class="checklist-sub">${esc(item.sub)}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function eventsHtml() {
        let events = [];
        try { events = window.CalendarModule.getUpcoming(3); } catch (err) {}
        if (events.length === 0) return '';
        return `
            <div class="agenda-group">
                <button type="button" class="agenda-head" onclick="App.switchTab('calendar')">
                    <span class="agenda-title">Coming up</span>
                </button>
                ${events.map(ev => `
                    <div class="agenda-event ${ev.isToday ? 'today' : ''}" onclick="App.switchTab('calendar')">
                        <span class="agenda-event-title">${esc(ev.title)}</span>
                        <span class="agenda-event-when">${esc(ev.when)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function render() {
        const container = document.getElementById('dashboard-agenda');
        if (!container) return;

        // What fits the time of day comes first
        const order = new Date().getHours() < 16
            ? ['morning', 'meals', 'workout', 'evening', 'todos']
            : ['evening', 'meals', 'workout', 'morning', 'todos'];

        const html = order.map(groupHtml).join('') + eventsHtml();
        container.innerHTML = html || `<div class="empty-state"><div class="empty-state-text">Nothing is planned for today yet. Add meals, exercises or care routines to get started.</div></div>`;
    }

    function toggle(groupKey, id) {
        const group = GROUPS[groupKey];
        if (!group) return;
        group.toggle(id);
        // The modules report the change; make sure this screen reflects it either way
        render();
    }

    return { render, toggle };
})();
