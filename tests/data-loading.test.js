'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInitializedApp } = require('./harness');

test('data loading', async (t) => {
  const app = await loadInitializedApp();

  await t.test('loads all pals from the fixture', () => {
    assert.equal(app.PALDEX.length, 288, 'expected 288 after the Gumoss tribe-collapse (289 raw records)');
  });

  await t.test('every PALDEX entry has a usable name and power', () => {
    for (const p of app.PALDEX) {
      assert.equal(typeof p.name, 'string');
      assert.ok(p.name.length > 0);
      assert.equal(typeof p.power, 'number');
      assert.ok(!Number.isNaN(p.power));
    }
  });

  await t.test('collapses same-tribe duplicate records (Gumoss base + _Flower variant) into one entry', () => {
    const gumossEntries = app.PALDEX.filter((p) => p.name === 'Gumoss');
    assert.equal(gumossEntries.length, 1, 'both PlantSlime records should collapse to a single Gumoss entry');
    assert.equal(gumossEntries[0].rarity, 1, 'the base (non-mutation) form should be the one kept');
  });

  await t.test('no duplicate display names remain after loading', () => {
    const seen = new Set();
    for (const p of app.PALDEX) {
      assert.ok(!seen.has(p.name), `duplicate name found: ${p.name}`);
      seen.add(p.name);
    }
  });

  await t.test('builds a non-trivial special-combos override table from breeding.json', () => {
    const comboCount = Object.keys(app.SPECIAL_COMBOS).length;
    assert.ok(comboCount > 50, `expected a substantial override table, got ${comboCount} entries`);
  });

  await t.test('known override is present and resolvable: Relaxaurus + Sparkit', () => {
    const entry = app.SPECIAL_COMBOS['Relaxaurus + Sparkit'];
    assert.ok(entry, 'expected an override entry for this pair');
    assert.equal(app.resolveComboChild(entry), 'Relaxaurus Lux');
  });

  await t.test('gender-dependent override (Katress x Wixen) is captured as a structured entry, not a plain string', () => {
    const entry = app.SPECIAL_COMBOS['Katress + Wixen'];
    assert.ok(entry, 'expected an override entry for this pair');
    assert.equal(typeof entry, 'object', 'gender-dependent combos should be objects with genderVariants, not a plain child name');
    assert.ok(Array.isArray(entry.genderVariants));
    assert.equal(entry.genderVariants.length, 2, 'both gender orderings should be recorded');
  });

  await t.test('skips breeding.json entries referencing tribes not present in this build (cut/unreleased content)', () => {
    // Yakushima* and similar codenames appear in the raw breeding.json but
    // have no corresponding pal record - buildSpecialCombos() should just
    // drop those rather than crash or emit combos with an undefined name.
    for (const key of Object.keys(app.SPECIAL_COMBOS)) {
      assert.doesNotMatch(key, /undefined/);
    }
  });
});
