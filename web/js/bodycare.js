(function() {
  'use strict';

  // ─── Constants ────────────────────────────────────────────
  const STORAGE_ITEMS   = 'lifeos_bodycare_items';
  const STORAGE_DONE    = 'lifeos_bodycare_completion';
  const MS_PER_DAY      = 86400000;

  const CATEGORY_COLORS = {
    teeth:    'var(--cat-teeth)',
    skincare: 'var(--cat-skin)',
    hair:     'var(--cat-hair)',
    eyebrows: 'var(--cat-brows)',
  };

  const CATEGORY_LABELS = {
    teeth:    'Teeth',
    skincare: 'Skincare',
    hair:     'Hair',
    eyebrows: 'Eyebrows',
  };

  const CATEGORY_ORDER = ['teeth', 'skincare', 'hair', 'eyebrows'];

  const ICONS = {
    sun: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
    moon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`,
    pencil: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
    care: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`
  };

  // ─── Default routine items ────────────────────────────────
  const DEFAULT_ITEMS = [
    { id: 'bc_m1', name: 'Brush teeth',              category: 'teeth',    timeOfDay: 'morning', frequency: 1, startDate: '2025-01-01', description: 'Brush for 2 minutes using gentle circular motions.' },
    { id: 'bc_m2', name: 'Whitening strips',          category: 'teeth',    timeOfDay: 'morning', frequency: 3, startDate: '2025-01-01', description: 'Apply lower strip first, then upper. Leave for 30 mins.' },
    { id: 'bc_m3', name: 'Wash face (gentle cleanser)', category: 'skincare', timeOfDay: 'morning', frequency: 1, startDate: '2025-01-01', description: 'Use lukewarm water, massage for 60 seconds.' },
    { id: 'bc_m4', name: 'Moisturizer with SPF',      category: 'skincare', timeOfDay: 'morning', frequency: 1, startDate: '2025-01-01', description: 'Apply generous amount to face and neck.' },
    { id: 'bc_m5', name: 'Zinc oxide spot treatment',  category: 'skincare', timeOfDay: 'morning', frequency: 1, startDate: '2025-01-01', description: 'Dab lightly on active breakouts.' },
    { id: 'bc_m6', name: 'Eyebrow gel',               category: 'eyebrows', timeOfDay: 'morning', frequency: 1, startDate: '2025-01-01', description: 'Brush upwards and outwards.' },
    { id: 'bc_e1', name: 'Brush teeth',   category: 'teeth',    timeOfDay: 'evening', frequency: 1, startDate: '2025-01-01', description: 'Brush for 2 minutes.' },
    { id: 'bc_e2', name: 'Floss',         category: 'teeth',    timeOfDay: 'evening', frequency: 1, startDate: '2025-01-01', description: 'Hug the tooth in a C-shape.' },
    { id: 'bc_e3', name: 'Wash face',     category: 'skincare', timeOfDay: 'evening', frequency: 1, startDate: '2025-01-01', description: 'Double cleanse if wearing heavy sunscreen.' },
    { id: 'bc_e4', name: 'Retinol serum', category: 'skincare', timeOfDay: 'evening', frequency: 2, startDate: '2025-01-01', description: 'Pea-sized amount. Wait 5 mins before moisturizer.' },
    { id: 'bc_e5', name: 'Moisturizer',   category: 'skincare', timeOfDay: 'evening', frequency: 1, startDate: '2025-01-01', description: 'Seal in hydration.' },
    { id: 'bc_e6', name: 'Hair oil treatment', category: 'hair', timeOfDay: 'evening', frequency: 3, startDate: '2025-01-01', description: 'Warm oil in hands, massage into scalp for 5 mins, then pull through ends.' },
    { id: 'bc_e7', name: 'Wash hair',     category: 'hair',     timeOfDay: 'evening', frequency: 3, startDate: '2025-01-01', description: 'Shampoo roots twice, condition only the ends.' },
  ];

  let activeTime = new Date().getHours() < 16 ? 'morning' : 'evening';

  // ─── Helpers ──────────────────────────────────────────────
  const today = () => App.getToday();
  const uid = () => 'bc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
  const esc = (text) => App.esc(text);
  const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

  function loadItems() {
    const raw = localStorage.getItem(STORAGE_ITEMS);
    if (raw) {
      try {
        const items = JSON.parse(raw);
        if (Array.isArray(items)) return items;
      } catch {}
    }
    localStorage.setItem(STORAGE_ITEMS, JSON.stringify(DEFAULT_ITEMS));
    return DEFAULT_ITEMS.map(i => ({ ...i }));
  }

  function saveItems(items) { localStorage.setItem(STORAGE_ITEMS, JSON.stringify(items)); }

  function loadCompletion() {
    const raw = localStorage.getItem(STORAGE_DONE);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data && data.date === today()) return data;
      } catch {}
    }
    return { date: today(), completed: [] };
  }

  function saveCompletion(comp) { localStorage.setItem(STORAGE_DONE, JSON.stringify(comp)); }

  /**
   * Items that repeat every N days carry a `nextDue` date. It only moves on when the
   * item is ticked off, so a missed treatment stays on the list instead of silently
   * skipping to the next cycle.
   */
  function nextDueOf(item) {
    if (item.nextDue) return item.nextDue;
    // First time: derive it from the original start date
    const since = daysBetween(item.startDate || today(), today());
    if (since <= 0) return item.startDate || today();
    const remainder = since % item.frequency;
    return App.addDays(today(), remainder === 0 ? 0 : item.frequency - remainder);
  }

  function getDaysUntilDue(item) {
    if (item.frequency <= 1) return 0;
    // Ticked off today: keep showing it under today
    if (item.doneOn === today()) return 0;
    return Math.max(0, daysBetween(today(), nextDueOf(item)));
  }

  function isOverdue(item) {
    return item.frequency > 1 && item.doneOn !== today() && daysBetween(today(), nextDueOf(item)) < 0;
  }

  function getDueStatusStr(days) {
    if (days === 0) return t('due_today');
    if (days === 1) return t('due_tomorrow');
    return t('due_in_days', { days });
  }

  function groupByCategory(items) {
    const groups = {};
    for (const cat of CATEGORY_ORDER) groups[cat] = [];
    for (const item of items) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return Object.entries(groups).filter(([, arr]) => arr.length > 0);
  }

  // ─── Toggle & Shift ───────────────────────────────────────

  function toggleItem(itemId) {
    const comp = loadCompletion();
    const idx = comp.completed.indexOf(itemId);
    const nowDone = idx === -1;
    if (nowDone) comp.completed.push(itemId);
    else comp.completed.splice(idx, 1);
    saveCompletion(comp);

    // Repeating items: move the next due date on (or back, when un-ticked)
    const items = loadItems();
    const item = items.find(i => i.id === itemId);
    if (item && item.frequency > 1) {
      if (nowDone) {
        item.prevNextDue = nextDueOf(item);
        item.doneOn = today();
        item.nextDue = App.addDays(today(), item.frequency);
      } else if (item.doneOn === today()) {
        item.nextDue = item.prevNextDue || today();
        delete item.doneOn;
        delete item.prevNextDue;
      }
      saveItems(items);
    }
    if (window.App && window.App.onCompletionChange) window.App.onCompletionChange();
  }

  function shiftItem(itemId, days) {
      const items = loadItems();
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      const shifted = App.addDays(nextDueOf(item), days);
      item.nextDue = shifted < today() ? today() : shifted;
      saveItems(items);
  }

  function toggleExpand(itemId) {
    const el = document.getElementById(`bc-expand-${itemId}`);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
  }

  // ─── Render: Section View ─────────────────────────────────

  function renderSection() {
    const morningContainer = document.getElementById('bodycare-morning');
    const eveningContainer = document.getElementById('bodycare-evening');
    if (!morningContainer || !eveningContainer) return;

    const comp = loadCompletion();

    const toggleHTML = `
      <div class="section-title stagger-item">
        <div class="section-title-icon">
            ${ICONS.care}
        </div>
        <h2>${t('body_care')}</h2>
      </div>
      <div class="time-toggle stagger-item" id="bc-time-toggle">
        <button class="time-toggle-btn ${activeTime === 'morning' ? 'active' : ''}" data-time="morning">
            <span style="display:inline-block; margin-right:6px; vertical-align:middle;">${ICONS.sun}</span>${t('morning')}
        </button>
        <button class="time-toggle-btn ${activeTime === 'evening' ? 'active' : ''}" data-time="evening">
            <span style="display:inline-block; margin-right:6px; vertical-align:middle;">${ICONS.moon}</span>${t('evening')}
        </button>
      </div>
    `;

    const allItems = loadItems().filter(i => i.timeOfDay === activeTime);
    const withDue = allItems.map(item => ({ ...item, daysUntilDue: getDaysUntilDue(item) }));
    
    const dueToday = withDue.filter(i => i.daysUntilDue === 0);
    const upcoming = withDue.filter(i => i.daysUntilDue > 0).sort((a,b) => a.daysUntilDue - b.daysUntilDue);

    let listHTML = '';

    function renderGroup(titleKey, items, isUpcomingGroup) {
        if (items.length === 0) return '';
        let html = `<h3 class="group-heading">${t(titleKey)}</h3>`;
        
        const grouped = groupByCategory(items);
        let staggerIdx = 0;
        
        for (const [cat, catItems] of grouped) {
            const color = CATEGORY_COLORS[cat] || 'var(--primary)';
            html += `
              <div class="category-header stagger-item">
                <span class="category-dot" style="background:${color}"></span>
                <h4>${CATEGORY_LABELS[cat] || cat}</h4>
              </div>
            `;
            staggerIdx++;

            for (const item of catItems) {
              const done = comp.completed.includes(item.id);
              const opacity = isUpcomingGroup ? '0.7' : '1';
              
              const shiftButtons = item.frequency > 1 && !done ? `
                  <div class="shift-btns">
                      <button class="bc-shift-btn" data-id="${item.id}" data-shift="-1" title="One day sooner">−1d</button>
                      <button class="bc-shift-btn" data-id="${item.id}" data-shift="1" title="One day later">+1d</button>
                  </div>
              ` : '';

              const hasDesc = !!item.description;
              let sub = t('daily');
              if (isUpcomingGroup) sub = getDueStatusStr(item.daysUntilDue);
              else if (isOverdue(item)) sub = 'Overdue';
              else if (item.frequency > 1) sub = `Every ${item.frequency} days`;

              html += `
                <div class="checklist-item ${done ? 'checked' : ''} ${isUpcomingGroup ? 'upcoming' : ''} stagger-item" data-id="${item.id}">
                  <div class="checklist-check" style="border-color:${done ? 'var(--success)' : color}">✓</div>
                  <div class="checklist-content">
                    <div class="checklist-text">${esc(item.name)}</div>
                    <div class="checklist-sub ${isOverdue(item) ? 'overdue' : ''}">${sub}</div>
                  </div>
                  ${shiftButtons}
                  ${hasDesc ? `<button class="btn-icon bc-info-btn" data-id="${item.id}" title="How to" aria-label="How to">i</button>` : ''}
                  <button class="btn-icon bc-edit-btn" data-id="${item.id}" title="Edit" aria-label="Edit">${ICONS.pencil}</button>
                </div>
              `;

              if (hasDesc) {
                  html += `
                    <div id="bc-expand-${item.id}" class="recipe-expand glass-card-sm" style="display:none;">
                        <p class="detail-text">${esc(item.description)}</p>
                    </div>
                  `;
              }
              staggerIdx++;
            }
        }
        return html;
    }

    if (dueToday.length === 0) {
      listHTML += `
        <h3 class="group-heading">${t('due_today')}</h3>
        <div class="empty-state stagger-item">
          <div class="empty-state-text">Nothing due this ${activeTime}.</div>
        </div>
      `;
    } else {
        listHTML += renderGroup('due_today', dueToday, false);
    }

    listHTML += renderGroup('Upcoming', upcoming, true); // No translation for Upcoming yet, assuming it works as fallback

    const doneCount  = dueToday.filter(i => comp.completed.includes(i.id)).length;
    const totalCount = dueToday.length;
    const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    const summaryHTML = totalCount > 0 ? `
      <div class="glass-card-sm stagger-item" style="margin-bottom:14px;">
        <div class="progress-row">
          <div class="progress-info">
            <div class="progress-label">
              <span>${activeTime === 'morning' ? t('morning') : t('evening')} Routine</span>
              <span class="progress-pct">${doneCount}/${totalCount}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill grad-accent" style="width:${pct}%"></div>
            </div>
          </div>
        </div>
      </div>
    ` : '';

    const addBtnHTML = `
      <button class="btn btn-primary stagger-item" id="bc-add-item" style="width:100%;margin-top:24px;">
        ${t('add_item')}
      </button>
    `;

    morningContainer.innerHTML = toggleHTML + summaryHTML + listHTML + addBtnHTML;
    eveningContainer.innerHTML = '';
    
    const newMorningContainer = morningContainer.cloneNode(true);
    morningContainer.parentNode.replaceChild(newMorningContainer, morningContainer);
    newMorningContainer.addEventListener('click', handleSectionClick);
  }

  function handleSectionClick(e) {
    const target = e.target;

    const toggleBtn = target.closest('#bc-time-toggle .time-toggle-btn');
    if (toggleBtn) {
      activeTime = toggleBtn.dataset.time;
      renderSection();
      return;
    }

    const editBtn = target.closest('.bc-edit-btn');
    if (editBtn) {
      e.stopPropagation();
      const items = loadItems();
      const item = items.find(i => i.id === editBtn.dataset.id);
      if (item) showItemModal(item);
      return;
    }

    const shiftBtn = target.closest('.bc-shift-btn');
    if (shiftBtn) {
      e.stopPropagation();
      shiftItem(shiftBtn.dataset.id, parseInt(shiftBtn.dataset.shift, 10));
      renderSection();
      if (window.App && window.App.onCompletionChange) window.App.onCompletionChange();
      return;
    }

    const infoBtn = target.closest('.bc-info-btn');
    if (infoBtn) {
      e.stopPropagation();
      toggleExpand(infoBtn.dataset.id);
      return;
    }

    // Tapping anywhere on a row ticks it off
    const checkItem = target.closest('.checklist-item[data-id]');
    if (checkItem) {
      toggleItem(checkItem.dataset.id);
      renderSection();
      return;
    }

    if (target.closest('#bc-add-item')) {
      showItemModal(null);
      return;
    }
  }

  function showItemModal(existingItem) {
    const isEdit = !!existingItem;
    const item = existingItem || {
      id: uid(), name: '', category: 'skincare', timeOfDay: activeTime, frequency: 1, startDate: today(), description: ''
    };

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="bc-form-name" value="${esc(item.name)}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" id="bc-form-cat">
            ${CATEGORY_ORDER.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${CATEGORY_LABELS[c]}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Time of Day</label>
        <div class="time-toggle" id="bc-form-time-toggle">
          <button type="button" class="time-toggle-btn ${item.timeOfDay === 'morning' ? 'active' : ''}" data-time="morning">${t('morning')}</button>
          <button type="button" class="time-toggle-btn ${item.timeOfDay === 'evening' ? 'active' : ''}" data-time="evening">${t('evening')}</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Frequency (every N days)</label>
        <input class="form-input" id="bc-form-freq" type="number" min="1" max="365" value="${item.frequency}">
      </div>
      <div class="form-group">
        <label class="form-label">Description / Instructions</label>
        <textarea class="form-input" id="bc-form-desc" style="resize:vertical; min-height:80px;">${esc(item.description || '')}</textarea>
      </div>
    `;

    const footerHTML = `
      ${isEdit ? `<button class="btn btn-ghost" id="bc-form-delete" style="color:var(--error);">Delete</button>` : ''}
      <button class="btn btn-primary" id="bc-form-save">${isEdit ? 'Update' : 'Add Item'}</button>
    `;

    if(!window.App) return;
    window.App.showModal(isEdit ? 'Edit Routine Item' : 'Add Routine Item', bodyHTML, footerHTML);

    let selectedTime = item.timeOfDay;
    document.getElementById('bc-form-time-toggle')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.time-toggle-btn');
      if (btn) {
        selectedTime = btn.dataset.time;
        document.querySelectorAll('#bc-form-time-toggle .time-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });

    document.getElementById('bc-form-save')?.addEventListener('click', () => {
      const name = document.getElementById('bc-form-name').value.trim();
      const cat = document.getElementById('bc-form-cat').value;
      const freq = Math.max(1, parseInt(document.getElementById('bc-form-freq').value, 10) || 1);
      const desc = document.getElementById('bc-form-desc').value.trim();

      if (!name) return window.App.showToast('Please enter a name', 'error');

      const items = loadItems();
      if (isEdit) {
        const idx = items.findIndex(i => i.id === item.id);
        if (idx !== -1) {
          // A changed rhythm starts counting from today
          const restart = items[idx].frequency !== freq ? { nextDue: today(), doneOn: undefined, prevNextDue: undefined } : {};
          items[idx] = { ...items[idx], name, category: cat, timeOfDay: selectedTime, frequency: freq, description: desc, ...restart };
        }
      } else {
        items.push({ id: item.id, name, category: cat, timeOfDay: selectedTime, frequency: freq, startDate: today(), description: desc });
      }
      saveItems(items);
      window.App.hideModal();
      renderSection();
      window.App.refreshDashboard();
    });

    document.getElementById('bc-form-delete')?.addEventListener('click', () => {
      if (!confirm(`Delete "${item.name}"?`)) return;
      saveItems(loadItems().filter(i => i.id !== item.id));
      window.App.hideModal();
      renderSection();
      window.App.refreshDashboard();
    });
  }

  function getCompletionData() {
    const comp = loadCompletion();
    const allDue = loadItems().filter(i => getDaysUntilDue(i) === 0);
    const total = allDue.length;
    const completed = allDue.filter(i => comp.completed.includes(i.id)).length;
    return { completed, total };
  }

  function getCategoryCompletion(category) {
    const comp = loadCompletion();
    const items = loadItems().filter(i => i.category === category && getDaysUntilDue(i) === 0);
    const total = items.length;
    const completed = items.filter(i => comp.completed.includes(i.id)).length;
    return { completed, total };
  }

  function init() {
    loadItems();
  }

  /** Due items for the Today screen. */
  function getTodayItems(timeOfDay) {
    const comp = loadCompletion();
    return loadItems()
      .filter(i => i.timeOfDay === timeOfDay && getDaysUntilDue(i) === 0)
      .map(i => ({
        id: i.id,
        label: i.name,
        sub: isOverdue(i) ? 'Overdue' : (i.frequency > 1 ? `Every ${i.frequency} days` : ''),
        done: comp.completed.includes(i.id),
      }));
  }

  window.BodycareModule = { init, renderSection, getCompletionData, getCategoryCompletion, getTodayItems, toggleItem };
})();
