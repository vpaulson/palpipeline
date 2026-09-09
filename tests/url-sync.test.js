'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInitializedApp } = require('./harness');

test('URL parameter sync', async (t) => {
  await t.test('syncURL() writes the current selections/exclusions/range into the URL, and reads back correctly', async () => {
    const app = await loadInitializedApp();
    app.document.getElementById('startA').value = 'Relaxaurus';
    app.document.getElementById('startB').value = 'Celaray';
    app.document.getElementById('targetPal').value = 'Anubis';
    app.document.getElementById('maxDepth').value = '4';
    app.excludedPals = new Set(['Sparkit']);
    app.document.getElementById('powerFloor').value = 500;
    app.document.getElementById('powerCeiling').value = 2000;

    app.syncURL();
    const parsed = app.readFiltersFromURL();

    assert.equal(parsed.a, 'Relaxaurus');
    assert.equal(parsed.b, 'Celaray');
    assert.equal(parsed.target, 'Anubis');
    assert.equal(parsed.exclude, 'Sparkit');
    assert.equal(parsed.powerMin, '500');
    assert.equal(parsed.powerMax, '2000');
  });

  await t.test(
    'regression: URL params present at page load must survive the full load sequence ' +
    '(populateSelects -> setupPowerRangeSlider -> applyFiltersFromURL), not get overwritten by defaults',
    async () => {
      // Simulate a browser preserving the query string across a refresh,
      // BEFORE any of the app's own JS runs.
      const app = await loadInitializedApp({
        // loadInitializedApp already calls initializeApp() once; we need the
        // URL to be present at the moment initializeApp() runs, so set it up
        // via a wrapped fetch that lets initializeApp complete normally
        // while we pre-seed window.location.search first.
      });
      // (loadInitializedApp has already completed one load with no params.)
      // Re-run the exact load sequence a second time - as if the user
      // refreshed the page - now with URL params present, and confirm they
      // win over the hardcoded defaults.
      app.window.location.search =
        '?a=Suzaku&b=Direhowl&target=Sparkit&depth=6&exclude=Anubis&include=Celaray&powerMin=500&powerMax=2000';

      app.populateSelects();
      app.setupPowerRangeSlider();
      app.applyFiltersFromURL();

      assert.equal(app.document.getElementById('startA').value, 'Suzaku');
      assert.equal(app.document.getElementById('startB').value, 'Direhowl');
      assert.equal(app.document.getElementById('targetPal').value, 'Sparkit');
      assert.equal(app.document.getElementById('maxDepth').value, '6');
      assert.ok(app.excludedPals.has('Anubis'));
      assert.ok(app.includedPals.has('Celaray'));
      assert.equal(app.document.getElementById('powerFloor').value, 500);
      assert.equal(app.document.getElementById('powerCeiling').value, 2000);
    }
  );

  await t.test('a URL with all three of a/b/target auto-runs the calculation', async () => {
    const app = await loadInitializedApp();
    let calculateCalls = 0;
    app.calculateRoutes = () => { calculateCalls++; };

    app.window.location.search = '?a=Relaxaurus&b=Celaray&target=Anubis';
    app.applyFiltersFromURL();

    assert.equal(calculateCalls, 1);
  });

  await t.test('an invalid/unknown pal name in the URL is ignored rather than breaking the restore', async () => {
    const app = await loadInitializedApp();
    let calculateCalls = 0;
    app.calculateRoutes = () => { calculateCalls++; };

    // loadInitializedApp() already ran the real initializeApp(), which sets
    // startA to its hardcoded default ("Relaxaurus") - so rather than
    // assuming an invalid URL value clears the field to empty (which isn't
    // actually the contract), set a known sentinel first and confirm the
    // invalid value is simply never written over it.
    app.document.getElementById('startA').value = 'Relaxaurus';
    app.window.location.search = '?a=NotARealPal&b=Celaray&target=Anubis';
    app.applyFiltersFromURL();

    assert.notEqual(app.document.getElementById('startA').value, 'NotARealPal', 'the invalid pal name should never be written into the field');
    assert.equal(app.document.getElementById('startB').value, 'Celaray', 'valid fields should still be applied');
    assert.equal(calculateCalls, 0, 'should not auto-run when the pipeline is incompletely specified');
  });

  await t.test('a fresh load with no URL params writes the current defaults into the URL instead of leaving it blank', async () => {
    const app = await loadInitializedApp();
    app.window.location.search = '';
    app.document.getElementById('startA').value = 'Relaxaurus';
    app.document.getElementById('startB').value = 'Celaray';
    app.document.getElementById('targetPal').value = 'Anubis';

    app.applyFiltersFromURL();

    assert.ok(app.window.location.search.includes('a=Relaxaurus'));
  });
});
