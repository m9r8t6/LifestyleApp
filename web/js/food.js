(function() {
    'use strict';

    const STORAGE_RECIPES = 'lifeos_recipes';
    const STORAGE_PLAN = 'lifeos_meal_plan'; // { date: mealIds[] }
    const STORAGE_COMPLETION = 'lifeos_meal_completion';
    const STORAGE_SHOPPING = 'lifeos_shopping_checked'; // { week: 'YYYY-MM-DD', keys: [] }
    const NUTRIENT_KEYS = ['calories', 'protein', 'fiber', 'zinc', 'omega3', 'vitaminA', 'iron', 'vitaminB12', 'vitaminC', 'vitaminD', 'vitaminE', 'biotin', 'magnesium'];

    let DAILY_TARGETS = {};

    function updateDailyTargets() {
        const defaultProfile = { sex: 'male', age: 25, weight: 75, height: 180, goals: { muscle: false, skin: false, hair: false } };
        let profile = defaultProfile;
        try {
            const stored = localStorage.getItem('lifeos_profile');
            if (stored) profile = JSON.parse(stored);
        } catch(e) {}

        let bmr = 0;
        if (profile.sex === 'male') {
            bmr = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age) + 5;
        } else {
            bmr = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age) - 161;
        }

        let cals = Math.round(bmr * 1.55);
        if (profile.goals && profile.goals.muscle) cals += 300;

        let protein = Math.round((profile.goals && profile.goals.muscle ? 2.0 : 1.6) * profile.weight);
        let zinc = (profile.goals && profile.goals.skin) ? 15 : (profile.sex === 'male' ? 11 : 8);
        let omega3 = (profile.goals && profile.goals.skin) ? 2000 : 1000;
        let vitaminA = (profile.goals && profile.goals.skin) ? 900 : 700;
        let biotin = (profile.goals && profile.goals.hair) ? 30 : 0;
        let magnesium = (profile.goals && profile.goals.muscle) ? 400 : 300;

        DAILY_TARGETS = {
            calories: cals,
            protein: protein,
            zinc: zinc,
            omega3: omega3,
            vitaminA: vitaminA,
            iron: 15,
            vitaminB12: 2.4,
            vitaminC: 90,
            vitaminD: 15,
            vitaminE: 15,
            biotin: biotin,
            magnesium: magnesium,
            fiber: 35
        };
    }

    updateDailyTargets();

    const PROTOTYPE_RECIPES = [
        {
            id: 'r1', name: 'Avocado on Dark Bread with Frozen Veggies', emoji: '🥑',
            prepTime: '10 min',
            nutrients: { calories: 550, protein: 18, fiber: 16, zinc: 3, omega3: 500, vitaminA: 200, iron: 4, vitaminB12: 0, vitaminC: 40, vitaminD: 0, vitaminE: 5, biotin: 8, magnesium: 120 },
            ingredients: [
                { name: 'Whole grain dark bread', amount: 2, unit: 'slices' },
                { name: 'Avocado', amount: 1, unit: 'whole' },
                { name: 'Frozen mixed vegetables', amount: 200, unit: 'g' }
            ],
            instructions: '1. Toast the bread.\n2. Microwave or steam the frozen veggies.\n3. Mash the avocado on the toast and serve veggies on the side.',
            isCustom: false
        },
        {
            id: 'r2', name: 'Whole Grain Pasta with Chickpea Salad', emoji: '🍝',
            prepTime: '15 min',
            nutrients: { calories: 750, protein: 32, fiber: 18, zinc: 4, omega3: 200, vitaminA: 300, iron: 6, vitaminB12: 0, vitaminC: 30, vitaminD: 0, vitaminE: 3, biotin: 10, magnesium: 150 },
            ingredients: [
                { name: 'Whole grain pasta', amount: 150, unit: 'g' },
                { name: 'Canned chickpeas', amount: 150, unit: 'g' },
                { name: 'Cherry tomatoes', amount: 100, unit: 'g' },
                { name: 'Olive oil', amount: 1, unit: 'tbsp' }
            ],
            instructions: '1. Boil pasta according to package.\n2. Rinse chickpeas and chop tomatoes.\n3. Mix all with olive oil and salt to taste.',
            isCustom: false
        },
        {
            id: 'r3', name: 'Bean Noodles with Olive-Tomato Dressing', emoji: '🍜',
            prepTime: '12 min',
            nutrients: { calories: 600, protein: 35, fiber: 12, zinc: 4.5, omega3: 300, vitaminA: 400, iron: 5, vitaminB12: 0, vitaminC: 35, vitaminD: 0, vitaminE: 4, biotin: 5, magnesium: 110 },
            ingredients: [
                { name: 'Black bean noodles', amount: 100, unit: 'g' },
                { name: 'Olives', amount: 50, unit: 'g' },
                { name: 'Sun-dried tomatoes', amount: 50, unit: 'g' },
                { name: 'Spinach', amount: 100, unit: 'g' }
            ],
            instructions: '1. Cook bean noodles.\n2. Blend or finely chop olives and tomatoes for dressing.\n3. Toss noodles with dressing and fresh spinach.',
            isCustom: false
        },
        {
            id: 'r4', name: 'Lentil Stew with Sweet Potato', emoji: '🍲',
            prepTime: '25 min',
            nutrients: { calories: 650, protein: 28, fiber: 22, zinc: 5, omega3: 150, vitaminA: 1200, iron: 8, vitaminB12: 0, vitaminC: 50, vitaminD: 0, vitaminE: 2, biotin: 15, magnesium: 130 },
            ingredients: [
                { name: 'Brown lentils (dry)', amount: 100, unit: 'g' },
                { name: 'Sweet potato', amount: 200, unit: 'g' },
                { name: 'Vegetable broth', amount: 400, unit: 'ml' }
            ],
            instructions: '1. Dice sweet potato.\n2. Boil lentils and sweet potato in broth for 20 mins until tender.',
            isCustom: false
        },
        {
            id: 'r5', name: 'Tofu Scramble with Spinach & Walnut', emoji: '🍳',
            prepTime: '10 min',
            nutrients: { calories: 500, protein: 30, fiber: 8, zinc: 5, omega3: 2500, vitaminA: 600, iron: 7, vitaminB12: 1.2, vitaminC: 45, vitaminD: 10, vitaminE: 6, biotin: 12, magnesium: 140 },
            ingredients: [
                { name: 'Firm tofu', amount: 200, unit: 'g' },
                { name: 'Spinach', amount: 100, unit: 'g' },
                { name: 'Walnuts', amount: 30, unit: 'g' },
                { name: 'Nutritional yeast', amount: 2, unit: 'tbsp' }
            ],
            instructions: '1. Crumble tofu into a pan.\n2. Cook for 5 mins, add spinach and nutritional yeast.\n3. Top with crushed walnuts.',
            isCustom: false
        },
        {
            id: 'r6', name: 'Overnight Oats with Chia & Hemp Seeds', emoji: '🥣',
            prepTime: '5 min',
            nutrients: { calories: 600, protein: 24, fiber: 14, zinc: 4, omega3: 3500, vitaminA: 100, iron: 5, vitaminB12: 0.5, vitaminC: 10, vitaminD: 2, vitaminE: 4, biotin: 6, magnesium: 180 },
            ingredients: [
                { name: 'Rolled oats', amount: 80, unit: 'g' },
                { name: 'Soy milk', amount: 200, unit: 'ml' },
                { name: 'Chia seeds', amount: 2, unit: 'tbsp' },
                { name: 'Hemp seeds', amount: 2, unit: 'tbsp' }
            ],
            instructions: '1. Mix all ingredients in a jar.\n2. Leave in fridge overnight.',
            isCustom: false
        },
        {
            id: 'r7', name: 'Tempeh Stir-Fry with Broccoli', emoji: '🥢',
            prepTime: '15 min',
            nutrients: { calories: 550, protein: 35, fiber: 10, zinc: 6, omega3: 400, vitaminA: 800, iron: 6, vitaminB12: 0, vitaminC: 85, vitaminD: 0, vitaminE: 2, biotin: 10, magnesium: 160 },
            ingredients: [
                { name: 'Tempeh', amount: 150, unit: 'g' },
                { name: 'Broccoli', amount: 200, unit: 'g' },
                { name: 'Soy sauce', amount: 2, unit: 'tbsp' }
            ],
            instructions: '1. Slice tempeh and chop broccoli.\n2. Stir-fry tempeh until golden, add broccoli and soy sauce.\n3. Cook until broccoli is tender-crisp.',
            isCustom: false
        },
        {
            id: 'r8', name: 'Quinoa Bowl with Edamame & Pumpkin Seeds', emoji: '🥗',
            prepTime: '20 min',
            nutrients: { calories: 680, protein: 32, fiber: 15, zinc: 7, omega3: 800, vitaminA: 150, iron: 8, vitaminB12: 0, vitaminC: 25, vitaminD: 0, vitaminE: 8, biotin: 5, magnesium: 200 },
            ingredients: [
                { name: 'Quinoa (dry)', amount: 80, unit: 'g' },
                { name: 'Edamame (shelled)', amount: 100, unit: 'g' },
                { name: 'Pumpkin seeds', amount: 30, unit: 'g' }
            ],
            instructions: '1. Cook quinoa.\n2. Thaw edamame.\n3. Mix quinoa, edamame, and top with pumpkin seeds.',
            isCustom: false
        },
        {
            id: 'r9', name: 'High-Protein Green Smoothie', emoji: '🥤',
            prepTime: '5 min',
            nutrients: { calories: 450, protein: 30, fiber: 10, zinc: 3, omega3: 2000, vitaminA: 900, iron: 5, vitaminB12: 1.2, vitaminC: 60, vitaminD: 5, vitaminE: 6, biotin: 10, magnesium: 110 },
            ingredients: [
                { name: 'Vegan protein powder', amount: 1, unit: 'scoop' },
                { name: 'Spinach', amount: 100, unit: 'g' },
                { name: 'Flaxseed (ground)', amount: 2, unit: 'tbsp' },
                { name: 'Banana', amount: 1, unit: 'whole' },
                { name: 'Soy milk', amount: 300, unit: 'ml' }
            ],
            instructions: '1. Add all ingredients to a blender.\n2. Blend until smooth.',
            isCustom: false
        }
    ];

    let recipes = [];
    let mealPlan = {}; // { 'YYYY-MM-DD': ['r1', 'r2', 'r3'] }
    let completion = { date: '', completed: [] };

    const t = (k) => window.i18n ? window.i18n.t(k) : k;

    // --- Helpers ---
    const esc = (text) => window.App.esc(text);
    const getToday = () => window.App.getToday();
    const addDays = (dateStr, days) => window.App.addDays(dateStr, days);
    const num = (value) => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : 0; };

    /** Make sure a recipe (stored, typed in or written by the AI) has every field the app relies on. */
    function normalizeRecipe(raw) {
        if (!raw || typeof raw !== 'object' || !String(raw.name || '').trim()) return null;
        const nutrients = {};
        NUTRIENT_KEYS.forEach(key => { nutrients[key] = num(raw.nutrients && raw.nutrients[key]); });
        const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
            .filter(i => i && String(i.name || '').trim())
            .map(i => ({ name: String(i.name).trim(), amount: num(i.amount), unit: String(i.unit || '').trim() || 'x' }));
        return {
            id: String(raw.id || 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
            name: String(raw.name).trim().slice(0, 120),
            emoji: String(raw.emoji || '🍲').slice(0, 8),
            prepTime: String(raw.prepTime || '15 min').slice(0, 30),
            description: String(raw.description || ''),
            instructions: String(raw.instructions || ''),
            nutrients,
            ingredients,
            isCustom: raw.isCustom !== false,
        };
    }

    function loadData() {
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(STORAGE_RECIPES)); } catch (e) {}
        recipes = (Array.isArray(stored) ? stored : PROTOTYPE_RECIPES).map(normalizeRecipe).filter(Boolean);
        if (recipes.length === 0) recipes = PROTOTYPE_RECIPES.map(normalizeRecipe);

        try { mealPlan = JSON.parse(localStorage.getItem(STORAGE_PLAN)) || {}; } catch (e) { mealPlan = {}; }

        completion = { date: getToday(), completed: [] };
        try {
            const storedComp = JSON.parse(localStorage.getItem(STORAGE_COMPLETION));
            if (storedComp && storedComp.date === getToday() && Array.isArray(storedComp.completed)) completion = storedComp;
        } catch (e) {}

        ensureWeeklyPlanExists();
    }

    function saveRecipes() { localStorage.setItem(STORAGE_RECIPES, JSON.stringify(recipes)); }
    function savePlan() { localStorage.setItem(STORAGE_PLAN, JSON.stringify(mealPlan)); }
    function saveCompletion() { localStorage.setItem(STORAGE_COMPLETION, JSON.stringify(completion)); }

    // --- Planning: keep the next 7 days filled ---
    function ensureWeeklyPlanExists() {
        const today = getToday();
        const known = new Set(recipes.map(r => r.id));
        let changed = false;

        // Forget days that are over (keeps the saved plan small)
        Object.keys(mealPlan).forEach(date => {
            if (date < addDays(today, -1)) { delete mealPlan[date]; changed = true; }
        });

        for (let i = 0; i <= 7; i++) {
            const date = addDays(today, i);
            const current = (mealPlan[date] || []).filter(id => known.has(id));
            if (current.length !== 3) {
                mealPlan[date] = generateDayMeals(date, current);
                changed = true;
            }
        }
        if (changed) savePlan();
    }

    /**
     * Pick three meals for a day: cover the nutrient targets, land near the calorie
     * target and avoid repeating what was eaten on the days right before.
     * @param {string} date
     * @param {string[]} keep - meals already fixed for that day
     */
    function generateDayMeals(date, keep = []) {
        const recent = new Set([...(mealPlan[addDays(date, -1)] || []), ...(mealPlan[addDays(date, -2)] || [])]);
        const selected = [...keep].slice(0, 3);
        const tracked = ['protein', 'zinc', 'omega3', 'vitaminA', 'iron', 'magnesium'];
        const weights = { protein: 2, zinc: 2, omega3: 2, vitaminA: 1, iron: 1, magnesium: 1 };
        const totals = { calories: 0 };
        tracked.forEach(k => { totals[k] = 0; });
        selected.forEach(id => {
            const r = recipes.find(x => x.id === id);
            if (r) { totals.calories += r.nutrients.calories; tracked.forEach(k => { totals[k] += r.nutrients[k]; }); }
        });

        while (selected.length < 3 && selected.length < recipes.length) {
            const mealsLeft = 3 - selected.length;
            let best = null;
            let bestScore = -Infinity;
            for (const r of recipes) {
                if (selected.includes(r.id)) continue;
                let score = Math.random() * 0.3;
                tracked.forEach(k => {
                    const target = DAILY_TARGETS[k] || 0;
                    const missing = Math.max(0, target - totals[k]);
                    if (target > 0) score += weights[k] * Math.min(r.nutrients[k], missing) / target;
                });
                const caloriesPerMeal = Math.max(0, DAILY_TARGETS.calories - totals.calories) / mealsLeft;
                if (caloriesPerMeal > 0) score -= Math.abs(r.nutrients.calories - caloriesPerMeal) / caloriesPerMeal;
                if (recent.has(r.id)) score -= 1.5;
                if (score > bestScore) { bestScore = score; best = r; }
            }
            if (!best) break;
            selected.push(best.id);
            totals.calories += best.nutrients.calories;
            tracked.forEach(k => { totals[k] += best.nutrients[k]; });
        }
        return selected;
    }

    function nutrientTagsHtml(n) {
        return `
            <span class="recipe-tag">${n.calories} kcal</span>
            <span class="recipe-tag high-protein">Protein ${n.protein} g</span>
            <span class="recipe-tag zinc">Zinc ${n.zinc} mg</span>
            <span class="recipe-tag omega3">Omega-3 ${n.omega3} mg</span>
            <span class="recipe-tag iron">Iron ${n.iron} mg</span>
            <span class="recipe-tag">Fiber ${n.fiber} g</span>
            <span class="recipe-tag">B12 ${n.vitaminB12} mcg</span>
            <span class="recipe-tag">Vit A ${n.vitaminA} mcg</span>
            <span class="recipe-tag">Vit C ${n.vitaminC} mg</span>
            <span class="recipe-tag">Vit D ${n.vitaminD} mcg</span>
            <span class="recipe-tag">Vit E ${n.vitaminE} mg</span>
            <span class="recipe-tag">Biotin ${n.biotin} mcg</span>
            <span class="recipe-tag">Magnesium ${n.magnesium} mg</span>
        `;
    }

    function recipeDetailsHtml(r) {
        return `
            <h4 class="detail-heading">Nutrition</h4>
            <div class="recipe-tags" style="margin-bottom:12px;">${nutrientTagsHtml(r.nutrients)}</div>
            <h4 class="detail-heading">${t('ingredients')}</h4>
            <ul class="detail-list">
                ${r.ingredients.map(i => `<li>${i.amount} ${esc(i.unit)} ${esc(i.name)}</li>`).join('')}
            </ul>
            <h4 class="detail-heading">${t('instructions')}</h4>
            <p class="detail-text">${esc(r.instructions || 'No instructions provided.')}</p>
        `;
    }

    // --- UI Rendering ---

    function getRecipeHtml(r, isDone) {
        return `
            <div class="checklist-item stagger-item ${isDone ? 'checked' : ''}" onclick="FoodModule.toggleExpand('${r.id}')">
                <div class="checklist-check" onclick="event.stopPropagation(); FoodModule.toggleCompletion('${r.id}')">✓</div>
                <div class="checklist-content">
                    <div class="checklist-text"><span class="meal-emoji">${esc(r.emoji)}</span>${esc(r.name)}</div>
                    <div class="checklist-sub">${r.nutrients.calories} kcal · ${r.nutrients.protein} g protein · ${esc(r.prepTime)}</div>
                </div>
                <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div id="expand-${r.id}" class="recipe-expand glass-card-sm" style="display:none;">
                ${recipeDetailsHtml(r)}
                <div class="detail-actions">
                    <button class="btn btn-sm btn-ghost" onclick="FoodModule.showSwapModal('${r.id}')">Swap meal</button>
                </div>
            </div>
        `;
    }

    function renderSection() {
        renderToday();
        renderShoppingList();
        renderSupplements();
        renderLibrary();
    }

    function renderToday() {
        const container = document.getElementById('food-today');
        if (!container) return;

        const today = getToday();
        const mealIds = mealPlan[today] || [];
        const todayRecipes = mealIds.map(id => recipes.find(r => r.id === id)).filter(Boolean);

        let html = `
            <div class="card-header-row">
                <div class="section-title" style="margin:0">
                    <div class="section-title-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
                    </div>
                    <h2>${t('todays_meals')}</h2>
                </div>
                <button type="button" class="btn btn-sm btn-ai" onclick="FoodModule.generateAIPlan()" id="btn-ai-plan">Plan my week</button>
            </div>
        `;

        if (todayRecipes.length === 0) {
            html += `<div class="empty-state"><div class="empty-state-text">${t('no_meals_planned')}</div></div>`;
        } else {
            todayRecipes.forEach(r => {
                html += getRecipeHtml(r, completion.completed.includes(r.id));
            });
        }
        
        container.innerHTML = html;
    }

    /** Ingredients for the next 7 days, added up. */
    function shoppingItems() {
        const today = getToday();
        const map = {};
        for (let i = 1; i <= 7; i++) {
            (mealPlan[addDays(today, i)] || []).forEach(id => {
                const r = recipes.find(x => x.id === id);
                if (!r) return;
                r.ingredients.forEach(ing => {
                    const key = `${ing.name.toLowerCase()}|${ing.unit.toLowerCase()}`;
                    if (!map[key]) map[key] = { key, name: ing.name, unit: ing.unit, amount: 0 };
                    map[key].amount += ing.amount;
                });
            });
        }
        return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    }

    function loadShoppingChecked() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_SHOPPING));
            // A ticked list is kept for a week, then starts fresh
            if (stored && stored.week && stored.week > addDays(getToday(), -7)) return stored;
        } catch (e) {}
        return { week: getToday(), keys: [] };
    }

    function toggleShoppingItem(key) {
        const state = loadShoppingChecked();
        const idx = state.keys.indexOf(key);
        if (idx === -1) state.keys.push(key); else state.keys.splice(idx, 1);
        localStorage.setItem(STORAGE_SHOPPING, JSON.stringify(state));
        renderShoppingList();
    }

    function renderShoppingList() {
        const container = document.getElementById('food-shopping');
        if (!container) return;

        const list = shoppingItems();
        const checked = loadShoppingChecked().keys;
        const open = list.filter(i => !checked.includes(i.key));
        const done = list.filter(i => checked.includes(i.key));

        let html = `
            <div class="card-header-row section-gap">
                <h2>${t('upcoming_groceries')}</h2>
                ${list.length ? `<span class="count-pill">${done.length}/${list.length}</span>` : ''}
            </div>
            <div class="glass-card-sm stagger-item shopping-list">
        `;
        if (list.length === 0) {
            html += `<div class="empty-state-text">${t('no_groceries')}</div>`;
        } else {
            [...open, ...done].forEach((ing, idx) => {
                const amt = Math.round(ing.amount * 10) / 10;
                const isDone = checked.includes(ing.key);
                html += `
                    <div class="shopping-item ${isDone ? 'checked' : ''}" data-shop="${idx}">
                        <div class="checklist-check">✓</div>
                        <span class="shopping-name">${esc(ing.name)}</span>
                        <span class="shopping-amount">${amt} ${esc(ing.unit)}</span>
                    </div>`;
            });
        }
        html += `</div>`;
        container.innerHTML = html;

        const ordered = [...open, ...done];
        container.querySelectorAll('[data-shop]').forEach(el => {
            el.addEventListener('click', () => toggleShoppingItem(ordered[Number(el.dataset.shop)].key));
        });
    }

    function renderSupplements() {
        const container = document.getElementById('food-supplements');
        if (!container) return;

        const today = getToday();
        const mealIds = mealPlan[today] || [];
        const todayRecipes = mealIds.map(id => recipes.find(r => r.id === id)).filter(Boolean);

        const sum = {};
        const eaten = {};
        NUTRIENT_KEYS.forEach(key => { sum[key] = 0; eaten[key] = 0; });
        todayRecipes.forEach(r => {
            const isDone = completion.completed.includes(r.id);
            NUTRIENT_KEYS.forEach(key => {
                sum[key] += r.nutrients[key];
                if (isDone) eaten[key] += r.nutrients[key];
            });
        });

        const macros = [
            { key: 'calories', label: 'Calories', unit: 'kcal' },
            { key: 'protein', label: 'Protein', unit: 'g' },
            { key: 'zinc', label: 'Zinc', unit: 'mg' },
            { key: 'omega3', label: 'Omega-3', unit: 'mg' },
            { key: 'vitaminA', label: 'Vitamin A', unit: 'mcg' },
            { key: 'iron', label: 'Iron', unit: 'mg' },
            { key: 'magnesium', label: 'Magnesium', unit: 'mg' },
            { key: 'fiber', label: 'Fiber', unit: 'g' }
        ];
        if (DAILY_TARGETS.biotin > 0) macros.push({ key: 'biotin', label: 'Biotin', unit: 'mcg' });

        let html = `
            <div class="card-header-row section-gap"><h2>Daily Nutrition</h2></div>
            <div class="glass-card stagger-item nutrition-card">
                <div class="nutrition-legend"><span class="legend-dot eaten"></span>eaten<span class="legend-dot planned"></span>planned</div>`;

        macros.forEach(m => {
            const target = DAILY_TARGETS[m.key] || 1;
            const plannedPct = Math.min(100, Math.round((sum[m.key] / target) * 100));
            const eatenPct = Math.min(100, Math.round((eaten[m.key] / target) * 100));
            html += `
                <div class="nutrition-row">
                    <div class="nutrition-label">
                        <strong>${m.label}</strong>
                        <span>${Math.round(eaten[m.key])} / ${target} ${m.unit}</span>
                    </div>
                    <div class="progress-track stacked">
                        <div class="progress-fill planned" style="width:${plannedPct}%;"></div>
                        <div class="progress-fill ${eatenPct >= 100 ? 'grad-success' : 'grad-primary'}" style="width:${eatenPct}%;"></div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;

        const gaps = [];
        if (sum.zinc < DAILY_TARGETS.zinc * 0.7) gaps.push(`Zinc (${DAILY_TARGETS.zinc}mg)`);
        if (sum.omega3 < DAILY_TARGETS.omega3 * 0.7) gaps.push(`Algae Omega-3 (${DAILY_TARGETS.omega3}mg)`);
        if (sum.vitaminB12 < DAILY_TARGETS.vitaminB12 * 0.7) gaps.push('Vitamin B12 (1000mcg)');
        if (sum.vitaminA < DAILY_TARGETS.vitaminA * 0.7) gaps.push(`Vitamin A (Skin support)`);
        if (DAILY_TARGETS.biotin > 0 && sum.biotin < DAILY_TARGETS.biotin * 0.7) gaps.push(`Biotin (${DAILY_TARGETS.biotin}mcg)`);
        if (sum.magnesium < DAILY_TARGETS.magnesium * 0.7) gaps.push(`Magnesium (${DAILY_TARGETS.magnesium}mg)`);

        html += `<div class="card-header-row section-gap"><h2>${t('suggested_supplements')}</h2></div>`;
        if (gaps.length === 0) {
            html += `<div class="glass-card-sm stagger-item"><div class="empty-state-text">${t('targets_hit')}</div></div>`;
        } else {
            html += `<div class="glass-card-sm stagger-item supplement-box">
                <p class="form-hint" style="margin:0 0 6px;">Today's planned meals leave a gap here:</p>
                <ul class="detail-list" style="margin:0;">
                    ${gaps.map(g => `<li>${g}</li>`).join('')}
                </ul>
            </div>`;
        }

        container.innerHTML = html;
    }

    let recipeSearchQuery = '';

    function setRecipeSearchQuery(val) {
        recipeSearchQuery = val.toLowerCase();
        renderLibrary();
        // Restore focus to input after render
        const input = document.getElementById('recipe-search');
        if (input) {
            input.focus();
            input.selectionStart = input.selectionEnd = input.value.length;
        }
    }

    function renderLibrary() {
        const container = document.getElementById('food-library');
        if (!container) return;
        
        let html = `
            <div class="card-header-row section-gap">
                <h2>${t('recipe_library')}</h2>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-sm btn-ai" id="btn-recommend-recipe">Suggest</button>
                    <button class="btn btn-primary btn-sm" id="btn-add-recipe">${t('add_recipe')}</button>
                </div>
            </div>
            <div style="margin-bottom: 12px;">
                <input type="search" id="recipe-search" class="form-input" placeholder="Search by name or ingredient..." value="${esc(recipeSearchQuery)}" oninput="FoodModule.setRecipeSearchQuery(this.value)">
            </div>
            <div class="recipe-grid stagger-item">
        `;
        
        const filteredRecipes = recipes.filter(r => {
            if (!recipeSearchQuery) return true;
            if (r.name.toLowerCase().includes(recipeSearchQuery)) return true;
            if (r.ingredients && r.ingredients.some(ing => ing.name.toLowerCase().includes(recipeSearchQuery))) return true;
            return false;
        });

        if (filteredRecipes.length === 0) {
            html += `<div class="empty-state" style="grid-column: 1 / -1;"><div class="empty-state-text">No recipes found.</div></div>`;
        } else {
            filteredRecipes.forEach((r, idx) => {
                const tagsHtml = [];
                if (r.nutrients.protein > 20) tagsHtml.push(`<span class="recipe-tag high-protein">High Protein</span>`);
                if (r.nutrients.omega3 > 400) tagsHtml.push(`<span class="recipe-tag omega3">Omega-3</span>`);
                if (r.nutrients.zinc > 3) tagsHtml.push(`<span class="recipe-tag zinc">Zinc</span>`);

                html += `
                    <div class="recipe-item" onclick="FoodModule.toggleExpand('lib-${r.id}')">
                        <div class="recipe-emoji">${esc(r.emoji)}</div>
                        <div class="recipe-info">
                            <div class="recipe-name">${esc(r.name)}</div>
                            <div class="recipe-tags">${tagsHtml.join('')}</div>
                        </div>
                    </div>
                    <div id="expand-lib-${r.id}" class="recipe-expand glass-card-sm" style="display:none;">
                        ${recipeDetailsHtml(r)}
                        <div class="detail-actions">
                            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); FoodModule.deleteRecipe('${r.id}')">Delete recipe</button>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `</div>`;
        container.innerHTML = html;
        
        document.getElementById('btn-add-recipe')?.addEventListener('click', showAddRecipeModal);
        document.getElementById('btn-recommend-recipe')?.addEventListener('click', recommendNewRecipe);
    }

    async function deleteRecipe(id) {
        const recipe = recipes.find(r => r.id === id);
        if (!recipe) return;
        if (recipes.length <= 3) {
            window.App.showToast('Keep at least three recipes so a day can be planned.', 'error');
            return;
        }
        if (!await window.App.confirm(`Delete "${recipe.name}"?`, { okLabel: 'Delete', danger: true })) return;
        recipes = recipes.filter(r => r.id !== id);
        saveRecipes();
        // Days that used this recipe get a replacement
        ensureWeeklyPlanExists();
        renderSection();
        if (window.App.refreshDashboard) window.App.refreshDashboard();
        window.App.showToast('Recipe deleted', 'success');
    }

    function showAddRecipeModal() {
        if (!window.App) return;

        const bodyHTML = `
            <div class="form-group">
                <label class="form-label">Recipe Name</label>
                <input type="text" id="recipe-name" class="form-input" placeholder="e.g. Tofu Bowl">
            </div>
            <div class="form-row">
                <div class="form-group" style="flex: 1;">
                    <label class="form-label">Emoji</label>
                    <input type="text" id="recipe-emoji" class="form-input" placeholder="🍲">
                </div>
                <div class="form-group" style="flex: 2;">
                    <label class="form-label">Prep Time</label>
                    <input type="text" id="recipe-prep" class="form-input" placeholder="e.g. 15 min" value="15 min">
                </div>
            </div>
            
            <h4 style="margin: 16px 0 8px; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Details</h4>
            <div class="form-group">
                <label class="form-label">Ingredients</label>
                <div id="recipe-ing-list" style="margin-bottom: 8px; font-size: 0.85rem; color: var(--text);"></div>
                <div class="form-row" style="margin-bottom: 8px;">
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <input type="number" step="any" id="ing-amount" class="form-input" placeholder="Amount (e.g. 200)" style="font-size: 0.8rem;">
                    </div>
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <input type="text" id="ing-unit" class="form-input" placeholder="Unit (g, tbsp)" style="font-size: 0.8rem;">
                    </div>
                    <div class="form-group" style="flex: 2; margin-bottom: 0;">
                        <input type="text" id="ing-name" class="form-input" placeholder="Name (e.g. Tofu)" style="font-size: 0.8rem;">
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" id="btn-add-ing" class="btn btn-sm btn-ghost" style="flex:1; border-style:dashed;">+ Add ingredient</button>
                    <button type="button" id="btn-scan-ing" class="btn btn-sm btn-ghost" style="flex:1;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6v12M8 6v12M11 6v12M15 6v12M18 6v12M20 6v12"/></svg>
                        Scan barcode
                    </button>
                </div>
                <div id="scan-result"></div>
            </div>
            <div class="form-group">
                <label class="form-label">Instructions</label>
                <textarea id="recipe-inst" class="form-input" style="resize:vertical; min-height:80px;" placeholder="1. Fry tofu...\n2. Add broccoli..."></textarea>
            </div>

            <div style="margin: 16px 0; text-align: center;">
                <button type="button" id="btn-calc-macros" class="btn btn-sm btn-ai">Estimate nutrition from ingredients</button>
            </div>
            
            <h4 style="margin: 16px 0 8px; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Nutritional Values</h4>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Calories (kcal)</label>
                    <input type="number" id="recipe-cal" class="form-input" value="500">
                </div>
                <div class="form-group">
                    <label class="form-label">Protein (g)</label>
                    <input type="number" id="recipe-pro" class="form-input" value="20">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Fiber (g)</label>
                    <input type="number" id="recipe-fiber" class="form-input" value="8">
                </div>
                <div class="form-group"></div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Zinc (mg)</label>
                    <input type="number" step="0.1" id="recipe-zinc" class="form-input" value="3">
                </div>
                <div class="form-group">
                    <label class="form-label">Omega-3 (mg)</label>
                    <input type="number" id="recipe-omega" class="form-input" value="500">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Iron (mg)</label>
                    <input type="number" step="0.1" id="recipe-iron" class="form-input" value="3">
                </div>
                <div class="form-group">
                    <label class="form-label">Vit B12 (mcg)</label>
                    <input type="number" step="0.1" id="recipe-b12" class="form-input" value="0">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Vit A (mcg)</label>
                    <input type="number" step="1" id="recipe-vita" class="form-input" value="0">
                </div>
                <div class="form-group">
                    <label class="form-label">Vit C (mg)</label>
                    <input type="number" step="1" id="recipe-vitc" class="form-input" value="0">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Vit D (mcg)</label>
                    <input type="number" step="0.1" id="recipe-vitd" class="form-input" value="0">
                </div>
                <div class="form-group">
                    <label class="form-label">Vit E (mg)</label>
                    <input type="number" step="0.1" id="recipe-vite" class="form-input" value="0">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Biotin (mcg)</label>
                    <input type="number" step="1" id="recipe-biotin" class="form-input" value="0">
                </div>
                <div class="form-group">
                    <label class="form-label">Magnesium (mg)</label>
                    <input type="number" step="1" id="recipe-mag" class="form-input" value="0">
                </div>
            </div>
        `;
        const footerHTML = `
            <button class="btn btn-ghost" onclick="App.hideModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-recipe">Save</button>
        `;
        
        window.currentRecipeIngredients = [];
        window.renderTempIngredients = () => {
            const list = document.getElementById('recipe-ing-list');
            if (!list) return;
            if (window.currentRecipeIngredients.length === 0) {
                list.innerHTML = '<span style="color:var(--text-muted);">No ingredients added yet.</span>';
                return;
            }
            list.innerHTML = window.currentRecipeIngredients.map((i, idx) => `
                <div style="display:flex; justify-content:space-between; margin-bottom: 4px; padding: 4px 8px; background: var(--surface); border-radius: 4px;">
                    <span>${i.amount} ${esc(i.unit)} ${esc(i.name)}${i.per100g ? '<span class="label-badge">label</span>' : ''}</span>
                    <span style="color:var(--error); cursor:pointer; font-weight:bold; padding:0 4px;" onclick="window.currentRecipeIngredients.splice(${idx}, 1); window.renderTempIngredients(); window.applyLabelTotals && window.applyLabelTotals();">×</span>
                </div>
            `).join('');
        };

        window.App.showModal('Add Custom Recipe', bodyHTML, footerHTML);
        window.renderTempIngredients();

        document.getElementById('btn-add-ing').addEventListener('click', () => {
            const amt = document.getElementById('ing-amount').value;
            const unit = document.getElementById('ing-unit').value.trim();
            const name = document.getElementById('ing-name').value.trim();
            if (!amt || !name) {
                window.App.showToast('Amount and Name are required.', 'error');
                return;
            }
            window.currentRecipeIngredients.push({ amount: parseFloat(amt), unit: unit || 'whole', name });
            document.getElementById('ing-amount').value = '';
            document.getElementById('ing-unit').value = '';
            document.getElementById('ing-name').value = '';
            window.renderTempIngredients();
            document.getElementById('ing-amount').focus();
        });

        const FIELD_IDS = {
            calories: 'recipe-cal', protein: 'recipe-pro', fiber: 'recipe-fiber', zinc: 'recipe-zinc', omega3: 'recipe-omega',
            iron: 'recipe-iron', vitaminB12: 'recipe-b12', vitaminA: 'recipe-vita', vitaminC: 'recipe-vitc',
            vitaminD: 'recipe-vitd', vitaminE: 'recipe-vite', biotin: 'recipe-biotin', magnesium: 'recipe-mag'
        };
        const setFields = (totals, onlyKeys) => {
            Object.entries(FIELD_IDS).forEach(([key, id]) => {
                if (onlyKeys && !onlyKeys.has(key)) return;
                const input = document.getElementById(id);
                const value = Number(totals[key]);
                if (input && Number.isFinite(value) && value >= 0) input.value = Math.round(value * 10) / 10;
            });
        };
        /** What a scanned product contributes, from the values printed on its package. */
        const labelShare = (ing) => {
            const share = {};
            if (!ing.per100g) return share;
            Object.entries(ing.per100g).forEach(([key, per100]) => { share[key] = per100 * ing.amount / 100; });
            return share;
        };
        // When every ingredient was scanned, the label values alone give the totals they cover
        window.applyLabelTotals = () => {
            const list = window.currentRecipeIngredients;
            if (!document.getElementById('recipe-cal') || list.length === 0 || !list.every(i => i.per100g)) return;
            const totals = {};
            const keys = new Set();
            list.forEach(ing => Object.entries(labelShare(ing)).forEach(([key, value]) => { totals[key] = (totals[key] || 0) + value; keys.add(key); }));
            setFields(totals, keys);
        };

        document.getElementById('btn-scan-ing').addEventListener('click', async () => {
            const code = await window.Scanner.scan();
            if (!code) return;
            const box = document.getElementById('scan-result');
            box.innerHTML = `<div class="glass-card-sm scan-result"><span class="form-hint">Looking up ${esc(code)}…</span></div>`;
            let product;
            try {
                product = (await window.Store.api(`/api/food/barcode/${code}`, { timeout: 20000 })).product;
            } catch (err) {
                const text = err.message === 'product_not_found'
                    ? 'This product is not in the database (or has no nutrition values). Add it by hand.'
                    : 'The product database could not be reached. Try again or add it by hand.';
                box.innerHTML = `<div class="glass-card-sm scan-result"><span class="form-hint">${text}</span></div>`;
                return;
            }
            const v = product.per100g;
            const shown = [
                v.calories !== undefined ? `${v.calories} kcal` : '',
                v.protein !== undefined ? `${v.protein} g protein` : '',
                v.fiber !== undefined ? `${v.fiber} g fiber` : '',
            ].filter(Boolean).join(' · ');
            box.innerHTML = `
                <div class="glass-card-sm scan-result">
                    <strong>${esc(product.name)}</strong>${product.brand ? ` <span class="form-hint">${esc(product.brand)}</span>` : ''}
                    <div class="scan-values">per 100 g: ${esc(shown || 'no calorie data')}${product.quantity ? ` · package ${esc(product.quantity)}` : ''}</div>
                    <div style="display:flex; gap:8px;">
                        <input type="number" inputmode="decimal" step="any" id="scan-amount" class="form-input" placeholder="Amount used in g" style="flex:1; min-width:0;">
                        <button type="button" class="btn btn-primary btn-sm" id="btn-scan-add">Add</button>
                    </div>
                </div>`;
            document.getElementById('scan-amount').focus();
            document.getElementById('btn-scan-add').addEventListener('click', () => {
                const grams = parseFloat(document.getElementById('scan-amount').value);
                if (!(grams > 0)) return window.App.showToast('Enter how many grams you use.', 'error');
                window.currentRecipeIngredients.push({ amount: grams, unit: 'g', name: product.name, per100g: product.per100g });
                box.innerHTML = '';
                window.renderTempIngredients();
                window.applyLabelTotals();
                if (!window.currentRecipeIngredients.every(i => i.per100g)) {
                    window.App.showToast('Added. Tap "Estimate nutrition" to combine label values with the other ingredients.', 'info');
                }
            });
        });

        document.getElementById('btn-calc-macros').addEventListener('click', async () => {
            
            if (window.currentRecipeIngredients.length === 0) {
                window.App.showToast('Please add some ingredients first.', 'error');
                return;
            }

            const list = window.currentRecipeIngredients;
            const ingredientsText = list.map((i, n) => `${n + 1}. ${i.amount} ${i.unit} ${i.name}`).join('\n');

            const btn = document.getElementById('btn-calc-macros');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Estimating…';
            btn.disabled = true;

            try {
                const answer = await window.App.ai([
                    {
                        role: 'system',
                        content: "You are a nutrition expert. For EACH numbered ingredient, estimate the nutritional values of exactly the given amount, and standardize its name into a common English name (e.g. 'tomate' -> 'Tomato') so it groups cleanly on a grocery list. Return ONLY a JSON object: {\"ingredients\": [{\"n\": 1, \"name\": string, \"nutrients\": {\"calories\": number, \"protein\": number, \"fiber\": number, \"zinc\": number, \"omega3\": number, \"iron\": number, \"vitaminB12\": number, \"vitaminA\": number, \"vitaminC\": number, \"vitaminD\": number, \"vitaminE\": number, \"biotin\": number, \"magnesium\": number}}]} with one entry per ingredient, in the same order. Units: kcal, g, g, mg, mg, mg, mcg, mcg, mg, mcg, mg, mcg, mg."
                    },
                    { role: 'user', content: ingredientsText }
                ], { temperature: 0.1, json: true });
                const result = window.App.parseAIJson(answer);
                const estimates = Array.isArray(result.ingredients) ? result.ingredients : [];
                if (estimates.length === 0) throw new Error('The estimate was empty.');

                // Add everything up; values printed on a scanned package replace the estimate
                const totals = {};
                list.forEach((ing, idx) => {
                    const estimate = estimates.find(e => Number(e.n) === idx + 1) || estimates[idx] || {};
                    const values = { ...(estimate.nutrients || {}), ...labelShare(ing) };
                    Object.keys(FIELD_IDS).forEach(key => { totals[key] = (totals[key] || 0) + num(values[key]); });
                    const cleanName = String(estimate.name || '').trim();
                    if (!ing.per100g && cleanName) ing.name = cleanName;
                });
                setFields(totals);
                window.renderTempIngredients();
                window.App.showToast('Nutrition estimated', 'success');
            } catch (err) {
                console.error('AI Calculation Error:', err);
                window.App.showToast('Could not estimate the nutrition. Please try again.', 'error');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });

        document.getElementById('btn-save-recipe').addEventListener('click', () => {
            const name = document.getElementById('recipe-name').value.trim();
            const emoji = document.getElementById('recipe-emoji').value.trim() || '🍲';
            const prepTime = document.getElementById('recipe-prep').value.trim() || '15 min';
            
            const cal = parseInt(document.getElementById('recipe-cal').value) || 0;
            const pro = parseInt(document.getElementById('recipe-pro').value) || 0;
            const zinc = parseFloat(document.getElementById('recipe-zinc').value) || 0;
            const omega3 = parseInt(document.getElementById('recipe-omega').value) || 0;
            const iron = parseFloat(document.getElementById('recipe-iron').value) || 0;
            const b12 = parseFloat(document.getElementById('recipe-b12').value) || 0;
            const vita = parseInt(document.getElementById('recipe-vita').value) || 0;
            const vitc = parseInt(document.getElementById('recipe-vitc').value) || 0;
            const vitd = parseFloat(document.getElementById('recipe-vitd').value) || 0;
            const vite = parseFloat(document.getElementById('recipe-vite').value) || 0;
            const biotin = parseInt(document.getElementById('recipe-biotin').value) || 0;
            const mag = parseInt(document.getElementById('recipe-mag').value) || 0;
            
            const inst = document.getElementById('recipe-inst').value.trim();

            if (!name) {
                window.App.showToast('Please enter a name.', 'error');
                return;
            }
            if (window.currentRecipeIngredients.length === 0) {
                window.App.showToast('Please add at least one ingredient.', 'error');
                return;
            }

            const ingredients = [...window.currentRecipeIngredients];
            window.applyLabelTotals = null;

            recipes.push(normalizeRecipe({
                id: 'c_' + Date.now().toString(36),
                name,
                emoji,
                prepTime,
                nutrients: { calories: cal, protein: pro, fiber: parseInt(document.getElementById('recipe-fiber').value) || 0, zinc: zinc, omega3: omega3, vitaminA: vita, iron: iron, vitaminB12: b12, vitaminC: vitc, vitaminD: vitd, vitaminE: vite, biotin: biotin, magnesium: mag },
                ingredients: ingredients,
                instructions: inst,
                isCustom: true
            }));
            saveRecipes();
            window.App.hideModal();
            renderSection();
            window.App.showToast('Recipe added!', 'success');
        });
    }

    function toggleExpand(recipeId) {
        const el = document.getElementById(`expand-${recipeId}`);
        if (el) {
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        }
    }

    function toggleCompletion(recipeId) {
        const idx = completion.completed.indexOf(recipeId);
        if (idx === -1) completion.completed.push(recipeId);
        else completion.completed.splice(idx, 1);
        
        saveCompletion();
        renderToday();
        renderSupplements();
        if(window.App && window.App.onCompletionChange) window.App.onCompletionChange();
    }

    /** Today's meals for the Today screen. */
    function getTodayItems() {
        return (mealPlan[getToday()] || [])
            .map(id => recipes.find(r => r.id === id))
            .filter(Boolean)
            .map(r => ({
                id: r.id,
                label: `${r.emoji} ${r.name}`,
                sub: `${r.nutrients.calories} kcal · ${r.nutrients.protein} g protein`,
                done: completion.completed.includes(r.id),
            }));
    }

    /** What the assistant should know about food today. */
    function getContextForAI() {
        const meals = getTodayItems().map(m => `${m.label} (${m.sub})${m.done ? ' [eaten]' : ' [not eaten yet]'}`);
        const planned = {};
        const eaten = {};
        NUTRIENT_KEYS.forEach(key => { planned[key] = 0; eaten[key] = 0; });
        (mealPlan[getToday()] || []).forEach(id => {
            const r = recipes.find(x => x.id === id);
            if (!r) return;
            NUTRIENT_KEYS.forEach(key => {
                planned[key] += r.nutrients[key];
                if (completion.completed.includes(id)) eaten[key] += r.nutrients[key];
            });
        });
        return {
            targets: DAILY_TARGETS,
            plannedTotals: planned,
            eatenTotals: eaten,
            todaysMeals: meals,
            recipeLibrary: recipes.map(r => `${r.name} (${r.nutrients.calories} kcal, ${r.nutrients.protein} g protein)`),
        };
    }

    function getCompletionData() {
        const today = getToday();
        const mealIds = mealPlan[today] || [];
        if (mealIds.length === 0) return { completed: 0, total: 0 };

        const done = mealIds.filter(id => completion.completed.includes(id)).length;
        return { completed: done, total: mealIds.length };
    }

    function showSwapModal(oldRecipeId) {
        if (!window.App) return;
        
        let html = `<div style="display:flex; flex-direction:column; gap:8px;">`;
        recipes.forEach(r => {
            if (r.id === oldRecipeId) return;
            html += `
                <div class="glass-card-sm" style="padding:12px; cursor:pointer;" onclick="FoodModule.swapMeal('${oldRecipeId}', '${r.id}')">
                    <div style="font-weight:600; font-size:0.9rem;">${esc(r.emoji)} ${esc(r.name)}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${r.nutrients.calories} kcal · ${r.nutrients.protein} g protein</div>
                </div>
            `;
        });
        html += `</div>`;

        window.App.showModal('Swap Meal', html, '<button class="btn btn-ghost" onclick="App.hideModal()">Cancel</button>');
    }

    function swapMeal(oldRecipeId, newRecipeId) {
        const today = getToday();
        if (mealPlan[today]) {
            const idx = mealPlan[today].indexOf(oldRecipeId);
            if (idx !== -1) {
                mealPlan[today][idx] = newRecipeId;
                savePlan();
            }
        }
        
        // Remove old recipe from completion if it was checked
        const compIdx = completion.completed.indexOf(oldRecipeId);
        if (compIdx !== -1) {
            completion.completed.splice(compIdx, 1);
            saveCompletion();
        }

        window.App.hideModal();
        renderSection();
        if (window.App.refreshDashboard) window.App.refreshDashboard();
    }

    async function generateAIPlan() {
        const btn = document.getElementById('btn-ai-plan');
        if(btn) {
            btn.innerHTML = 'Planning…';
            btn.disabled = true;
        }

        try {
            const today = getToday();
            // We want to plan today + next 6 days
            const targetDates = [];
            for (let i = 0; i < 7; i++) {
                targetDates.push(addDays(today, i));
            }

            // Prepare recipe catalog for AI
            const catalog = recipes.map(r => ({
                id: r.id,
                name: r.name,
                calories: r.nutrients.calories,
                protein: r.nutrients.protein,
                zinc: r.nutrients.zinc,
                omega3: r.nutrients.omega3,
                vitaminA: r.nutrients.vitaminA || 0,
                iron: r.nutrients.iron
            }));
            
            let profile = {};
            try { profile = JSON.parse(localStorage.getItem('lifeos_profile')) || {}; } catch(e) {}
            
            const dietRestr = profile.dietRestrictions || [];
            const legacyDiet = profile.diet && profile.diet !== 'none' ? profile.diet : '';
            const allDiet = [...dietRestr];
            if (legacyDiet && !allDiet.includes(legacyDiet)) allDiet.push(legacyDiet);
            const diet = allDiet.length > 0 ? allDiet.join(', ') : 'none';
            
            const budget = profile.budget || 'standard';
            const mealPrep = profile.meal_prep || 'none';

            let mealPrepInstruction = "";
            if (mealPrep === '2days') {
                mealPrepInstruction = "MEAL PREP RULE: You MUST duplicate dinner recipes into the next day's lunch to save cooking time. (e.g. Monday Dinner == Tuesday Lunch).";
            } else if (mealPrep === '3days') {
                mealPrepInstruction = "MEAL PREP RULE: You MUST serve the exact same 3 meals for 3 consecutive days to support extreme batch cooking (e.g. Mon/Tue/Wed have identical meals).";
            }

            const goals = [];
            if (profile.goals) {
                if (profile.goals.muscle) goals.push("Muscle Gain");
                if (profile.goals.skin) goals.push("Better Skin (Acne-friendly)");
                if (profile.goals.hair) goals.push("Hair/Eyebrow Growth");
            }
            const goalsStr = goals.length > 0 ? `The user's physical goals are: ${goals.join(', ')}. Optimize the recipe selection to support these goals.` : '';
            
            const lang = localStorage.getItem('lifeos_lang') === 'de' ? 'German' : 'English';

            const sysPrompt = `You are a world-class nutritionist AI.
The user's dietary restriction is: ${diet}.
Their budget preference is: ${budget} (if cheap, prioritize lower-cost recipes).
${goalsStr}
${mealPrepInstruction}
They need a 7-day meal plan chosen ONLY from the exact list of recipes provided below.
The daily targets are: Calories: ${DAILY_TARGETS.calories}, Protein: ${DAILY_TARGETS.protein}g, Zinc: ${DAILY_TARGETS.zinc}mg, Omega-3: ${DAILY_TARGETS.omega3}mg, Vitamin A: ${DAILY_TARGETS.vitaminA}mcg, Iron: ${DAILY_TARGETS.iron}mg.
Here is the catalog of available recipes (choose from these IDs):
${JSON.stringify(catalog)}

Return ONLY a valid JSON object where the keys are the following exact date strings: ${JSON.stringify(targetDates)} and the values are arrays of exactly 3 recipe IDs (breakfast, lunch, dinner). Vary the meals across the week.`;

            const answer = await window.App.ai([
                { role: 'system', content: sysPrompt },
                { role: 'user', content: 'Create the plan now and answer with the JSON object only.' }
            ], { temperature: 0.2, json: true });
            const plan = window.App.parseAIJson(answer);

            // Only accept days that consist of three different recipes that really exist
            const known = new Set(recipes.map(r => r.id));
            let updated = false;
            for (const date of targetDates) {
                const ids = Array.isArray(plan[date]) ? plan[date].filter(id => known.has(id)) : [];
                if (ids.length === 3) {
                    mealPlan[date] = ids;
                    updated = true;
                }
            }

            if (updated) {
                // Meals ticked off today may have been replaced
                completion.completed = completion.completed.filter(id => (mealPlan[today] || []).includes(id));
                saveCompletion();
                savePlan();
                renderSection();
                if (window.App.refreshDashboard) window.App.refreshDashboard();
                window.App.showToast('Your next 7 days are planned', 'success');
            } else {
                throw new Error('The plan did not match the recipe list.');
            }

        } catch (err) {
            console.error('AI Plan Error:', err);
            window.App.showToast('Could not plan the week. Please try again.', 'error');
        } finally {
            if(btn) {
                btn.innerHTML = 'Plan my week';
                btn.disabled = false;
            }
        }
    }

    function init() {
        loadData();
    }

    async function recommendNewRecipe() {
        const btn = document.getElementById('btn-recommend-recipe');
        if(btn) {
            btn.innerHTML = 'Thinking…';
            btn.disabled = true;
        }

        let profile = {};
        try { profile = JSON.parse(localStorage.getItem('lifeos_profile')) || {}; } catch(e) {}
        
        const dietRestr = profile.dietRestrictions || [];
        const legacyDiet = profile.diet && profile.diet !== 'none' ? profile.diet : '';
        const allDiet = [...dietRestr];
        if (legacyDiet && !allDiet.includes(legacyDiet)) allDiet.push(legacyDiet);
        const diet = allDiet.length > 0 ? allDiet.join(', ') : 'none';
        
        const budget = profile.budget || 'standard';

        const goals = [];
        if (profile.goals) {
            if (profile.goals.muscle) goals.push("Muscle Gain");
            if (profile.goals.skin) goals.push("Better Skin (Acne-friendly)");
            if (profile.goals.hair) goals.push("Hair/Eyebrow Growth");
        }
        const goalsStr = goals.length > 0 ? `The user's physical goals are: ${goals.join(', ')}. Optimize the recipe to heavily support these goals.` : '';

        const lang = localStorage.getItem('lifeos_lang') === 'de' ? 'German' : 'English';

        const existingNames = recipes.map(r => r.name).join(', ');

        const sysPrompt = `You are a world-class nutritionist AI. The user wants a NEW, delicious, easy-to-cook recipe to add to their library.
You MUST write the recipe in ${lang} language.
Their dietary restriction is: ${diet}.
Their budget preference is: ${budget} (if cheap, strictly limit to low-cost ingredients).
${goalsStr}
They already have these recipes, do NOT duplicate them: ${existingNames}.
Their personal daily nutritional targets are: Calories: ${DAILY_TARGETS.calories}, Protein: ${DAILY_TARGETS.protein}g, Zinc: ${DAILY_TARGETS.zinc}mg, Omega-3: ${DAILY_TARGETS.omega3}mg, Vitamin A: ${DAILY_TARGETS.vitaminA}mcg, Iron: ${DAILY_TARGETS.iron}mg, Vit C: ${DAILY_TARGETS.vitaminC}mg, Vit D: ${DAILY_TARGETS.vitaminD}mcg, Vit E: ${DAILY_TARGETS.vitaminE}mg, Biotin: ${DAILY_TARGETS.biotin}mcg, Magnesium: ${DAILY_TARGETS.magnesium}mg, Fiber: ${DAILY_TARGETS.fiber}g.
The recipe should be roughly 1/3 of these targets.

You MUST respond ONLY with a raw, valid JSON object exactly matching this structure (no markdown, no backticks, no extra text):
{
  "name": "Creative Recipe Name",
  "emoji": "🍲",
  "prepTime": "15 min",
  "description": "A short, appetizing description.",
  "instructions": "Step 1: ...\\nStep 2: ...",
  "nutrients": { "calories": 500, "protein": 30, "fiber": 10, "zinc": 5, "omega3": 500, "vitaminA": 300, "iron": 5, "vitaminB12": 1, "vitaminC": 30, "vitaminD": 5, "vitaminE": 4, "biotin": 10, "magnesium": 100 },
  "ingredients": [
    { "name": "Ingredient Name", "amount": 100, "unit": "g" }
  ]
}
`;

        try {
            const answer = await window.App.ai([
                { role: 'system', content: sysPrompt },
                { role: 'user', content: 'Give me a new recipe as a JSON object.' }
            ], { temperature: 0.7, json: true, max_tokens: 1500 });

            const parsed = normalizeRecipe({ ...window.App.parseAIJson(answer), id: null, isCustom: true });
            if (!parsed || parsed.ingredients.length === 0) throw new Error('The suggestion was incomplete.');

            showReviewModal(parsed);

        } catch (err) {
            console.error('Recommend Recipe Error:', err);
            window.App.showToast('Could not create a recipe. Please try again.', 'error');
        } finally {
            if(btn) {
                btn.innerHTML = 'Suggest';
                btn.disabled = false;
            }
        }
    }

    function showReviewModal(recipe) {
        if (!window.App) return;

        const bodyHTML = `
            <div style="text-align: center; font-size: 3rem; margin-bottom: 8px;">${esc(recipe.emoji)}</div>
            <h3 style="text-align: center; margin-top: 0;">${esc(recipe.name)}</h3>
            <p style="text-align: center; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">${esc(recipe.description)} · ${esc(recipe.prepTime)}</p>
            ${recipeDetailsHtml(recipe)}
        `;

        const footerHTML = `
            <button class="btn btn-ghost" onclick="App.hideModal()">Discard</button>
            <button class="btn btn-primary" id="btn-approve-recipe">Add to Library</button>
        `;

        window.App.showModal('Review New Recipe', bodyHTML, footerHTML);

        document.getElementById('btn-approve-recipe').addEventListener('click', () => {
            recipes.unshift(recipe);
            saveRecipes();
            renderLibrary();
            window.App.hideModal();
            window.App.showToast('Recipe added to library!', 'success');
        });
    }

    window.FoodModule = { init, renderSection, getCompletionData, getTodayItems, getContextForAI, toggleExpand, toggleCompletion, deleteRecipe, generateAIPlan, updateDailyTargets, recommendNewRecipe, showSwapModal, swapMeal, setRecipeSearchQuery };

})();
