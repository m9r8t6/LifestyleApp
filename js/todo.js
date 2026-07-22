(function() {
    'use strict';

    const STORAGE_KEY = 'lifeos_todos';
    let todos = [];

    const t = (key) => window.i18n ? window.i18n.t(key) : key;

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function init() {
        try {
            todos = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
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
            
            <div style="display:flex; flex-direction:column; gap:12px;">
        `;

        if (pending.length === 0 && completed.length === 0) {
            html += `<div class="empty-state"><div class="empty-state-text">No tasks yet.</div></div>`;
        }

        const renderItem = (item, idx) => `
            <div class="checklist-item stagger-item" style="animation-delay:${idx*30}ms;" onclick="TodoModule.toggleTask('${item.id}')">
                <div class="checkbox ${item.completed ? 'checked' : ''}" style="border-color: var(--primary);"></div>
                <div class="checklist-item-content" style="${item.completed ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">
                    <div style="font-weight: 600;">${item.title}</div>
                    ${item.description ? `<div style="font-size: 0.8rem; margin-top: 4px; ${item.completed ? 'color: var(--text-muted);' : 'color: var(--text-secondary);'}">${item.description}</div>` : ''}
                </div>
                <button class="btn btn-icon btn-sm" style="border:none; background:transparent; margin-left:auto;" onclick="event.stopPropagation(); TodoModule.deleteTask('${item.id}')">🗑️</button>
            </div>
        `;

        pending.forEach((item, idx) => { html += renderItem(item, idx); });
        
        if (completed.length > 0) {
            html += `<h3 style="margin-top: 16px; font-size: 0.9rem; color: var(--text-muted);">Completed</h3>`;
            completed.forEach((item, idx) => { html += renderItem(item, idx + pending.length); });
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    function renderDashboard() {
        const container = document.getElementById('dashboard-todo');
        if (!container) return; // Might not exist if we didn't add it to dashboard.js

        const pending = todos.filter(x => !x.completed).length;
        if (pending > 0) {
            container.innerHTML = `
                <div class="dashboard-block glass-card stagger-item">
                    <div class="card-header-row">
                        <h3>Tasks</h3>
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-muted);">You have ${pending} pending task(s).</div>
                </div>
            `;
        } else {
            container.innerHTML = '';
        }
    }

    function showAddModal() {
        if (!window.App) return;

        const html = `
            <div class="form-group">
                <label class="form-label">Task Title</label>
                <input type="text" id="todo-title" class="form-input" placeholder="e.g. Buy groceries">
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
            if (window.App) {
                window.App.refreshDashboard();
                if (task.completed) {
                    window.App.onCompletionChange(); // Gamification integration
                }
            }
        }
    }

    function deleteTask(id) {
        if (!confirm('Delete this task?')) return;
        todos = todos.filter(t => t.id !== id);
        saveTodos();
        renderSection();
        if (window.App) window.App.refreshDashboard();
    }
    
    function getCompletionData() {
        // Return 5 XP per completed task today? 
        // We don't track completion date in this simple version, so let's skip daily XP or just return static for now.
        return { completed: 0, total: 0 }; 
    }

    window.TodoModule = { init, renderSection, renderDashboard, showAddModal, addTask, toggleTask, deleteTask, getCompletionData };

})();
