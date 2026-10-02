(function() {
    'use strict';

    const STORAGE_RECIPES = 'lifeos_recipes';
    const STORAGE_PLAN = 'lifeos_meal_plan'; // { date: mealIds[] }
    const STORAGE_COMPLETION = 'lifeos_meal_completion';
    const STORAGE_SHOPPING = 'lifeos_shopping_checked'; // { week: 'YYYY-MM-DD', keys: [] }
    const STORAGE_SNACK = 'lifeos_snack_plan';   // { default: recipeId|null, days: { 'YYYY-MM-DD': recipeId|null } }
    /**
     * Everything the app tracks, in one place. Targets are the DGE/ÖGE reference values for
     * adults (25 to under 51), m = men, f = women. `priority`: 1 = critical (often short,
     * especially on a plant-based diet, per the DGE position on vegan diets), 2 = important,
     * 3 = usually covered by a mixed diet. Planning, gaps and suggestions go by priority.
     * `label100` is the hint the AI gets for the unit per 100 g.
     */
    const NUTRIENTS = [
        { key: 'calories',   label: 'Calories',    unit: 'kcal', priority: 1 },
        { key: 'protein',    label: 'Protein',     unit: 'g',    priority: 1 },
        { key: 'vitaminB12', label: 'Vitamin B12', unit: 'mcg',  priority: 1, m: 4,    f: 4 },
        { key: 'vitaminD',   label: 'Vitamin D',   unit: 'mcg',  priority: 1, m: 20,   f: 20 },
        { key: 'iodine',     label: 'Iodine',      unit: 'mcg',  priority: 1, m: 150,  f: 150 },
        { key: 'iron',       label: 'Iron',        unit: 'mg',   priority: 1, m: 11,   f: 16 },
        { key: 'zinc',       label: 'Zinc',        unit: 'mg',   priority: 1, m: 14,   f: 8 },
        { key: 'calcium',    label: 'Calcium',     unit: 'mg',   priority: 1, m: 1000, f: 1000 },
        { key: 'omega3',     label: 'Omega-3',     unit: 'mg',   priority: 1, m: 1500, f: 1500 },
        { key: 'fiber',      label: 'Fiber',       unit: 'g',    priority: 2, m: 30,   f: 30 },
        { key: 'magnesium',  label: 'Magnesium',   unit: 'mg',   priority: 2, m: 350,  f: 300 },
        { key: 'selenium',   label: 'Selenium',    unit: 'mcg',  priority: 2, m: 70,   f: 60 },
        { key: 'vitaminB2',  label: 'Vitamin B2',  unit: 'mg',   priority: 2, m: 1.4,  f: 1.1 },
        { key: 'folate',     label: 'Folate',      unit: 'mcg',  priority: 2, m: 300,  f: 300 },
        { key: 'vitaminA',   label: 'Vitamin A',   unit: 'mcg',  priority: 2, m: 850,  f: 700 },
        { key: 'vitaminC',   label: 'Vitamin C',   unit: 'mg',   priority: 2, m: 110,  f: 95 },
        { key: 'potassium',  label: 'Potassium',   unit: 'mg',   priority: 2, m: 4000, f: 4000 },
        { key: 'vitaminE',   label: 'Vitamin E',   unit: 'mg',   priority: 3, m: 8,    f: 8 },
        { key: 'vitaminK',   label: 'Vitamin K',   unit: 'mcg',  priority: 3, m: 70,   f: 60 },
        { key: 'vitaminB1',  label: 'Vitamin B1',  unit: 'mg',   priority: 3, m: 1.2,  f: 1.0 },
        { key: 'vitaminB6',  label: 'Vitamin B6',  unit: 'mg',   priority: 3, m: 1.6,  f: 1.4 },
        { key: 'niacin',     label: 'Niacin',      unit: 'mg',   priority: 3, m: 15,   f: 12 },
        { key: 'biotin',     label: 'Biotin',      unit: 'mcg',  priority: 3, m: 40,   f: 40 },
    ];
    const NUTRIENT_KEYS = NUTRIENTS.map(n => n.key);
    const NUTRIENT_VERSION = 2;   // recipes saved with fewer values are recalculated once
    let PRIORITY = {};            // key → 1..3, adjusted to the user's goals

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

        const goals = profile.goals || {};
        let cals = Math.round(bmr * 1.55);
        if (goals.muscle) cals += 300;

        DAILY_TARGETS = {};
        PRIORITY = {};
        NUTRIENTS.forEach(n => {
            DAILY_TARGETS[n.key] = profile.sex === 'female' ? n.f : n.m;
            PRIORITY[n.key] = n.priority;
        });
        DAILY_TARGETS.calories = cals;
        DAILY_TARGETS.protein = Math.round((goals.muscle ? 2.0 : 1.6) * profile.weight);

        // Personal goals raise targets and move what matters for them to the top
        if (goals.muscle) { DAILY_TARGETS.magnesium += 50; PRIORITY.magnesium = 1; }
        if (goals.skin) {
            DAILY_TARGETS.zinc += 2; DAILY_TARGETS.omega3 = 2000;
            PRIORITY.vitaminA = 1; PRIORITY.vitaminC = 1; PRIORITY.vitaminE = 2;
        }
        if (goals.hair) { PRIORITY.biotin = 1; PRIORITY.selenium = 1; }
    }

    /** Nutrients ordered by how much they matter (calories and protein first). */
    const byPriority = () => [...NUTRIENTS].sort((a, b) => PRIORITY[a.key] - PRIORITY[b.key]);
    const meter = (key) => `<span class="prio prio-${PRIORITY[key]}" title="Priority ${PRIORITY[key]} of 3"><i></i><i></i><i></i></span>`;

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

    // Small things for the evening; they are never planned as one of the three meals
    const PROTOTYPE_SNACKS = [
        {
            id: 's1', type: 'snack', name: 'Handful of Mixed Nuts', emoji: '🥜', prepTime: '1 min',
            nutrients: { calories: 185, protein: 6, fiber: 2.5, zinc: 1.2, omega3: 700, vitaminA: 0, iron: 1.2, vitaminB12: 0, vitaminC: 0, vitaminD: 0, vitaminE: 4, biotin: 9, magnesium: 65 },
            ingredients: [{ name: 'Mixed nuts (walnuts, almonds, cashews)', amount: 30, unit: 'g' }],
            instructions: 'A small handful is about 30 g.', isCustom: false
        },
        {
            id: 's2', type: 'snack', name: 'Soy Yogurt with Berries & Pumpkin Seeds', emoji: '🫐', prepTime: '3 min',
            nutrients: { calories: 230, protein: 14, fiber: 5, zinc: 2, omega3: 100, vitaminA: 10, iron: 2.5, vitaminB12: 0.6, vitaminC: 15, vitaminD: 1, vitaminE: 1.5, biotin: 4, magnesium: 95 },
            ingredients: [{ name: 'Soy yogurt (unsweetened)', amount: 200, unit: 'g' }, { name: 'Berries', amount: 80, unit: 'g' }, { name: 'Pumpkin seeds', amount: 15, unit: 'g' }],
            instructions: 'Top the yogurt with berries and seeds.', isCustom: false
        },
        {
            id: 's3', type: 'snack', name: 'Apple with Peanut Butter', emoji: '🍎', prepTime: '2 min',
            nutrients: { calories: 215, protein: 6, fiber: 5.5, zinc: 0.7, omega3: 10, vitaminA: 5, iron: 0.6, vitaminB12: 0, vitaminC: 8, vitaminD: 0, vitaminE: 2, biotin: 6, magnesium: 40 },
            ingredients: [{ name: 'Apple', amount: 1, unit: 'whole' }, { name: 'Peanut butter', amount: 20, unit: 'g' }],
            instructions: 'Slice the apple and dip it.', isCustom: false
        },
    ];

    let recipes = [];
    let snackPlan = { default: null, days: {} };
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
            type: raw.type === 'snack' ? 'snack' : 'meal',
            nv: Number(raw.nv) || 1,
            nutrients,
            ingredients,
            isCustom: raw.isCustom !== false,
        };
    }

    function loadData() {
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(STORAGE_RECIPES)); } catch (e) {}
        recipes = (Array.isArray(stored) ? stored : PROTOTYPE_RECIPES).map(normalizeRecipe).filter(Boolean);
        if (!recipes.some(isMeal)) recipes = [...PROTOTYPE_RECIPES.map(normalizeRecipe), ...recipes];
        // The library gets a few snacks the first time the snack slot exists
        if (!recipes.some(r => r.type === 'snack')) {
            recipes = [...recipes, ...PROTOTYPE_SNACKS.map(normalizeRecipe)];
            if (Array.isArray(stored)) saveRecipes();
        }

        snackPlan = { default: null, days: {} };
        try {
            const storedSnack = JSON.parse(localStorage.getItem(STORAGE_SNACK));
            if (storedSnack && typeof storedSnack === 'object') snackPlan = { default: storedSnack.default || null, days: storedSnack.days || {} };
        } catch (e) {}

        try { mealPlan = JSON.parse(localStorage.getItem(STORAGE_PLAN)) || {}; } catch (e) { mealPlan = {}; }

        completion = { date: getToday(), completed: [] };
        try {
            const storedComp = JSON.parse(localStorage.getItem(STORAGE_COMPLETION));
            if (storedComp && storedComp.date === getToday() && Array.isArray(storedComp.completed)) completion = storedComp;
        } catch (e) {}

        ensureWeeklyPlanExists();
    }

    const isMeal = (r) => r.type !== 'snack';

    /** The snack for a day: what was chosen for that day, otherwise the usual one. null = none. */
    function snackFor(date) {
        const id = Object.prototype.hasOwnProperty.call(snackPlan.days, date) ? snackPlan.days[date] : snackPlan.default;
        return id && recipes.some(r => r.id === id) ? id : null;
    }

    /** Everything eaten on a day: the three meals plus the evening snack. */
    function dayIds(date) {
        const ids = [...(mealPlan[date] || [])];
        const snack = snackFor(date);
        if (snack) ids.push(snack);
        return ids;
    }

    function saveSnackPlan() {
        // Days that are over are not kept
        const today = getToday();
        Object.keys(snackPlan.days).forEach(date => { if (date < addDays(today, -1)) delete snackPlan.days[date]; });
        localStorage.setItem(STORAGE_SNACK, JSON.stringify(snackPlan));
    }

    function saveRecipes() { localStorage.setItem(STORAGE_RECIPES, JSON.stringify(recipes)); }
    function savePlan() { localStorage.setItem(STORAGE_PLAN, JSON.stringify(mealPlan)); }
    function saveCompletion() { localStorage.setItem(STORAGE_COMPLETION, JSON.stringify(completion)); }

    // --- Planning: keep the next 7 days filled ---
    function ensureWeeklyPlanExists() {
        const today = getToday();
        const known = new Set(recipes.filter(isMeal).map(r => r.id));
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
        // Every tracked value counts; critical ones three times as much as minor ones
        const tracked = NUTRIENT_KEYS.filter(k => k !== 'calories');
        const weights = {};
        tracked.forEach(k => { weights[k] = { 1: 1.5, 2: 0.7, 3: 0.3 }[PRIORITY[k]]; });
        const totals = { calories: 0 };
        tracked.forEach(k => { totals[k] = 0; });
        selected.forEach(id => {
            const r = recipes.find(x => x.id === id);
            if (r) { totals.calories += r.nutrients.calories; tracked.forEach(k => { totals[k] += r.nutrients[k]; }); }
        });

        const snack = recipes.find(r => r.id === snackFor(date));
        if (snack) { totals.calories += snack.nutrients.calories; tracked.forEach(k => { totals[k] += snack.nutrients[k]; }); }
        const meals = recipes.filter(isMeal);

        while (selected.length < 3 && selected.length < meals.length) {
            const mealsLeft = 3 - selected.length;
            let best = null;
            let bestScore = -Infinity;
            for (const r of meals) {
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

    /**
     * Nutrition of a list of ingredients: the AI estimates each ingredient on its own and the
     * app adds them up. Values printed on a scanned package (per100g) replace the estimate.
     * @returns {Promise<{totals:Object, names:string[]}>}
     */
    async function estimateTotals(list) {
        // The AI only supplies table values per 100 g and the weight of each amount;
        // the multiplication and the adding up are done here, where they cannot go wrong.
        const answer = await window.App.ai([
            {
                role: 'system',
                content: `You are a food composition database. For EACH numbered ingredient return: \"name\" (a common English name, e.g. 'tomate' -> 'Tomato'), \"grams\" (the weight in grams of the stated amount: convert ml, tbsp, tsp, pieces, slices, cups, 'whole' etc. to grams; for an amount already in g repeat it) and \"per100g\" (the nutritional values PER 100 GRAMS of that ingredient, raw/dry as stated, from standard food composition tables). Return ONLY a JSON object: {\"ingredients\": [{\"n\": 1, \"name\": string, \"grams\": number, \"per100g\": {${NUTRIENT_KEYS.map(k => `\"${k}\": number`).join(', ')}}}]} with one entry per ingredient, in the same order. Units per 100 g: ${NUTRIENTS.map(n => `${n.key} ${n.unit}`).join('; ')}. Notes: omega3 is MILLIGRAMS of omega-3 fatty acids (walnuts about 9000, flaxseed about 22000, olive oil about 760, most vegetables under 100); vitaminA is mcg RAE; folate is mcg folate equivalents; iodine is mcg (iodised salt about 2000, most plants under 5).`
            },
            { role: 'user', content: list.map((i, n) => `${n + 1}. ${i.amount} ${i.unit} ${i.name}`).join('\n') }
        ], { temperature: 0, json: true, max_tokens: 7500 });
        const estimates = window.App.parseAIJson(answer).ingredients;
        if (!Array.isArray(estimates) || estimates.length === 0) throw new Error('The estimate was empty.');

        const totals = {};
        NUTRIENT_KEYS.forEach(key => { totals[key] = 0; });
        const names = [];
        list.forEach((ing, idx) => {
            const estimate = estimates.find(e => Number(e.n) === idx + 1) || estimates[idx] || {};
            const unit = String(ing.unit || '').toLowerCase();
            // An amount given in grams is taken as it is; everything else uses the AI's conversion
            const grams = unit === 'g' ? num(ing.amount) : (unit === 'kg' ? num(ing.amount) * 1000 : num(estimate.grams));
            const per100g = { ...(estimate.per100g || {}), ...(ing.per100g || {}) };
            // Nothing edible has more than 900 kcal per 100 g; such an answer is not usable
            if (num(per100g.calories) > 900) throw new Error('The estimate was implausible.');
            NUTRIENT_KEYS.forEach(key => { totals[key] += num(per100g[key]) * grams / 100; });
            names.push(String(estimate.name || '').trim());
        });
        NUTRIENT_KEYS.forEach(key => { totals[key] = Math.round(totals[key] * 10) / 10; });
        return { totals, names };
    }

    function nutrientTagsHtml(n) {
        const cls = { protein: 'high-protein', zinc: 'zinc', omega3: 'omega3', iron: 'iron' };
        const fmt = (v) => Math.round(v * 10) / 10;
        return byPriority().map(d => d.key === 'calories'
            ? `<span class="recipe-tag">${fmt(n.calories)} kcal</span>`
            : `<span class="recipe-tag ${cls[d.key] || ''}">${d.label} ${fmt(n[d.key])} ${d.unit}</span>`).join('');
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

    function getRecipeHtml(r, isDone, isSnack) {
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
                    ${isSnack
                        ? `<button class="btn btn-sm btn-ghost" onclick="FoodModule.showSnackModal()">Change snack</button>`
                        : `<button class="btn btn-sm btn-ghost" onclick="FoodModule.showSwapModal('${r.id}')">Swap meal</button>`}
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

        const snack = recipes.find(r => r.id === snackFor(today));
        html += `
            <div class="card-header-row" style="margin-top:18px;">
                <h3 class="group-heading" style="margin:0;">Evening snack</h3>
                <button type="button" class="btn btn-sm btn-ghost" onclick="FoodModule.showSnackModal()">${snack ? 'Change' : 'Choose'}</button>
            </div>
            ${snack
                ? getRecipeHtml(snack, completion.completed.includes(snack.id), true)
                : `<div class="empty-state" style="padding:14px;"><div class="empty-state-text">No snack planned. It counts towards your daily nutrition when you add one.</div></div>`}
        `;
        
        container.innerHTML = html;
    }

    /** Ingredients for the next 7 days, added up. */
    function shoppingItems() {
        const today = getToday();
        const map = {};
        for (let i = 1; i <= 7; i++) {
            dayIds(addDays(today, i)).forEach(id => {
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
        const todayRecipes = dayIds(today).map(id => recipes.find(r => r.id === id)).filter(Boolean);

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

        const pending = recipes.some(r => r.nv < NUTRIENT_VERSION);
        const row = (m) => {
            const target = DAILY_TARGETS[m.key] || 1;
            const plannedPct = Math.min(100, Math.round((sum[m.key] / target) * 100));
            const eatenPct = Math.min(100, Math.round((eaten[m.key] / target) * 100));
            return `
                <div class="nutrition-row">
                    <div class="nutrition-label">
                        <strong>${meter(m.key)}${m.label}</strong>
                        <span>${Math.round(eaten[m.key] * 10) / 10} / ${target} ${m.unit}</span>
                    </div>
                    <div class="progress-track stacked">
                        <div class="progress-fill planned" style="width:${plannedPct}%;"></div>
                        <div class="progress-fill ${eatenPct >= 100 ? 'grad-success' : 'grad-primary'}" style="width:${eatenPct}%;"></div>
                    </div>
                </div>`;
        };
        const ordered = byPriority();
        const main = ordered.filter(m => PRIORITY[m.key] <= 2);
        const minor = ordered.filter(m => PRIORITY[m.key] === 3);

        let html = `
            <div class="card-header-row section-gap"><h2>Daily Nutrition</h2></div>
            <div class="glass-card stagger-item nutrition-card">
                <div class="nutrition-legend"><span class="legend-dot eaten"></span>eaten<span class="legend-dot planned"></span>planned<span style="margin-left:auto;">${meter('protein')} = priority</span></div>
                ${pending ? `<p class="form-hint" style="margin:0;">Values for the newly tracked nutrients are still being calculated for some recipes.</p>` : ''}
                ${main.map(row).join('')}
                <button type="button" class="chat-clear" style="margin:0 auto;" onclick="FoodModule.toggleMinorNutrients()">${showMinor ? 'Hide' : 'Show'} ${minor.length} more</button>
                ${showMinor ? minor.map(row).join('') : ''}
            </div>`;

        // What today's plan leaves open, most important first
        const supplementHint = { vitaminB12: 'a supplement is the reliable source on a plant-based diet', vitaminD: 'little comes from food; sun or a supplement', iodine: 'iodised salt, seaweed', omega3: 'flaxseed, walnuts, algae oil', calcium: 'fortified plant milk, tofu, kale', iron: 'lentils, with vitamin C', zinc: 'pumpkin seeds, oats, legumes', selenium: 'Brazil nuts', vitaminB2: 'almonds, mushrooms, fortified foods' };
        const gaps = ordered
            .filter(m => m.key !== 'calories' && PRIORITY[m.key] <= 2 && sum[m.key] < DAILY_TARGETS[m.key] * 0.7)
            .map(m => `${meter(m.key)}<strong>${m.label}</strong> ${Math.round(sum[m.key] / DAILY_TARGETS[m.key] * 100)}% of ${DAILY_TARGETS[m.key]} ${m.unit}${supplementHint[m.key] ? ` <span class="form-hint">(${supplementHint[m.key]})</span>` : ''}`);

        html += `<div class="card-header-row section-gap"><h2>${t('suggested_supplements')}</h2></div>`;
        if (gaps.length === 0) {
            html += `<div class="glass-card-sm stagger-item"><div class="empty-state-text">${t('targets_hit')}</div></div>`;
        } else {
            html += `<div class="glass-card-sm stagger-item supplement-box">
                <p class="form-hint" style="margin:0 0 6px;">Today's plan covers less than 70% of these, most important first:</p>
                <ul class="detail-list" style="margin:0;">
                    ${gaps.map(g => `<li>${g}</li>`).join('')}
                </ul>
            </div>`;
        }

        container.innerHTML = html;
    }

    let recipeSearchQuery = '';
    let showMinor = false;

    function toggleMinorNutrients() {
        showMinor = !showMinor;
        renderSupplements();
    }

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
                if (r.type === 'snack') tagsHtml.push(`<span class="recipe-tag iron">Snack</span>`);
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
        if (isMeal(recipe) && recipes.filter(isMeal).length <= 3) {
            window.App.showToast('Keep at least three recipes so a day can be planned.', 'error');
            return;
        }
        if (!await window.App.confirm(`Delete "${recipe.name}"?`, { okLabel: 'Delete', danger: true })) return;
        recipes = recipes.filter(r => r.id !== id);
        saveRecipes();
        if (snackPlan.default === id) { snackPlan.default = null; saveSnackPlan(); }
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
            <div class="form-group">
                <label class="form-label">Kind</label>
                <div class="time-toggle" id="recipe-type" style="margin-bottom:0;">
                    <button type="button" class="time-toggle-btn active" data-type="meal">Meal</button>
                    <button type="button" class="time-toggle-btn" data-type="snack">Snack</button>
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
            
            <h4 style="margin: 16px 0 8px; font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Nutritional values (whole recipe)</h4>
            <div class="nutrient-fields">
                ${byPriority().map(n => `
                    <div class="form-group">
                        <label class="form-label" for="nutr-${n.key}">${n.label} (${n.unit})</label>
                        <input type="number" inputmode="decimal" step="any" min="0" id="nutr-${n.key}" class="form-input" value="0">
                    </div>`).join('')}
            </div>
        `;
        const footerHTML = `
            <button class="btn btn-ghost" onclick="App.hideModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-recipe">Save</button>
        `;
        
        window.currentRecipeIngredients = [];
        setTimeout(() => {
            document.querySelectorAll('#recipe-type [data-type]').forEach(btn => btn.addEventListener('click', () => {
                document.querySelectorAll('#recipe-type [data-type]').forEach(b => b.classList.toggle('active', b === btn));
            }));
        }, 0);
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

        const FIELD_IDS = {};
        NUTRIENT_KEYS.forEach(key => { FIELD_IDS[key] = `nutr-${key}`; });
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
            if (!document.getElementById('nutr-calories') || list.length === 0 || !list.every(i => i.per100g)) return;
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

            const btn = document.getElementById('btn-calc-macros');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Estimating…';
            btn.disabled = true;

            try {
                const { totals, names } = await estimateTotals(list);
                list.forEach((ing, idx) => { if (!ing.per100g && names[idx]) ing.name = names[idx]; });
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
            
            const nutrients = {};
            NUTRIENT_KEYS.forEach(key => { nutrients[key] = parseFloat(document.getElementById(`nutr-${key}`).value) || 0; });

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
                type: document.querySelector('#recipe-type .active')?.dataset.type || 'meal',
                name,
                emoji,
                prepTime,
                nv: NUTRIENT_VERSION,
                nutrients,
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
        return dayIds(getToday())
            .map(id => recipes.find(r => r.id === id))
            .filter(Boolean)
            .map(r => ({
                id: r.id,
                label: `${r.emoji} ${r.name}${r.type === 'snack' ? ' (snack)' : ''}`,
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
        dayIds(getToday()).forEach(id => {
            const r = recipes.find(x => x.id === id);
            if (!r) return;
            NUTRIENT_KEYS.forEach(key => {
                planned[key] += r.nutrients[key];
                if (completion.completed.includes(id)) eaten[key] += r.nutrients[key];
            });
        });
        return {
            units: Object.fromEntries(NUTRIENTS.map(n => [n.key, n.unit])),
            priorities: Object.fromEntries(NUTRIENT_KEYS.map(k => [k, PRIORITY[k]])),
            targets: DAILY_TARGETS,
            plannedTotals: planned,
            eatenTotals: eaten,
            todaysMeals: meals,
            recipeLibrary: recipes.map(r => `${r.type === 'snack' ? '[snack] ' : ''}${r.name} (${r.nutrients.calories} kcal, ${r.nutrients.protein} g protein)`),
        };
    }

    function getCompletionData() {
        const mealIds = dayIds(getToday());
        if (mealIds.length === 0) return { completed: 0, total: 0 };

        const done = mealIds.filter(id => completion.completed.includes(id)).length;
        return { completed: done, total: mealIds.length };
    }

    function showSnackModal() {
        const today = getToday();
        const current = snackFor(today);
        const snacks = recipes.filter(r => r.type === 'snack');
        const row = (r) => `
            <div class="glass-card-sm" style="padding:12px; cursor:pointer; ${r.id === current ? 'border-color:var(--primary);' : ''}" onclick="FoodModule.setSnack('${r.id}')">
                <div style="font-weight:600; font-size:0.9rem;">${esc(r.emoji)} ${esc(r.name)}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${r.nutrients.calories} kcal · ${r.nutrients.protein} g protein · ${r.nutrients.zinc} mg zinc · ${r.nutrients.magnesium} mg magnesium</div>
            </div>`;
        window.App.showModal('Evening snack', `
            <p class="form-hint" style="margin-bottom:12px;">Your choice stays for the following days until you change it. Add your own snacks in the recipe library (kind: Snack) or let the AI suggest one.</p>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${snacks.map(row).join('') || '<p class="form-hint">No snacks in your library yet.</p>'}
            </div>
        `, `<button class="btn btn-ghost" onclick="FoodModule.setSnack('')">No snack today</button><button class="btn btn-ghost" onclick="FoodModule.setSnack('', true)">No snack at all</button>`);
    }

    /** @param {string} id - recipe id, or '' for none. @param {boolean} [always] - also for the coming days */
    function setSnack(id, always) {
        const today = getToday();
        const previous = snackFor(today);
        if (id) {
            snackPlan.default = id;
            snackPlan.days[today] = id;
        } else {
            snackPlan.days[today] = null;
            if (always) snackPlan.default = null;
        }
        saveSnackPlan();
        if (previous && previous !== id) {
            completion.completed = completion.completed.filter(x => x !== previous);
            saveCompletion();
        }
        window.App.hideModal();
        renderSection();
        if (window.App.refreshDashboard) window.App.refreshDashboard();
    }

    function showSwapModal(oldRecipeId) {
        if (!window.App) return;
        
        let html = `<div style="display:flex; flex-direction:column; gap:8px;">`;
        recipes.filter(isMeal).forEach(r => {
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
            const planKeys = byPriority().filter(n => PRIORITY[n.key] === 1).map(n => n.key);
            const catalog = recipes.filter(isMeal).map(r => {
                const entry = { id: r.id, name: r.name };
                planKeys.forEach(key => { entry[key] = r.nutrients[key]; });
                return entry;
            });
            
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
The daily targets, most important first: ${byPriority().filter(n => PRIORITY[n.key] <= 2).map(n => `${n.label} ${DAILY_TARGETS[n.key]} ${n.unit}`).join(', ')}. Cover the first ones before the later ones.
Here is the catalog of available recipes (choose from these IDs):
${JSON.stringify(catalog)}

Return ONLY a valid JSON object where the keys are the following exact date strings: ${JSON.stringify(targetDates)} and the values are arrays of exactly 3 recipe IDs (breakfast, lunch, dinner). Vary the meals across the week.${snackFor(today) ? ` The user also eats an evening snack of about ${(recipes.find(r => r.id === snackFor(today)) || { nutrients: { calories: 0 } }).nutrients.calories} kcal every day, so the three meals should cover the rest of the targets.` : ''}`;

            const answer = await window.App.ai([
                { role: 'system', content: sysPrompt },
                { role: 'user', content: 'Create the plan now and answer with the JSON object only.' }
            ], { temperature: 0.2, json: true });
            const plan = window.App.parseAIJson(answer);

            // Only accept days that consist of three different recipes that really exist
            const known = new Set(recipes.filter(isMeal).map(r => r.id));
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
                completion.completed = completion.completed.filter(id => dayIds(today).includes(id));
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

    let backfilling = false;

    /**
     * Recipes saved before the extra nutrients existed only know 13 values. They are
     * recalculated once from their ingredients, one after the other, in the background.
     */
    async function backfillNutrients() {
        if (backfilling || navigator.onLine === false) return;
        const todo = recipes.filter(r => r.nv < NUTRIENT_VERSION && r.ingredients.length > 0);
        if (todo.length === 0) return;
        backfilling = true;
        let done = 0;
        try {
            for (const recipe of todo) {
                const { totals } = await estimateTotals(recipe.ingredients);
                const current = recipes.find(r => r.id === recipe.id);
                if (!current) continue;
                current.nutrients = totals;
                current.nv = NUTRIENT_VERSION;
                saveRecipes();
                done++;
            }
        } catch (err) {
            console.warn('Nutrient recalculation paused:', err.message);
        } finally {
            backfilling = false;
        }
        if (done > 0) {
            if (document.body.dataset.section === 'food') { renderToday(); renderSupplements(); renderLibrary(); }
            if (window.App.refreshDashboard) window.App.refreshDashboard();
            if (done === todo.length) window.App.showToast(`Nutrition recalculated for ${done} recipes`, 'success');
        }
    }

    function init() {
        loadData();
        // After the app has settled, bring older recipes up to the full nutrient list
        setTimeout(backfillNutrients, 4000);
    }

    const SUGGEST_NUTRIENTS = NUTRIENTS.filter(n => n.key !== 'calories');

    /** Ask what kind of suggestion is wanted before the AI writes one. */
    function recommendNewRecipe() {
        // Nutrients where today's plan is weakest are offered first
        const today = getContextForAI();
        const gap = (key) => (DAILY_TARGETS[key] > 0 ? today.plannedTotals[key] / DAILY_TARGETS[key] : 1);
        // Critical nutrients first, and within a level whatever today's plan covers least
        const ordered = [...SUGGEST_NUTRIENTS].sort((a, b) => (PRIORITY[a.key] - PRIORITY[b.key]) || (gap(a.key) - gap(b.key)));

        window.App.showModal('Suggest a recipe', `
            <div class="form-group">
                <label class="form-label">Kind</label>
                <div class="time-toggle" id="suggest-type" style="margin-bottom:0;">
                    <button type="button" class="time-toggle-btn active" data-type="meal">Meal</button>
                    <button type="button" class="time-toggle-btn" data-type="snack">Snack</button>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" for="suggest-ingredients">Use these ingredients (optional)</label>
                <input type="text" id="suggest-ingredients" class="form-input" placeholder="e.g. chickpeas, spinach" autocapitalize="none">
                <p class="form-hint">Comma separated. The recipe will be built around them.</p>
            </div>
            <div class="form-group">
                <label class="form-label">Rich in (optional)</label>
                <div class="tab-pills" id="suggest-nutrients">
                    ${ordered.map(n => `<button type="button" class="tab-pill" data-key="${n.key}">${n.label}${gap(n.key) < 0.7 ? ' ·low' : ''}</button>`).join('')}
                </div>
                <p class="form-hint" style="margin-top:8px;">Most important first. "low" marks what today's plan covers by less than 70%.</p>
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" for="suggest-wish">Anything else? (optional)</label>
                <input type="text" id="suggest-wish" class="form-input" placeholder="e.g. no cooking, ready in 10 minutes">
            </div>
        `, `<button class="btn btn-primary" id="btn-suggest-go">Suggest</button>`);

        const toggleGroup = (selector, single) => document.querySelectorAll(selector).forEach(btn => btn.addEventListener('click', () => {
            if (single) document.querySelectorAll(selector).forEach(b => b.classList.toggle('active', b === btn));
            else btn.classList.toggle('active');
        }));
        toggleGroup('#suggest-type [data-type]', true);
        toggleGroup('#suggest-nutrients [data-key]', false);

        document.getElementById('btn-suggest-go').addEventListener('click', () => {
            generateSuggestion({
                type: document.querySelector('#suggest-type .active').dataset.type,
                ingredients: document.getElementById('suggest-ingredients').value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 8),
                nutrients: [...document.querySelectorAll('#suggest-nutrients .active')].map(b => SUGGEST_NUTRIENTS.find(n => n.key === b.dataset.key).label),
                wish: document.getElementById('suggest-wish').value.trim().slice(0, 200),
            });
        });
    }

    async function generateSuggestion(options) {
        const btn = document.getElementById('btn-suggest-go');
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
Their personal daily nutritional targets, most important first: ${byPriority().map(n => `${n.label} ${DAILY_TARGETS[n.key]} ${n.unit}`).join(', ')}.
${options.type === 'snack'
    ? 'This is an EVENING SNACK, not a meal: 150-300 kcal, at most 4 ingredients, ready in under 5 minutes, light enough before sleep.'
    : 'The recipe should be roughly 1/3 of these targets.'}
${options.ingredients.length ? `It MUST be built around these ingredients (all of them should appear): ${options.ingredients.join(', ')}.` : ''}
${options.nutrients.length ? `It MUST be especially rich in: ${options.nutrients.join(', ')}. Choose ingredients that are genuinely good sources of these and reflect that in the nutrient numbers.` : ''}
${options.wish ? `Additional wish from the user: ${options.wish}` : ''}

Leave "nutrients" as shown; the app calculates the values from your ingredients. Give every ingredient an amount with a unit in g or ml where possible.
You MUST respond ONLY with a raw, valid JSON object exactly matching this structure (no markdown, no backticks, no extra text):
{
  "name": "Creative Recipe Name",
  "emoji": "🍲",
  "prepTime": "15 min",
  "description": "A short, appetizing description.",
  "instructions": "Step 1: ...\\nStep 2: ...",
  "nutrients": { "calories": 0, "protein": 0 },
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

            const parsed = normalizeRecipe({ ...window.App.parseAIJson(answer), id: null, isCustom: true, type: options.type });
            if (!parsed || parsed.ingredients.length === 0) throw new Error('The suggestion was incomplete.');

            // Work the nutrition out ingredient by ingredient, the same way as for your own recipes
            try {
                parsed.nutrients = (await estimateTotals(parsed.ingredients)).totals;
                parsed.nv = NUTRIENT_VERSION;
            } catch (err) {
                console.warn('Nutrition check failed, keeping the first estimate:', err);
            }

            showReviewModal(parsed);

        } catch (err) {
            console.error('Recommend Recipe Error:', err);
            window.App.showToast('Could not create a recipe. Please try again.', 'error');
        } finally {
            const again = document.getElementById('btn-suggest-go');
            if (again) {
                again.innerHTML = 'Suggest';
                again.disabled = false;
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
            <button class="btn btn-primary" id="btn-approve-recipe">${recipe.type === 'snack' ? 'Add as my snack' : 'Add to Library'}</button>
        `;

        window.App.showModal('Review New Recipe', bodyHTML, footerHTML);

        document.getElementById('btn-approve-recipe').addEventListener('click', () => {
            recipes.unshift(recipe);
            saveRecipes();
            if (recipe.type === 'snack') return setSnack(recipe.id);
            renderLibrary();
            window.App.hideModal();
            window.App.showToast('Recipe added to library!', 'success');
        });
    }

    window.FoodModule = { init, renderSection, getCompletionData, getTodayItems, getContextForAI, toggleMinorNutrients, backfillNutrients, showSnackModal, setSnack, toggleExpand, toggleCompletion, deleteRecipe, generateAIPlan, updateDailyTargets, recommendNewRecipe, showSwapModal, swapMeal, setRecipeSearchQuery };

})();
