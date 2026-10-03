'use strict';

// Product lookup by barcode. The nutrition values printed on the package come from
// Open Food Facts (a free, open product database), fetched by the server.

const express = require('express');
const auth = require('./auth');

const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

// Open Food Facts gives everything per 100 g, minerals and vitamins in grams.
// The app uses: kcal, g (protein, fiber), mg and mcg.
const FIELDS = {
    calories:   { key: 'energy-kcal_100g', factor: 1 },
    protein:    { key: 'proteins_100g', factor: 1 },
    fiber:      { key: 'fiber_100g', factor: 1 },
    zinc:       { key: 'zinc_100g', factor: 1000 },
    iron:       { key: 'iron_100g', factor: 1000 },
    magnesium:  { key: 'magnesium_100g', factor: 1000 },
    omega3:     { key: 'omega-3-fat_100g', factor: 1000 },
    vitaminC:   { key: 'vitamin-c_100g', factor: 1000 },
    vitaminE:   { key: 'vitamin-e_100g', factor: 1000 },
    vitaminA:   { key: 'vitamin-a_100g', factor: 1e6 },
    vitaminD:   { key: 'vitamin-d_100g', factor: 1e6 },
    vitaminB12: { key: 'vitamin-b12_100g', factor: 1e6 },
    biotin:     { key: 'biotin_100g', factor: 1e6 },
    calcium:    { key: 'calcium_100g', factor: 1000 },
    potassium:  { key: 'potassium_100g', factor: 1000 },
    iodine:     { key: 'iodine_100g', factor: 1e6 },
    selenium:   { key: 'selenium_100g', factor: 1e6 },
    folate:     { key: 'vitamin-b9_100g', factor: 1e6 },
    vitaminK:   { key: 'vitamin-k_100g', factor: 1e6 },
    vitaminB1:  { key: 'vitamin-b1_100g', factor: 1000 },
    vitaminB2:  { key: 'vitamin-b2_100g', factor: 1000 },
    vitaminB6:  { key: 'vitamin-b6_100g', factor: 1000 },
    niacin:     { key: 'vitamin-pp_100g', factor: 1000 },
};

/** Turn an Open Food Facts product into what the recipe form needs. */
function toProduct(code, product) {
    const nutriments = product.nutriments || {};
    const per100g = {};
    for (const [name, { key, factor }] of Object.entries(FIELDS)) {
        const value = Number(nutriments[key]);
        if (nutriments[key] !== undefined && nutriments[key] !== '' && Number.isFinite(value) && value >= 0) {
            per100g[name] = Math.round(value * factor * 100) / 100;
        }
    }
    // Older entries only carry kilojoules
    if (per100g.calories === undefined && Number.isFinite(Number(nutriments['energy_100g']))) {
        per100g.calories = Math.round(Number(nutriments['energy_100g']) / 4.184);
    }
    const name = String(product.product_name_de || product.product_name || '').trim();
    return {
        code,
        name: name.slice(0, 120),
        brand: String(product.brands || '').split(',')[0].trim().slice(0, 80),
        quantity: String(product.quantity || '').slice(0, 40),
        per100g,
    };
}

async function lookup(code) {
    const cached = cache.get(code);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.product;

    const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,product_name_de,brands,quantity,nutriments`,
        { headers: { 'User-Agent': 'LifeOS/1.0 (private household app)' }, signal: AbortSignal.timeout(12000) }
    );
    const data = await res.json().catch(() => null);
    const product = data && data.status === 1 && data.product ? toProduct(code, data.product) : null;
    // A product without a name or any values is as good as unknown
    const usable = product && product.name && Object.keys(product.per100g).length > 0 ? product : null;
    cache.set(code, { at: Date.now(), product: usable });
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    return usable;
}

const router = express.Router();

router.get('/barcode/:code', auth.requireUser, (req, res, next) => {
    const code = String(req.params.code || '');
    if (!/^\d{8,14}$/.test(code)) return res.status(400).json({ error: 'invalid_barcode' });
    lookup(code)
        .then(product => product ? res.json({ product }) : res.status(404).json({ error: 'product_not_found' }))
        .catch(err => {
            console.error('[food] barcode lookup failed:', err.message);
            res.status(502).json({ error: 'product_lookup_unavailable' });
        });
});

module.exports = { router, toProduct };
