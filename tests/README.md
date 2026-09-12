# PalPipeline tests

A real, runnable test suite for the single-file `index.html` app. No npm
install, no build step, no dependencies - just plain Node (v18+, uses the
built-in `node:test` runner).

## Running

From the project folder (the one containing `index.html`):

```bash
node --test tests/*.test.js
```

Takes roughly 25-30 seconds. Most of that is a handful of tests that run the
real `findChains()` breeding-chain search against the full real 288-species
fixture dataset at depth 2 - that's inherently a bit of work, and it's worth
it for the tests to exercise the real algorithm at a realistic scale rather
than a toy one.

To run a single file (much faster, useful while iterating):

```bash
node --test tests/breeding-logic.test.js
```

## How it works

`index.html` has no build step and doesn't export anything - all its logic
lives inside one inline `<script>` block. `harness.js` re-extracts and
re-evaluates that actual script on every test run (inside a sandboxed `vm`
context with a minimal fake DOM/localStorage/fetch), so every test always
runs against whatever `index.html` currently says. There's no hand-copied
snapshot of the logic to drift out of sync when someone edits the real file.

`loadInitializedApp()` (in `harness.js`) goes one step further: it also runs
the real `initializeApp()` against the real Atlas fixture files in
`fixtures/` (an actual pals/index.json + breeding.json pulled from a real
build), so tests get the same PALDEX, SPECIAL_COMBOS, tribe-collapse
deduplication, etc. that a real browser session would end up with - not a
hand-rolled imitation of that mapping logic.

## What's covered

- **`data-loading.test.js`** - the Atlas → PALDEX mapping, the Gumoss
  same-tribe dedup, and the special-combos override table built from
  `breeding.json`.
- **`breeding-logic.test.js`** - `getOffspring()`: special-combo overrides,
  self-breeding, gender-dependent combos, and the power-tie tie-break rule
  (regression test for the Sibelyx + Needoll Noct → Carnibora case).
- **`filler-filters.test.js`** - confirms the exclusion list and the
  breeding-power range slider both only ever filter the *external filler* at
  each step, never a bred intermediate result or the parents/target.
- **`include-list.test.js`** - the include-list ranking rule (more included
  fillers used → ranks higher; ties broken by shortest path), and that it's
  scoped to filler pals only, the same as the exclusion list.
- **`url-sync.test.js`** - the URL query-param round trip, and a regression
  test for the load-order bug where `setupPowerRangeSlider()` used to
  overwrite an incoming shared link's params with defaults before they were
  ever read.
- **`image-manifest.test.js`** - the local `images-manifest.json` loader
  (which replaced fetching thumbnails from a live wiki API at runtime),
  including that a missing manifest degrades gracefully instead of breaking
  anything.
- **`trait-odds.test.js`** - the passive-trait inheritance probability model
  (validated against a documented reference point: 4 clean desired traits
  split any way between two parents gives exactly 10%), the "expected eggs
  needed" / "first-try chance" stats derived from it, and their DOM wiring.

## A note on `innerHTML` and live inputs

The harness's fake DOM does not parse HTML strings - setting
`element.innerHTML = "...<input value='2'>..."` just stores that text on
the `.innerHTML` property, it does not create a real child `<input>` whose
`.value` is `"2"`. `document.getElementById()` only "sees" elements that
were actually created through it or `createElement()`.

This matters for anything that renders a template string containing inputs
and then reads them back by id (like the trait-odds widgets): a quick ad
hoc script that calls e.g. `recalcPipelineOdds()` right after rendering,
without first manually setting each input's `.value` to match what the
template says, will read back empty strings - `parseInt('', 10)` is `NaN`,
which the clamping falls back to `0`, silently producing nonsense results
(a step that should read 2/2 will compute as the vacuous 0/0 "nothing
required" case instead). This isn't a bug in the app - a real browser
parses `value="2"` into a live input just fine - it's purely an artifact of
this harness's no-parsing shortcut.

The permanent tests avoid this by explicitly seeding every input's
`.value` before calling anything that reads it (see the `seed()` helpers in
`trait-odds.test.js`). When writing a new test - or a quick manual check -
that touches rendered form inputs, do the same: either seed the values by
hand, or restrict the check to the HTML *string* itself (regex/substring
matching on `card.innerHTML`, as the "renders odds widgets with correct
ids and defaults" test does) rather than reading values back through
`getElementById()`.

## A note on cross-realm objects

`vm.createContext()` gives each loaded app its own realm, with its own
`Object`, `Array`, etc. An empty object literal created inside that sandbox
(`{}`) is not `assert.deepEqual`-identical to one created in the outer test
file, even though both are empty - `deepEqual` (which is strict under
`node:assert/strict`) compares prototypes, and the two `{}`s have different
`Object.prototype` references from different realms. When asserting on
plain objects/arrays that came out of `loadApp()`/`loadInitializedApp()`,
prefer checking shape (`Object.keys(x).length`, `Array.isArray(x)`,
individual property values) over `assert.deepEqual(x, {})` or similar
literal comparisons.

## A note on synthetic vs. real test data

A couple of these tests originally used small hand-built PALDEX arrays
instead of the real fixture, for simplicity. That backfired twice during
development: a small dataset is small enough that coincidental tie-breaks
and "the bred result is also directly obtainable as its own filler" loops
show up far more easily than they do in the real 288-species dataset,
producing failures that were really artifacts of the toy data rather than
real bugs. Where that matters, these tests now run against the real fixture
data instead.

## Adding a new test

Just add a new `*.test.js` file - `node --test` picks up anything matching
that pattern automatically. Use `loadInitializedApp()` from `harness.js` for
anything that needs a fully-loaded app, or `loadApp()` if you want to seed
`PALDEX`/`SPECIAL_COMBOS` by hand for a narrower unit test.
