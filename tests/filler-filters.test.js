'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInitializedApp } = require('./harness');

test('exclusion list only filters external filler', async (t) => {
  await t.test('excluding an intermediate result does not block chains that pass through it', async () => {
    const app = await loadInitializedApp();
    const find = (name) => app.PALDEX.find((p) => p.name === name);
    const start = find('Relaxaurus');

    app.excludedPals = new Set();
    const before = app.findChains(start, 2);
    // Pick some intermediate this chain actually reaches through a filler
    // (not the start pal itself) to use as the thing we'll exclude.
    const someIntermediate = Object.keys(before).find((name) => name !== start.name && before[name].length > 0);
    assert.ok(someIntermediate, 'test setup: expected at least one multi-step intermediate to be reachable');

    app.excludedPals = new Set([someIntermediate]);
    const after = app.findChains(start, 2);
    assert.ok(
      after[someIntermediate],
      `'${someIntermediate}' is a bred stepping-stone here, not something fetched externally - excluding it should not remove it from the reachable set`
    );
  });

  await t.test('excluding every possible filler leaves only the starting parent reachable', async () => {
    const app = await loadInitializedApp();
    const find = (name) => app.PALDEX.find((p) => p.name === name);
    const start = find('Relaxaurus');

    // Deterministic and unambiguous, unlike trying to identify "the" filler
    // behind some specific result: findChains() only records the first path
    // it finds to each species, so a result can have other valid (just
    // unrecorded) producing fillers too. Excluding literally everything
    // except the start pal removes every possible filler at once, so if
    // exclusion works at all, nothing beyond 0 steps can be reached.
    app.excludedPals = new Set(app.PALDEX.map((p) => p.name).filter((n) => n !== start.name));
    const result = app.findChains(start, 3);

    assert.deepEqual(Object.keys(result), [start.name], 'with every filler excluded, only the starting parent (0 steps) should remain reachable');
  });
});

test('power-range slider only filters external filler', async (t) => {
  await t.test('raising the floor shrinks the reachable set without touching the parents/target', async () => {
    const app = await loadInitializedApp();
    const find = (name) => app.PALDEX.find((p) => p.name === name);
    const start = find('Relaxaurus');

    const floorInput = app.document.getElementById('powerFloor');
    const ceilingInput = app.document.getElementById('powerCeiling');
    const powers = app.PALDEX.map((p) => p.power);
    floorInput.min = Math.min(...powers); floorInput.max = Math.max(...powers);
    ceilingInput.min = Math.min(...powers); ceilingInput.max = Math.max(...powers);

    floorInput.value = floorInput.min; ceilingInput.value = ceilingInput.max;
    const full = app.findChains(start, 2);

    floorInput.value = 1500; // excludes every filler rarer than this
    const raised = app.findChains(start, 2);

    assert.ok(Object.keys(raised).length < Object.keys(full).length, 'raising the floor should shrink the reachable set');
    assert.ok(raised[start.name], 'the starting pal itself should always remain "reachable" at 0 steps regardless of the filter');
  });

  await t.test('lowering the ceiling shrinks the reachable set too', async () => {
    const app = await loadInitializedApp();
    const find = (name) => app.PALDEX.find((p) => p.name === name);
    const start = find('Relaxaurus');

    const floorInput = app.document.getElementById('powerFloor');
    const ceilingInput = app.document.getElementById('powerCeiling');
    const powers = app.PALDEX.map((p) => p.power);
    floorInput.min = Math.min(...powers); floorInput.max = Math.max(...powers);
    ceilingInput.min = Math.min(...powers); ceilingInput.max = Math.max(...powers);

    floorInput.value = floorInput.min; ceilingInput.value = ceilingInput.max;
    const full = app.findChains(start, 2);

    ceilingInput.value = 1500; // excludes every filler more common than this
    const lowered = app.findChains(start, 2);

    assert.ok(Object.keys(lowered).length < Object.keys(full).length, 'lowering the ceiling should shrink the reachable set');
  });

  await t.test('getPowerRange() self-corrects if the floor/ceiling inputs are inverted', async () => {
    const app = await loadInitializedApp();
    app.document.getElementById('powerFloor').value = 500;
    app.document.getElementById('powerCeiling').value = 100;
    const range = app.getPowerRange();
    assert.equal(range.floor, 100);
    assert.equal(range.ceiling, 500);
  });
});
