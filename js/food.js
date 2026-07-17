(function() {
    'use strict';

    const STORAGE_RECIPES = 'lifeos_recipes';
    const STORAGE_PLAN = 'lifeos_meal_plan'; // { date: mealIds[] }
    const STORAGE_COMPLETION = 'lifeos_meal_completion';

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
    function getToday() {
        return window.App ? window.App.getToday() : new Date().toISOString().slice(0, 10);
    }
    function addDays(dateStr, days) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    }

    function loadData() {
        const storedRecipes = localStorage.getItem(STORAGE_RECIPES);
        recipes = storedRecipes ? JSON.parse(storedRecipes) : [...PROTOTYPE_RECIPES];

        const storedPlan = localStorage.getItem(STORAGE_PLAN);
        mealPlan = storedPlan ? JSON.parse(storedPlan) : {};

        const storedComp = localStorage.getItem(STORAGE_COMPLETION);
        if (storedComp) {
            completion = JSON.parse(storedComp);
        }
        if (completion.date !== getToday()) {
            completion = { date: getToday(), completed: [] };
            saveCompletion();
        }

        ensureWeeklyPlanExists();
    }

    function saveRecipes() { localStorage.setItem(STORAGE_RECIPES, JSON.stringify(recipes)); }
    function savePlan() { localStorage.setItem(STORAGE_PLAN, JSON.stringify(mealPlan)); }
    function saveCompletion() { localStorage.setItem(STORAGE_COMPLETION, JSON.stringify(completion)); }

    // --- Algorithm: Generate 7 Days ---
    function ensureWeeklyPlanExists() {
        const today = getToday();
        
        // Find how many days ahead we have planned
        let highestDate = today;
        for (let i = 0; i < 14; i++) {
            const d = addDays(today, i);
            if (mealPlan[d] && mealPlan[d].length === 3) {
                highestDate = d;
            } else {
                break;
            }
        }

        // We want at least 7 days planned from today (today + 6 days)
        const targetDate = addDays(today, 7);
        
        let currentDate = today;
        let generatedAny = false;
        
        while (currentDate <= targetDate) {
            if (!mealPlan[currentDate] || mealPlan[currentDate].length < 3) {
                mealPlan[currentDate] = generateDayMeals();
                generatedAny = true;
            }
            currentDate = addDays(currentDate, 1);
        }

        if (generatedAny) savePlan();
    }

    function generateDayMeals() {
        // Greedy selection to fill targets
        const available = [...recipes].sort(() => Math.random() - 0.5);
        let selected = [];
        let currentNutrients = { protein: 0, zinc: 0, omega3: 0, vitaminA: 0, iron: 0, calories: 0 };

        for (let i = 0; i < 3; i++) {
            let bestRecipe = null;
            let bestScore = -Infinity;

            for (const r of available) {
                if (selected.includes(r.id)) continue;

                // Score based on what we need most
                const pScore = (DAILY_TARGETS.protein - currentNutrients.protein) > 0 ? (r.nutrients.protein / DAILY_TARGETS.protein) * 2 : 0;
                const zScore = (DAILY_TARGETS.zinc - currentNutrients.zinc) > 0 ? (r.nutrients.zinc / DAILY_TARGETS.zinc) * 3 : 0; // high priority
                const oScore = (DAILY_TARGETS.omega3 - currentNutrients.omega3) > 0 ? (r.nutrients.omega3 / DAILY_TARGETS.omega3) * 3 : 0; // high priority
                const vScore = (DAILY_TARGETS.vitaminA - currentNutrients.vitaminA) > 0 ? (r.nutrients.vitaminA / DAILY_TARGETS.vitaminA) * 1.5 : 0;
                
                const score = pScore + zScore + oScore + vScore + (Math.random() * 0.2); // slight randomization

                if (score > bestScore) {
                    bestScore = score;
                    bestRecipe = r;
                }
            }

            if (bestRecipe) {
                selected.push(bestRecipe.id);
                currentNutrients.protein += bestRecipe.nutrients.protein;
                currentNutrients.zinc += bestRecipe.nutrients.zinc;
                currentNutrients.omega3 += bestRecipe.nutrients.omega3;
                currentNutrients.vitaminA += bestRecipe.nutrients.vitaminA;
            }
        }
        return selected;
    }

    // --- UI Rendering ---

    function getRecipeHtml(r, isDone, index) {
        return `
            <div class="checklist-item stagger-item ${isDone ? 'checked' : ''}" style="animation-delay:${index*50}ms; cursor:pointer;" onclick="FoodModule.toggleExpand('${r.id}')">
                <div class="checklist-check" onclick="event.stopPropagation(); FoodModule.toggleCompletion('${r.id}')">✓</div>
                <div class="checklist-content">
                    <div class="checklist-text"><span class="progress-emoji" style="margin-right:8px; font-size:1.2rem;">${r.emoji}</span> ${r.name}</div>
                    <div class="checklist-sub">
                        ${r.nutrients.calories} kcal • ${r.nutrients.protein}g Protein • ${r.prepTime}
                    </div>
                </div>
            </div>
            <div id="expand-${r.id}" class="recipe-expand glass-card-sm" style="display:none; margin-bottom: 12px; margin-top: -8px; border-top: none; border-top-left-radius: 0; border-top-right-radius: 0;">
                <h4 style="margin: 0 0 8px 0; font-size: 0.85rem; color: var(--text-secondary);">Nutrition</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; font-size: 0.75rem;">
                    <span class="recipe-tag">Calories: ${r.nutrients.calories}</span>
                    <span class="recipe-tag high-protein">Protein: ${r.nutrients.protein}g</span>
                    <span class="recipe-tag zinc">Zinc: ${r.nutrients.zinc}mg</span>
                    <span class="recipe-tag omega3">Omega-3: ${r.nutrients.omega3}mg</span>
                    <span class="recipe-tag">Iron: ${r.nutrients.iron}mg</span>
                    <span class="recipe-tag">Vit B12: ${r.nutrients.vitaminB12}mcg</span>
                    <span class="recipe-tag" style="background: rgba(234, 179, 8, 0.1); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.2);">Vit A: ${r.nutrients.vitaminA || 0}mcg</span>
                    <span class="recipe-tag" style="background: rgba(249, 115, 22, 0.1); color: #fdba74; border: 1px solid rgba(249, 115, 22, 0.2);">Vit C: ${r.nutrients.vitaminC || 0}mg</span>
                    <span class="recipe-tag" style="background: rgba(250, 204, 21, 0.1); color: #fef08a; border: 1px solid rgba(250, 204, 21, 0.2);">Vit D: ${r.nutrients.vitaminD || 0}mcg</span>
                    <span class="recipe-tag" style="background: rgba(163, 230, 53, 0.1); color: #d9f99d; border: 1px solid rgba(163, 230, 53, 0.2);">Vit E: ${r.nutrients.vitaminE || 0}mg</span>
                    <span class="recipe-tag" style="background: rgba(236, 72, 153, 0.1); color: #fbcfe8; border: 1px solid rgba(236, 72, 153, 0.2);">Biotin: ${r.nutrients.biotin || 0}mcg</span>
                    <span class="recipe-tag" style="background: rgba(168, 85, 247, 0.1); color: #e9d5ff; border: 1px solid rgba(168, 85, 247, 0.2);">Magnesium: ${r.nutrients.magnesium || 0}mg</span>
                </div>
                <h4 style="margin: 0 0 8px 0; font-size: 0.85rem; color: var(--text-secondary);">${t('ingredients')}</h4>
                <ul style="margin: 0 0 12px 0; padding-left: 18px; font-size: 0.85rem; color: var(--text-muted);">
                    ${r.ingredients.map(i => `<li>${i.amount} ${i.unit} ${i.name}</li>`).join('')}
                </ul>
                <h4 style="margin: 0 0 8px 0; font-size: 0.85rem; color: var(--text-secondary);">${t('instructions')}</h4>
                <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); white-space: pre-wrap;">${r.instructions}</p>
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
                    <div class="section-title-icon" style="background:rgba(99,102,241,0.15); color:var(--primary-light);">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
                    </div>
                    <h2>${t('todays_meals')}</h2>
                </div>
                <button type="button" class="btn btn-sm btn-ghost" onclick="FoodModule.generateAIPlan()" id="btn-ai-plan" style="border: 1px dashed rgba(139, 92, 246, 0.4); color: #c4b5fd; font-size:0.75rem;">
                    AI Plan
                </button>
            </div>
        `;

        if (todayRecipes.length === 0) {
            html += `<div class="empty-state"><div class="empty-state-text">${t('no_meals_planned')}</div></div>`;
        } else {
            html += `<p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:16px;">Tap a meal to view recipe & ingredients.</p>`;
            todayRecipes.forEach((r, idx) => {
                const isDone = completion.completed.includes(r.id);
                html += getRecipeHtml(r, isDone, idx);
            });
        }
        
        container.innerHTML = html;
    }

    function renderShoppingList() {
        const container = document.getElementById('food-shopping');
        if (!container) return;

        // Aggregate ingredients for tomorrow to tomorrow + 6 days (Next 7 days)
        const today = getToday();
        const ingredientsMap = {}; // name_unit -> { name, unit, amount }

        for (let i = 1; i <= 7; i++) {
            const d = addDays(today, i);
            const mealIds = mealPlan[d] || [];
            mealIds.forEach(id => {
                const r = recipes.find(x => x.id === id);
                if (r && r.ingredients) {
                    r.ingredients.forEach(ing => {
                        const key = `${ing.name.toLowerCase()}_${ing.unit}`;
                        if (!ingredientsMap[key]) {
                            ingredientsMap[key] = { name: ing.name, unit: ing.unit, amount: 0 };
                        }
                        ingredientsMap[key].amount += ing.amount;
                    });
                }
            });
        }

        const list = Object.values(ingredientsMap).sort((a,b) => a.name.localeCompare(b.name));

        let html = `
            <div class="card-header-row" style="margin-top:24px; margin-bottom: 12px;">
                <h2>${t('upcoming_groceries')}</h2>
            </div>
            <div class="glass-card-sm stagger-item" style="padding: 16px;">
        `;

        if (list.length === 0) {
            html += `<div class="empty-state-text">${t('no_groceries')}</div>`;
        } else {
            html += `<ul style="margin:0; padding-left:18px; color:var(--text); font-size:0.9rem; line-height:1.6;">`;
            list.forEach(ing => {
                // Round amount to 1 decimal place if needed
                const amt = Math.round(ing.amount * 10) / 10;
                html += `<li><strong>${amt} ${ing.unit}</strong> ${ing.name}</li>`;
            });
            html += `</ul>`;
        }
        html += `</div>`;

        container.innerHTML = html;
    }

    function renderSupplements() {
        const container = document.getElementById('food-supplements');
        if (!container) return;

        const today = getToday();
        const mealIds = mealPlan[today] || [];
        const todayRecipes = mealIds.map(id => recipes.find(r => r.id === id)).filter(Boolean);

        let sum = { calories:0, protein:0, zinc:0, omega3:0, vitaminA:0, iron:0, vitaminB12:0, vitaminC:0, vitaminD:0, vitaminE:0, biotin:0, magnesium:0, fiber:0 };
        todayRecipes.forEach(r => {
            sum.calories += r.nutrients.calories || 0;
            sum.protein += r.nutrients.protein || 0;
            sum.zinc += r.nutrients.zinc || 0;
            sum.omega3 += r.nutrients.omega3 || 0;
            sum.vitaminA += r.nutrients.vitaminA || 0;
            sum.iron += r.nutrients.iron || 0;
            sum.vitaminB12 += r.nutrients.vitaminB12 || 0;
            sum.vitaminC += r.nutrients.vitaminC || 0;
            sum.vitaminD += r.nutrients.vitaminD || 0;
            sum.vitaminE += r.nutrients.vitaminE || 0;
            sum.biotin += r.nutrients.biotin || 0;
            sum.magnesium += r.nutrients.magnesium || 0;
            sum.fiber += r.nutrients.fiber || 0;
        });

        // Generate Macro Progress Bars
        const macros = [
            { key: 'calories', label: 'Calories', unit: 'kcal' },
            { key: 'protein', label: 'Protein', unit: 'g' },
            { key: 'zinc', label: 'Zinc', unit: 'mg' },
            { key: 'omega3', label: 'Omega-3', unit: 'mg' },
            { key: 'vitaminA', label: 'Vit A', unit: 'mcg' },
            { key: 'magnesium', label: 'Magnesium', unit: 'mg' }
        ];

        let html = `<div class="card-header-row" style="margin-top:24px; margin-bottom:12px;"><h2>Daily Nutrition</h2></div>`;
        html += `<div class="glass-card stagger-item" style="padding: 16px; margin-bottom: 24px; display:flex; flex-direction:column; gap:12px;">`;
        
        macros.forEach(m => {
            const target = DAILY_TARGETS[m.key] || 1;
            const current = sum[m.key] || 0;
            let pct = Math.min(100, Math.round((current / target) * 100));
            const color = pct >= 100 ? '#10b981' : 'var(--primary)';
            
            html += `
                <div>
                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px; color:var(--text);">
                        <span><strong>${m.label}</strong></span>
                        <span style="color:var(--text-muted);">${Math.round(current)} / ${target} ${m.unit} (${pct}%)</span>
                    </div>
                    <div class="progress-bar-bg" style="height:6px;">
                        <div class="progress-bar-fill" style="width: ${pct}%; background: ${color};"></div>
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

        html += `<div class="card-header-row" style="margin-top:24px;"><h2>${t('suggested_supplements')}</h2></div>`;
        if (gaps.length === 0) {
            html += `<div class="glass-card-sm stagger-item"><div class="empty-state-text">${t('targets_hit')}</div></div>`;
        } else {
            html += `<div class="glass-card-sm stagger-item" style="border: 1px solid rgba(245,158,11,0.3);">
                <ul style="margin:0; padding-left:18px; color:var(--text-muted); font-size:0.9rem; line-height:1.6;">
                    ${gaps.map(g => `<li>${g}</li>`).join('')}
                </ul>
            </div>`;
        }

        container.innerHTML = html;
    }

    function renderLibrary() {
        const container = document.getElementById('food-library');
        if (!container) return;
        
        let html = `
            <div class="card-header-row" style="margin-top:24px;">
                <h2>${t('recipe_library')}</h2>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-sm" id="btn-recommend-recipe" style="background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); color: #c4b5fd;">Recommend Recipe</button>
                    <button class="btn btn-primary btn-sm" id="btn-add-recipe">${t('add_recipe')}</button>
                </div>
            </div>
            <div class="recipe-grid stagger-item" style="margin-top: 12px;">
        `;
        
        recipes.forEach((r, idx) => {
            const tagsHtml = [];
            if (r.nutrients.protein > 20) tagsHtml.push(`<span class="recipe-tag high-protein">High Protein</span>`);
            if (r.nutrients.omega3 > 400) tagsHtml.push(`<span class="recipe-tag omega3">Omega-3</span>`);
            if (r.nutrients.zinc > 3) tagsHtml.push(`<span class="recipe-tag zinc">Zinc</span>`);

            html += `
                <div class="recipe-item" style="animation-delay:${idx*30}ms; cursor:pointer;" onclick="FoodModule.toggleExpand('lib-${r.id}')">
                    <div class="recipe-emoji">${r.emoji}</div>
                    <div class="recipe-info">
                        <div class="recipe-name">${r.name}</div>
                        <div class="recipe-tags">${tagsHtml.join('')}</div>
                    </div>
                </div>
                <div id="expand-lib-${r.id}" class="recipe-expand glass-card-sm" style="display:none; margin-bottom: 12px; margin-top: -8px; border-top: none; border-top-left-radius: 0; border-top-right-radius: 0;">
                    <h4 style="margin: 0 0 8px 0; font-size: 0.85rem; color: var(--text-secondary);">Nutrition</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; font-size: 0.75rem;">
                        <span class="recipe-tag">Calories: ${r.nutrients.calories}</span>
                        <span class="recipe-tag high-protein">Protein: ${r.nutrients.protein}g</span>
                        <span class="recipe-tag zinc">Zinc: ${r.nutrients.zinc}mg</span>
                        <span class="recipe-tag omega3">Omega-3: ${r.nutrients.omega3}mg</span>
                        <span class="recipe-tag">Iron: ${r.nutrients.iron}mg</span>
                        <span class="recipe-tag">Vit B12: ${r.nutrients.vitaminB12}mcg</span>
                    </div>
                    <h4 style="margin: 0 0 8px 0; font-size: 0.85rem; color: var(--text-secondary);">${t('ingredients')}</h4>
                    <ul style="margin: 0 0 12px 0; padding-left: 18px; font-size: 0.85rem; color: var(--text-muted);">
                        ${(r.ingredients || []).map(i => `<li>${i.amount} ${i.unit} ${i.name}</li>`).join('')}
                    </ul>
                    <h4 style="margin: 0 0 8px 0; font-size: 0.85rem; color: var(--text-secondary);">${t('instructions')}</h4>
                    <p style="margin: 0 0 12px 0; font-size: 0.85rem; color: var(--text-muted); white-space: pre-wrap;">${r.instructions || 'No instructions provided.'}</p>
                    <div style="border-top: 1px solid var(--glass-border); padding-top: 12px; display: flex; justify-content: flex-end;">
                        <button class="btn btn-sm" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: var(--error);" onclick="event.stopPropagation(); FoodModule.deleteRecipe('${r.id}')">Delete Recipe</button>
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
        container.innerHTML = html;
        
        document.getElementById('btn-add-recipe')?.addEventListener('click', showAddRecipeModal);
        document.getElementById('btn-recommend-recipe')?.addEventListener('click', recommendNewRecipe);
    }

    function deleteRecipe(id) {
        recipes = recipes.filter(r => r.id !== id);
        saveRecipes();
        renderLibrary();
        if(window.App && window.App.showToast) window.App.showToast('Recipe deleted', 'success');
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
                <button type="button" id="btn-add-ing" class="btn btn-sm btn-ghost" style="width: 100%; border: 1px dashed var(--glass-border);">+ Add Ingredient</button>
            </div>
            <div class="form-group">
                <label class="form-label">Instructions</label>
                <textarea id="recipe-inst" class="form-input" style="resize:vertical; min-height:80px;" placeholder="1. Fry tofu...\n2. Add broccoli..."></textarea>
            </div>

            <div style="margin: 16px 0; text-align: center;">
                <button type="button" id="btn-calc-macros" class="btn btn-sm" style="background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); color: #c4b5fd;">
                    Auto-Calculate Macros with AI
                </button>
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
                <div style="display:flex; justify-content:space-between; margin-bottom: 4px; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                    <span>${i.amount} ${i.unit} ${i.name}</span>
                    <span style="color:var(--error); cursor:pointer; font-weight:bold; padding:0 4px;" onclick="window.currentRecipeIngredients.splice(${idx}, 1); window.renderTempIngredients();">×</span>
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

        document.getElementById('btn-calc-macros').addEventListener('click', async () => {
            const apiKey = localStorage.getItem('lifeos_deepseek_key');
            if (!apiKey) {
                window.App.showToast('Please add your DeepSeek API key in Settings.', 'error');
                return;
            }
            
            if (window.currentRecipeIngredients.length === 0) {
                window.App.showToast('Please add some ingredients first.', 'error');
                return;
            }

            const ingredientsText = window.currentRecipeIngredients.map(i => `${i.amount} ${i.unit} ${i.name}`).join('\n');

            const btn = document.getElementById('btn-calc-macros');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Calculating... ⏳';
            btn.disabled = true;

            try {
                const response = await fetch('https://api.deepseek.com/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "deepseek-chat",
                        messages: [
                            {
                                role: "system",
                                content: "You are a nutrition expert. 1) Estimate the total nutritional values of the provided ingredients. 2) Standardize the ingredient names into a common English name (e.g., 'tomate' -> 'Tomato', 'tomatoe' -> 'Tomato') so they group cleanly on a grocery list. Return ONLY a valid JSON object with numerical keys: calories, protein, zinc, omega3, iron, vitaminB12, vitaminA, vitaminC, vitaminD, vitaminE, biotin, magnesium, AND an array key 'standardizedIngredients' containing objects exactly like {amount: number, unit: string, name: string}. Do not include markdown formatting."
                            },
                            {
                                role: "user",
                                content: ingredientsText
                            }
                        ],
                        temperature: 0.1
                    })
                });

                const data = await response.json();
                
                if (data.error) {
                    throw new Error(data.error.message || 'API Error');
                }

                let content = data.choices[0].message.content.trim();
                
                // Strip markdown if it still returned it
                if (content.startsWith('\`\`\`json')) {
                    content = content.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
                } else if (content.startsWith('\`\`\`')) {
                    content = content.replace(/\`\`\`/g, '').trim();
                }

                const result = JSON.parse(content);

                if (result.calories !== undefined) document.getElementById('recipe-cal').value = Math.round(result.calories);
                if (result.protein !== undefined) document.getElementById('recipe-pro').value = Math.round(result.protein);
                if (result.zinc !== undefined) document.getElementById('recipe-zinc').value = result.zinc;
                if (result.omega3 !== undefined) document.getElementById('recipe-omega').value = Math.round(result.omega3);
                if (result.iron !== undefined) document.getElementById('recipe-iron').value = result.iron;
                if (result.vitaminB12 !== undefined) document.getElementById('recipe-b12').value = result.vitaminB12;
                if (result.vitaminA !== undefined) document.getElementById('recipe-vita').value = Math.round(result.vitaminA);
                if (result.vitaminC !== undefined) document.getElementById('recipe-vitc').value = Math.round(result.vitaminC);
                if (result.vitaminD !== undefined) document.getElementById('recipe-vitd').value = result.vitaminD;
                if (result.vitaminE !== undefined) document.getElementById('recipe-vite').value = result.vitaminE;
                if (result.biotin !== undefined) document.getElementById('recipe-biotin').value = Math.round(result.biotin);
                if (result.magnesium !== undefined) document.getElementById('recipe-mag').value = Math.round(result.magnesium);
                
                if (result.standardizedIngredients && Array.isArray(result.standardizedIngredients)) {
                    window.currentRecipeIngredients = result.standardizedIngredients;
                    window.renderTempIngredients();
                }

                window.App.showToast('Macros estimated & ingredients formatted!', 'success');

            } catch (err) {
                console.error('AI Calculation Error:', err);
                window.App.showToast('Failed to calculate macros. Check API key.', 'error');
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

            recipes.push({
                id: 'c_' + Date.now().toString(36),
                name,
                emoji,
                prepTime,
                nutrients: { calories: cal, protein: pro, fiber: 10, zinc: zinc, omega3: omega3, vitaminA: vita, iron: iron, vitaminB12: b12, vitaminC: vitc, vitaminD: vitd, vitaminE: vite, biotin: biotin, magnesium: mag },
                ingredients: ingredients,
                instructions: inst || 'Custom recipe.',
                isCustom: true
            });
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
        if(window.App && window.App.onCompletionChange) window.App.onCompletionChange();
    }

    function getCompletionData() {
        const today = getToday();
        const mealIds = mealPlan[today] || [];
        if (mealIds.length === 0) return { completed: 0, total: 0 };

        const done = mealIds.filter(id => completion.completed.includes(id)).length;
        return { completed: done, total: mealIds.length };
    }

    async function generateAIPlan() {
        const apiKey = localStorage.getItem('lifeos_deepseek_key');
        if (!apiKey) {
            if(window.App && window.App.showToast) window.App.showToast('Please add your DeepSeek API key in Settings to use the AI Meal Planner.', 'error');
            return;
        }

        const btn = document.getElementById('btn-ai-plan');
        if(btn) {
            btn.innerHTML = 'Planning... ⏳';
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

Return ONLY a valid JSON object where the keys are the following exact date strings: ${JSON.stringify(targetDates)} and the values are arrays of exactly 3 recipe IDs. Do not include markdown formatting.`;

            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [ { role: "system", content: sysPrompt } ],
                    temperature: 0.1
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message || 'API Error');

            let content = data.choices[0].message.content.trim();
            const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (match) {
                content = match[1].trim();
            } else {
                content = content.replace(/\`\`\`/g, '').trim();
            }

            const plan = JSON.parse(content);

            // Merge into mealPlan
            let updated = false;
            for (const date of targetDates) {
                if (plan[date] && Array.isArray(plan[date]) && plan[date].length === 3) {
                    mealPlan[date] = plan[date];
                    updated = true;
                }
            }

            if (updated) {
                savePlan();
                renderSection();
                if(window.App && window.App.showToast) window.App.showToast('AI perfectly balanced your meals for the next 7 days!', 'success');
            } else {
                throw new Error('Invalid JSON format from AI.');
            }

        } catch (err) {
            console.error('AI Plan Error:', err);
            if(window.App && window.App.showToast) window.App.showToast('Failed to generate AI plan. Check API key or try again.', 'error');
        } finally {
            if(btn) {
                btn.innerHTML = 'AI Plan';
                btn.disabled = false;
            }
        }
    }

    function init() {
        loadData();
    }

    async function recommendNewRecipe() {
        const apiKey = localStorage.getItem('lifeos_deepseek_key');
        if (!apiKey) {
            if(window.App) window.App.showToast('Please set your DeepSeek API Key in Settings first', 'error');
            return;
        }

        const btn = document.getElementById('btn-recommend-recipe');
        if(btn) {
            btn.innerHTML = 'Thinking...';
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
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: sysPrompt },
                        { role: 'user', content: 'Give me a new recipe.' }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.7,
                    max_tokens: 1500
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message || 'API Error');
            
            let content = data.choices[0].message.content.trim();
            const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (match) {
                content = match[1].trim();
            } else {
                content = content.replace(/\`\`\`/g, '').trim();
            }

            const parsed = JSON.parse(content);
            parsed.id = 'c_' + Date.now().toString(36);
            parsed.isCustom = true;
            
            showReviewModal(parsed);

        } catch (err) {
            console.error('Recommend Recipe Error:', err);
            if(window.App) window.App.showToast(`Failed: ${err.message}`, 'error');
        } finally {
            if(btn) {
                btn.innerHTML = 'Recommend Recipe';
                btn.disabled = false;
            }
        }
    }

    function showReviewModal(recipe) {
        if (!window.App) return;

        const bodyHTML = `
            <div style="text-align: center; font-size: 3rem; margin-bottom: 8px;">${recipe.emoji}</div>
            <h3 style="text-align: center; margin-top: 0;">${recipe.name}</h3>
            <p style="text-align: center; font-size: 0.85rem; color: var(--text-muted);">${recipe.description}</p>
            
            <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin-bottom:16px; font-size:0.75rem;">
                <span class="recipe-tag">Calories: ${recipe.nutrients.calories}</span>
                <span class="recipe-tag">Protein: ${recipe.nutrients.protein}g</span>
                <span class="recipe-tag">Zinc: ${recipe.nutrients.zinc}mg</span>
                <span class="recipe-tag">Omega-3: ${recipe.nutrients.omega3}mg</span>
                <span class="recipe-tag">Prep: ${recipe.prepTime}</span>
            </div>

            <div style="font-size: 0.85rem; color: var(--text); text-align: left;">
                <strong>Ingredients:</strong>
                <ul style="margin: 4px 0 12px 0; padding-left: 18px;">
                    ${recipe.ingredients.map(i => `<li>${i.amount} ${i.unit} ${i.name}</li>`).join('')}
                </ul>
                <strong>Instructions:</strong>
                <p style="margin: 4px 0 0 0; white-space: pre-wrap;">${recipe.instructions}</p>
            </div>
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

    window.FoodModule = { init, renderSection, getCompletionData, toggleExpand, toggleCompletion, deleteRecipe, generateAIPlan, updateDailyTargets, recommendNewRecipe };

})();
