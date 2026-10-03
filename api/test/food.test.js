'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toProduct } = require('../src/food');

test('barcode products are converted to the units the app uses', () => {
    const product = toProduct('4000000000001', {
        product_name: 'Haferflocken',
        product_name_de: 'Zarte Haferflocken',
        brands: 'Kölln, Peter Kölln',
        quantity: '500 g',
        nutriments: {
            'energy-kcal_100g': 372, 'proteins_100g': 13.5, 'fiber_100g': 10,
            'iron_100g': 0.0058, 'zinc_100g': 0.0043, 'magnesium_100g': 0.13,
            'vitamin-b12_100g': 0.0000025, 'vitamin-c_100g': '', 'sugars_100g': 1.2,
        },
    });
    assert.equal(product.name, 'Zarte Haferflocken');
    assert.equal(product.brand, 'Kölln');
    assert.deepEqual(product.per100g, {
        calories: 372, protein: 13.5, fiber: 10,
        zinc: 4.3, iron: 5.8, magnesium: 130, vitaminB12: 2.5,
    });
});

test('missing values are left out and kilojoules are converted', () => {
    const product = toProduct('1', { product_name: 'X', nutriments: { 'energy_100g': 2252, 'proteins_100g': 'abc' } });
    assert.deepEqual(product.per100g, { calories: 538 });
});
