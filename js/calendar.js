(function() {
    'use strict';

    const STORAGE_KEY = 'lifeos_calendar_events';
    let events = [];
    let notificationInterval = null;
    let selectedDate = new Date();

    const t = (key) => window.i18n ? window.i18n.t(key) : key;

    function loadEvents() {
        try {
            events = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch (e) {
            events = [];
        }
    }

    function saveEvents() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    }

    // Sort events: oldest first (so upcoming ones are near the top if we filter >= today)
    function getSortedEvents() {
        return [...events].sort((a, b) => {
            const dtA = new Date(`${a.date}T${a.time || '00:00'}`);
            const dtB = new Date(`${b.date}T${b.time || '00:00'}`);
            return dtA - dtB;
        });
    }

    // Generate unique ID
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function init() {
        loadEvents();
        
        // Request notification permission if not asked yet (and supported)
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        // Setup notification loop every 60 seconds
        if (notificationInterval) clearInterval(notificationInterval);
        notificationInterval = setInterval(checkNotifications, 60000);
        
        // Check immediately on load
        checkNotifications();
    }

    function checkNotifications() {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const now = new Date();
        const notifiedKey = 'lifeos_notified_events';
        let notifiedEvents = {};
        try {
            notifiedEvents = JSON.parse(localStorage.getItem(notifiedKey)) || {};
        } catch (e) { }

        events.forEach(ev => {
            if (!ev.reminder || ev.reminder === 'none') return;
            if (!ev.date || !ev.time) return;

            const eventTime = new Date(`${ev.date}T${ev.time}`);
            let reminderTime = new Date(eventTime.getTime());

            if (ev.reminder === '1h') reminderTime.setHours(reminderTime.getHours() - 1);
            if (ev.reminder === '1d') reminderTime.setDate(reminderTime.getDate() - 1);

            // If we are past the reminder time but haven't notified yet
            // Wait, we only want to notify if it's within a 15 min window after reminderTime to avoid spamming old events
            const diffMs = now - reminderTime;
            const diffMins = diffMs / 60000;

            if (diffMins >= 0 && diffMins <= 15 && !notifiedEvents[ev.id]) {
                // Trigger notification
                new Notification(ev.title, {
                    body: `Upcoming event on ${ev.date} at ${ev.time}`,
                    icon: 'icon.svg'
                });
                // Vibrate if supported
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

                notifiedEvents[ev.id] = true;
            }
        });

        localStorage.setItem(notifiedKey, JSON.stringify(notifiedEvents));
    }

    function renderSection() {
        const container = document.getElementById('calendar-container');
        if (!container) return;

        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        
        // 0 = Sunday, 1 = Monday. We want Monday to be the first day.
        let startingDay = firstDay.getDay() - 1;
        if (startingDay < 0) startingDay = 6;

        const monthNames = window.i18n && window.i18n.getLang() === 'de' ? 
            ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'] :
            ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const dayNames = window.i18n && window.i18n.getLang() === 'de' ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

        // Get events for this month
        const monthEvents = getSortedEvents().filter(e => {
            const ed = new Date(e.date);
            return ed.getFullYear() === year && ed.getMonth() === month;
        });

        // Grid HTML
        let html = `
            <div class="card-header-row" style="margin-bottom: 16px;">
                <div style="display:flex; align-items:center; gap: 12px;">
                    <button class="btn btn-ghost" onclick="CalendarModule.prevMonth()" style="padding:4px 8px;">&larr;</button>
                    <h2 style="margin:0; min-width:130px; text-align:center;">${monthNames[month]} ${year}</h2>
                    <button class="btn btn-ghost" onclick="CalendarModule.nextMonth()" style="padding:4px 8px;">&rarr;</button>
                </div>
                <div style="display:flex; gap:8px;">
                    ${window.RAGModule && window.RAGModule.isReady ? `<button class="btn btn-secondary btn-sm" onclick="CalendarModule.syncWithGoogle()" title="Sync with Google Calendar" style="padding:4px 8px;">🔄</button>` : ''}
                    <button class="btn btn-primary btn-sm" onclick="CalendarModule.showAddEventModal()">${t('add_event')}</button>
                </div>
            </div>
            
            <div class="glass-card-sm" style="padding: 16px; margin-bottom: 24px;">
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; margin-bottom: 8px;">
                    ${dayNames.map(d => `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:bold;">${d}</div>`).join('')}
                </div>
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center;">
        `;

        // Empty slots
        for (let i = 0; i < startingDay; i++) {
            html += `<div></div>`;
        }

        // Days
        const todayStr = new Date().toISOString().slice(0, 10);
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const hasEvent = monthEvents.some(e => e.date === dateStr);
            const isToday = dateStr === todayStr;
            
            let bg = 'transparent';
            let color = 'var(--text)';
            if (isToday) {
                bg = 'var(--primary-light)';
                color = 'white';
            }
            
            html += `
                <div style="position:relative; height:32px; display:flex; align-items:center; justify-content:center; border-radius:16px; background:${bg}; color:${color}; font-size:0.85rem;">
                    ${i}
                    ${hasEvent ? `<div style="position:absolute; bottom:2px; width:4px; height:4px; border-radius:50%; background:var(--accent);"></div>` : ''}
                </div>
            `;
        }

        html += `
                </div>
            </div>
            
            <div class="card-header-row" style="margin-bottom: 12px;">
                <h2>${t('upcoming_events')}</h2>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
        `;

        const upcomingEvents = getSortedEvents().filter(e => e.date >= todayStr);
        if (upcomingEvents.length === 0) {
            html += `<div class="empty-state"><div class="empty-state-text">No upcoming events.</div></div>`;
        } else {
            upcomingEvents.forEach((ev, idx) => {
                html += `
                    <div class="glass-card-sm stagger-item" style="padding:16px; animation-delay:${idx*50}ms;" onclick="CalendarModule.showEventDetails('${ev.id}')">
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            <strong style="font-size:1rem; color:var(--primary-light);">${ev.title}</strong>
                            <span style="font-size:0.8rem; color:var(--text-muted);">${ev.date} at ${ev.time}</span>
                        </div>
                        ${ev.prepNotes ? `<div style="font-size:0.8rem; color:var(--accent); margin-bottom:4px;">✨ Prep notes generated</div>` : ''}
                        ${ev.notes ? `<div style="font-size:0.8rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ev.notes}</div>` : ''}
                    </div>
                `;
            });
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    function renderDashboard() {
        // Optional: show next event on dashboard
    }

    function prevMonth() {
        selectedDate.setMonth(selectedDate.getMonth() - 1);
        renderSection();
    }

    function nextMonth() {
        selectedDate.setMonth(selectedDate.getMonth() + 1);
        renderSection();
    }

    function showAddEventModal() {
        if (!window.App) return;

        const html = `
            <div class="form-group">
                <label class="form-label">Title</label>
                <input type="text" id="event-title" class="form-input" placeholder="e.g. Doctor Appointment">
            </div>
            <div class="form-row">
                <div class="form-group" style="flex:1;">
                    <label class="form-label">Date</label>
                    <input type="date" id="event-date" class="form-input" value="${new Date().toISOString().slice(0, 10)}">
                </div>
                <div class="form-group" style="flex:1;">
                    <label class="form-label">Time</label>
                    <input type="time" id="event-time" class="form-input" value="12:00">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Reminder</label>
                <select id="event-reminder" class="form-input">
                    <option value="none">None</option>
                    <option value="1h">1 Hour Before</option>
                    <option value="1d">1 Day Before</option>
                </select>
            </div>
        `;
        window.App.showModal('Add Event', html, '<button class="btn btn-primary" onclick="CalendarModule.addEvent()" style="width:100%;">Save Event</button>');
    }

    async function syncWithGoogle() {
        if (!window.RAGModule || !window.RAGModule.isReady) return;
        const token = window.RAGModule.getAccessToken();
        if (!token) return;

        window.App.showToast('Syncing with Google Calendar...', 'info');

        try {
            const timeMin = new Date().toISOString();
            let timeMax = new Date();
            timeMax.setDate(timeMax.getDate() + 30);
            
            const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax.toISOString())}&singleEvents=true&orderBy=startTime`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch from Google Calendar');
            const data = await response.json();

            let addedCount = 0;
            data.items.forEach(gEvent => {
                const dateStr = gEvent.start.dateTime ? gEvent.start.dateTime.slice(0, 10) : (gEvent.start.date ? gEvent.start.date : null);
                const timeStr = gEvent.start.dateTime ? gEvent.start.dateTime.slice(11, 16) : '00:00';
                
                if (!dateStr) return;

                const exists = events.find(e => e.title === gEvent.summary && e.date === dateStr);
                if (!exists) {
                    events.push({
                        id: generateId(),
                        title: gEvent.summary || 'Google Event',
                        date: dateStr,
                        time: timeStr,
                        reminder: 'none',
                        notes: '',
                        prepNotes: ''
                    });
                    addedCount++;
                }
            });

            saveEvents();
            renderSection();
            window.App.showToast(`Synced! Added ${addedCount} events from Google.`, 'success');
        } catch (e) {
            console.error(e);
            window.App.showToast('Google Calendar sync failed', 'error');
        }
    }

    async function pushToGoogleCalendar(ev) {
        if (!window.RAGModule || !window.RAGModule.isReady) return;
        const token = window.RAGModule.getAccessToken();
        if (!token) return;

        try {
            const startDate = new Date(`${ev.date}T${ev.time || '00:00'}:00`);
            const endDate = new Date(startDate.getTime() + 60*60000);

            const overrides = [];
            if (ev.reminder === '1h') overrides.push({ method: 'popup', minutes: 60 });
            else if (ev.reminder === '1d') overrides.push({ method: 'popup', minutes: 24 * 60 });
            
            const remindersObj = overrides.length > 0 ? { useDefault: false, overrides } : { useDefault: true };

            const gEvent = {
                summary: ev.title,
                description: 'Created by LifeOS',
                start: { dateTime: startDate.toISOString() },
                end: { dateTime: endDate.toISOString() },
                reminders: remindersObj
            };

            await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(gEvent)
            });
            
            window.App.showToast('Event pushed to Google Calendar!', 'success');
        } catch (e) {
            console.error('Failed to push to Google', e);
        }
    }

    function addEvent() {
        const title = document.getElementById('event-title').value.trim();
        const date = document.getElementById('event-date').value;
        const time = document.getElementById('event-time').value;
        const reminder = document.getElementById('event-reminder').value;

        if (!title || !date || !time) {
            window.App.showToast('Please fill all fields', 'error');
            return;
        }

        const newEv = {
            id: generateId(),
            title,
            date,
            time,
            reminder,
            notes: '',
            prepNotes: ''
        };
        events.push(newEv);

        saveEvents();
        window.App.hideModal();
        renderSection();
        
        pushToGoogleCalendar(newEv);
        
        // Trigger permission prompt if reminder set and not granted
        if (reminder !== 'none' && 'Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }
    }

    function showEventDetails(id) {
        if (!window.App) return;
        const ev = events.find(e => e.id === id);
        if (!ev) return;

        const html = `
            <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">${ev.date} at ${ev.time} • Reminder: ${ev.reminder}</div>
            
            <div class="form-group">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <label class="form-label" style="margin:0;">${t('prep_notes')}</label>
                    <button class="btn btn-sm btn-ghost" onclick="CalendarModule.prepareWithAI('${ev.id}')" style="border: 1px dashed rgba(139, 92, 246, 0.4); color: #c4b5fd; font-size:0.7rem; padding:4px 8px;" id="btn-prep-ai-${ev.id}">
                        ✨ ${t('prepare_with_ai')}
                    </button>
                </div>
                <textarea id="event-prep-${ev.id}" class="form-input" style="min-height:80px; resize:vertical;" placeholder="AI will generate preparation notes here, or you can type your own...">${ev.prepNotes || ''}</textarea>
            </div>

            <div class="form-group">
                <label class="form-label">${t('event_notes')}</label>
                <textarea id="event-notes-${ev.id}" class="form-input" style="min-height:80px; resize:vertical;" placeholder="Notes after the event...">${ev.notes || ''}</textarea>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <button class="btn btn-sm" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: var(--error);" onclick="CalendarModule.deleteEvent('${ev.id}')">Delete Event</button>
                <button class="btn btn-primary btn-sm" onclick="CalendarModule.saveEventDetails('${ev.id}')">Save Notes</button>
            </div>
        `;
        window.App.showModal(ev.title, html, '');
    }

    function saveEventDetails(id) {
        const ev = events.find(e => e.id === id);
        if (!ev) return;

        ev.prepNotes = document.getElementById(`event-prep-${id}`).value;
        ev.notes = document.getElementById(`event-notes-${id}`).value;
        saveEvents();
        window.App.hideModal();
        renderSection();
        window.App.showToast('Notes saved', 'success');
    }

    function deleteEvent(id) {
        if (!confirm('Delete this event?')) return;
        events = events.filter(e => e.id !== id);
        saveEvents();
        window.App.hideModal();
        renderSection();
    }

    async function prepareWithAI(eventId) {
        const ev = events.find(e => e.id === eventId);
        if (!ev) return;

        const apiKey = localStorage.getItem('lifeos_deepseek_key');
        if (!apiKey) {
            window.App.showToast('Please set your DeepSeek API Key in Settings first', 'error');
            return;
        }

        const btn = document.getElementById(`btn-prep-ai-${eventId}`);
        if(btn) {
            btn.innerHTML = 'Thinking...';
            btn.disabled = true;
        }

        try {
            // Gather all past notes from ANY event before this one
            const pastEventsWithNotes = events.filter(e => e.id !== eventId && (e.notes || e.prepNotes) && new Date(e.date) <= new Date(ev.date));
            const pastNotesContext = pastEventsWithNotes.map(e => `Event: ${e.title} (${e.date})\nNotes: ${e.notes}\n`).join('\n');

            const lang = window.i18n && window.i18n.getLang() === 'de' ? 'German' : 'English';
            
            let contextMsg = pastNotesContext ? `Here are notes from past events:\n${pastNotesContext}` : 'No past events with notes exist yet.';

            const sysPrompt = `You are a highly organized AI assistant. The user has an upcoming calendar event: "${ev.title}" on ${ev.date}.
${contextMsg}
Based on the past notes (if any) and the nature of the upcoming event, write a concise preparation checklist and briefing for the user. What should they keep in mind? What tasks resulted from previous meetings that they should follow up on?
You MUST write the response in ${lang} language. Respond only with the notes, no markdown blocks.`;

            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [ { role: "system", content: sysPrompt } ],
                    temperature: 0.3
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message || 'API Error');

            const aiText = data.choices[0].message.content.trim();
            const prepArea = document.getElementById(`event-prep-${eventId}`);
            if (prepArea) {
                prepArea.value = aiText;
            }
        } catch (err) {
            console.error('AI Prep Error:', err);
            window.App.showToast('Failed to generate prep notes.', 'error');
        } finally {
            if(btn) {
                btn.innerHTML = `✨ ${t('prepare_with_ai')}`;
                btn.disabled = false;
            }
        }
    }

    window.CalendarModule = { init, renderSection, renderDashboard, prevMonth, nextMonth, showAddEventModal, addEvent, showEventDetails, saveEventDetails, deleteEvent, prepareWithAI, syncWithGoogle };

})();
