'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadInitializedApp } = require('./harness');

// Mirrors the pipeline-building + sorting block inside calculateRoutes()
// (which itself is tightly coupled to DOM rendering), so the ranking logic
// can be exercised directly without needing a full DOM.
function buildAndSortPipelines(app, palA, palB, target, maxDepth) {
  const chainsA = app.findChains(palA, maxDepth);
  const chainsB = app.findChains(palB, maxDepth);
  const validPipelines = [];
  for (const interAName in chainsA) {
    for (const interBName in chainsB) {
      const interA = app.PALDEX.find((p) => p.name === interAName);
      const interB = app.PALDEX.find((p) => p.name === interBName);
      const finalChild = app.getOffspring(interA, interB);
      if (finalChild.name !== target.name) continue;

      const lineASteps = chainsA[interAName];
      const lineBSteps = chainsB[interBName];
      const wildsUsed = new Set([...lineASteps, ...lineBSteps].map((s) => s.filler.name));
      const matchedIncludes = Array.from(app.includedPals).filter((n) => wildsUsed.has(n));

      validPipelines.push({
        lineASteps, lineBSteps, finalA: interA, finalB: interB,
        totalSteps: lineASteps.length + lineBSteps.length + 1,
        matchedIncludes, wildsUsed,
      });
    }
  }
  validPipelines.sort((a, b) => (b.matchedIncludes.length - a.matchedIncludes.length) || (a.totalSteps - b.totalSteps));
  return validPipelines;
}

test('include-list ranking', async (t) => {
  const app = await loadInitializedApp();
  const find = (name) => app.PALDEX.find((p) => p.name === name);

  await t.test('with no include list, ranking is pure shortest-path-first (regression)', () => {
    app.includedPals = new Set();
    const pipelines = buildAndSortPipelines(app, find('Relaxaurus'), find('Celaray'), find('Suzaku Aqua'), 2);
    assert.ok(pipelines.length > 1, 'need multiple candidate pipelines for this to be a meaningful check');
    for (let i = 1; i < pipelines.length; i++) {
      assert.ok(pipelines[i].totalSteps >= pipelines[i - 1].totalSteps, 'pipelines must be non-decreasing in totalSteps');
    }
  });

  await t.test('including a pal that only ever appears as a bred RESULT (never a filler) produces zero matches', () => {
    // Find a pal that shows up as some step's `result` in the no-include run
    // above but never as any step's `filler`, anywhere in the candidate set.
    app.includedPals = new Set();
    const baseline = buildAndSortPipelines(app, find('Relaxaurus'), find('Celaray'), find('Suzaku Aqua'), 2);
    const allFillers = new Set();
    baseline.forEach((p) => [...p.lineASteps, ...p.lineBSteps].forEach((s) => allFillers.add(s.filler.name)));

    let resultOnlyName = null;
    outer:
    for (const p of baseline) {
      for (const s of [...p.lineASteps, ...p.lineBSteps]) {
        if (!allFillers.has(s.result.name)) { resultOnlyName = s.result.name; break outer; }
      }
    }
    assert.ok(resultOnlyName, 'test setup: expected to find at least one result-only pal in this candidate set');

    app.includedPals = new Set([resultOnlyName]);
    const withInclude = buildAndSortPipelines(app, find('Relaxaurus'), find('Celaray'), find('Suzaku Aqua'), 2);
    const anyMatch = withInclude.some((p) => p.matchedIncludes.length > 0);
    assert.equal(anyMatch, false, `'${resultOnlyName}' never appears as external filler, so it should never count as a match`);
  });

  await t.test('including a pal that DOES appear as filler promotes its pipeline above shorter non-matching ones', () => {
    app.includedPals = new Set();
    const baseline = buildAndSortPipelines(app, find('Relaxaurus'), find('Celaray'), find('Suzaku Aqua'), 2);

    // Find a filler used in some non-top pipeline but not in the current top one.
    const topFillers = new Set([...baseline[0].lineASteps, ...baseline[0].lineBSteps].map((s) => s.filler.name));
    let differentiatingFiller = null;
    for (let i = 1; i < baseline.length; i++) {
      for (const name of baseline[i].wildsUsed) {
        if (!topFillers.has(name)) { differentiatingFiller = name; break; }
      }
      if (differentiatingFiller) break;
    }
    assert.ok(differentiatingFiller, 'test setup: expected to find a filler that differentiates some pipeline from the current top pick');

    app.includedPals = new Set([differentiatingFiller]);
    const withInclude = buildAndSortPipelines(app, find('Relaxaurus'), find('Celaray'), find('Suzaku Aqua'), 2);
    assert.ok(withInclude[0].matchedIncludes.includes(differentiatingFiller), 'the promoted pipeline should be the one that actually uses the included filler');
  });

  await t.test('an include list matching nothing in any candidate falls back cleanly to shortest-first', () => {
    app.includedPals = new Set(['ZZZ_Definitely_Not_A_Real_Pal']);
    const pipelines = buildAndSortPipelines(app, find('Relaxaurus'), find('Celaray'), find('Suzaku Aqua'), 2);
    assert.ok(pipelines.every((p) => p.matchedIncludes.length === 0));
    for (let i = 1; i < pipelines.length; i++) {
      assert.ok(pipelines[i].totalSteps >= pipelines[i - 1].totalSteps);
    }
  });
});
