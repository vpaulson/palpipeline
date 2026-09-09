'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInitializedApp } = require('./harness');

test('breeding logic (getOffspring)', async (t) => {
  const app = await loadInitializedApp();
  const find = (name) => {
    const pal = app.PALDEX.find((p) => p.name === name);
    assert.ok(pal, `fixture is missing expected pal: ${name}`);
    return pal;
  };

  await t.test('special-combo override wins over the power formula', () => {
    const child = app.getOffspring(find('Relaxaurus'), find('Sparkit'));
    assert.equal(child.name, 'Relaxaurus Lux');
  });

  await t.test('special-combo lookup is order-independent', () => {
    const a = app.getOffspring(find('Relaxaurus'), find('Sparkit')).name;
    const b = app.getOffspring(find('Sparkit'), find('Relaxaurus')).name;
    assert.equal(a, b);
  });

  await t.test('same species always breeds itself', () => {
    const child = app.getOffspring(find('Anubis'), find('Anubis'));
    assert.equal(child.name, 'Anubis');
  });

  await t.test('gender-dependent override resolves to a real pal (default variant)', () => {
    const child = app.getOffspring(find('Katress'), find('Wixen'));
    assert.equal(child.name, 'Wixen Noct');
  });

  await t.test(
    'tie-break rule: on an exact tie in distance from the target power, the HIGHER-power species wins ' +
    '(regression: Sibelyx + Needoll Noct averages to 1695, exactly equidistant from Beakon(1690) and ' +
    'Carnibora(1700) - the correct real-game answer is Carnibora, confirmed against op.gg)',
    () => {
      const child = app.getOffspring(find('Sibelyx'), find('Needoll Noct'));
      assert.equal(child.name, 'Carnibora');
    }
  );

  await t.test('tie-break is order-independent too', () => {
    const a = app.getOffspring(find('Sibelyx'), find('Needoll Noct')).name;
    const b = app.getOffspring(find('Needoll Noct'), find('Sibelyx')).name;
    assert.equal(a, b);
  });

  await t.test('formula fallback (no override, no tie) picks the closest breeding power', () => {
    const a = find('Lamball');
    const b = find('Cattiva');
    const target = Math.floor((a.power + b.power + 1) / 2);
    const child = app.getOffspring(a, b);
    const actualDiff = Math.abs(child.power - target);
    const bestPossibleDiff = Math.min(...app.PALDEX.map((p) => Math.abs(p.power - target)));
    assert.equal(actualDiff, bestPossibleDiff, 'getOffspring should return a species at the minimum possible distance from the target');
  });

  await t.test('every result of getOffspring is always a real member of PALDEX', () => {
    // Broad sanity sweep across a sample of pairs, not just hand-picked cases.
    let checked = 0;
    for (let i = 0; i < app.PALDEX.length; i += 7) {
      for (let j = i; j < app.PALDEX.length; j += 13) {
        const result = app.getOffspring(app.PALDEX[i], app.PALDEX[j]);
        assert.ok(app.PALDEX.includes(result), `getOffspring(${app.PALDEX[i].name}, ${app.PALDEX[j].name}) returned a pal not in PALDEX`);
        checked++;
      }
    }
    assert.ok(checked > 100, 'sanity check: this sweep should exercise a meaningful number of pairs');
  });
});
