(function() {
    'use strict';

    const STORAGE_RECIPES = 'lifeos_recipes';
    const STORAGE_PLAN = 'lifeos_meal_plan'; // { date: mealIds[] }
    const STORAGE_COMPLETION = 'lifeos_meal_completion';

    const DAILY_TARGETS = {
        calories: 2700,
        protein: 130,     // g
        zinc: 20,         // mg (high for acne)
        omega3: 2000,     // mg (high for acne)
        vitaminA: 900,    // mcg (acne/skin)
        iron: 15,         // mg
        vitaminB12: 2.4,  // mcg
        vitaminC: 90,     // mg
        fiber: 35         // g
    };

    const PROTOTYPE_RECIPES = [
        {
            id: 'r1', name: 'Avocado on Dark Bread with Frozen Veggies', emoji: '🥑',
            prepTime: '10 min',
            nutrients: { calories: 550, protein: 18, fiber: 16, zinc: 3, omega3: 500, vitaminA: 200, iron: 4, vitaminB12: 0, vitaminC: 40 },
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
            nutrients: { calories: 750, protein: 32, fiber: 18, zinc: 4, omega3: 200, vitaminA: 300, iron: 6, vitaminB12: 0, vitaminC: 30 },
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
            nutrients: { calories: 600, protein: 35, fiber: 12, zinc: 4.5, omega3: 300, vitaminA: 400, iron: 5, vitaminB12: 0, vitaminC: 35 },
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
            nutrients: { calories: 650, protein: 28, fiber: 22, zinc: 5, omega3: 150, vitaminA: 1200, iron: 8, vitaminB12: 0, vitaminC: 50 },
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
            nutrients: { calories: 500, protein: 30, fiber: 8, zinc: 5, omega3: 2500, vitaminA: 600, iron: 7, vitaminB12: 1.2, vitaminC: 45 },
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
            nutrients: { calories: 600, protein: 24, fiber: 14, zinc: 4, omega3: 3500, vitaminA: 100, iron: 5, vitaminB12: 0.5, vitaminC: 10 },
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
            nutrients: { calories: 550, protein: 35, fiber: 10, zinc: 6, omega3: 400, vitaminA: 800, iron: 6, vitaminB12: 0, vitaminC: 85 },
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
            nutrients: { calories: 680, protein: 32, fiber: 15, zinc: 7, omega3: 800, vitaminA: 150, iron: 8, vitaminB12: 0, vitaminC: 25 },
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
            nutrients: { calories: 450, protein: 30, fiber: 10, zinc: 3, omega3: 2000, vitaminA: 900, iron: 5, vitaminB12: 1.2, vitaminC: 60 },
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

        let sum = { protein:0, zinc:0, omega3:0, vitaminA:0, iron:0, vitaminB12:0 };
        todayRecipes.forEach(r => {
            sum.protein += r.nutrients.protein || 0;
            sum.zinc += r.nutrients.zinc || 0;
            sum.omega3 += r.nutrients.omega3 || 0;
            sum.vitaminA += r.nutrients.vitaminA || 0;
            sum.iron += r.nutrients.iron || 0;
            sum.vitaminB12 += r.nutrients.vitaminB12 || 0;
        });

        const gaps = [];
        if (sum.zinc < DAILY_TARGETS.zinc * 0.7) gaps.push('Zinc (15-20mg)');
        if (sum.omega3 < DAILY_TARGETS.omega3 * 0.7) gaps.push('Algae Omega-3 (1000mg)');
        if (sum.vitaminB12 < DAILY_TARGETS.vitaminB12 * 0.7) gaps.push('Vitamin B12 (1000mcg)');
        if (sum.vitaminA < DAILY_TARGETS.vitaminA * 0.7) gaps.push('Vitamin A (Skin support)');

        let html = `<div class="card-header-row" style="margin-top:24px;"><h2>${t('suggested_supplements')}</h2></div>`;
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
                <button class="btn btn-primary btn-sm" id="btn-add-recipe">${t('add_recipe')}</button>
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
                <label class="form-label">Ingredients (Format: Amount Unit Name, e.g. "200 g Tofu", one per line)</label>
                <textarea id="recipe-ing" class="form-input" style="resize:vertical; min-height:80px;" placeholder="200 g Tofu\n1 tbsp Soy sauce\n100 g Broccoli"></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Instructions</label>
                <textarea id="recipe-inst" class="form-input" style="resize:vertical; min-height:80px;" placeholder="1. Fry tofu...\n2. Add broccoli..."></textarea>
            </div>

            <div style="margin: 16px 0; text-align: center;">
                <button type="button" id="btn-calc-macros" class="btn btn-sm" style="background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); color: #c4b5fd;">
                    Auto-Calculate Macros with AI 🤖
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
        `;
        const footerHTML = `
            <button class="btn btn-ghost" onclick="App.hideModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-recipe">Save</button>
        `;
        
        window.App.showModal('Add Custom Recipe', bodyHTML, footerHTML);

        document.getElementById('btn-calc-macros').addEventListener('click', async () => {
            const apiKey = localStorage.getItem('lifeos_deepseek_key');
            if (!apiKey) {
                window.App.showToast('Please add your DeepSeek API key in Settings.', 'error');
                return;
            }
            
            const ingredients = document.getElementById('recipe-ing').value.trim();
            if (!ingredients) {
                window.App.showToast('Please enter some ingredients first.', 'error');
                return;
            }

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
                                content: "You are a nutrition expert. Estimate the total nutritional values of the provided ingredients combined. Return ONLY a valid JSON object with the following numerical keys: calories, protein, zinc, omega3, iron, vitaminB12. Do not include markdown formatting, markdown code blocks, or any other text."
                            },
                            {
                                role: "user",
                                content: ingredients
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

                window.App.showToast('Macros estimated automatically!', 'success');

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
            
            const rawIng = document.getElementById('recipe-ing').value.trim();
            const inst = document.getElementById('recipe-inst').value.trim();

            if (!name) {
                window.App.showToast('Please enter a name.', 'error');
                return;
            }

            // Parse ingredients
            const ingredients = [];
            if (rawIng) {
                const lines = rawIng.split('\\n');
                lines.forEach(line => {
                    const parts = line.trim().split(' ');
                    if (parts.length >= 2) {
                        let amount = parseFloat(parts[0]);
                        if (!isNaN(amount)) {
                            // "200 g Tofu" -> amount=200, unit='g', name='Tofu'
                            // "1 tbsp Soy sauce" -> amount=1, unit='tbsp', name='Soy sauce'
                            const unit = parts[1];
                            const iName = parts.slice(2).join(' ');
                            if (iName) {
                                ingredients.push({ name: iName, amount: amount, unit: unit });
                            } else {
                                // "1 Avocado" -> amount=1, unit='', name='Avocado'
                                ingredients.push({ name: parts.slice(1).join(' '), amount: amount, unit: 'whole' });
                            }
                        } else {
                            // "Pinch of salt"
                            ingredients.push({ name: line.trim(), amount: 1, unit: 'serving' });
                        }
                    } else if (line.trim()) {
                        ingredients.push({ name: line.trim(), amount: 1, unit: 'serving' });
                    }
                });
            }

            recipes.push({
                id: 'c_' + Date.now().toString(36),
                name,
                emoji,
                prepTime,
                nutrients: { calories: cal, protein: pro, fiber: 10, zinc: zinc, omega3: omega3, vitaminA: 100, iron: iron, vitaminB12: b12, vitaminC: 10 },
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

    function init() {
        loadData();
    }

    window.FoodModule = { init, renderSection, getCompletionData, toggleExpand, toggleCompletion, deleteRecipe };

})();
