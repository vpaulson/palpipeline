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

  await t.test('default case (2/2 parent, 0/0 wild) matches the hand-derived hypergeometric value', async () => {
    const app = loadApp();
    const p = app.stepInheritanceProbability(2, 2, 0, 0);
    // pool=2, desired=2: only k=2 can satisfy it, weight 3/7, hypergeometric term = 1
    assert.ok(Math.abs(p - 3 / 7) < 1e-9);
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
    assert.match(html, /id="p0-overall"/);
    assert.match(html, /id="p0-final-parentTotal"[^>]*value="2"/, 'final cross Parent A should default to 2 total');
    assert.match(html, /id="p0-final-wildTotal"[^>]*value="2"/, 'final cross Parent B should default to 2 total (not the usual wild default of 0)');
    assert.match(html, /recalcPipelineOdds\(0,/, 'inputs should wire up to recalcPipelineOdds for this card index');
  });

  await t.test('recalcPipelineOdds correctly multiplies every step (Line A x Line B x final)', () => {
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

    const overall = app.recalcPipelineOdds(0, 1, 2); // 1 Line A step, 2 Line B steps
    const expected = Math.pow(3 / 7, 3) * 0.10; // 3 clean steps at 3/7 each, final at 10%
    assert.ok(Math.abs(overall - expected) < 1e-9, `expected ${expected}, got ${overall}`);
    assert.equal(app.document.getElementById('p0-overall').textContent, app.formatPct(overall));
  });

  await t.test('dirtying one step reduces the overall odds without needing to touch the others', () => {
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

    assert.ok(dirty < clean, `expected dirtying a step to lower the overall odds: ${dirty} vs ${clean}`);
  });

  await t.test('a 0-step line contributes nothing to the product (only the other line + final matter)', () => {
    const app = loadApp();
    const seed = (prefix, parentTotal, parentDesired, wildTotal, wildDesired) => {
      app.document.getElementById(`${prefix}-parentTotal`).value = parentTotal;
      app.document.getElementById(`${prefix}-parentDesired`).value = parentDesired;
      app.document.getElementById(`${prefix}-wildTotal`).value = wildTotal;
      app.document.getElementById(`${prefix}-wildDesired`).value = wildDesired;
    };

    seed('p0-b0', 2, 2, 0, 0);
    seed('p0-final', 2, 2, 2, 2);
    const overall = app.recalcPipelineOdds(0, 0, 1); // lineACount = 0

    const expected = (3 / 7) * 0.10;
    assert.ok(Math.abs(overall - expected) < 1e-9, `expected ${expected}, got ${overall}`);
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
