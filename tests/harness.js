'use strict';
// Shared test harness for PalPipeline's single-file index.html "app".
//
// The app has no build step and no exported module - all its logic lives
// inside one inline <script> block. Rather than hand-copy functions out into
// a separate module (which drifts out of sync with the real file the moment
// someone edits index.html and forgets the copy), this harness re-extracts
// and re-evaluates the ACTUAL <script> content from index.html on every test
// run, inside a sandboxed vm context with a minimal fake DOM/localStorage/
// fetch. Every test therefore runs against whatever index.html currently
// says, not a frozen snapshot.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DEFAULT_HTML_PATH = path.join(__dirname, '..', 'index.html');

function extractInlineScript(html) {
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one inline <script> block in index.html, found ${matches.length}. ` +
      `If index.html now has multiple <script> tags, update extractInlineScript() to pick the right one.`
    );
  }
  return matches[0][1];
}

// A vm context only exposes a script's `var`-declared globals and function
// declarations as properties of the context object - top-level `let`/`const`
// create real bindings the script's own functions can close over just fine,
// but they're invisible from outside (this is standard JS lexical-vs-global
// scoping, not a Node/vm quirk). Since tests need to read and seed state
// like PALDEX and excludedPals directly, this rewrites just the top-level
// `let` declarations to `var` before evaluating. It's scoped narrowly by
// indentation: index.html consistently uses exactly 4 spaces for top-level
// statements and 6+ for anything nested inside a function, so matching
// `^    let ` (anchored, exact 4-space indent) targets only the handful of
// top-level state variables (PALDEX, SPECIAL_COMBOS, excludedPals, ...) and
// never touches a `let` inside a function body. If index.html's formatting
// style ever changes, this regex is the first thing to check.
function exposeTopLevelLet(script) {
  return script.replace(/^ {4}let /gm, '    var ');
}

// A generic mutable stand-in for any DOM element. Rather than hand-declare
// every element id the app might touch (and have to remember to add new
// ones every time index.html grows a new control), getElementById() below
// lazily creates one of these for any id on first request and reuses the
// same instance for that id afterward, matching real DOM identity semantics
// closely enough for these tests.
function makeElement(id) {
  let _value = '';
  return {
    id,
    innerHTML: '',
    textContent: '',
    style: {},
    disabled: false,
    min: '0',
    max: '0',
    className: '',
    get value() { return _value; },
    set value(v) { _value = v; },
    appendChild(child) { (this._children = this._children || []).push(child); return child; },
    insertAdjacentElement() {},
    insertAdjacentHTML() {},
    addEventListener(evt, fn) { (this._listeners = this._listeners || {})[evt] = fn; },
    remove() {},
  };
}

// Builds a fresh sandbox (fresh PALDEX, fresh URL, fresh localStorage) for
// one test. fetchImpl lets a test control what the app's fetch() calls see -
// see fixtureFetch() below for the common case of serving the real Atlas
// fixture files.
function createSandbox({ fetchImpl } = {}) {
  const elementCache = Object.create(null);
  const storageMap = new Map();
  const fakeLocation = { pathname: '/index.html', search: '' };

  const sandbox = {
    console,
    URLSearchParams,
    Promise, Math, JSON, Number, String, Array, Object, Set, Map, Date,
    setTimeout, clearTimeout,
    document: {
      getElementById(id) {
        if (!(id in elementCache)) elementCache[id] = makeElement(id);
        return elementCache[id];
      },
      createElement(tag) { return makeElement(`__created_${tag}`); },
      activeElement: null,
    },
    window: { location: fakeLocation },
    location: fakeLocation,
    history: {
      replaceState(_state, _title, url) {
        const q = url.indexOf('?');
        fakeLocation.search = q >= 0 ? url.slice(q) : '';
      },
    },
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k),
    },
    fetch: fetchImpl || (async (url) => { throw new Error(`fetch() not mocked for this test; requested: ${url}`); }),
  };
  sandbox.globalThis = sandbox;
  return sandbox;
}

// Loads index.html, extracts its script, and runs it in a sandboxed context.
// Returns the context object - every top-level function and `let`/`const`
// the script declares (PALDEX, getOffspring, findChains, syncURL, ...) is
// accessible as a property of the returned object, e.g. `app.PALDEX`,
// `app.getOffspring(a, b)`.
function loadApp(options = {}) {
  const htmlPath = options.htmlPath || DEFAULT_HTML_PATH;
  const html = fs.readFileSync(htmlPath, 'utf8');
  const script = exposeTopLevelLet(extractInlineScript(html));
  const sandbox = createSandbox(options);
  const context = vm.createContext(sandbox);
  vm.runInContext(script, context, { filename: 'index.html (inline script)' });
  return context;
}

// A fetch() mock that serves the real Atlas fixture files for the app's
// three expected URLs (latest.json pointer, pals/index.json, breeding.json),
// and a benign "no thumbnails" response for the wiki thumbnail API so
// initializeApp() completes without needing real network/image data.
function fixtureFetch(pals, breeding, { steamBuildId = 'TEST-BUILD' } = {}) {
  return async (url) => {
    if (url.includes('v1/latest.json')) {
      return { ok: true, json: async () => ({ buildPath: 'builds/TEST', steamBuildId }) };
    }
    if (url.includes('pals/index.json')) {
      return { ok: true, json: async () => pals };
    }
    if (url.includes('breeding.json')) {
      return { ok: true, json: async () => breeding };
    }
    if (url.includes('fandom.com')) {
      return { ok: true, json: async () => ({ query: { pages: {} } }) };
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };
}

function loadFixtures() {
  const pals = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'pals-index.json'), 'utf8'));
  const breeding = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'breeding.json'), 'utf8'));
  return { pals, breeding };
}

// Convenience: loads the app and runs the real initializeApp() against the
// real fixture data, so PALDEX/SPECIAL_COMBOS/the slider/etc. all end up in
// the same state they would in a real browser session. Use this for any
// test that needs a fully-initialized app rather than calling bare pure
// functions.
async function loadInitializedApp(options = {}) {
  const { pals, breeding } = loadFixtures();
  const app = loadApp({ ...options, fetchImpl: options.fetchImpl || fixtureFetch(pals, breeding, options) });
  await app.initializeApp();
  return app;
}

module.exports = { loadApp, loadInitializedApp, loadFixtures, fixtureFetch, extractInlineScript, makeElement };
