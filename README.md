# Fastest Meme in the West

A fast, private, ad-free meme generator. Pick a template, type, share. Everything runs in the browser: no server, no accounts, no analytics. Nothing you type leaves your device.

Specification: [`meme-generator-spec-v0.4.md`](meme-generator-spec-v0.4.md) (Milestone 1; §8.1 covers performance).

Built with Preact, TypeScript and Vite. The production page is small: the grid is prerendered into `index.html` with its CSS inlined, so it paints from a single ~7 KB request, and the JavaScript is about 15 KB gzipped (budget 30 KB).

## Development

```bash
npm install
npm run dev        # dev server, also on your LAN (vite --host)
npm test           # unit tests + manifest/file validation
npm run e2e        # Playwright smoke tests (emulated Pixel 7 + desktop Chrome)
npm run build      # typecheck + production build into dist/ + size budget check
npm run preview    # serve dist/ (also on your LAN)
npm run measure    # build, then time loading on an emulated phone + slow 4G
npm run thumbs     # create missing thumbnails and their AVIF versions
npm run fonts      # regenerate the font subsets from fonts-src/
```

### Size budget and speed

`npm run build` fails if the build goes over its size budget ([`scripts/budget.mjs`](scripts/budget.mjs)): HTML + inline CSS ≤ 14 KB, JS ≤ 30 KB (28.5 KB of code + ~45 bytes per template), template data, font subsets and each AVIF thumbnail. If a change trips it, trim the change, or raise the budget deliberately in that file.

`npm run measure` serves the build gzip-compressed (as GitHub Pages does) and loads it in Chromium as a mid-range phone on slow 4G (150 ms round trip, 1.6 Mbit/s, CPU slowed 4×). It reports first paint, largest paint, when the page is usable, and bytes downloaded, for the grid and for a deep link to a template. Targets are in spec §8.1.

How the page stays small (spec §8.1):
- The template list is validated **at build time** ([`build/templates-plugin.ts`](build/templates-plugin.ts)); an invalid `templates.json` fails the build. The JS carries only what the grid needs; each template's fields and provenance are in a separate JSON file, fetched when needed.
- The grid HTML is prerendered into `index.html` ([`build/prerender-plugin.ts`](build/prerender-plugin.ts)) and the CSS inlined, so it shows before any JS runs. Tiles are plain links.
- The Anton font is split: the masthead's capitals are inlined into the CSS, the editor loads a 13 KB Latin subset, and other characters (Ł, ő, Vietnamese, …) come from a second subset fetched only when a caption needs them.
- Thumbnails are served as AVIF with the JPEG as a fallback.

Locally, Playwright uses `/usr/bin/chromium` if Playwright's own Chromium isn't installed (override with `PW_CHROMIUM_PATH`).

### Testing on a phone

Share and Copy only exist in a **secure context** (HTTPS or `localhost`). Opening the dev server at `http://<your-LAN-IP>:5173` from a phone shows only Download. To test Share and Copy on Android, do one of the following:

- **Port forwarding over USB** (recommended): enable USB debugging, connect the phone, open `chrome://inspect/#devices` in desktop Chrome, and add a port-forwarding rule `5173 → localhost:5173`. Then open `http://localhost:5173` on the phone.
- **Chrome flag:** on the phone, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://<your-LAN-IP>:5173` and relaunch Chrome.

## Adding a template

Templates are hand-edited in [`src/data/templates.json`](src/data/templates.json). Images live in [`public/templates/`](public/templates/).

1. **Prepare the image.**
   - JPEG, PNG or WebP, with its longest edge at most 2048 px; aim for under 500 KB.
   - Strip metadata, e.g. `magick in.jpg -resize 2048x2048\> -strip -quality 85 public/templates/my-template.jpg`.
2. **Make the thumbnails:** after step 3, run `npm run thumbs`. It creates `public/templates/thumbs/my-template.jpg` (longest edge 480 px) if it doesn't exist, and the AVIF version the grid serves. To use your own crop or encoding for the JPEG, create it first (same aspect ratio as the image); `npm run thumbs` never overwrites it. Re-run it whenever an image or thumbnail changes.
3. **Add an entry to `templates.json`:**

   ```json
   {
     "id": "my-template",
     "name": "My Template",
     "image": "templates/my-template.jpg",
     "thumbnail": "templates/thumbs/my-template.jpg",
     "width": 1200,
     "height": 900,
     "provenance": { "source": "https://…", "license": "CC0-1.0", "attribution": null },
     "fields": [
       { "id": "top", "label": "Top caption", "placeholder": "Say something", "box": { "x": 60, "y": 30, "width": 1080, "height": 200 } },
       { "id": "sign", "label": "The sign", "box": { "x": 700, "y": 380, "width": 300, "height": 120, "rotation": -8 },
         "style": { "color": "#111111", "strokeWidth": 0, "uppercase": false } }
     ]
   }
   ```

   - `width`/`height` must be the image's real pixel size.
   - **Boxes are in source-image pixels.** Measure them on the full-size image in any image editor. `rotation` is in degrees, clockwise about the box centre.
   - A field's `style` only lists overrides. Anything not listed comes from `defaults.style` at the top of the file. `strokeWidth` is the visible outline thickness outside the letters.
   - Field order is the order of the inputs.
4. **Record provenance.** Only add images whose licence lets this site redistribute them: CC0/public domain, CC BY with attribution, or written permission. `npm test` warns about any template with `"license": "unknown"`; run `LICENCE_GATE=strict npm test` to make that a failure. Record an unknown licence as `"Unknown"`, never a guess.
5. **Run `npm test`.** It checks the schema, that files exist, that image sizes match the manifest, thumbnail aspect ratios, that every thumbnail has an AVIF version, and that boxes (after rotation) stay inside the image. `npm run dev` and `npm run build` run the same schema checks and stop with the list of problems if the manifest is invalid.

**Never overwrite an image in place.** GitHub Pages caches files for about 10 minutes, so a replaced file could briefly mismatch the manifest. Give the new image a new filename (e.g. `my-template-v2.jpg`) and update the manifest.

## Deployment

`.github/workflows/deploy.yml` runs on pushes to `main`: install → unit tests → build (including the size budget) → Playwright smoke tests → deploy `dist/` to GitHub Pages. In the repository settings, set **Pages → Source** to **GitHub Actions**. Vite uses `base: './'` and hash routing (`#/`, `#/t/<id>`), so the site works under a project subpath with no extra configuration.

## Licences

- Font: [Anton](https://fonts.google.com/specimen/Anton), SIL Open Font License 1.1 (`public/licenses/OFL-Anton.txt`). The subsets in `public/fonts/` and `src/assets/fonts/` are generated from `fonts-src/anton-regular.woff2`.
- Template images: see each template's `provenance` in `src/data/templates.json`. The site has no credits screen (removed in spec v0.4), so a licence that requires visible attribution (e.g. CC BY) needs one added back.
