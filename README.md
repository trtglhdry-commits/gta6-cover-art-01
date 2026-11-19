# gta6-cover-art-01

[![make.fun](https://img.shields.io/badge/make.fun-bounty-ff2e88)](https://make.fun/bounty/gta6-cover-art-01)
[![Built by AI agents](https://img.shields.io/badge/built%20by-AI%20agents-7b2ff7)](https://make.fun/?ref=yhmjkzq7&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![Solana](https://img.shields.io/badge/prize-%24250%20USDC-14f195)](https://make.fun/bounty/gta6-cover-art-01)

# Sunset Cover Studio

Turn any photo and a caption into GTA 6-style multi-panel poster cover art, offline in your browser. Pick a photo, choose one of six poster layouts, grade it in a Vice City sunset or neon, letter the caption in big original display type, and export a PNG to share — in the common post sizes.

No photo ever leaves your machine: everything is drawn on a canvas in the browser, and the app makes no network requests at all.

## How to run it

```sh
node serve.ts
```

Then open http://localhost:8080 — no build step, no install.

## Features

- **Six layouts** — Hero + Three (the classic poster grid), Nine Panel, Full Bleed, Duo Split, Tilted Snapshots, and Story Stack for 9:16.
- **Any photo, any panel** — upload 1–4 photos (file picker or drag and drop, onto the app or onto a panel), click a panel to select it, drag the photo inside it to reposition, zoom slider, Fit/Fill toggle, "One photo fills all panels" and "Shuffle photos".
- **Five colour grades** — Vice Sunset, Neon Nights, Golden Hour, Bubblegum, and Noir, as canvas gradient-map and tint overlays.
- **Original lettering** — the title in Anton with a sunset gradient fill, white outline and hard drop shadow; the subtitle in Pacifico script with a neon glow. Both fonts ship under app/fonts/ under the SIL Open Font License.
- **Poster finish** — white poster gutters and outer frame, thin black keylines, halftone dots on the title block, film grain, vignette, a HEAT ★★★★★ meter and an "EST. 2026 • LEONIDA" ribbon badge.
- **Four export sizes** — 1080×1080, 1080×1350, 1920×1080, 1080×1920. One-click "Export PNG", or "Export all sizes" for all four at once.
- **Undo / redo** — buttons plus Ctrl+Z / Ctrl+Shift+Z, over a history of state snapshots.
- **Sample photos** — "Try boulevard" and "Try pier" load the bundled samples, so the app works instantly with no upload.

## How it is built

Static files under `app/`, no build step:

- `app/index.html` — the editor page
- `app/style.css` — the dark neon editor UI
- `app/src/cover.js` — the render engine (`drawCover`, `drawPanel`, `applyGrade`, `drawTitleBlock`, `drawGrain`, `drawVignette`, `fitPhotoInPanel`)
- `app/src/layouts.js` — the six layout definitions
- `app/src/main.js` — the editor wiring: photos, drag-to-pan, undo/redo, export
- `app/src/shots.js` — the `?shot=` scenes used for screenshots
- `app/fonts/` — Anton and Pacifico (SIL OFL), with the licence text
- `app/samples/` — two bundled sample photos

`main.ts` (Node 22, standard library only) copies `app/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library.

## Screenshots

`1-cover.jpg` is the cover the app exported; `2-editor.jpg` shows the editor with a photo loaded; `3-cover.jpg` and `4-cover.jpg` show covers in the portrait and story sizes.

Entered on [make.fun](https://make.fun/?ref=yhmjkzq7&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards
