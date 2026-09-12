'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, loadInitializedApp } = require('./harness');

test('trait inheritance probability model', async (t) => {
  await t.test(
    'reproduces the documented reference point exactly: 4 clean desired traits (no junk) -> 10% per egg, ' +
    'regardless of how the 4 are split between the two sides',
    async () => {
      const app = loadApp();
      const splits = [[2, 2, 2, 2], [4, 4, 0, 0], [3, 3, 1, 1], [1, 1, 3, 3]];
      for (const [pt, pd, wt, wd] of splits) {
        const p = app.stepInheritanceProbability(pt, pd, wt, wd);
        assert.ok(Math.abs(p - 0.10) < 1e-9, `split (${pt},${pd},${wt},${wd}) should give exactly 10%, got ${p * 100}%`);
      }
    }
  );

  await t.test('default case (2/2 parent, 0/0 wild) matches the hand-derived value', async () => {
    const app = loadApp();
    const p = app.stepInheritanceProbability(2, 2, 0, 0);
    // pool=2, desired=2: only k=2 can satisfy it (weight 3/7), hypergeometric
    // term = 1, but 2 of the child's 4 slots are left empty by that roll -
    // a clean result also needs the mutation check to skip them (40%).
    assert.ok(Math.abs(p - (3 / 7) * 0.4) < 1e-9);
  });

  await t.test('zero desired traits is vacuously guaranteed (100%), with or without junk present', async () => {
    const app = loadApp();
    assert.equal(app.stepInheritanceProbability(0, 0, 0, 0), 1);
    assert.equal(app.stepInheritanceProbability(2, 0, 3, 0), 1);
  });

  await t.test('adding junk traits strictly decreases the odds', async () => {
    const app = loadApp();
    const clean = app.stepInheritanceProbability(2, 2, 0, 0);
    const oneJunk = app.stepInheritanceProbability(2, 2, 1, 0);
    const twoJunk = app.stepInheritanceProbability(2, 2, 2, 0);
    assert.ok(clean > oneJunk && oneJunk > twoJunk, `expected strictly decreasing: ${clean} > ${oneJunk} > ${twoJunk}`);
  });

  await t.test('only the totals matter, not which side (parent vs. wild) holds the desired traits', async () => {
    const app = loadApp();
    const a = app.stepInheritanceProbability(2, 2, 1, 0);
    const b = app.stepInheritanceProbability(1, 0, 2, 2);
    assert.ok(Math.abs(a - b) < 1e-9);
  });

  await t.test('probability stays within [0, 1] across every valid combination of 0-4 traits', async () => {
    const app = loadApp();
    for (let pt = 0; pt <= 4; pt++) {
      for (let pd = 0; pd <= pt; pd++) {
        for (let wt = 0; wt <= 4; wt++) {
          for (let wd = 0; wd <= wt; wd++) {
            const p = app.stepInheritanceProbability(pt, pd, wt, wd);
            assert.ok(p >= -1e-9 && p <= 1 + 1e-9 && !Number.isNaN(p), `out of range at (${pt},${pd},${wt},${wd}): ${p}`);
          }
        }
      }
    }
  });

  await t.test('more than 4 total desired traits is genuinely impossible (child has only 4 slots) -> probability 0', async () => {
    const app = loadApp();
    // 4 desired on each side = 8 total desired, but only 4 slots exist on the child
    const p = app.stepInheritanceProbability(4, 4, 4, 4);
    assert.equal(p, 0);
  });
});

test('expected-eggs (primary stat) and formatting', async (t) => {
  await t.test('expectedAttempts is the reciprocal of the probability', async () => {
    const app = loadApp();
    assert.ok(Math.abs(app.expectedAttempts(0.1) - 10) < 1e-9);
    assert.ok(Math.abs(app.expectedAttempts(0.5) - 2) < 1e-9);
    assert.equal(app.expectedAttempts(1), 1);
  });

  await t.test('expectedAttempts of an impossible step (p=0) is Infinity, not a crash or NaN', async () => {
    const app = loadApp();
    assert.equal(app.expectedAttempts(0), Infinity);
  });

  await t.test('formatEggs renders Infinity as an explicit "impossible" message, not "Infinity"', async () => {
    const app = loadApp();
    assert.match(app.formatEggs(Infinity), /never|impossible/i);
    assert.doesNotMatch(app.formatEggs(Infinity), /Infinity/);
  });

  await t.test('formatEggs uses singular "egg" only for a value that rounds to 1', async () => {
    const app = loadApp();
    assert.match(app.formatEggs(1), /\begg\b(?!s)/);
    assert.match(app.formatEggs(2.3), /eggs/);
  });
});


test('trait odds UI generation and recalculation', async (t) => {
  await t.test('calculateRoutes() renders odds widgets with correct ids and defaults in the card HTML', async () => {
    const app = await loadInitializedApp();
    app.document.getElementById('startA').value = 'Relaxaurus';
    app.document.getElementById('startB').value = 'Celaray';
    app.document.getElementById('targetPal').value = 'Anubis';
    app.document.getElementById('maxDepth').value = '4';

    app.calculateRoutes();
    await new Promise((r) => setTimeout(r, 150)); // let the internal setTimeout(...,50) fire

    const resultsDiv = app.document.getElementById('results');
    const firstCard = (resultsDiv._children || [])[0];
    assert.ok(firstCard, 'expected at least one rendered pipeline card');

    const html = firstCard.innerHTML;
    assert.match(html, /id="p0-overall-eggs"/);
    assert.match(html, /id="p0-overall-firsttry"/);
    assert.match(html, /id="p0-final-parentTotal"[^>]*value="2"/, 'final cross Parent A should default to 2 total');
    assert.match(html, /id="p0-final-wildTotal"[^>]*value="2"/, 'final cross Parent B should default to 2 total (not the usual wild default of 0)');
    assert.match(html, /recalcPipelineOdds\(0,/, 'inputs should wire up to recalcPipelineOdds for this card index');
  });

  await t.test('recalcPipelineOdds sums expected eggs ADDITIVELY across steps (not multiplicatively)', () => {
    const app = loadApp();
    const seed = (prefix, parentTotal, parentDesired, wildTotal, wildDesired) => {
      app.document.getElementById(`${prefix}-parentTotal`).value = parentTotal;
      app.document.getElementById(`${prefix}-parentDesired`).value = parentDesired;
      app.document.getElementById(`${prefix}-wildTotal`).value = wildTotal;
      app.document.getElementById(`${prefix}-wildDesired`).value = wildDesired;
    };

    seed('p0-a0', 2, 2, 0, 0);
    seed('p0-b0', 2, 2, 0, 0);
    seed('p0-b1', 2, 2, 0, 0);
    seed('p0-final', 2, 2, 2, 2);

    const { totalEggs, firstTryChance } = app.recalcPipelineOdds(0, 1, 2); // 1 Line A step, 2 Line B steps

    // Each 2/2-vs-0/0 step has p=(3/7)*0.4=6/35 (expected attempts 35/6);
    // the final cross's 2/2-vs-2/2 has p=0.10 (expected attempts 10, no
    // mutation factor since all 4 slots are filled by the pool roll
    // there). Eggs should ADD.
    const stepP = (3 / 7) * 0.4;
    const expectedEggs = 3 * (1 / stepP) + 10;
    assert.ok(Math.abs(totalEggs - expectedEggs) < 1e-9, `expected ${expectedEggs}, got ${totalEggs}`);

    // The old multiplicative "first-try" figure should still be available,
    // just as the secondary stat, and should equal the product of the same
    // per-step probabilities.
    const expectedFirstTry = Math.pow(stepP, 3) * 0.10;
    assert.ok(Math.abs(firstTryChance - expectedFirstTry) < 1e-9);

    assert.equal(app.document.getElementById('p0-overall-eggs').textContent, app.formatEggs(totalEggs));
    assert.equal(app.document.getElementById('p0-overall-firsttry').textContent, app.formatPct(firstTryChance));
  });

  await t.test('dirtying one step increases total expected eggs without needing to touch the others', () => {
    const app = loadApp();
    const seed = (prefix, parentTotal, parentDesired, wildTotal, wildDesired) => {
      app.document.getElementById(`${prefix}-parentTotal`).value = parentTotal;
      app.document.getElementById(`${prefix}-parentDesired`).value = parentDesired;
      app.document.getElementById(`${prefix}-wildTotal`).value = wildTotal;
      app.document.getElementById(`${prefix}-wildDesired`).value = wildDesired;
    };

    seed('p0-a0', 2, 2, 0, 0);
    seed('p0-final', 2, 2, 2, 2);
    const clean = app.recalcPipelineOdds(0, 1, 0);

    seed('p0-a0', 2, 2, 1, 0); // introduce 1 junk trait on the wild side of this step
    const dirty = app.recalcPipelineOdds(0, 1, 0);

    assert.ok(dirty.totalEggs > clean.totalEggs, `expected dirtying a step to raise expected eggs: ${dirty.totalEggs} vs ${clean.totalEggs}`);
    assert.ok(dirty.firstTryChance < clean.firstTryChance, `expected dirtying a step to lower first-try chance: ${dirty.firstTryChance} vs ${clean.firstTryChance}`);
  });

  await t.test('a genuinely impossible step (>4 total desired) surfaces as "impossible", not a broken number', () => {
    const app = loadApp();
    const seed = (prefix, parentTotal, parentDesired, wildTotal, wildDesired) => {
      app.document.getElementById(`${prefix}-parentTotal`).value = parentTotal;
      app.document.getElementById(`${prefix}-parentDesired`).value = parentDesired;
      app.document.getElementById(`${prefix}-wildTotal`).value = wildTotal;
      app.document.getElementById(`${prefix}-wildDesired`).value = wildDesired;
    };

    seed('p0-final', 4, 4, 4, 4); // 8 desired traits, only 4 child slots exist
    const { totalEggs } = app.recalcPipelineOdds(0, 0, 0);

    assert.equal(totalEggs, Infinity);
    assert.match(app.document.getElementById('p0-overall-eggs').textContent, /impossible|never/i);
  });

  await t.test('a 0-step line contributes nothing to the total (only the other line + final matter)', () => {
    const app = loadApp();
    const seed = (prefix, parentTotal, parentDesired, wildTotal, wildDesired) => {
      app.document.getElementById(`${prefix}-parentTotal`).value = parentTotal;
      app.document.getElementById(`${prefix}-parentDesired`).value = parentDesired;
      app.document.getElementById(`${prefix}-wildTotal`).value = wildTotal;
      app.document.getElementById(`${prefix}-wildDesired`).value = wildDesired;
    };

    seed('p0-b0', 2, 2, 0, 0);
    seed('p0-final', 2, 2, 2, 2);
    const { totalEggs } = app.recalcPipelineOdds(0, 0, 1); // lineACount = 0

    const expected = 1 / ((3 / 7) * 0.4) + 10;
    assert.ok(Math.abs(totalEggs - expected) < 1e-9, `expected ${expected}, got ${totalEggs}`);
  });

  await t.test('clampOddsInput snaps a desired count down if it exceeds the current total', () => {
    const app = loadApp();
    app.document.getElementById('p0-a0-parentTotal').value = 1;
    app.document.getElementById('p0-a0-parentDesired').value = 3; // invalid: more desired than total
    const clamped = app.clampOddsInput('p0-a0-parentDesired', 0, 1);
    assert.equal(clamped, 1);
    assert.equal(app.document.getElementById('p0-a0-parentDesired').value, 1);
  });
});
