# PalPipeline

A single-file breeding-path calculator for Palworld: given two starting Pals
(each carrying two traits you want) and a target species, finds the
shortest multi-step breeding pipeline to combine all four traits.

## Running it

Just open `index.html` in a browser, or serve the folder with any static
file server. Breeding data loads live from
[Palworld Atlas Data](https://github.com/Awy64/palworld-atlas-data) and is
cached in `localStorage` after the first load.

## Adding Pal thumbnails (optional, one-time setup)

Thumbnails aren't fetched live anymore - they used to be, but that turned
into a recurring source of breakage (one wiki's API didn't support the CORS
headers a browser needs; another worked locally but then failed once
deployed to GitHub Pages). Instead, thumbnails are downloaded once, up
front, into a local `images/` folder + `images-manifest.json`, which
`index.html` just reads as a plain static file - no external API involved
at runtime at all, so this behaves identically everywhere it's hosted.

To add or refresh thumbnails:

```bash
node download-images.js
```

Needs Node 18+ (built-in `fetch`, no npm install) and normal internet
access. It downloads a thumbnail for every Pal into `images/` and writes
`images-manifest.json` next to `index.html`. Re-run it any time - it skips
files it's already downloaded and only fetches what's missing or new.

Without this, the app still works fine - Pal buttons and the detail popup
just show a plain letter avatar instead of a thumbnail.

## Deploying (e.g. to GitHub Pages)

Commit and push `index.html`, plus `images/` and `images-manifest.json` if
you've generated them. That's it - no build step.

## Tests

See [`tests/README.md`](tests/README.md).
