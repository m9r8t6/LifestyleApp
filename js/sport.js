(function() {
    const STORAGE_SCHEDULE = 'lifeos_workout_schedule';
    const STORAGE_COMPLETION = 'lifeos_workout_completion';
    const STORAGE_TIMER = 'lifeos_timer_duration';
    const STORAGE_HISTORY = 'lifeos_sport_history';
    const STORAGE_BODY_WEIGHT = 'lifeos_body_weight_history';

    const DEFAULT_SCHEDULE = {
        1: { type: 'chest', exercises: [] },
        2: { type: 'back', exercises: [] },
        3: { type: 'legs', exercises: [] },
        4: { type: 'chest', exercises: [] },
        5: { type: 'back', exercises: [] },
        6: { type: 'legs', exercises: [] },
        0: { type: 'rest', exercises: [] }
    };

    let schedule = {};
    let completion = { date: '', completed: [] }; // array of exercise IDs
    let selectedDayIndex = 1;
    let sportHistory = {}; // { "Bench Press": [{date, weight}] }
    let bodyWeightHistory = []; // [{date, weight}]

    // Chart state
    let chartInstance = null;
    let chartMetric = 'Body Weight';
    let chartTimeframe = 'month'; // 'week', 'month', 'year'

    // Timer state
    let timerDuration = 180; // seconds
    let timerRemaining = 180;
    let timerInterval = null;
    let timerRunning = false;
    let timerEndTime = 0; // Timestamp for robust background handling

    // Audio context for beep
    let audioCtx = null;
    let beepInterval = null;
    
    const t = (k) => window.i18n ? window.i18n.t(k) : k;

    function generateId() {
        return Math.random().toString(36).substring(2, 9);
    }

    function loadData() {
        const storedSchedule = localStorage.getItem(STORAGE_SCHEDULE);
        schedule = storedSchedule ? JSON.parse(storedSchedule) : DEFAULT_SCHEDULE;

        // Auto-wipe old default schedule (if it starts with Bench Press) so user can start fresh
        if (schedule[1] && schedule[1].exercises && schedule[1].exercises.length > 0 && schedule[1].exercises[0].name === 'Bench Press') {
            schedule = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
            saveSchedule();
        }

        const storedCompletion = localStorage.getItem(STORAGE_COMPLETION);
        if (storedCompletion) completion = JSON.parse(storedCompletion);

        const storedTimer = localStorage.getItem(STORAGE_TIMER);
        if (storedTimer) {
            timerDuration = parseInt(storedTimer, 10);
            timerRemaining = timerDuration;
        }

        const storedHistory = localStorage.getItem(STORAGE_HISTORY);
        if (storedHistory) sportHistory = JSON.parse(storedHistory);

        const storedBW = localStorage.getItem(STORAGE_BODY_WEIGHT);
        if (storedBW) bodyWeightHistory = JSON.parse(storedBW);

        const today = window.App ? window.App.getToday() : new Date().toISOString().slice(0, 10);
        if (completion.date !== today) {
            completion = { date: today, completed: [] };
            saveCompletion();
        }

        selectedDayIndex = window.App ? window.App.getDayOfWeek() : new Date().getDay();
        
        updateTimerDisplay();
    }

    function saveSchedule() {
        localStorage.setItem(STORAGE_SCHEDULE, JSON.stringify(schedule));
    }

    function saveCompletion() {
        localStorage.setItem(STORAGE_COMPLETION, JSON.stringify(completion));
    }

    function saveTimer() {
        localStorage.setItem(STORAGE_TIMER, timerDuration.toString());
    }

    function saveSportHistory() {
        localStorage.setItem(STORAGE_HISTORY, JSON.stringify(sportHistory));
    }

    function saveBodyWeight() {
        localStorage.setItem(STORAGE_BODY_WEIGHT, JSON.stringify(bodyWeightHistory));
    }

    // --- Timer Logic ---
    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return {
            m: m.toString().padStart(2, '0'),
            s: s.toString().padStart(2, '0')
        };
    }

    function updateTimerDisplay() {
        const mEl = document.getElementById('timer-minutes');
        const sEl = document.getElementById('timer-seconds');
        const lblEl = document.getElementById('timer-duration-label');
        const progEl = document.getElementById('timer-progress');
        
        if (mEl && sEl) {
            const t = formatTime(timerRemaining);
            mEl.textContent = t.m;
            sEl.textContent = t.s;
        }

        if (lblEl) {
            lblEl.textContent = `${Math.floor(timerDuration/60)}:${(timerDuration%60).toString().padStart(2, '0')}`;
        }

        if (progEl) {
            const circumference = 553; // 2 * pi * 88
            const fraction = 1 - (timerRemaining / timerDuration);
            progEl.style.strokeDashoffset = circumference * fraction;
        }
    }

    function toggleTimer() {
        const btn = document.getElementById('timer-start');
        const colons = document.querySelectorAll('.timer-colon');

        if (timerRunning) {
            clearInterval(timerInterval);
            timerRunning = false;
            // Catch up exact time on pause
            timerRemaining = Math.max(0, Math.ceil((timerEndTime - Date.now()) / 1000));
            updateTimerDisplay();
            
            if(btn) {
                btn.textContent = 'Start';
                btn.classList.remove('running');
            }
            colons.forEach(c => c.classList.add('paused'));
        } else {
            if (timerRemaining <= 0) {
                timerRemaining = timerDuration;
                stopBeep();
            }
            document.querySelector('.timer-container')?.classList.remove('timer-done');
            
            timerRunning = true;
            timerEndTime = Date.now() + (timerRemaining * 1000);

            if(btn) {
                btn.textContent = 'Pause';
                btn.classList.add('running');
            }
            colons.forEach(c => c.classList.remove('paused'));

            // init audio context on first user interaction
            if (!audioCtx && window.AudioContext) {
                audioCtx = new AudioContext();
            }

            timerInterval = setInterval(() => {
                const now = Date.now();
                timerRemaining = Math.max(0, Math.ceil((timerEndTime - now) / 1000));
                updateTimerDisplay();

                if (timerRemaining <= 0) {
                    clearInterval(timerInterval);
                    timerRunning = false;
                    if(btn) {
                        btn.textContent = 'Start';
                        btn.classList.remove('running');
                    }
                    colons.forEach(c => c.classList.add('paused'));
                    document.querySelector('.timer-container')?.classList.add('timer-done');
                    playBeep();
                }
            }, 250); // Check frequently for smooth animation and catchup
        }
    }

    function resetTimer() {
        clearInterval(timerInterval);
        stopBeep();
        timerRunning = false;
        timerRemaining = timerDuration;
        
        const btn = document.getElementById('timer-start');
        if(btn) {
            btn.textContent = 'Start';
            btn.classList.remove('running');
        }
        document.querySelectorAll('.timer-colon').forEach(c => c.classList.add('paused'));
        document.querySelector('.timer-container')?.classList.remove('timer-done');
        
        updateTimerDisplay();
    }

    function playBeep() {
        stopBeep(); // Clear any existing

        const soundOn = localStorage.getItem('lifeos_sound') !== 'off';
        
        const singleBeep = () => {
            if (navigator.vibrate) {
                navigator.vibrate([200, 100]);
            }
            if (soundOn && audioCtx) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, audioCtx.currentTime);
                gain.gain.setValueAtTime(1, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 0.3);
            }
        };

        // Play first immediately
        singleBeep();
        
        // Then loop every 1.5 seconds until stopped
        beepInterval = setInterval(singleBeep, 1500);

        if(window.App) window.App.showToast('Rest is over! Back to work 💪', 'success');
    }

    function stopBeep() {
        if (beepInterval) {
            clearInterval(beepInterval);
            beepInterval = null;
        }
    }

    // Bind timer events
    function bindTimer() {
        document.getElementById('timer-start')?.addEventListener('click', toggleTimer);
        document.getElementById('timer-reset')?.addEventListener('click', resetTimer);
        document.getElementById('timer-close')?.addEventListener('click', () => {
            document.getElementById('timer-overlay')?.classList.add('hidden');
            stopBeep();
        });
        document.getElementById('timer-decrease')?.addEventListener('click', () => {
            if (timerDuration > 30) {
                timerDuration -= 30;
                saveTimer();
                if(!timerRunning) { timerRemaining = timerDuration; }
                updateTimerDisplay();
            }
        });
        document.getElementById('timer-increase')?.addEventListener('click', () => {
            if (timerDuration < 600) {
                timerDuration += 30;
                saveTimer();
                if(!timerRunning) { timerRemaining = timerDuration; }
                updateTimerDisplay();
            }
        });
    }

    // --- Rendering ---
    function renderDayTypeBadge(type) {
        return `<span class="day-type-badge ${type}">${type}</span>`;
    }

    function renderDashboard() {
        const container = document.getElementById('dashboard-workout');
        if (!container) return;

        const todayIndex = window.App ? window.App.getDayOfWeek() : new Date().getDay();
        const dayPlan = schedule[todayIndex];

        let html = `
            <div class="card-header-row">
                <h2>Today's Workout</h2>
                ${renderDayTypeBadge(dayPlan.type)}
            </div>
        `;

        if (dayPlan.type === 'rest') {
            html += `<div class="empty-state"><div class="empty-state-text">${t('rest_day_enjoy')}</div></div>`;
        } else {
            const total = dayPlan.exercises.length;
            const done = dayPlan.exercises.filter(ex => completion.completed.includes(ex.id)).length;
            
            html += `
                <div class="progress-row stagger-item">
                    <div class="progress-info">
                        <div class="progress-label"><span>Exercises Completed</span><span class="progress-pct">${done}/${total}</span></div>
                        <div class="progress-track"><div class="progress-fill grad-accent" style="width:${total ? (done/total)*100 : 0}%"></div></div>
                    </div>
                </div>
                <div style="text-align: right; margin-top: 10px;">
                    <button class="btn btn-sm btn-ghost" onclick="document.getElementById('nav-sport').click()">View Details →</button>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    function renderSection() {
        const todayContainer = document.getElementById('sport-today');
        const timerBtnContainer = document.getElementById('sport-timer-container');
        const weeklyContainer = document.getElementById('sport-weekly');
        const exContainer = document.getElementById('sport-exercises');

        const todayIndex = window.App ? window.App.getDayOfWeek() : new Date().getDay();
        const todayPlan = schedule[todayIndex];

        renderAnalytics();

        // 1. Today's Workout
        if (todayContainer) {
            let tHtml = `
                <div class="card-header-row">
                    <div class="section-title" style="margin:0"><div class="section-title-icon" style="background:rgba(6,182,212,0.2); color: var(--accent-light);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 000 20 14.5 14.5 0 000-20"/><path d="M2 12h20"/></svg></div><h2>${t('workout')}</h2></div>
                    ${renderDayTypeBadge(todayPlan.type)}
                </div>
            `;

            if (todayPlan.type === 'rest') {
                tHtml += `<div class="empty-state stagger-item"><div class="empty-state-text">${t('rest_day')}</div></div>`;
            } else if (todayPlan.exercises.length === 0) {
                tHtml += `<div class="empty-state stagger-item"><div class="empty-state-text">${t('no_exercises_added')}</div></div>`;
            } else {
                todayPlan.exercises.forEach((ex, idx) => {
                    const isDone = completion.completed.includes(ex.id);
                    let lastW = '';
                    let isPR = false;
                    if (sportHistory[ex.name] && sportHistory[ex.name].length > 0) {
                        lastW = sportHistory[ex.name][sportHistory[ex.name].length - 1].weight;
                        const maxW = Math.max(...sportHistory[ex.name].map(h => h.weight));
                        if (lastW === maxW && sportHistory[ex.name].length > 1) { // PR if it's the max and they have history
                            isPR = true;
                        }
                    }
                    
                    const trophySvg = isPR ? `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #fbbf24; margin-left: 6px; vertical-align: middle; display:inline-block;"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>` : '';
                    
                    tHtml += `
                        <div class="checklist-item stagger-item ${isDone ? 'checked' : ''}" data-ex-id="${ex.id}" data-ex-name="${ex.name}">
                            <div class="checklist-check">✓</div>
                            <div class="checklist-content" style="flex: 1;">
                                <div class="checklist-text" style="display:flex; align-items:center;">${ex.name}${trophySvg}</div>
                                <div class="checklist-sub">${ex.sets} sets × ${ex.reps} ${ex.weight ? '| '+ex.weight : ''}</div>
                            </div>
                            <div class="weight-input-container" style="display:flex; align-items:center; gap:4px;" onclick="event.stopPropagation()">
                                <input type="number" step="0.1" class="weight-input" placeholder="kg" style="width:50px; padding:6px; border-radius:6px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.2); color:var(--text); font-size:0.85rem; outline:none;" value="${lastW}" />
                                <button class="btn-save-weight" style="background:var(--primary); color:white; border:none; border-radius:6px; padding:6px 10px; font-size:0.8rem; cursor:pointer;">Save</button>
                            </div>
                        </div>
                    `;
                });
            }
            todayContainer.innerHTML = tHtml;

            // Bind checkboxes
            todayContainer.querySelectorAll('.checklist-item').forEach(item => {
                item.addEventListener('click', () => {
                    const exId = item.getAttribute('data-ex-id');
                    const idx = completion.completed.indexOf(exId);
                    if (idx > -1) {
                        completion.completed.splice(idx, 1);
                        item.classList.remove('checked');
                    } else {
                        completion.completed.push(exId);
                        item.classList.add('checked');
                    }
                    saveCompletion();
                    if(window.App && window.App.onCompletionChange) window.App.onCompletionChange();
                });
                
                const saveBtn = item.querySelector('.btn-save-weight');
                const inputField = item.querySelector('.weight-input');
                if (saveBtn && inputField) {
                    saveBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const exName = item.getAttribute('data-ex-name');
                        const w = inputField.value;
                        if (w.trim() !== '') {
                            const numericW = parseFloat(w);
                            let maxW = 0;
                            if (sportHistory[exName] && sportHistory[exName].length > 0) {
                                maxW = Math.max(...sportHistory[exName].map(h => h.weight));
                            }
                            
                            if (!sportHistory[exName]) sportHistory[exName] = [];
                            sportHistory[exName].push({ date: window.App ? window.App.getToday() : new Date().toISOString().slice(0, 10), weight: numericW });
                            saveSportHistory();
                            
                            if (numericW > maxW && maxW > 0) {
                                if(window.App) window.App.showToast(`New PR for ${exName}!`, 'success');
                                // Trigger a re-render to show the badge
                                setTimeout(() => renderSection(), 100);
                            }
                            
                            renderAnalytics();
                            
                            saveBtn.textContent = '✓';
                            saveBtn.style.background = '#10b981';
                            setTimeout(() => {
                                saveBtn.textContent = 'Save';
                                saveBtn.style.background = 'var(--primary)';
                            }, 2000);
                        }
                    });
                }
            });
        }

        // 2. Timer button
        if (timerBtnContainer && todayPlan.type !== 'rest') {
            timerBtnContainer.innerHTML = `<button class="btn btn-ghost" id="btn-open-timer" style="width:100%"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${t('open_rest_timer')}</button>`;
            document.getElementById('btn-open-timer')?.addEventListener('click', () => {
                document.getElementById('timer-overlay')?.classList.remove('hidden');
                updateTimerDisplay();
            });
        } else if (timerBtnContainer) {
            timerBtnContainer.innerHTML = '';
        }

        // 3. Weekly Schedule
        if (weeklyContainer) {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            let chips = '';
            for(let i=1; i<=7; i++) {
                let dayIdx = i % 7; // start mon (1), end sun (0)
                let s = schedule[dayIdx];
                let classes = 'day-chip';
                if(dayIdx === selectedDayIndex) classes += ' active';
                if(s.type === 'rest') classes += ' rest';
                chips += `<div class="${classes}" data-day="${dayIdx}">${days[dayIdx]}</div>`;
            }

            weeklyContainer.innerHTML = `
                <div class="card-header-row" style="margin-bottom:8px"><h2>${t('weekly_planner')}</h2></div>
                <div class="day-chips" style="margin-bottom: 12px">${chips}</div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:0.85rem; color:var(--text-secondary)">${t('day_type')} 
                        <span style="cursor:pointer; text-decoration:underline; font-weight:bold" id="btn-change-type">
                            ${schedule[selectedDayIndex].type.toUpperCase()}
                        </span>
                    </div>
                </div>
            `;

            weeklyContainer.querySelectorAll('.day-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    selectedDayIndex = parseInt(chip.getAttribute('data-day'));
                    renderSection();
                });
            });

            document.getElementById('btn-change-type')?.addEventListener('click', showChangeTypeModal);
        }

        // 4. Exercise Management (for selected day)
        if (exContainer) {
            const selPlan = schedule[selectedDayIndex];
            let exHtml = `
                <div class="card-header-row" style="margin-top:20px;">
                    <h2>${t('exercises')} (${selPlan.type})</h2>
                    ${selPlan.type !== 'rest' ? `<button class="btn btn-primary btn-sm" id="btn-add-ex">${t('add_exercise')}</button>` : ''}
                </div>
            `;

            if (selPlan.type === 'rest') {
                exHtml += `<div class="empty-state"><div class="empty-state-text">${t('no_exercises_rest')}</div></div>`;
            } else {
                selPlan.exercises.forEach(ex => {
                    exHtml += `
                        <div class="exercise-item stagger-item">
                            <div class="exercise-info">
                                <div class="exercise-name">${ex.name}</div>
                                <div class="exercise-detail">${ex.sets} × ${ex.reps} ${ex.weight ? '· '+ex.weight : ''}</div>
                            </div>
                            <div class="exercise-actions">
                                <button class="btn-icon ex-delete" data-id="${ex.id}">×</button>
                            </div>
                        </div>
                    `;
                });
            }
            exContainer.innerHTML = exHtml;

            document.getElementById('btn-add-ex')?.addEventListener('click', showAddExerciseModal);

            exContainer.querySelectorAll('.ex-delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    schedule[selectedDayIndex].exercises = schedule[selectedDayIndex].exercises.filter(x => x.id !== id);
                    saveSchedule();
                    renderSection();
                });
            });
        }
    }

    function showChangeTypeModal() {
        if (!window.App) return;
        const types = ['rest', 'chest', 'back', 'legs', 'push', 'pull', 'shoulders', 'arms', 'core', 'cardio', 'custom'];
        
        let bodyHtml = `<div class="tab-pills">`;
        types.forEach(t => {
            const act = schedule[selectedDayIndex].type === t ? 'active' : '';
            bodyHtml += `<div class="tab-pill ${act}" data-type="${t}">${t.toUpperCase()}</div>`;
        });
        bodyHtml += `</div>`;

        window.App.showModal('Change Day Type', bodyHtml, '<button class="btn btn-ghost" onclick="App.hideModal()">Close</button>');
        
        const modalBody = document.getElementById('modal-body');
        modalBody.querySelectorAll('.tab-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                schedule[selectedDayIndex].type = pill.getAttribute('data-type');
                saveSchedule();
                window.App.hideModal();
                renderSection();
                if(window.App.refreshDashboard) window.App.refreshDashboard();
            });
        });
    }

    function saveBodyWeightEntry(weight) {
        if (isNaN(weight) || weight <= 0) return;
        const today = window.App ? window.App.getToday() : new Date().toISOString().slice(0, 10);
        const existing = bodyWeightHistory.find(b => b.date === today);
        if (existing) {
            existing.weight = weight;
        } else {
            bodyWeightHistory.push({ date: today, weight: weight });
            bodyWeightHistory.sort((a,b) => new Date(a.date) - new Date(b.date));
        }
        saveBodyWeight();
        if (window.App) window.App.showToast('Body weight saved!', 'success');
        renderSection(); // re-render to update the input and chart
    }

    function updateChartSettings() {
        const select = document.getElementById('chart-metric-select');
        if (select) {
            chartMetric = select.value;
            drawSportChart();
        }
    }
    
    function setChartTimeframe(tf) {
        chartTimeframe = tf;
        renderSection(); // to re-render pills and redraw
    }

    function drawSportChart() {
        const canvas = document.getElementById('sport-chart');
        const insightEl = document.getElementById('chart-insight');
        if (!canvas) return;

        // 1. Determine date threshold
        const today = new Date();
        let daysToSubtract = 30; // default month
        if (chartTimeframe === 'week') daysToSubtract = 7;
        else if (chartTimeframe === 'year') daysToSubtract = 365;
        
        const thresholdDate = new Date();
        thresholdDate.setDate(today.getDate() - daysToSubtract);
        const thresholdStr = thresholdDate.toISOString().slice(0, 10);

        // 2. Gather data
        let rawData = []; // [{date, y}]
        let labelSuffix = '';

        if (chartMetric === 'Body Weight') {
            rawData = bodyWeightHistory.map(b => ({ date: b.date, y: b.weight }));
            labelSuffix = ' kg';
        } else if (chartMetric.endsWith(' Ratio')) {
            const exName = chartMetric.replace(' Ratio', '');
            const exHistory = sportHistory[exName] || [];
            
            exHistory.forEach(h => {
                // Find closest body weight on or before this date
                const bw = [...bodyWeightHistory].reverse().find(b => b.date <= h.date);
                if (bw && bw.weight > 0) {
                    rawData.push({ date: h.date, y: parseFloat((h.weight / bw.weight).toFixed(2)) });
                }
            });
            labelSuffix = 'x BW';
        } else {
            const exName = chartMetric;
            const exHistory = sportHistory[exName] || [];
            rawData = exHistory.map(h => ({ date: h.date, y: h.weight }));
            labelSuffix = ' kg';
        }

        // Filter by timeframe
        let filteredData = rawData.filter(d => d.date >= thresholdStr);
        // Sort chronologically
        filteredData.sort((a,b) => new Date(a.date) - new Date(b.date));

        // 3. Draw or show empty
        if (filteredData.length === 0) {
            if (chartInstance) chartInstance.destroy();
            chartInstance = null;
            if (insightEl) insightEl.innerHTML = `<span style="color:var(--text-muted); font-weight:normal;">No data available for this timeframe.</span>`;
            return;
        }

        const labels = filteredData.map(d => {
            const parts = d.date.split('-'); // YYYY-MM-DD
            return `${parts[2]}.${parts[1]}.`; 
        });
        const dataPts = filteredData.map(d => d.y);

        // Calculate insight
        if (filteredData.length > 1) {
            const first = filteredData[0].y;
            const last = filteredData[filteredData.length - 1].y;
            const diff = last - first;
            let insightText = '';
            let color = 'var(--text)';
            
            if (diff > 0) {
                insightText = `📈 +${diff.toFixed(1)}${labelSuffix}`;
                color = '#10b981'; // green
            } else if (diff < 0) {
                insightText = `📉 ${diff.toFixed(1)}${labelSuffix}`;
                color = '#ef4444'; // red
            } else {
                insightText = `➖ No Change`;
                color = 'var(--text-muted)';
            }
            if (insightEl) insightEl.innerHTML = `<span style="color:${color};">${insightText}</span>`;
        } else {
            if (insightEl) insightEl.innerHTML = `<span style="color:var(--text-muted); font-weight:normal;">Need more data for trend.</span>`;
        }

        // Destroy old chart
        if (chartInstance) chartInstance.destroy();

        // Draw new chart
        const ctx = canvas.getContext('2d');
        
        // CSS variable fallback colors
        const gridColor = 'rgba(255, 255, 255, 0.1)';
        const primaryColor = '#6366f1'; 

        // @ts-ignore (Assuming Chart is loaded via CDN)
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: chartMetric,
                    data: dataPts,
                    borderColor: primaryColor,
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 2,
                    pointBackgroundColor: primaryColor,
                    pointRadius: 4,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.parsed.y + labelSuffix;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { color: gridColor }, ticks: { color: 'rgba(255,255,255,0.7)' } },
                    y: { grid: { color: gridColor }, ticks: { color: 'rgba(255,255,255,0.7)' } }
                }
            }
        });
    }

    function renderAnalytics() {
        const container = document.getElementById('sport-analytics');
        if (!container) return;
        
        let lastBW = '';
        if (bodyWeightHistory.length > 0) {
            lastBW = bodyWeightHistory[bodyWeightHistory.length - 1].weight;
        }

        // Options for metric dropdown
        const exercises = Object.keys(sportHistory).filter(name => sportHistory[name].length > 0).sort();
        let optionsHtml = `<option value="Body Weight" ${chartMetric === 'Body Weight' ? 'selected' : ''}>Body Weight</option>`;
        exercises.forEach(ex => {
            optionsHtml += `<option value="${ex}" ${chartMetric === ex ? 'selected' : ''}>${ex}</option>`;
            optionsHtml += `<option value="${ex} Ratio" ${chartMetric === `${ex} Ratio` ? 'selected' : ''}>${ex} / BW Ratio</option>`;
        });

        let html = `
            <div class="card-header-row" style="margin-top:24px; margin-bottom: 12px;">
                <h2>Statistics</h2>
            </div>
            
            <!-- Body Weight Input -->
            <div class="glass-card stagger-item" style="margin-bottom: 16px;">
                <div style="font-weight:600; margin-bottom:8px;">Log Body Weight</div>
                <div style="display:flex; gap:8px;">
                    <input type="number" step="0.1" id="bw-input" class="form-input" style="flex:1;" placeholder="z.B. 75.5 kg" value="${lastBW}">
                    <button class="btn btn-primary" onclick="SportModule.saveBodyWeightEntry(parseFloat(document.getElementById('bw-input').value))">Save</button>
                </div>
            </div>

            <!-- Chart Controls -->
            <div class="glass-card stagger-item" style="margin-bottom: 16px;">
                <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
                    <select id="chart-metric-select" class="form-input" onchange="SportModule.updateChartSettings()">
                        ${optionsHtml}
                    </select>
                    <div class="tab-pills">
                        <div class="tab-pill ${chartTimeframe === 'week' ? 'active' : ''}" onclick="SportModule.setChartTimeframe('week')">Week</div>
                        <div class="tab-pill ${chartTimeframe === 'month' ? 'active' : ''}" onclick="SportModule.setChartTimeframe('month')">Month</div>
                        <div class="tab-pill ${chartTimeframe === 'year' ? 'active' : ''}" onclick="SportModule.setChartTimeframe('year')">Year</div>
                    </div>
                </div>
                
                <div id="chart-insight" style="font-weight:600; font-size:0.9rem; color:var(--text); margin-bottom:8px; text-align:center;"></div>
                <div style="position: relative; height: 200px; width: 100%;">
                    <canvas id="sport-chart"></canvas>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Let the DOM update, then draw the chart
        setTimeout(() => drawSportChart(), 50);
    }

    function showAddExerciseModal() {
        if (!window.App) return;

        const bodyHTML = `
            <div class="form-group">
                <label class="form-label">Exercise Name</label>
                <input type="text" id="ex-name" class="form-input" placeholder="e.g. Bicep Curls">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Sets</label>
                    <input type="number" id="ex-sets" class="form-input" value="3">
                </div>
                <div class="form-group">
                    <label class="form-label">Reps</label>
                    <input type="text" id="ex-reps" class="form-input" placeholder="e.g. 10 or failure">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Weight (optional)</label>
                <input type="text" id="ex-weight" class="form-input" placeholder="e.g. 20kg">
            </div>
        `;

        const footerHTML = `
            <button class="btn btn-ghost" onclick="App.hideModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-ex">Add Exercise</button>
        `;

        window.App.showModal('Add Exercise', bodyHTML, footerHTML);

        document.getElementById('btn-save-ex').addEventListener('click', () => {
            const name = document.getElementById('ex-name').value.trim();
            const sets = parseInt(document.getElementById('ex-sets').value) || 3;
            const reps = document.getElementById('ex-reps').value.trim() || '10';
            const weight = document.getElementById('ex-weight').value.trim();

            if (!name) {
                window.App.showToast('Please enter a name.', 'error');
                return;
            }

            schedule[selectedDayIndex].exercises.push({
                id: generateId(),
                name, sets, reps, weight
            });
            saveSchedule();
            window.App.hideModal();
            renderSection();
        });
    }

    function getCompletionData() {
        const todayIndex = window.App ? window.App.getDayOfWeek() : new Date().getDay();
        const plan = schedule[todayIndex];
        if (plan.type === 'rest' || plan.exercises.length === 0) return { completed: 0, total: 0 };
        
        const total = plan.exercises.length;
        const done = plan.exercises.filter(ex => completion.completed.includes(ex.id)).length;
        return { completed: done, total: total };
    }

    function init() {
        loadData();
        bindTimer();
    }

    window.SportModule = { init, renderSection, renderDashboard, getCompletionData, updateChartSettings, setChartTimeframe, saveBodyWeightEntry };

})();
