'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, loadFixtures, fixtureFetch } = require('./harness');

test('local image manifest loading', async (t) => {
  await t.test('loads thumbnails from a local images-manifest.json when present', async () => {
    const { pals, breeding } = loadFixtures();
    const app = loadApp({
      fetchImpl: async (url) => {
        if (url.includes('images-manifest.json')) {
          return { ok: true, json: async () => ({ Lamball: 'images/Lamball.png' }) };
        }
        return fixtureFetch(pals, breeding)(url);
      },
    });

    await app.initializeApp();

    assert.equal(app.PAL_IMAGES.Lamball, 'images/Lamball.png');
  });

  await t.test('a missing manifest (e.g. download-images.js never run) degrades gracefully, not fatally', async () => {
    const { pals, breeding } = loadFixtures();
    const app = loadApp({ fetchImpl: fixtureFetch(pals, breeding) }); // fixtureFetch 404s images-manifest.json

    await app.initializeApp();

    assert.equal(Object.keys(app.PAL_IMAGES).length, 0, 'no images, but not an error - just empty');
    assert.equal(app.PALDEX.length, 288, 'the rest of the app should be fully functional regardless');
  });

  await t.test('does not depend on any external wiki API anymore', async () => {
    const { pals, breeding } = loadFixtures();
    const calledUrls = [];
    const app = loadApp({
      fetchImpl: async (url) => {
        calledUrls.push(url);
        if (url.includes('images-manifest.json')) return { ok: false, status: 404 };
        return fixtureFetch(pals, breeding)(url);
      },
    });

    await app.initializeApp();

    const hitExternalWiki = calledUrls.some((u) => u.includes('fandom.com') || u.includes('wiki.gg'));
    assert.equal(hitExternalWiki, false, 'thumbnails should come entirely from the local manifest, never a live wiki API call');
  });
});
