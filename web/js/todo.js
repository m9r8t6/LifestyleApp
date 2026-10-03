(function() {
    'use strict';

    const STORAGE_KEY = 'lifeos_todos';
    let todos = [];

    const t = (key) => window.i18n ? window.i18n.t(key) : key;
    const esc = (text) => window.App.esc(text);

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function init() {
        try {
            todos = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
            if (!Array.isArray(todos)) todos = [];
        } catch (e) {
            todos = [];
        }
    }

    function saveTodos() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    }

    function renderSection() {
        const container = document.getElementById('todo-container');
        if (!container) return;

        // Sort: pending first (newest first), completed last
        const pending = todos.filter(x => !x.completed).sort((a,b) => b.createdAt - a.createdAt);
        const completed = todos.filter(x => x.completed).sort((a,b) => b.createdAt - a.createdAt);

        let html = `
            <div class="card-header-row" style="margin-bottom: 16px;">
                <h2 style="margin:0;">To-Do List</h2>
                <button class="btn btn-primary btn-sm" onclick="TodoModule.showAddModal()">Add Task</button>
            </div>
            
            <div>
        `;

        if (pending.length === 0 && completed.length === 0) {
            html += `<div class="empty-state"><div class="empty-state-text">No tasks yet.</div></div>`;
        }

        const renderItem = (item, idx) => `
            <div class="checklist-item stagger-item ${item.completed ? 'checked' : ''}" onclick="TodoModule.toggleTask('${item.id}')">
                <div class="checklist-check">✓</div>
                <div class="checklist-content">
                    <div class="checklist-text">${esc(item.title)}</div>
                    ${item.description ? `<div class="checklist-sub">${esc(item.description)}</div>` : ''}
                </div>
                <button class="btn-icon btn-quiet" aria-label="Delete task" onclick="event.stopPropagation(); TodoModule.deleteTask('${item.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
            </div>
        `;

        pending.forEach((item, idx) => { html += renderItem(item, idx); });
        
        if (completed.length > 0) {
            html += `<div class="card-header-row" style="margin:16px 0 0;"><h3 class="group-heading" style="margin:0;">Completed</h3><button class="btn btn-sm btn-ghost" onclick="TodoModule.clearCompleted()">Clear</button></div>`;
            completed.forEach((item, idx) => { html += renderItem(item, idx + pending.length); });
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    function renderDashboard() {}

    function showAddModal() {
        if (!window.App) return;

        const html = `
            <div class="form-group">
                <label class="form-label">Task Title</label>
                <input type="text" id="todo-title" class="form-input" placeholder="e.g. Buy groceries" enterkeyhint="done">
            </div>
            <div class="form-group">
                <label class="form-label">Description (Optional)</label>
                <textarea id="todo-desc" class="form-input" style="min-height:80px; resize:vertical;" placeholder="Details..."></textarea>
            </div>
        `;
        window.App.showModal('Add Task', html, '<button class="btn btn-primary" onclick="TodoModule.addTask()" style="width:100%;">Save Task</button>');
    }

    function addTask() {
        const title = document.getElementById('todo-title').value.trim();
        const desc = document.getElementById('todo-desc').value.trim();

        if (!title) {
            window.App.showToast('Please enter a title', 'error');
            return;
        }

        todos.push({
            id: generateId(),
            title: title,
            description: desc,
            completed: false,
            createdAt: Date.now()
        });

        saveTodos();
        window.App.hideModal();
        renderSection();
        if (window.App) window.App.refreshDashboard();
    }

    function toggleTask(id) {
        const task = todos.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            saveTodos();
            renderSection();
            if (window.App) window.App.refreshDashboard();
        }
    }

    async function deleteTask(id) {
        if (!await window.App.confirm('Delete this task?', { okLabel: 'Delete', danger: true })) return;
        todos = todos.filter(t => t.id !== id);
        saveTodos();
        renderSection();
        if (window.App) window.App.refreshDashboard();
    }
    
    function clearCompleted() {
        todos = todos.filter(t => !t.completed);
        saveTodos();
        renderSection();
    }

    /** Open tasks for the Today screen and the assistant. */
    function getPending() {
        return todos.filter(x => !x.completed).sort((a, b) => b.createdAt - a.createdAt)
            .map(x => ({ id: x.id, title: x.title, description: x.description }));
    }

    function getCompletionData() {
        // Return 5 XP per completed task today? 
        // We don't track completion date in this simple version, so let's skip daily XP or just return static for now.
        return { completed: 0, total: 0 }; 
    }

    window.TodoModule = { init, renderSection, renderDashboard, showAddModal, addTask, toggleTask, deleteTask, clearCompleted, getPending, getCompletionData };

})();
