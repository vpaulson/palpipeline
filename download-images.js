#!/usr/bin/env node
'use strict';
// Run this once (or whenever you want to refresh thumbnails), with normal
// internet access, from the same folder as index.html:
//
//   node download-images.js
//
// It downloads a thumbnail for every Pal into ./images/ and writes
// images-manifest.json (display name -> local file path) alongside
// index.html. index.html then loads that manifest as a plain static file at
// runtime - no external API call, no CORS question, works the same on
// localhost, file://, or GitHub Pages. Needs Node 18+ (built-in fetch), no
// npm install.
//
// Re-run this any time you want to pick up new Pals or refresh a thumbnail
// that didn't resolve the first time.

const fs = require('fs');
const path = require('path');

const ATLAS_ROOT = 'https://awy64.github.io/palworld-atlas-data';
const WIKI_API = 'https://palworld.fandom.com/api.php';
const OUT_DIR = path.join(__dirname, 'images');
const MANIFEST_PATH = path.join(__dirname, 'images-manifest.json');
const CHUNK_SIZE = 50; // MediaWiki API's practical limit per request

function slugify(name) {
  return name.replace(/[^a-zA-Z0-9]+/g, '_');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Same logic as index.html's own (now-removed) runtime fetcher: batches
// page titles, follows normalization/redirect chains to find the real
// thumbnail-bearing page.
async function fetchWikiThumbnailBatch(names) {
  const titles = names.map(encodeURIComponent).join('|');
  const url = `${WIKI_API}?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=400&redirects=1&titles=${titles}`;
  const data = await fetchJson(url);

  const canonical = {};
  (data.query && data.query.normalized || []).forEach((n) => { canonical[n.from] = n.to; });
  (data.query && data.query.redirects || []).forEach((r) => { canonical[r.from] = r.to; });

  const byTitle = {};
  Object.values((data.query && data.query.pages) || {}).forEach((p) => {
    if (p.thumbnail && p.thumbnail.source) byTitle[p.title] = p.thumbnail.source;
  });

  const result = {};
  names.forEach((name) => {
    let t = name;
    if (canonical[t]) t = canonical[t];
    if (canonical[t]) t = canonical[t];
    result[name] = byTitle[t] || null;
  });
  return result;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

// Mirrors index.html's own tribe-based dedup (same tribe = same breeding
// species, e.g. Gumoss's base form and its color-mutation variant) so the
// image set lines up exactly with what the app actually shows.
function dedupeByTribe(records) {
  const byTribe = {};
  for (const p of records) {
    const id = p.tribe || p.id;
    const existing = byTribe[id];
    if (!existing || (existing.rawId.includes('_') && !p.id.includes('_'))) {
      byTribe[id] = { ...p, rawId: p.id };
    }
  }
  return Object.values(byTribe);
}

async function main() {
  console.log('Fetching current Palworld Atlas build info...');
  const pointer = await fetchJson(`${ATLAS_ROOT}/v1/latest.json`);
  const base = `${ATLAS_ROOT}/v1/${pointer.buildPath}`;
  const palsData = await fetchJson(`${base}/pals/index.json`);

  const pals = dedupeByTribe(palsData.records);
  console.log(`Found ${pals.length} Pals (build ${pointer.steamBuildId}). Looking up thumbnails...`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const existingManifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : {};
  const manifest = { ...existingManifest };

  let downloaded = 0, skipped = 0, missing = 0, failed = 0;
  const names = pals.map((p) => p.name);

  for (let i = 0; i < names.length; i += CHUNK_SIZE) {
    const chunk = names.slice(i, i + CHUNK_SIZE);
    console.log(`Batch ${i / CHUNK_SIZE + 1}/${Math.ceil(names.length / CHUNK_SIZE)}...`);
    const batch = await fetchWikiThumbnailBatch(chunk);

    for (const name of chunk) {
      const url = batch[name];
      if (!url) {
        console.log(`  no thumbnail found: ${name}`);
        missing++;
        continue;
      }
      const ext = path.extname(new URL(url).pathname) || '.png';
      const filename = `${slugify(name)}${ext}`;
      const destPath = path.join(OUT_DIR, filename);

      if (fs.existsSync(destPath) && manifest[name] === `images/${filename}`) {
        skipped++;
        continue;
      }
      try {
        await downloadFile(url, destPath);
        manifest[name] = `images/${filename}`;
        downloaded++;
      } catch (err) {
        console.log(`  FAILED to download ${name}: ${err.message}`);
        failed++;
      }
    }
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log('\nDone.');
  console.log(`  Downloaded: ${downloaded}`);
  console.log(`  Already had: ${skipped}`);
  console.log(`  No thumbnail found: ${missing}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total in manifest: ${Object.keys(manifest).length}/${names.length}`);
  console.log(`\nWrote ${MANIFEST_PATH}`);
  console.log('Deploy images/ and images-manifest.json alongside index.html.');
}

main().catch((err) => { console.error(err); process.exit(1); });
