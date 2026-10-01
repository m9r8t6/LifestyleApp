(function() {
    'use strict';

    const STORAGE_KEY = 'lifeos_chat_history';
    const MAX_STORED = 80;      // older messages are dropped so the saved history stays small
    const MAX_CONTEXT = 12;     // messages sent along with each question
    let messages = [];
    let bound = false;
    let busy = false;

    const esc = (text) => window.App.esc(text);
    const read = (key, fallback) => {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
    };

    function init() {
        messages = read(STORAGE_KEY, []);
        if (!Array.isArray(messages)) messages = [];
        if (bound) return;
        bound = true;

        document.querySelectorAll('.chat-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const input = document.getElementById('chat-input');
                input.value = chip.textContent;
                handleSend();
            });
        });

        document.getElementById('btn-chat-send')?.addEventListener('click', handleSend);
        document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
    }

    function saveMessages() {
        if (messages.length > MAX_STORED) messages = messages.slice(-MAX_STORED);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }

    /** Everything the assistant should know: the same data the screens show. */
    function buildSystemPrompt() {
        const profile = read('lifeos_profile', {});
        const goals = Object.entries(profile.goals || {}).filter(([, on]) => on).map(([name]) => name);
        const lang = window.i18n && window.i18n.getLang() === 'de' ? 'German' : 'English';
        const today = window.App.getToday();
        const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });

        const food = window.FoodModule ? window.FoodModule.getContextForAI() : {};
        const sport = window.SportModule ? window.SportModule.getContextForAI() : {};
        const care = window.BodycareModule
            ? ['morning', 'evening'].map(time => `${time}: ` + (window.BodycareModule.getTodayItems(time).map(i => `${i.label}${i.done ? ' [done]' : ''}`).join(', ') || 'nothing due'))
            : [];
        const todos = window.TodoModule ? window.TodoModule.getPending().map((t, i) => `${i + 1}. ${t.title}${t.description ? ` — ${t.description}` : ''}`) : [];
        const events = window.CalendarModule ? window.CalendarModule.getContextForAI() : [];
        const mails = window.MailModule ? window.MailModule.getContextForAI() : [];
        const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        return `You are the assistant inside the user's personal lifestyle app "LifeOS".
Answer in the language the user writes in (if unclear, use ${lang}). Write plain text without Markdown: no asterisks, no headings; use short lines and simple dashes for lists. Be concise, concrete and friendly. Base every statement about the user on the data below; if something is not in the data, say so instead of guessing. You cannot change the app's data yourself.
Today is ${weekday}, ${today}, and it is ${now} now.
When the user asks what to do next, what can be done quickly, or for a plan: answer with a numbered sequence in a sensible order (quick wins and things that fit together first), give a rough time for each step, and only use items that are in the data below. Keep it short enough to act on.

--- PROFILE ---
Sex: ${profile.sex || 'unknown'}, age: ${profile.age || 'unknown'}, weight: ${profile.weight || 'unknown'} kg, height: ${profile.height || 'unknown'} cm
Goals: ${goals.join(', ') || 'none set'}
Diet restrictions: ${(profile.dietRestrictions || []).join(', ') || 'none'}

--- NUTRITION ---
Daily targets (kcal; protein and fiber in g; zinc, iron, omega3, vitaminC, vitaminE, magnesium in mg; vitaminA, B12, D, biotin in mcg): ${JSON.stringify(food.targets || {})}
Today's meals: ${(food.todaysMeals || []).join('; ') || 'none planned'}
Nutrients in today's planned meals (units as in the targets): ${JSON.stringify(food.plannedTotals || {})}
Nutrients eaten so far today: ${JSON.stringify(food.eatenTotals || {})}
Recipes in the library: ${(food.recipeLibrary || []).join('; ')}

--- TRAINING ---
Weekly plan: ${(sport.weeklyPlan || []).join(' | ')}
Today's exercises: ${(sport.today || []).join('; ') || 'none (rest day or nothing planned)'}
Latest lifts: ${(sport.latestLifts || []).join('; ') || 'nothing logged yet'}
Body weight log: ${(sport.bodyWeight || []).join('; ') || 'nothing logged yet'}

--- BODY CARE DUE TODAY ---
${care.join('\n')}

--- OPEN TO-DOS ---
${todos.join('\n') || 'none'}

--- UPCOMING EVENTS ---
${events.join('\n') || 'none'}

--- UNREAD IMPORTANT MAIL ---
${mails.join('\n') || 'none loaded (the Mail screen has not been opened in this session, or nothing is unread)'}
`;
    }

    function bubble(msg) {
        const isUser = msg.role === 'user';
        return `<div class="chat-row ${isUser ? 'user' : 'assistant'}"><div class="chat-bubble ${isUser ? 'user' : 'assistant'}">${esc(msg.content)}</div></div>`;
    }

    function renderSection() {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        if (messages.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="empty-state-text">Ask about your meals, training or what is due today.</div></div>`;
        } else {
            container.innerHTML = messages.map(bubble).join('')
                + `<button type="button" class="chat-clear" id="btn-chat-clear">Clear conversation</button>`;
            document.getElementById('btn-chat-clear')?.addEventListener('click', () => {
                if (!confirm('Delete this conversation?')) return;
                messages = [];
                saveMessages();
                renderSection();
            });
        }
        window.scrollTo(0, document.body.scrollHeight);
    }

    async function handleSend() {
        const inputField = document.getElementById('chat-input');
        const text = inputField.value.trim();
        if (!text || busy) return;
        busy = true;

        messages.push({ role: 'user', content: text });
        saveMessages();
        inputField.value = '';
        renderSection();

        const container = document.getElementById('chat-messages');
        container.insertAdjacentHTML('beforeend', `<div class="chat-row assistant" id="chat-thinking"><div class="chat-bubble assistant thinking">Thinking…</div></div>`);
        window.scrollTo(0, document.body.scrollHeight);

        try {
            const history = messages.slice(-MAX_CONTEXT).map(m => ({ role: m.role, content: m.content }));
            const answer = await window.App.ai([{ role: 'system', content: buildSystemPrompt() }, ...history], { temperature: 0.5 });
            messages.push({ role: 'assistant', content: answer });
            saveMessages();
        } catch (err) {
            console.error('Chat AI Error:', err);
            // The failed question is kept so it can simply be sent again
            window.App.showToast(err.message || 'The assistant could not answer.', 'error');
            messages.pop();
            saveMessages();
            inputField.value = text;
        } finally {
            busy = false;
            renderSection();
        }
    }

    function renderDashboard() {}

    window.ChatModule = { init, renderSection, renderDashboard };

})();
