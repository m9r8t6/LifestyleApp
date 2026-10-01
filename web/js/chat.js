(function() {
    'use strict';

    const STORAGE_KEY = 'lifeos_chat_history';
    let messages = [];
    let bound = false;

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function init() {
        try {
            messages = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch (e) {
            messages = [];
        }
        if (bound) return;
        bound = true;

        document.querySelectorAll('.chat-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const input = document.getElementById('chat-input');
                input.value = chip.textContent;
                input.focus();
            });
        });

        const sendBtn = document.getElementById('btn-chat-send');
        const inputField = document.getElementById('chat-input');
        
        if (sendBtn) {
            sendBtn.addEventListener('click', handleSend);
        }
        
        if (inputField) {
            inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                }
            });
        }
    }

    function saveMessages() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }

    function buildSystemPrompt() {
        // Gather all local data
        const profile = JSON.parse(localStorage.getItem('lifeos_profile') || '{}');
        const calendar = JSON.parse(localStorage.getItem('lifeos_calendar_events') || '[]');
        const workout = JSON.parse(localStorage.getItem('lifeos_workout_schedule') || '{}');
        const bodycare = JSON.parse(localStorage.getItem('lifeos_bodycare_items') || '[]');
        const recipes = JSON.parse(localStorage.getItem('lifeos_recipes') || '[]');
        
        const lang = window.i18n && window.i18n.getLang() === 'de' ? 'German' : 'English';

        let context = `You are LifeOS Assistant, an AI deeply integrated into the user's personal lifestyle app.
You must communicate in ${lang}.
Keep your answers highly concise, friendly, and directly related to the user's data when asked.
Here is the user's current data context from their app:

--- USER PROFILE ---
Age: ${profile.age || 'Unknown'}, Weight: ${profile.weight || 'Unknown'}kg, Height: ${profile.height || 'Unknown'}cm
Diet Restrictions: ${(profile.dietRestrictions || []).join(', ')}
Goals: ${JSON.stringify(profile.goals || {})}

--- WORKOUT SCHEDULE ---
${JSON.stringify(workout)}

--- CALENDAR EVENTS ---
${JSON.stringify(calendar)}

--- BODYCARE ROUTINES ---
${JSON.stringify(bodycare)}
`;

        return context;
    }

    function renderSection() {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        let html = '';
        
        if (messages.length === 0) {
            html += `<div style="text-align:center; color:var(--text-muted); margin-top:40px; font-size:0.9rem;">No messages yet. Ask me about your data!</div>`;
        } else {
            messages.forEach(msg => {
                const isUser = msg.role === 'user';
                html += `
                    <div style="display:flex; justify-content:${isUser ? 'flex-end' : 'flex-start'}; margin-bottom:12px;">
                        <div class="chat-bubble ${isUser ? 'user' : 'assistant'}">${escapeHtml(msg.content)}</div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    }

    async function handleSend() {
        const inputField = document.getElementById('chat-input');
        const text = inputField.value.trim();
        if (!text) return;

        // Add user message
        messages.push({ role: 'user', content: text });
        saveMessages();
        inputField.value = '';
        renderSection();

        // Add temporary loading message
        const container = document.getElementById('chat-messages');
        const loadingId = 'loading-' + Date.now();
        container.insertAdjacentHTML('beforeend', `
            <div id="${loadingId}" style="display:flex; justify-content:flex-start; margin-bottom:12px;">
                <div class="chat-bubble assistant thinking">Thinking…</div>
            </div>
        `);
        container.scrollTop = container.scrollHeight;

        try {
            // Prepare API payload
            let sysPrompt = buildSystemPrompt();
            
            // Limit history to last 10 messages to save context
            const historyToInclude = messages.slice(-10);
            
            const apiMessages = [
                { role: 'system', content: sysPrompt },
                ...historyToInclude
            ];

            const response = await fetch('/api/ai/chat', {
                credentials: 'same-origin',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'lifeos' },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: apiMessages,
                    temperature: 0.5
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message || 'API Error');

            const aiText = data.choices[0].message.content.trim();
            messages.push({ role: 'assistant', content: aiText });
            saveMessages();
            
        } catch (err) {
            console.error('Chat AI Error:', err);
            window.App.showToast('Failed to connect to AI', 'error');
            messages.push({ role: 'assistant', content: 'Sorry, I could not reach the assistant. Please try again in a moment.' });
            saveMessages();
        } finally {
            renderSection();
        }
    }

    function renderDashboard() {
        // Not needed for chat currently
    }

    window.ChatModule = { init, renderSection, renderDashboard };

})();
