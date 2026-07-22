(function() {
    'use strict';

    let emails = [];
    let isLoading = false;
    let isConnected = false;
    let categorySummaries = { work: '', shopping: '', other: '' };
    let isSummarizingCategory = { work: false, shopping: false, other: false };

    const t = (key) => window.i18n ? window.i18n.t(key) : key;

    function init() {
        // Nothing special to load on init, depends on RAGModule auth
    }

    // Helper to decode base64url encoded strings from Gmail API
    function decodeBase64Url(base64UrlStr) {
        if (!base64UrlStr) return '';
        let base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
        const pad = base64.length % 4;
        if (pad) {
            if (pad === 1) {
                throw new Error('InvalidLengthError: Input base64url string is the wrong length to determine padding');
            }
            base64 += new Array(5 - pad).join('=');
        }
        try {
            return decodeURIComponent(escape(atob(base64)));
        } catch (e) {
            return atob(base64);
        }
    }

    function extractBody(payload) {
        if (!payload) return '';
        if (payload.mimeType === 'text/plain') return decodeBase64Url(payload.body.data);
        if (payload.mimeType === 'text/html') {
            // Very naive HTML to text, but better to get plain text if possible
            const html = decodeBase64Url(payload.body.data);
            const tmp = document.createElement('DIV');
            tmp.innerHTML = html;
            return tmp.textContent || tmp.innerText || "";
        }
        
        if (payload.parts && payload.parts.length > 0) {
            // Prefer text/plain
            const plainTextPart = payload.parts.find(p => p.mimeType === 'text/plain');
            if (plainTextPart) return extractBody(plainTextPart);
            
            // Fallback to text/html
            const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
            if (htmlPart) return extractBody(htmlPart);
            
            // Fallback to first part (e.g. multipart/alternative)
            return extractBody(payload.parts[0]);
        }
        
        return '';
    }

    async function categorizeEmails(emailsToCategorize) {
        if (emailsToCategorize.length === 0) return;
        const apiKey = localStorage.getItem('lifeos_deepseek_key');
        if (!apiKey) {
            emailsToCategorize.forEach(e => e.category = 'other');
            return;
        }

        const inputList = emailsToCategorize.map(e => `ID: ${e.id} | From: ${e.from} | Subject: ${e.subject}`).join('\n');
        
        try {
            const sysPrompt = `Categorize the following emails into exactly one of three categories: "work", "shopping", or "other". Return ONLY a valid JSON object with a "categories" array containing "id" and "category" keys. Example: {"categories": [{"id":"123", "category":"work"}]}`;
            
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [ 
                        { role: "system", content: sysPrompt },
                        { role: "user", content: inputList }
                    ],
                    temperature: 0.1,
                    response_format: { type: "json_object" }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message || 'API Error');

            let resultJson = data.choices[0].message.content.trim();
            // Remove markdown code blocks if the AI misbehaves
            resultJson = resultJson.replace(/```json/g, '').replace(/```/g, '');
            
            let parsed = JSON.parse(resultJson);
            let catArray = parsed.categories || [];

            const catMap = {};
            catArray.forEach(c => catMap[c.id] = c.category.toLowerCase());

            emailsToCategorize.forEach(e => {
                e.category = catMap[e.id] || 'other';
                if (!['work', 'shopping', 'other'].includes(e.category)) e.category = 'other';
            });
        } catch (err) {
            console.error('Categorization error:', err);
            emailsToCategorize.forEach(e => e.category = 'other');
        }
    }

    async function fetchEmails() {
        if (!window.RAGModule || !window.RAGModule.isReady) {
            window.App.showToast('Please connect to Google Drive/Gmail first (Settings or bottom button)', 'error');
            return;
        }
        const token = window.RAGModule.getAccessToken();
        
        isLoading = true;
        renderSection();

        try {
            // 1. Fetch message list
            const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=in:inbox -category:promotions -category:social', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!listRes.ok) throw new Error('Failed to fetch messages. Have you authorized Gmail?');
            const listData = await listRes.json();

            if (!listData.messages || listData.messages.length === 0) {
                emails = [];
                isConnected = true;
                isLoading = false;
                renderSection();
                return;
            }

            // 2. Fetch full details for each message
            const detailsPromises = listData.messages.map(m => 
                fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).then(r => r.json())
            );

            const details = await Promise.all(detailsPromises);

            let fetchedEmails = details.map(d => {
                const headers = d.payload.headers;
                const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';
                const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
                const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';
                
                // Parse body
                const body = extractBody(d.payload);

                return {
                    id: d.id,
                    threadId: d.threadId,
                    snippet: d.snippet,
                    subject,
                    from,
                    date: new Date(date).toLocaleString(),
                    body: body,
                    isUnread: d.labelIds.includes('UNREAD'),
                    category: 'other', // Default, will be updated
                    aiSummary: '',
                    aiDraft: ''
                };
            });
            
            await categorizeEmails(fetchedEmails);
            emails = fetchedEmails;
            categorySummaries = { work: '', shopping: '', other: '' };

            isConnected = true;
            window.App.showToast('Emails loaded & categorized', 'success');
        } catch (e) {
            console.error(e);
            window.App.showToast(e.message || 'Error fetching emails', 'error');
            // If it failed due to permissions, we might need to prompt re-auth
            isConnected = false;
        } finally {
            isLoading = false;
            renderSection();
        }
    }

    async function summarizeEmail(id) {
        const email = emails.find(e => e.id === id);
        if (!email) return;

        const apiKey = localStorage.getItem('lifeos_deepseek_key');
        if (!apiKey) {
            window.App.showToast('Please set your DeepSeek API Key in Settings first', 'error');
            return;
        }

        const btn = document.getElementById(`btn-sum-${id}`);
        if(btn) { btn.innerHTML = 'Thinking...'; btn.disabled = true; }

        try {
            const sysPrompt = `You are a highly efficient assistant. Summarize the following email in 2-3 concise bullet points. Focus on the core message and any actionable items. Write in the same language as the email.`;
            const userPrompt = `Subject: ${email.subject}\nFrom: ${email.from}\n\n${email.body}`;

            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [ 
                        { role: "system", content: sysPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.3
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message || 'API Error');

            email.aiSummary = data.choices[0].message.content.trim();
        } catch (err) {
            console.error(err);
            window.App.showToast('Failed to summarize email.', 'error');
        } finally {
            renderSection();
            // Keep expanded
            const expandDiv = document.getElementById(`expand-mail-${id}`);
            if (expandDiv) expandDiv.style.display = 'block';
        }
    }

    async function draftReply(id) {
        const email = emails.find(e => e.id === id);
        if (!email) return;

        const apiKey = localStorage.getItem('lifeos_deepseek_key');
        if (!apiKey) {
            window.App.showToast('Please set your DeepSeek API Key in Settings first', 'error');
            return;
        }

        const btn = document.getElementById(`btn-reply-${id}`);
        if(btn) { btn.innerHTML = 'Drafting...'; btn.disabled = true; }

        const extraInst = document.getElementById(`reply-inst-${id}`)?.value.trim() || '';

        try {
            const sysPrompt = `You are an AI assistant helping the user reply to an email. Write a polite, professional, and concise reply based on the context of the email. If the email asks for information, provide a generic polite placeholder like "[Insert Info Here]" for the user to fill out. Sign off with "Best regards,". Write in the same language as the email. Only output the reply text.`;
            const userPrompt = `Email from: ${email.from}\nSubject: ${email.subject}\nBody:\n${email.body}\n\n${extraInst ? `Additional instructions for reply: ${extraInst}\n\n` : ''}Please draft a reply.`;

            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [ 
                        { role: "system", content: sysPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.7
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message || 'API Error');

            email.aiDraft = data.choices[0].message.content.trim();
        } catch (err) {
            console.error(err);
            window.App.showToast('Failed to draft reply.', 'error');
        } finally {
            renderSection();
            const expandDiv = document.getElementById(`expand-mail-${id}`);
            if (expandDiv) expandDiv.style.display = 'block';
        }
    }

    async function summarizeCategory(category) {
        const unreadInCat = emails.filter(e => e.category === category && e.isUnread);
        if (unreadInCat.length === 0) {
            window.App.showToast(`No unread emails in ${category}`, 'info');
            return;
        }

        const apiKey = localStorage.getItem('lifeos_deepseek_key');
        if (!apiKey) {
            window.App.showToast('Please set your DeepSeek API Key in Settings first', 'error');
            return;
        }

        isSummarizingCategory[category] = true;
        renderSection();

        try {
            const sysPrompt = `You are a helpful AI assistant. Summarize the following unread emails from the "${category}" category. Provide a consolidated summary in 3-5 bullet points, highlighting only what the user needs to take note of or action on. Keep it concise.`;
            const userPrompt = unreadInCat.map(e => `Subject: ${e.subject}\nFrom: ${e.from}\nBody: ${e.snippet}`).join('\n\n---\n\n');

            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [ 
                        { role: "system", content: sysPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.3
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message || 'API Error');

            categorySummaries[category] = data.choices[0].message.content.trim();
        } catch (err) {
            console.error('Category summary error:', err);
            window.App.showToast(`Failed to summarize ${category}.`, 'error');
        } finally {
            isSummarizingCategory[category] = false;
            renderSection();
        }
    }

    function toggleExpand(id) {
        const el = document.getElementById(`expand-mail-${id}`);
        if (el) {
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        }
    }

    function renderSection() {
        const container = document.getElementById('mail-container');
        if (!container) return;

        let html = `
            <div class="card-header-row" style="margin-bottom: 16px;">
                <h2 style="margin:0;">Inbox</h2>
                <button class="btn ${isConnected ? 'btn-ghost' : 'btn-primary'} btn-sm" onclick="MailModule.fetchEmails()" ${isLoading ? 'disabled' : ''}>
                    ${isLoading ? 'Loading...' : (isConnected ? '🔄 Refresh' : 'Connect Gmail')}
                </button>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
        `;

        if (!isConnected && !isLoading) {
            html += `
                <div class="glass-card" style="text-align:center; padding:32px 16px;">
                    <div style="font-size:3rem; margin-bottom:16px;">📧</div>
                    <h3 style="margin-bottom:8px;">Connect your Inbox</h3>
                    <p style="color:var(--text-muted); font-size:0.9rem; line-height:1.5; margin-bottom:24px;">
                        LifeOS can read your recent emails and use AI to summarize them and draft responses automatically.
                    </p>
                    <button class="btn btn-primary" onclick="window.RAGModule.authGoogle(false)">Authorize Google API</button>
                </div>
            `;
        } else if (isLoading) {
            html += `<div class="empty-state"><div class="empty-state-text">Fetching emails...</div></div>`;
        } else if (emails.length === 0) {
            html += `<div class="empty-state"><div class="empty-state-text">Inbox is zero! 🎉</div></div>`;
        } else {
            const categories = ['work', 'shopping', 'other'];
            const categoryLabels = { 
                work: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg> Work', 
                shopping: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg> Shopping', 
                other: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg> Other' 
            };

            categories.forEach(cat => {
                const catEmails = emails.filter(e => e.category === cat);
                if (catEmails.length === 0) return;

                const unreadCount = catEmails.filter(e => e.isUnread).length;

                html += `
                    <div style="margin-top: 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid var(--glass-border); padding-bottom: 8px;">
                        <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-secondary);">${categoryLabels[cat]}</h3>
                        ${unreadCount > 0 ? `<button class="btn btn-sm btn-ghost" onclick="MailModule.summarizeCategory('${cat}')" ${isSummarizingCategory[cat] ? 'disabled' : ''} style="font-size: 0.7rem; border-color: rgba(99,102,241,0.3); color: var(--primary-light);">${isSummarizingCategory[cat] ? 'Thinking...' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:2px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Summarize Unread'}</button>` : ''}
                    </div>
                `;

                if (categorySummaries[cat]) {
                    html += `
                        <div class="glass-card stagger-item" style="margin-bottom: 12px; border-left: 4px solid var(--accent);">
                            <div style="font-weight: 700; color: var(--accent); font-size: 0.8rem; text-transform: uppercase; margin-bottom: 8px;">Unread Summary</div>
                            <div style="font-size: 0.85rem; color: var(--text); line-height: 1.5;">${categorySummaries[cat].replace(/\n/g, '<br>')}</div>
                        </div>
                    `;
                }

                html += `<div style="display:flex; flex-direction:column; gap:12px; margin-bottom: 24px;">`;

                catEmails.forEach((email, idx) => {
                    // Shorten from name (e.g. "John Doe <john@doe.com>" -> "John Doe")
                    let fromName = email.from.split('<')[0].trim();
                    if (fromName.startsWith('"') && fromName.endsWith('"')) fromName = fromName.substring(1, fromName.length - 1);
                    
                    html += `
                        <div class="glass-card-sm stagger-item" style="animation-delay:${idx*20}ms;">
                            <div style="padding: 16px; cursor: pointer;" onclick="MailModule.toggleExpand('${email.id}')">
                                <div style="display:flex; justify-content:space-between; margin-bottom:4px; align-items:center;">
                                    <div style="font-weight: 700; font-size: 1rem; color: ${email.isUnread ? 'var(--text)' : 'var(--text-secondary)'};">
                                        ${email.isUnread ? '🔵 ' : ''}${fromName}
                                    </div>
                                    <div style="font-size: 0.75rem; color: var(--text-muted);">${email.date}</div>
                                </div>
                                <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; color: ${email.isUnread ? 'var(--text)' : 'var(--text-secondary)'};">
                                    ${email.subject}
                                </div>
                                <div style="font-size: 0.85rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${email.snippet}
                                </div>
                            </div>
                            
                            <!-- Expanded Details -->
                            <div id="expand-mail-${email.id}" style="display:none; border-top: 1px solid var(--glass-border); padding: 16px; background: rgba(0,0,0,0.2);">
                                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom: 16px;">
                                    <div style="display:flex; gap:8px;">
                                        <button class="btn btn-sm btn-accent" id="btn-sum-${email.id}" onclick="MailModule.summarizeEmail('${email.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Summarize</button>
                                        <button class="btn btn-sm btn-ghost" id="btn-reply-${email.id}" onclick="MailModule.draftReply('${email.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> Draft Reply</button>
                                    </div>
                                    <input type="text" id="reply-inst-${email.id}" class="form-input" style="font-size: 0.8rem; padding: 6px 10px; background: rgba(255,255,255,0.05);" placeholder="Optional instructions (e.g., 'Say yes, but only next week')">
                                </div>
                                
                                ${email.aiSummary ? `
                                    <div style="margin-bottom: 16px; padding: 12px; background: rgba(6, 182, 212, 0.1); border-left: 3px solid var(--accent); border-radius: 4px;">
                                        <strong style="color:var(--accent); font-size:0.8rem; text-transform:uppercase;">AI Summary</strong>
                                        <div style="font-size: 0.85rem; color:var(--text); margin-top:8px;">
                                            ${email.aiSummary.replace(/\n/g, '<br>')}
                                        </div>
                                    </div>
                                ` : ''}

                                ${email.aiDraft ? `
                                    <div style="margin-bottom: 16px; padding: 12px; background: rgba(139, 92, 246, 0.1); border-left: 3px solid var(--primary-light); border-radius: 4px;">
                                        <strong style="color:var(--primary-light); font-size:0.8rem; text-transform:uppercase;">AI Draft Reply</strong>
                                        <textarea class="form-input" style="min-height: 120px; resize:vertical; margin-top:8px;">${email.aiDraft}</textarea>
                                    </div>
                                ` : ''}

                                <div style="font-size: 0.85rem; color: var(--text); line-height: 1.5; white-space: pre-wrap; font-family: monospace; overflow-x: auto;">
                                    ${email.body}
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                html += `</div>`; // Close category emails wrapper
            });
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    function renderDashboard() {
        // Optional
    }

    window.MailModule = { init, renderSection, renderDashboard, fetchEmails, summarizeEmail, draftReply, toggleExpand };

})();
