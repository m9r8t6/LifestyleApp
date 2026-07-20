(function() {
    'use strict';

    const STORAGE_KEY = 'lifeos_chat_history';
    let messages = [];

    function init() {
        try {
            messages = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch (e) {
            messages = [];
        }
        
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
            html = `<div style="text-align:center; color:var(--text-muted); margin-top:40px; font-size:0.9rem;">No messages yet. Ask me about your data!</div>`;
        } else {
            messages.forEach(msg => {
                const isUser = msg.role === 'user';
                html += `
                    <div style="display:flex; justify-content:${isUser ? 'flex-end' : 'flex-start'};">
                        <div style="max-width:80%; padding:10px 14px; border-radius:16px; font-size:0.9rem; line-height:1.4; white-space:pre-wrap; 
                            background:${isUser ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}; 
                            color:${isUser ? '#fff' : 'var(--text)'};
                            border-bottom-${isUser ? 'right' : 'left'}-radius: 4px;
                            border: 1px solid ${isUser ? 'transparent' : 'rgba(255,255,255,0.1)'};
                        ">
                            ${msg.content}
                        </div>
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

        const apiKey = localStorage.getItem('lifeos_deepseek_key');
        if (!apiKey) {
            window.App.showToast('Please set your DeepSeek API Key in Settings first', 'error');
            return;
        }

        // Add user message
        messages.push({ role: 'user', content: text });
        saveMessages();
        inputField.value = '';
        renderSection();

        // Add temporary loading message
        const container = document.getElementById('chat-messages');
        const loadingId = 'loading-' + Date.now();
        container.insertAdjacentHTML('beforeend', `
            <div id="${loadingId}" style="display:flex; justify-content:flex-start; margin-top:12px;">
                <div style="max-width:80%; padding:10px 14px; border-radius:16px; font-size:0.9rem; background:rgba(255,255,255,0.05); color:var(--text-muted); border-bottom-left-radius:4px; border: 1px solid rgba(255,255,255,0.1);">
                    <span style="animation: pulse 1.5s infinite;">Thinking...</span>
                </div>
            </div>
        `);
        container.scrollTop = container.scrollHeight;

        try {
            // Prepare API payload
            const sysPrompt = buildSystemPrompt();
            
            // Limit history to last 10 messages to save context
            const historyToInclude = messages.slice(-10);
            
            const apiMessages = [
                { role: 'system', content: sysPrompt },
                ...historyToInclude
            ];

            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
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
            messages.push({ role: 'assistant', content: 'Sorry, I encountered an error. Please check your API key and connection.' });
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
