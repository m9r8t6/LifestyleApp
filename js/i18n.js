(function() {
    'use strict';

    const translations = {
        en: {
            nav_today: 'Today',
            nav_food: 'Food',
            nav_sport: 'Sport',
            nav_care: 'Care',
            nav_settings: 'Settings',
            settings_title: 'Settings',
            theme: 'Theme',
            light_mode: 'Light Mode',
            dark_mode: 'Dark Mode',
            language: 'Language',
            timer_sound: 'Timer Sound',
            on: 'On',
            off: 'Off',
            english: 'English',
            german: 'German',
            workout: 'Workout',
            rest_day: 'Today is a rest day.',
            rest_day_enjoy: 'Rest Day. Enjoy your recovery!',
            open_rest_timer: 'Open Rest Timer',
            weekly_planner: 'Weekly Planner',
            day_type: 'Day Type:',
            exercises: 'Exercises',
            add_exercise: '+ Add',
            no_exercises_added: 'No exercises added for today yet.',
            no_exercises_rest: 'No exercises on rest days.',
            body_care: 'Body Care',
            morning: 'Morning',
            evening: 'Evening',
            due_today: 'Due today',
            due_tomorrow: 'Due tomorrow',
            due_in_days: 'Due in {days} days',
            daily: 'Daily',
            add_item: '+ Add Item',
            todays_meals: "Today's Meals",
            upcoming_groceries: "Upcoming Week's Groceries",
            suggested_supplements: "Suggested Supplements",
            ingredients: "Ingredients",
            instructions: "Instructions",
            no_meals_planned: "No meals planned for today.",
            no_groceries: "No upcoming meals planned.",
            targets_hit: "Your meals hit all targets today!",
            recipe_library: "Recipe Library",
            add_recipe: "+ Add Recipe",
            strength_progress: "Strength Progress",
            achievements: "Achievements",
            level: "Level",
            meal_prep_strategy: "Meal Prep Strategy"
        },
        de: {
            nav_today: 'Heute',
            nav_food: 'Essen',
            nav_sport: 'Sport',
            nav_care: 'Pflege',
            nav_settings: 'Einst.',
            settings_title: 'Einstellungen',
            theme: 'Design',
            light_mode: 'Hell',
            dark_mode: 'Dunkel',
            language: 'Sprache',
            timer_sound: 'Timer Ton',
            on: 'An',
            off: 'Aus',
            english: 'Englisch',
            german: 'Deutsch',
            workout: 'Training',
            rest_day: 'Heute ist Ruhetag.',
            rest_day_enjoy: 'Ruhetag. Genieße die Erholung!',
            open_rest_timer: 'Pausen-Timer öffnen',
            weekly_planner: 'Wochenplan',
            day_type: 'Tag-Typ:',
            exercises: 'Übungen',
            add_exercise: '+ Hinzufügen',
            no_exercises_added: 'Noch keine Übungen für heute hinzugefügt.',
            no_exercises_rest: 'Keine Übungen an Ruhetagen.',
            body_care: 'Körperpflege',
            morning: 'Morgen',
            evening: 'Abend',
            due_today: 'Heute fällig',
            due_tomorrow: 'Morgen fällig',
            due_in_days: 'Fällig in {days} Tagen',
            daily: 'Täglich',
            add_item: '+ Hinzufügen',
            todays_meals: "Heutige Mahlzeiten",
            upcoming_groceries: "Einkaufsliste nächste Woche",
            suggested_supplements: "Empfohlene Ergänzungen",
            ingredients: "Zutaten",
            instructions: "Anleitung",
            no_meals_planned: "Keine Mahlzeiten für heute geplant.",
            no_groceries: "Keine kommenden Mahlzeiten geplant.",
            targets_hit: "Deine Mahlzeiten erreichen heute alle Ziele!",
            recipe_library: "Rezeptbibliothek",
            add_recipe: "+ Neues Rezept",
            strength_progress: "Kraftfortschritte",
            achievements: "Erfolge",
            level: "Level",
            meal_prep_strategy: "Meal-Prep Strategie"
        }
    };

    let currentLang = localStorage.getItem('lifeos_lang') || 'en';

    function setLang(lang) {
        currentLang = translations[lang] ? lang : 'en';
        localStorage.setItem('lifeos_lang', currentLang);
        applyTranslations();
        if(window.App && window.App.refreshDashboard) window.App.refreshDashboard();
        // Trigger a re-render of active sections
        if(window.FoodModule) window.FoodModule.renderSection();
        if(window.SportModule) window.SportModule.renderSection();
        if(window.BodycareModule) window.BodycareModule.renderSection();
    }

    function getLang() {
        return currentLang;
    }

    function t(key, params = {}) {
        let text = translations[currentLang][key] || translations['en'][key] || key;
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(`{${k}}`, v);
        }
        return text;
    }

    function applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[currentLang][key]) {
                el.textContent = translations[currentLang][key];
            }
        });
    }

    // Export globally
    window.i18n = { setLang, getLang, t, applyTranslations };

    // Apply on load
    document.addEventListener('DOMContentLoaded', applyTranslations);
})();
