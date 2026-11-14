# Fastest Meme in the West — Product & Technical Specification v0.4

**Status:**
- **Milestone 1** (MVP, built-in templates; §1–§13) is ready for implementation. Behaviours that depend on the device (§3.3 keyboard layout, §6 copy/share) are binding through their acceptance criteria; the suggested techniques may change after testing on real devices.
- **Milestone 2** (user templates; §14) is specified for planning. It starts after M1 ships and does not change M1's manifest schema.

**Platform:** Static web application (mobile-first)
**Hosting:** GitHub Pages
**Principle:** Fast, private, ad-free meme creation with as few interactions as possible.

## 0. Change log

### v0.4

Speed and size. M1 behaviour is unchanged; these are implementation decisions, now binding through the performance budget (§8.1).

| Area | Decision | Section |
|---|---|---|
| UI framework | Preact (with `preact/hooks`) instead of React | §8 |
| Validation | The manifest is validated and resolved **at build time** (a Vite plugin); the browser never runs Zod. An invalid manifest fails the build. | §4.1, §4.3 |
| Template data | A small grid index ships in the JS; the full resolved library is a hashed JSON file fetched when a page needs it | §4.1 |
| First paint | The grid is prerendered into `index.html` and the CSS inlined: the grid paints from one request, before any JS runs. Tiles are real links. | §8.1 |
| Fonts | Anton is subset: an inlined capitals-only face for the masthead, a Latin face for the editor, and an extended face loaded only when a caption needs it | §4.4, §5.1 |
| Thumbnails | AVIF versions (generated) served with the JPEG as fallback | §4.1 |
| Deep links | `index.html` preloads the library, font and template image for `#/t/<id>` | §8.1 |
| Text fitting | Shrink before breaking a word: words are split only if no size keeps them whole | §5.2 |
| Budget | Size budget enforced by `npm run build`; load speed measured with `npm run measure` | §8.1 |
| Credits | The Credits screen is removed; provenance stays in the manifest. The font licence ships as `public/licenses/OFL-Anton.txt`. | §3.6 |
| Crashes | A render error shows an error screen (with a way back), never a blank page | §9 (13) |

### v0.3

| Area | Decision | Section |
|---|---|---|
| User templates | New Milestone 2: users turn their own photos into templates stored on the device (IndexedDB), using layout presets | §14 |
| Template packs | Export/import a `.zip` whose contents use **exactly the built-in library format** (`templates.json` + `templates/…` images), so packs and the repo are interchangeable | §14.2 |
| Shared validator | One `validateManifest` used by CI and by pack import | §4.3, §14.3 |
| Licence gate | `npm test` reports built-in templates whose licence is `"unknown"` (the value user-created templates carry). A warning by default; it fails with `LICENCE_GATE=strict`. | §4.3 |

### v0.2 (changes from v0.1)

| Area | v0.2 decision | Section |
|---|---|---|
| Keyboard vs preview | While a field has focus on touch devices, a compact sticky preview stays visible above the focused field | §3.3 |
| Action bar | In normal page flow and sticky at the bottom; hidden while a text field has focus on touch devices, with a Done button on the focused field to bring it back | §3.3 |
| Share timing | PNG is encoded ahead of time and cached; Share uses the cached `File` synchronously inside the tap handler | §6.1 |
| Font | Logical family `MemeFont`, bundled Anton (SIL OFL 1.1), loaded explicitly with `document.fonts.load` | §4.4, §5.1 |
| State after share | Current template and captions are saved in `sessionStorage` and restored after the tab is discarded | §3.4 |
| Routing | Hash routing (`#/`, `#/t/<id>`); Vite `base: './'` | §3.5, §8 |
| Text fitting | Accounts for outline and font metrics; measurer injected for tests; grapheme-safe word breaking | §5.2 |
| Inputs | `<textarea>` with a per-field `maxLength` | §3.3, §4.2 |
| Schema | Manifest-level `defaults.style` (one shallow merge); stricter validation; image-size cap; dimensions checked in CI | §4 |
| Provenance | Required `provenance` per template | §4.2, §3.6 |
| Rotation | Optional `box.rotation` in degrees | §4.2, §5.3 |
| Thumbnails | Required from the start | §4.2 |
| Export order | Primary action depends on the device's capabilities | §6.2 |
| Accessibility | Canvas label, focus management, live region | §3.7 |
| Naming | Repo is `fastest-meme-in-the-west` | §7 |

## 1. Product intent

Create a simple meme generator using a small, hand-curated library of image templates. A template is a source image plus declarative metadata for its text regions. Users choose a template, type into its predefined fields, watch a live preview, and export the composed image.

The application runs entirely in the browser: no accounts, no server, no uploads, no ads or tracking. More than 90% of expected use is on mobile, so touch ergonomics, screen space and integration with the share sheet matter more than flexible editing on desktop.

## 2. MVP scope

### Included

- Browse a curated set of templates in a thumbnail grid; select one to edit.
- Each template defines an image plus any number of named, ordered text regions.
- One multi-line input per region, with a human-readable label and an optional placeholder.
- Live preview that updates as text changes, without a separate render button.
- Text placement, colour, font, size, alignment, outline, rotation and wrapping all come from template metadata. Users get no typography controls.
- Export a full-resolution PNG containing the base image and the rendered text.
- Actions: **Share image** (where supported), **Copy image** (where supported), **Download PNG**.
- Works in mobile browsers, with a usable desktop layout.
- Clear loading and error states when a template cannot be loaded or an export fails.
- No external service required at runtime except GitHub Pages' static asset hosting.

### Explicitly excluded from v0.1

- User image uploads (planned for Milestone 2, §14) or arbitrary image URLs (not planned).
- Dragging or resizing text regions; custom positioning or font controls.
- Image editing, filters, stickers, effects, or video/GIF memes.
- Template creation (user templates are Milestone 2, §14) or an admin UI (not planned).
- Cloud sync, accounts, history, social features, server storage or analytics.
- Persistent drafts across sessions. (The single-session restore in §3.4 is in scope.)
- Saving straight into the iOS/Android photo library. Use the native share and save flows instead.
- Offline use or PWA installation.
- JPEG/WebP export (see §6.4).

## 3. User experience

### 3.1 Primary user journey

1. Open the site and see the template library immediately.
2. Tap a thumbnail.
3. See a large preview of the image above its text fields.
4. Type into the fields; the preview updates immediately and stays visible while typing.
5. Tap **Share**, **Copy** or **Download**.
6. Return to template selection (header back button or system back) and repeat.

### 3.2 Layout

- **Mobile (< 900 CSS px wide):** a single column with a compact header containing a back button and the template name, the preview (aspect ratio preserved, never cropped), fields stacked vertically, then the action bar. The page scrolls normally for tall images and many fields.
- **Desktop (≥ 900 CSS px):** preview on the left; fields and actions on the right.
- Use `viewport-fit=cover` and `env(safe-area-inset-*)` padding. Do not set `maximum-scale` or `user-scalable=no`.
- Primary touch targets are at least 44 CSS px high.
- Textarea font size is at least 16 CSS px, so iOS does not zoom on focus.

### 3.3 Editing on touch devices (keyboard behaviour)

The software keyboard takes up roughly half the screen. Being able to see the preview while typing is the core feature, so it is a hard requirement.

**Required behaviour.** On a touch device (`(pointer: coarse)`), when any caption field has focus:

1. The editor enters **compact mode**. The preview container becomes `position: sticky; top: 0` with a maximum height of `30svh`. The canvas shrinks to fit inside that box and keeps its aspect ratio; `svh` does not change when the keyboard opens.
2. The action bar is hidden (`display: none`). This avoids the iOS Safari problem where a fixed or sticky bottom bar jumps or sits under the keyboard.
3. When a field gains focus, and again on the next `visualViewport` `resize` event (the keyboard has settled), scroll so that the preview's top meets the top of the visual viewport and the focused field sits directly below it. Fields are in normal flow directly beneath the preview.

4. The focused field shows a **Done** button at the end of its label row, which stays on screen between the preview and the keyboard. Back gestures and tapping the preview aren't discoverable on a first visit (found in testing), so Done is the visible way back to the actions. Pressing it must not move focus (`preventDefault` on `pointerdown`); its click blurs the field.

The editor leaves compact mode when focus leaves all caption fields (Done, keyboard dismissed, the preview tapped, or Android back). Tapping the preview blurs the active field. Detect entering and leaving with `focusin`/`focusout` on the field container. Use `focusout` with a `relatedTarget` check so that moving between fields does not cause flicker.

**Outside compact mode** the action bar is `position: sticky; bottom: 0` inside the editor column, with safe-area bottom padding.

**Acceptance:** on Chrome Android and iOS Safari, for a template with four fields, while typing in any field, the whole compact preview and the focused field are both visible above the keyboard (§9, criterion 10).

**Fields:**

- `<textarea rows="1">` that grows with its content up to 4 rows, then scrolls. Newlines are allowed.
- `maxlength` comes from the field's resolved `maxLength` (§4.2).
- `autocomplete="off"`, `enterkeyhint="enter"`.
- A visible `<label>` from `field.label`. The `placeholder` appears only in the input; it is never rendered onto the image.
- When a field's text was truncated during fitting (§5.2), show a short note under that field: "Too long — text was shortened." It does not block anything.

**Autofocus:** on `(pointer: fine)` devices, focus the first field when the editor opens. On touch devices, do not autofocus: the user sees the whole template first, and iOS often won't open the keyboard for focus set after a navigation anyway.

### 3.4 Caption state

- Selecting a different template starts with empty fields.
- Re-opening the most recently edited template in the same tab session restores its captions. This covers accidental back navigation and briefly switching apps.
- Store `{ templateId, values: Record<fieldId, string> }` under the `sessionStorage` key `fmitw:draft`, written on every change. On opening `#/t/<id>`:
  - if the stored `templateId` matches, restore the values for field ids that still exist;
  - otherwise, start empty and overwrite the stored draft as soon as the user types.
- Purpose: Chrome on Android often discards a background tab while the user is in the share target app. When they return, the URL hash plus this entry rebuild the editor exactly.
- Wrap every `sessionStorage` access in `try/catch`. If storage is unavailable, the app still works, just without restore.
- Captions are never put in the URL, `localStorage` or any network request.

### 3.5 Navigation

- Routes: `#/` (grid), `#/t/<template-id>` (editor). An unknown route or template id shows "Template not found" with a link back to the grid.
- Opening a template sets `location.hash`, which creates a history entry, so system back (including Android's back button) returns to the grid.
- The header back button calls `history.back()` if the app navigated to the editor itself (tracked in memory). Otherwise, for example after opening a deep link or restoring a discarded tab, it calls `location.replace('#/')`, so back never leaves the site unexpectedly.
- When returning to the grid, restore its scroll position and focus the thumbnail of the template just left.

### 3.6 Credits

Removed in v0.4. No built-in image currently needs on-screen attribution, and the SIL OFL is satisfied by shipping its text with the font (`public/licenses/OFL-Anton.txt`). Provenance is still recorded per template (§4.2). If an image with an attribution licence (such as CC BY) is added, bring back a screen that shows it.

### 3.7 Accessibility

- Thumbnails are links (`<a href="#/t/<id>">`) whose accessible name is the template name (`<img alt="">` inside the link, followed by the name).
- The preview canvas has `role="img"` and an `aria-label` of `"<template name>: <non-empty captions joined with ' / '>"`, updated after typing stops for 500 ms.
- On entering the editor with assistive technology, move focus to the editor heading (`tabindex="-1"`). Autofocus on fine pointers (§3.3) takes precedence on desktop.
- Status messages (Copied, Saved, export errors, truncation notes) go to a single `aria-live="polite"` region.
- Interactive elements meet WCAG AA contrast and have visible focus outlines.

### 3.8 Interaction defaults

- Empty or whitespace-only fields render nothing.
- Exports are disabled only while the image or font is loading, or if rendering failed. Exporting a template with no captions is valid.

## 4. Template format

### 4.1 Files and URLs

- The manifest is `src/data/templates.json`. It is never shipped as written: the build validates it and resolves every field's style (`build/templates-plugin.ts`, module `virtual:templates`), then ships two parts:
  - a small **grid index** (id, name, thumbnail, size) inside the JS bundle;
  - the **full resolved library** (fields, styles, provenance) as a hashed JSON file, fetched when the editor needs it, preloaded on deep links and warmed once the grid is idle.
- Template images and thumbnails live under `public/templates/`.
- Each thumbnail also has an **AVIF version** next to it (same name, `.avif`; same pixel size), generated by `npm run thumbs` (which also creates any missing JPEG thumbnail). The grid serves it through `<picture>` with the JPEG as the fallback. The manifest only names the JPEG.
- Asset paths in the manifest are **relative** (no leading `/`, no scheme), resolved against `import.meta.env.BASE_URL`. With `base: './'` (§8) they resolve correctly under `username.github.io/repo/` and at a root domain.
- **Never overwrite an image in place.** GitHub Pages caches assets for about 10 minutes, so an old cached image could briefly mismatch a new manifest. To replace an image, give the new file a new name (for example `drake-v2.jpg`) and update the manifest.

### 4.2 Schema

All positions and sizes are in **source-image pixels**. The canvas is created at the image's natural size; the preview is scaled with CSS only.

```json
{
  "version": 1,
  "defaults": {
    "maxLength": 200,
    "style": {
      "fontFamily": "MemeFont",
      "fontSize": 72,
      "minFontSize": 28,
      "fontWeight": 400,
      "color": "#FFFFFF",
      "strokeColor": "#000000",
      "strokeWidth": 4,
      "align": "center",
      "verticalAlign": "middle",
      "uppercase": true,
      "maxLines": 2,
      "lineHeight": 1.05
    }
  },
  "templates": [
    {
      "id": "two-panel-example",
      "name": "Two Panel Example",
      "image": "templates/two-panel-example.jpg",
      "thumbnail": "templates/thumbs/two-panel-example.jpg",
      "width": 1200,
      "height": 900,
      "provenance": {
        "source": "https://example.org/original-photo",
        "license": "CC0-1.0",
        "attribution": null
      },
      "fields": [
        {
          "id": "top",
          "label": "Top caption",
          "placeholder": "First thought",
          "box": { "x": 80, "y": 40, "width": 1040, "height": 160 }
        },
        {
          "id": "bottom",
          "label": "Bottom caption",
          "placeholder": "Second thought",
          "box": { "x": 80, "y": 700, "width": 1040, "height": 160 }
        },
        {
          "id": "sign",
          "label": "Sign text",
          "box": { "x": 700, "y": 380, "width": 300, "height": 120, "rotation": -8 },
          "maxLength": 60,
          "style": {
            "color": "#111111",
            "strokeWidth": 0,
            "uppercase": false,
            "maxLines": 3,
            "fontSize": 48,
            "minFontSize": 20
          }
        }
      ]
    }
  ]
}
```

**Fields:**

| Key | Required | Notes |
|---|---|---|
| `version` | yes | Must be `1`. Allows future format migrations. |
| `defaults.style` | yes | A complete style object; every style key must be present. |
| `defaults.maxLength` | yes | Integer, 1–500. |
| `template.id` | yes | Unique; lowercase `a-z0-9-`; used in URLs and export filenames. |
| `template.name` | yes | Display name. |
| `template.image` | yes | Relative path; `.jpg`, `.jpeg`, `.png` or `.webp`. |
| `template.thumbnail` | yes | Relative path; longest edge ≤ 480 px; same aspect ratio as `image` (±1%). |
| `template.width` / `height` | yes | Must equal the image's natural size. Longest edge ≤ 2048. |
| `template.provenance` | yes | `source` (URL or free text), `license` (SPDX id or short text, e.g. `"Permission granted by owner 2026-11-01"`), `attribution` (string or `null`). |
| `template.fields` | yes | At least one item. Order is the input order. |
| `field.id` | yes | Unique within its template; `a-z0-9-`. |
| `field.label` | yes | Visible label. |
| `field.placeholder` | no | Input hint only; never rendered. |
| `field.box` | yes | `x`, `y` ≥ 0; `width`, `height` > 0; optional `rotation` in degrees, −180 to 180, default 0, clockwise about the box centre. |
| `field.maxLength` | no | Overrides `defaults.maxLength`; 1–500. |
| `field.style` | no | Partial style; **shallow-merged** over `defaults.style`. There is no other cascade. |

**Style keys** (all required after merging):

| Key | Constraint | Meaning |
|---|---|---|
| `fontFamily` | one of the bundled logical families (v0.1: `"MemeFont"` only) | |
| `fontSize` | integer > 0, source px | Starting (maximum) size. |
| `minFontSize` | integer, 1 ≤ `minFontSize` ≤ `fontSize` | Smallest size before truncating. |
| `fontWeight` | 100–900, multiple of 100 | Must match a bundled face (v0.1: 400). |
| `color`, `strokeColor` | `#RGB` or `#RRGGBB` | |
| `strokeWidth` | number ≥ 0, source px | **Visible outline thickness outside the glyph.** 0 means no outline. |
| `align` | `left` / `center` / `right` | |
| `verticalAlign` | `top` / `middle` / `bottom` | |
| `uppercase` | boolean | Uses `String.prototype.toUpperCase()`, which does not depend on locale, so the result is deterministic. |
| `maxLines` | integer ≥ 1 | |
| `lineHeight` | number, 0.8–2.0 | Multiplier of the font size. |

### 4.3 Validation

**Rules (Zod, `src/lib/schema.ts`):**

- Every constraint in the tables above.
- Template ids are unique; field ids are unique within each template.
- Every corner of each field's box, after rotation, lies inside `[0, width] × [0, height]`.
- After merging, `minFontSize ≤ fontSize` and `fontFamily` is a bundled family.

**Shared validator.** Put the rules in one function in `src/lib/manifest.ts`:

```ts
validateManifest(json: unknown, files: { size(path: string): Promise<{ width: number; height: number } | null> })
```

It runs the Zod schema, then the file checks: every `image` and `thumbnail` exists, each image's real size equals `width`/`height` and is within the 2048 px cap, and each thumbnail matches its image's aspect ratio. It returns either the parsed manifest or a list of `{ path, message }` issues.

- In M1, CI calls it with a file reader backed by `image-size` and `public/`.
- In M2, pack import calls the same function with a reader backed by the zip contents (§14.3).

The rules therefore cannot drift apart.

**When validation runs:**

1. **CI (blocking):** `tests/manifest.test.ts` calls `validateManifest` on the real manifest. It also applies one rule for built-ins only: the **licence gate** lists templates whose `provenance.license` is `"unknown"` (see §4.5, §14.2). By default this is a warning; with `LICENCE_GATE=strict` it fails the tests. Deploy runs only if tests pass.
2. **At build time:** the build parses the manifest with the same schema and cross-checks, and fails, listing each issue's path and message, if it is invalid. In development the same message appears in Vite's error overlay. The browser therefore never sees an invalid manifest and doesn't ship the validator.
3. **When an image loads:** if the decoded natural size differs from `width`/`height`, show an error for that template only ("This template's image doesn't match its settings — try reloading"). The grid and other templates keep working.

Image size guideline: under 500 KB per image and under 60 KB per JPEG thumbnail. AVIF thumbnails are held to the size budget (§8.1).

### 4.4 Fonts

- The logical family `MemeFont` maps to **Anton Regular** (SIL Open Font License 1.1). It is a condensed bold sans in the same style as Impact. Impact itself is not redistributable.
- The source file is `fonts-src/anton-regular.woff2`. `npm run fonts` (`scripts/build-fonts.mjs`) cuts three subsets from it, without hinting:
  - `src/assets/fonts/anton-title.woff2`: only the masthead's capitals (family `MemeTitle`). It is small enough that Vite inlines it into the CSS as a data URI, so the title paints with no font request.
  - `public/fonts/anton-latin.woff2`: Basic Latin, Latin-1 and common punctuation (`src/lib/fontRanges.ts`).
  - `public/fonts/anton-ext.woff2`: every other character Anton has.
- `MemeFont` is registered from JS (`registerMemeFont`) as two `FontFace`s with complementary `unicode-range`s and `display: 'block'`. Registering downloads nothing. The browser fetches a subset only when page text needs it; the canvas loads the Latin subset explicitly (§5.1), and the extended one when a caption contains characters outside the Latin subset.
- The grid doesn't need `MemeFont`: it is fetched after the page has loaded and gone idle, or when a tile is pressed, or from `<head>` on a deep link.
- Do **not** name the family `Impact` or any other system font name. A load failure must not silently fall back to a similar-looking local font.
- Copy the OFL text to `public/licenses/OFL-Anton.txt`, deployed alongside the font.
- During implementation, check that the bundled file contains U+2026 (…). If not, the ellipsis in §5.2 is `"..."`.
- Emoji and characters the font doesn't have fall back to system fonts, so exports containing them can differ slightly between devices. This is accepted.

### 4.5 Licensing policy

Prefer templates whose `provenance.license` lets this site redistribute the image: public domain/CC0, CC BY (with attribution), or written permission from the rights holder. Record the permission in `provenance`.

As of v0.4 the library knowingly includes classic meme images (film and TV stills, photos) whose licence is recorded as `"Unknown"`, by the owner's decision. They must stay recorded as unknown, not given an invented licence. The licence gate warns about them; set `LICENCE_GATE=strict` to enforce the policy above. An image with an attribution licence (such as CC BY) also needs an on-screen credit, and there is no credits screen at the moment (§3.6).

This policy covers only the built-in library, which this site redistributes. User templates (M2) stay on the user's device and are never redistributed by the site. If a user template is promoted to the built-in library (§14.2), it should meet this policy first; `LICENCE_GATE=strict` checks that.

## 5. Rendering specification

Use the browser's native Canvas 2D API, not Fabric.js or Konva.

### 5.1 Pipeline

1. **Font (once per app load):** load the Latin subset's `FontFace` explicitly (§4.4); a rejection is a font-load error. Do not rely on `document.fonts.ready`: a font used only by the canvas is never requested, so `ready` can resolve without it. When a caption contains characters outside the Latin subset, load the extended face and redraw once it arrives (until then those characters use a fallback font). Then measure the vertical metrics once: `ascentRatio` and `descentRatio` = `fontBoundingBoxAscent` / `fontBoundingBoxDescent` of `measureText('Hg')` at 100 px, divided by 100.
2. **Image (once per template open):** load with `new Image()`, `decoding = 'async'`, `await img.decode()`, shared per URL so an early warm-up (deep link, tile press) and the editor's load are one download. Check the natural size (§4.3). Errors appear in the editor with a Retry button.
3. **Canvas:** create one canvas at the image's natural size, owned outside component render (a ref in `MemePreview`).
4. **Each render:**
   - clear, then `drawImage` the full image;
   - for every field with non-empty text, transform it (`uppercase`), lay it out (§5.2) and draw it (§5.3).
5. **Preview:** the same canvas, scaled with CSS only. No DOM text overlays.
6. **Export:** encode the same canvas to an `image/png` Blob (§6.1).

**Scheduling:**

- Field values live in component state.
- A change schedules a single `requestAnimationFrame` render. Several changes within one frame are combined into one render.
- Every render increments a `revision` counter, which the export cache in §6.1 uses.
- Never re-decode the image or reload the font on a keystroke.

### 5.2 Text layout and fitting (`src/lib/layoutText.ts`)

A pure function with no DOM access:

```ts
type Measurer = {
  width(text: string, fontSize: number): number; // advance width in source px
  ascentRatio: number;   // ascent / fontSize
  descentRatio: number;  // descent / fontSize
};

type Layout = {
  fontSize: number;
  lines: { text: string; x: number; y: number; width: number }[]; // x/y = box-local, baseline-left
  truncated: boolean;
};

function layoutText(text: string, style: ResolvedStyle, box: { width: number; height: number }, m: Measurer): Layout;
```

In the app, `Measurer.width` wraps `ctx.measureText` with `ctx.font` set to `${weight} ${size}px "MemeFont", sans-serif`. Tests inject a fake measurer, for example one with a fixed width per character.

**Algorithm:**

1. **Content area:** inset the box by `strokeWidth` on every side. `availW = box.width − 2·strokeWidth`, `availH = box.height − 2·strokeWidth`. If either is ≤ 0, nothing is drawn and `truncated = true`.
2. **Paragraphs:** split on `\n`. Blank paragraphs are kept as empty lines. Text that is empty after trimming draws nothing (`lines: []`).
3. **Wrapping at size `s`:** in each paragraph, split words on runs of whitespace other than newlines, and greedily fill lines up to `availW`. A word wider than `availW` on its own is broken at **grapheme boundaries** (`Intl.Segmenter` with `granularity: 'grapheme'`), so emoji sequences and accented characters are never split — but only as a last resort (see step 5).
4. **Fit test at size `s`:** the wrapped line count `n` is ≤ `maxLines`, and the block height `(n − 1)·s·lineHeight + s·(ascentRatio + descentRatio)` is ≤ `availH`.
5. **Size search:** try integer sizes from `fontSize` down to `minFontSize` in steps of 1 px and use the first that fits. The scan runs twice: first with word breaking disabled (a size at which any word is wider than `availW` does not fit), so text shrinks to keep words whole; only if no size fits that way is it repeated with word breaking allowed. A linear scan is used rather than binary search because wrapped fit is not strictly monotonic in size. With `maxLength` ≤ 500 the cost is negligible.
6. **Overflow:** if nothing fits, use `minFontSize`:
   - keep as many leading lines as satisfy both `maxLines` and `availH`;
   - drop the rest;
   - on the last kept line, remove trailing graphemes (then trailing whitespace) until `line + "…"` fits `availW`, then append `"…"`;
   - set `truncated = true`;
   - if not even one line fits vertically, draw nothing and set `truncated = true`.
7. **Placement:**
   - **Horizontal:** `x` is `0`, `(availW − w)/2` or `availW − w` for left, centre or right.
   - **Vertical:** the block starts at the top, middle or bottom of `availH`. The first baseline is at `blockTop + s·ascentRatio`, and each following line is `s·lineHeight` lower.
   - Coordinates are offset by `strokeWidth`, so they are relative to the unrotated box's top-left corner.

**Required unit tests (`tests/layoutText.test.ts`):**

- Every line's ink box, extended by `strokeWidth`, lies inside the box. Test this with short, long, many-word, single-long-word, multi-newline, emoji/ZWJ and accented-character input.
- Explicit newlines are honoured, and blank lines are kept.
- Results are deterministic: the same input gives the same output.
- Size steps down before truncating.
- Truncation sets the flag, appends an ellipsis and respects `maxLines`.
- Whitespace-only input produces no lines.
- A grapheme cluster is never split.

### 5.3 Drawing (`src/lib/renderMeme.ts`)

For each laid-out field:

```
ctx.save()
ctx.translate(box.x + box.width / 2, box.y + box.height / 2)
ctx.rotate(rotation * Math.PI / 180)
ctx.translate(-box.width / 2, -box.height / 2)
ctx.font = `${fontWeight} ${fontSize}px "MemeFont", sans-serif`
ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
if strokeWidth > 0:
  ctx.lineJoin = 'round'; ctx.miterLimit = 2
  ctx.lineWidth = strokeWidth * 2; ctx.strokeStyle = strokeColor
  strokeText each line at (x, y)
ctx.fillStyle = color; fillText each line at (x, y)
ctx.restore()
```

The stroke is drawn first, at twice the width, and the fill goes on top. The visible outline is therefore exactly `strokeWidth` outside the glyph, which matches the inset in §5.2. Emoji get outlined as well; this is accepted.

`renderMeme` returns `{ truncatedFieldIds: string[] }`, which drives the per-field notes in §3.3.

## 6. Export behaviour

### 6.1 PNG encoding and cache (`src/lib/exportMeme.ts`)

**Encoding.** Use `canvas.toBlob(cb, 'image/png')`, wrapped in a Promise.

**Cache.** Keep the encoded image in a cache: `{ revision, blob, file }`, where `file = new File([blob], `${template.id}.png`, { type: 'image/png' })`.

**When to encode:**

- after a render, once the user has stopped typing for **250 ms**;
- **immediately** when focus leaves the caption fields;
- immediately after the first render of a template.

**Freshness.** The cache is fresh when `cache.revision === current revision`.

**Why.** `navigator.share()` needs a real `File` while the user's tap still counts as user activation. Encoding a photo-sized PNG can take more than 100 ms on mid-range phones, and Safari is strict about that time limit. Never `await` encoding inside the Share click handler.

### 6.2 Actions and capability detection (`src/lib/capabilities.ts`)

Detect support once at startup:

- **Share:** `navigator.canShare?.({ files: [new File([new Blob()], 'probe.png', { type: 'image/png' })] }) === true`.
- **Copy:** `typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write`. Also require `ClipboardItem.supports('image/png')` where `ClipboardItem.supports` exists.
- **Download:** always available.

An action that isn't supported is **hidden**, not disabled.

**Button order:** the first supported action from Share → Copy → Download is the **primary** (filled) button; the others are secondary. On a typical device this gives:

- Android/iOS: Share primary.
- Desktop Chromium/Safari: Copy primary (Share may also appear).
- Firefox desktop: Copy or Download primary.

| Action | Implementation | Failure handling |
|---|---|---|
| Share | In the click handler, synchronously: if the cache is fresh, `navigator.share({ files: [cache.file] })` with **no `title` or `text`** (some Android targets drop the file when text is present). If the cache is stale, the button shows "Preparing…" and is briefly disabled. Encoding is normally finished before the tap, because blurring a field triggers it. | `AbortError` (user cancelled): no message. Other errors: "Couldn't open sharing — try Download." |
| Copy | In the click handler, synchronously: `navigator.clipboard.write([new ClipboardItem({ 'image/png': fresh ? cache.blob : encodePromise })])`. Passing a Promise is valid here, and Safari requires it. | Success: "Copied". If it fails with `NotAllowedError` even though the tap was active and the page had focus, the browser refuses image copies outright. This was seen on Firefox for Android: it reports support and a granted permission, then refuses every image write, even 1×1. Chrome for Android copies images fine. In that case, hide Copy, say "This browser doesn't allow copying images. Use Share instead.", and remember this in `localStorage` for the current user-agent string, so Copy is tried again after a browser update. Any other failure: "Couldn't copy the image — use Share or Download instead." Never fall back to copying text only. |
| Download | Create an object URL, click a temporary `<a download="<template-id>.png">`, and revoke the URL after 10 s (revoking straight away breaks some browsers). | On iOS (detected via `navigator.maxTouchPoints > 1` plus Safari, or a platform heuristic), show this once per session after the first download: "Saved to the Files app. To save to Photos, use Share → Save Image." |

### 6.3 Platform limits

A static web app cannot save straight into the iOS or Android photo library in one tap. v0.1 relies on the native share sheet (which includes Save Image on iOS) or the browser's save flow. Clipboard and share support vary by browser, so every path needs testing on real devices.

### 6.4 Format

PNG keeps the outline edges crisp, but PNGs of photographic templates are 1–3 MB, about 3–5 times the size of a JPEG. Messaging apps usually recompress anyway. This is accepted for v0.1. A JPEG/WebP option is deferred (§11).

## 7. Repo layout

```text
fastest-meme-in-the-west/
  .github/workflows/deploy.yml
  public/
    templates/
      two-panel-example.jpg
      thumbs/
        two-panel-example.jpg
    licenses/
      OFL-Anton.txt
    fonts/
      anton-latin.woff2  # generated by npm run fonts (§4.4)
      anton-ext.woff2
  fonts-src/
    anton-regular.woff2  # source for the subsets
  build/
    templates-plugin.ts  # build-time validation; virtual:templates (§4.1, §4.3)
    prerender-plugin.ts  # grid HTML into index.html (§8.1)
    inline-css-plugin.ts # CSS into index.html (§8.1)
  scripts/
    build-fonts.mjs      # npm run fonts
    build-thumbs.mjs     # npm run thumbs
    budget.mjs           # size budget, run by npm run build (§8.1)
    measure.mjs          # npm run measure (§8.1)
  src/
    assets/
      fonts/
        anton-title.woff2  # masthead capitals, inlined into the CSS
    components/
      TemplateGrid.tsx
      MemeEditor.tsx
      MemePreview.tsx
      CaptionField.tsx
      ExportActions.tsx
      ErrorScreen.tsx
      TopBar.tsx
    data/
      templates.json
    lib/
      schema.ts        # Zod schema, style merge, resolved types (build and tests only)
      library.ts       # grid index + lazy library fetch (§4.1)
      manifest.ts      # validateManifest: schema + file checks (§4.3)
      assets.ts        # BASE_URL-aware path resolution
      router.ts        # hash routing, in-app navigation tracking
      draft.ts         # sessionStorage draft (§3.4)
      fonts.ts         # font registration, load + metrics (§4.4, §5.1)
      fontRanges.ts    # how the font is subset
      layoutText.ts    # pure layout/fitting (§5.2)
      renderMeme.ts    # canvas drawing (§5.3)
      exportMeme.ts    # encode cache, share/copy/download (§6)
      capabilities.ts  # feature detection (§6.2)
    App.tsx
    main.tsx           # hydrates the prerendered grid, or renders fresh
    prerender.tsx      # build-time render of the grid
    styles.css
  tests/
    layoutText.test.ts
    schema.test.ts     # schema rules with synthetic manifests
    manifest.test.ts   # real manifest + files on disk (§4.3), AVIF thumbnails
    templates-plugin.test.ts  # build-time validation
  e2e/
    smoke.spec.ts
  index.html
  vite.config.ts
  playwright.config.ts
  package.json
  README.md
```

## 8. Tech stack and deployment

- Preact (`preact`, `preact/hooks`) + TypeScript for the editor and template browsing. Text inputs use `onInput`; focus handling on containers uses `onFocusIn`/`onFocusOut` (Preact's `onFocus`/`onBlur` don't bubble).
- Vite for builds and local development, with **`base: './'`**. Hash routing means the app never needs server-side path rewrites, so relative asset URLs work under any subpath. Do not hard-code `/` as an asset prefix anywhere.
- Plain CSS for a simple responsive UI. No component library.
- Native Canvas 2D for all drawing and export.
- Zod for manifest validation at build time and in CI (§4.3), as a development dependency only. M2 pack import will load it lazily (a dynamic import on the import screen), so it never weighs on the grid or editor.
- Development-only tools: `image-size` (CI manifest check), `sharp` (`npm run thumbs`), `subset-font` (`npm run fonts`), `preact-render-to-string` (prerendering).
- Vitest for unit tests. Playwright (Chromium) for smoke tests: grid renders, a template opens, typing changes canvas pixels, Download produces a PNG of the correct size, back returns to the grid.
- GitHub Actions on push to `main`: `npm ci` → `npm test` → `npm run build` → Playwright smoke against `vite preview` → `actions/upload-pages-artifact` (`dist`) → `actions/deploy-pages`. Set the repository's Pages source to "GitHub Actions".
- `index.html` viewport: `width=device-width, initial-scale=1, viewport-fit=cover`.
- No backend endpoints, service worker, analytics SDK, third-party runtime APIs or remote fonts.

### 8.1 Performance budget

The page must load fast on a mid-range phone on a slow mobile connection.

**How it's built for speed:**
- The grid is **prerendered** into `index.html` at build time (`build/prerender-plugin.ts`, a separate SSR build), and the CSS is **inlined** (`build/inline-css-plugin.ts`). The grid paints from the first response, before any JS runs. `main.tsx` then hydrates it, or renders fresh for any other route.
- Tiles are real `<a href="#/…">` links, so they work before the JS has loaded.
- On a deep link (`#/t/…`), a small inline script in `<head>` hides the prerendered grid until the app has rendered, and preloads the library JSON, the Latin font subset and the template's image (the build fills in the URLs).
- Thumbnails are AVIF with a JPEG fallback, all `loading="lazy"` (so the hidden grid fetches nothing on a deep link) with `fetchpriority="high"` on the first row.
- One JS file; no module-preload helper.

**Targets** (Lighthouse's mobile profile: 150 ms RTT, 1.6 Mbit/s down, 4× CPU slowdown; cold cache; median of runs; gzip as served):

| | Target |
|---|---|
| HTML + inline CSS (everything for the grid's first paint) | ≤ 14 KB, one request |
| JavaScript | ≤ 30 KB (28.5 KB of code + about 45 bytes per template for the grid index). The M1 build is about 15 KB; the headroom is for M2. |
| Grid: first paint / usable (on-screen thumbnails loaded) | ≤ 500 ms / ≤ 1200 ms |
| Grid: downloaded by the time it's idle | ≤ 200 KB |
| Deep link to a template: canvas drawn | ≤ 1200 ms |
| Caption font downloaded by the editor | ≤ 25 KB, not before the grid has loaded |

**Enforcement:**
- `npm run build` ends with `scripts/budget.mjs`, which fails the build when a file group is over its size budget (HTML, JS, library data, font subsets, each AVIF thumbnail). Budgets that grow with the library (JS index, library data) scale with the template count, so adding templates never fails the build; growing the code does.
- `npm run measure` builds, serves `dist/` gzip-compressed and reports first paint, largest paint, readiness and bytes for the grid and a deep link under the profile above. Timing varies between machines, so it is a manual check, not part of CI.
- Playwright checks the behaviour the speed depends on: the grid works without JavaScript, deep links don't flash the grid and fetch each asset once, the grid doesn't fetch the caption font before load, and the extended font subset is fetched only when needed.

## 9. Acceptance criteria

1. The site loads from a GitHub Pages subpath with all assets, including the font, resolving correctly.
2. The template grid shows at least three templates with different aspect ratios and layouts, using bundled thumbnails. At least one has a rotated field.
3. Selecting a template shows the correct number of text inputs, in manifest order.
4. Text changes appear in the preview within one frame; empty inputs render no text.
5. Text stays inside its box (after rotation, including the outline) at expected sizes and with long text. Truncated fields show the note.
6. The preview and the exported PNG have the same composition, at the image's original resolution.
7. PNG download works in desktop Chromium and Chrome for Android.
8. Copy succeeds where supported, or gives a clear message pointing to Share/Download.
9. Share opens the native share sheet where file sharing is supported. On iOS Safari, the sheet offers **Save Image** and the saved photo is the full-resolution meme.
10. On Chrome Android and iOS Safari in portrait, while typing in any field of a four-field template, the compact preview and the focused field are both visible above the keyboard, and the action bar does not cover or jump over inputs.
11. System back from the editor returns to the grid. The header back button never leaves the site.
12. After sharing to another app and coming back (including after the tab was discarded on Android), the same template and captions are shown.
13. An invalid manifest, a missing image, a size mismatch or a font failure produces an understandable error, never a blank screen. An invalid manifest fails CI.
14. Every template records its provenance, and the font licence ships with the site.
15. The app does not depend on a running backend or an account, and user-entered text is never sent anywhere or put in the URL.

**Manual test matrix on real devices:** Chrome Android (primary), Firefox Android (secondary: it cannot copy images, see §6.2), Safari iOS, desktop Chromium, desktop Safari. Playwright covers smoke tests. Check clipboard, native sharing, downloads, keyboard behaviour, tab-discard restore and saving to Photos by hand, because they depend on OS and browser permissions and UI. To force a tab discard on Android, use `chrome://discards` or open several heavy apps.

## 10. Build sequence

1. Scaffold Vite + Preact + TypeScript with `base: './'`, hash router, CI workflow and deploy to Pages (empty shell).
2. Schema, style merge, validation and the manifest CI test (§4).
3. Add three templates with different layouts (one with a rotated field), thumbnails and recorded provenance. Bundle Anton and its licence.
4. `layoutText` with the injected measurer and its full unit tests. Then `fonts.ts` and `renderMeme`.
5. Template grid, editor, live preview, compact editing mode and draft restore.
6. Encode cache, the three export actions, capability detection and fallbacks.
7. Test on Android and iOS: tune compact mode and share behaviour against criteria 9–12, then deploy.

## 11. Deliberately deferred

- PWA installability and offline cached templates.
- Image import and user templates: now Milestone 2 (§14). Items deferred beyond M2 are listed in §14.10.
- An in-app template geometry editor with drag handles.
- User-adjustable styling.
- Recently used templates, favourites and persistent drafts.
- Shareable deep links with encoded caption text (mind privacy and URL length).
- Search, categories and pagination as the library grows.
- JPEG/WebP export or a size-optimised share option.
- Caption bars that extend the canvas beyond the source image (for now, bake the bar into the template image).

## 12. Implementation guardrails for Codex

- Optimise for small code, not hypothetical scale.
- Keep image URL resolution aware of the deployment base; never use root-absolute paths.
- Don't add a server, database, image proxy, cloud API, tracking, authentication or state-management framework.
- Don't build template-editor functionality in M1. M2 adds user templates through fixed layout presets only, with no box-drawing editor.
- Don't change the manifest schema to accommodate user templates. A user template is an ordinary manifest entry (§14).
- Export the canvas's actual pixels, never a screenshot of the DOM.
- Never `await` before `navigator.share` or `navigator.clipboard.write` in a click handler (§6).
- Do not silently switch to exporting only text if image clipboard permissions fail.
- Keep `layoutText` pure and DOM-free; all measuring goes through the injected `Measurer`.
- Load the font explicitly with `document.fonts.load`; never name the logical family after a system font.
- Keep the manifest easy to edit by hand. The README must show how to add a template step by step: image and thumbnail, measuring boxes in source pixels, provenance, running `npm test`, and the rule never to overwrite an image in place.
- Keep fonts and source images local so results are consistent and the canvas stays exportable (not tainted).

## 13. Open items (non-blocking)

- Final product name. "Fastest Meme in the West" is the working title.
- The initial three templates and their licences.
- Whether the bundled Anton build includes U+2026 (§4.4).
- M2: whether the caption-bar preset needs a second, plainer bundled font (OFL), for example a regular-weight sans (§14.5).
- M2: whether iOS reliably gives a decodable JPEG for HEIC library photos with `accept="image/*"` (§14.5); confirm on a device.

## 14. Milestone 2 — User templates

### 14.1 Goal and principles

- Users can turn their own photo into a template on their device and use it exactly like a built-in one: same editor, rendering, export actions, compact mode and draft restore.
- **Images never leave the device** unless the user explicitly exports a template pack.
- **One format.** A user template is an ordinary manifest entry (§4.2), and an exported template pack uses the built-in library's file layout and `templates.json` format exactly. A pack can be promoted to the built-in library, and built-in files can be packed and imported, without conversion.
- No server and no M1 schema changes.

### 14.2 Template pack format

A pack is a `.zip` whose contents mirror the built-in library:

```text
templates.json
templates/<id>.jpg
templates/thumbs/<id>.jpg
```

**Contents:**

- `templates.json` is a manifest that is valid under §4.2/§4.3: same schema, same `validateManifest`. Image paths are the same relative strings used in the built-in manifest (`templates/<id>.jpg`), resolved against the zip root instead of the deployment base.
- **Exported styles are fully resolved:** every field's `style` lists all style keys explicitly. A pack therefore renders identically whatever defaults the importing app has. The `defaults` block, which the schema requires, holds the exporting app's defaults.
- **Provenance:** user-created templates get `{ "source": "User upload", "license": "unknown", "attribution": null }`. That is valid under the schema, but the built-in licence gate (§4.3) flags it, so a maintainer should record real provenance before promoting the template.
- A pack holds one or more templates. **Export** writes `<id>.zip`; **Export all** writes `my-templates-YYYY-MM-DD.zip`.
- Zip handling uses `fflate` (MIT, small, tree-shakeable). Images are stored uncompressed because they are already compressed; `templates.json` is deflated.

**Promoting a pack to the built-in library** (documented in the README):

1. Copy the pack's `templates/**` files into `public/templates/`.
2. Append the pack's `templates` entries to `src/data/templates.json`. Optionally reduce each `style` to overrides of the library defaults.
3. Fill in real `provenance`.
4. Run `npm test`.

**The reverse also works:** zipping a `templates.json` containing some built-in entries, together with their image files, produces a pack the app can import. This is useful for testing.

### 14.3 Importing packs (untrusted input)

Packs may come from other people, so treat every pack as untrusted:

1. **Size limits before inflating:**
   - the pack file is at most 50 MB;
   - it contains at most 50 templates, and only `templates.json` plus the files it references are read;
   - the declared uncompressed total is at most 100 MB. Abort if inflating exceeds the declared sizes (zip-bomb protection).
2. Reject entry names that are absolute or contain `..` or `\`. Ignore entries the manifest doesn't reference.
3. Run `validateManifest` with a `size()` reader that decodes images from the zip using `createImageBitmap`.
4. **Partial import:** each template is accepted or rejected on its own. A rejected template writes nothing; the result screen lists rejected ones with the reason, e.g. "Imported 3 templates; 1 skipped: image size doesn't match manifest."
5. **Re-encode every accepted image** through the pipeline in §14.5 step 3, and regenerate its thumbnail. Imported bytes are never stored as they arrive.
6. **Id clashes:**
   - With a **built-in** id: keep both, and give the imported template a suffix (`-2`, `-3`, …), rewriting its image paths to match.
   - With an existing **user** template id: ask once per import: "N templates already exist — Replace / Keep both". This makes restoring a backup idempotent.
7. Template names and labels are capped at 80 characters, placeholders at 120. They are only ever rendered as text, never as HTML.

### 14.4 Storage

**IndexedDB database `fmitw`, version 1**, with stores that mirror the pack layout, so exporting is a direct read:

| Store | Key | Value |
|---|---|---|
| `templates` | `id` | `{ entry, createdAt, updatedAt }`. `entry` is a manifest template entry with fully resolved styles. |
| `files` | `path` | `{ path, blob }`. `path` is exactly the string used in `entry.image` / `entry.thumbnail`. |

**Rules:**

- Writes that affect a template and its files happen in a single transaction.
- Call `navigator.storage.persist()` after the user saves their first template, not at startup.
- Catch `QuotaExceededError` and show: "Not enough storage on this device. Delete or export some templates."
- If IndexedDB is unavailable, hide **New** and **Import**, and show a one-line explanation. Built-in templates are unaffected.
- **Durability note:** Safari may delete a site's data after about 7 days without use in a browser tab. The "Your templates" header always shows: "Saved on this device only — export a backup to keep them."

**Loading images.** `assets.ts` gains `loadTemplateImage(template)`:
- built-in templates use the `BASE_URL` path as in M1;
- user templates read the Blob from `files` and decode it with `createImageBitmap`. Blobs count as the same origin, so the canvas stays exportable.

**Ids** are unique across built-in and user templates. Creation and import enforce this, so user templates use the same `#/t/<id>` route.

### 14.5 Creating a template

**Flow:** the grid shows a **"Your templates"** section above the built-ins. It always contains a **"+ New template"** tile first, followed by any user templates.

1. **Pick an image.** Tap **New**, which opens `<input type="file" accept="image/*">` with no `capture` attribute, so mobile offers both the photo library and the camera. On desktop, pasting an image on the grid or dropping one on the tile also works. Reject files over 30 MB before decoding.
2. **Decode.** Use `createImageBitmap(file, { imageOrientation: 'from-image' })`. If decoding fails, show "This image format isn't supported here. Try a JPEG or PNG." This can happen with HEIC on browsers other than Safari; confirm that iOS gives a decodable JPEG when `accept="image/*"` is used.
3. **Compose and encode.**
   - Scale so that the final image's longest edge, including any caption bar, is at most 2048 px.
   - Fill the canvas white first, so transparent PNGs flatten predictably.
   - Draw the image, then encode as JPEG at quality 0.9.
   - Create a thumbnail with its longest edge at most 480 px, JPEG quality 0.8.
   - Re-encoding drops all EXIF data, including location. The creation screen says: "Location and camera data are removed. The image stays on this device."
4. **Choose a layout and name.** One screen shows the image with each preset's boxes outlined; one tap selects a preset (default: Top & bottom). The name field defaults to "My template N". Tapping **Save** stores the template and opens the editor directly. The whole flow is picker → preset → Save.
5. **Ids and paths.** The id is `slug(name)` plus `-` plus 4 random base-36 characters. The image goes to `templates/<id>.jpg` and the thumbnail to `templates/thumbs/<id>.jpg`. Renaming changes `name` only; the id never changes.

**Layout presets (`src/lib/presets.ts`)**

`W`×`H` is the final image size after scaling, including any bar, and `b = min(W, H)`. All values are rounded to integers. The base style is the app defaults with these sizes:

- `fontSize = round(0.10·b)`
- `minFontSize = max(12, round(0.04·b))`
- `strokeWidth = max(1, round(0.006·b))`

The result is written out fully resolved.

| Preset | Fields (id / label) | Boxes and style changes |
|---|---|---|
| Top & bottom | `top` / Top caption, `bottom` / Bottom caption | `x = 0.04W`, `width = 0.92W`, `height = 0.20H`; top at `y = 0.03H`, bottom at `y = 0.77H` |
| Top only | `top` / Top caption | as the top box above |
| Bottom only | `bottom` / Bottom caption | as the bottom box above |
| Caption bar | `caption` / Caption | A white bar of height `barH = round(0.28·Wimg)` is added above the photo when composing (step 3). The box is the bar inset by `0.04W` on every side. Style: `color #000000`, `strokeWidth 0`, `uppercase false`, `maxLines 4`, `fontSize = round(0.075W)`, `minFontSize = max(12, round(0.035W))`. |

The caption-bar preset uses `MemeFont` without uppercase. A second, plainer bundled font for this style is an open item (§13).

### 14.6 Managing templates

- Each user-template tile has a "⋯" button (at least 44 px) with **Rename**, **Export** and **Delete**. Delete asks for confirmation, removes the entry and its files in one transaction, and clears any `sessionStorage` draft for that template.
- The "Your templates" header has **Import** and **Export all**.
- **Export** builds the zip as a `File`. **Download** is always offered. **Share** is offered only if `navigator.canShare({ files: [zipFile] })` returns true. Chrome's Web Share file-type allowlist excludes `.zip` and `.json`, so on Android this will normally be Download only. The pack format is the same either way.
- **Import** opens `<input type="file" accept=".zip,application/zip">`. On desktop, a zip can also be dropped on the grid.

### 14.7 Repo additions

```text
src/lib/userStore.ts     # IndexedDB access (§14.4)
src/lib/importImage.ts   # decode, compose, re-encode, thumbnail (§14.5)
src/lib/presets.ts       # layout presets (§14.5)
src/lib/pack.ts          # zip export/import (§14.2–14.3)
src/components/NewTemplate.tsx
src/components/TemplateMenu.tsx
src/components/ImportResult.tsx
tests/presets.test.ts    # boxes within bounds; every preset passes validateManifest
tests/pack.test.ts       # round trip; malicious zips (bomb, traversal, oversize, bad manifest)
tests/userStore.test.ts  # with fake-indexeddb
e2e/userTemplates.spec.ts
```

New dependencies: `fflate` (runtime), `fake-indexeddb` (development only).

### 14.8 Acceptance criteria (M2)

1. On Chrome Android and iOS Safari, a user can choose a photo from the library and reach the editor with only preset → Save after the picker closes.
2. User templates survive a reload and a browser restart.
3. Stored images contain no EXIF metadata and have a longest edge of at most 2048 px, including the caption bar.
4. A pack exported from the app passes the repository's `validateManifest` unchanged. Only the built-in licence gate flags it (a warning, or a failure under `LICENCE_GATE=strict`), as expected. A pack assembled from the repo's built-in `templates.json` entries and files imports successfully.
5. Export → delete → import restores the same template entries (ids, fields, styles) and renders that are identical pixel for pixel. Importing the same backup twice and choosing Replace leaves no duplicates.
6. Malformed, oversized, zip-bomb and path-traversal packs are rejected with a clear message, and a rejected template writes nothing.
7. A full storage quota or missing IndexedDB produces a clear message, and built-in templates keep working.
8. No network request contains user images or template data. Verify this with Playwright's request log during create, export and import.
9. On user templates, rendering, export actions, compact mode, draft restore and navigation behave exactly as they do on built-ins.

### 14.9 Build sequence (M2)

1. A zip-backed `size()` reader for `validateManifest` (already shared with CI since M1).
2. IndexedDB store and image loading for user templates.
3. Image import pipeline, presets and the creation UI.
4. Template menu: rename and delete.
5. Pack export and import, with round-trip and hardening tests.
6. Device testing: HEIC on iOS, storage persistence, sharing/downloading packs, then deploy.

### 14.10 Still deferred after M2

- Draw-a-box geometry editor, and changing a user template's layout after creation.
- A UI for editing provenance (maintainers edit it in JSON when promoting).
- "Share to Fastest Meme" from the Photos app via Web Share Target, which needs PWA installation and a service worker.
- Cloud sync or any way to share templates other than files.

## 15. Technical references

- Vite static deploy / GitHub Pages: https://vite.dev/guide/static-deploy
- MDN `CanvasRenderingContext2D.measureText` / `TextMetrics`: https://developer.mozilla.org/en-US/docs/Web/API/TextMetrics
- MDN `FontFaceSet.load`: https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load
- MDN `Intl.Segmenter`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter
- MDN Visual Viewport API: https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API
- MDN Clipboard API / `ClipboardItem`: https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem
- MDN Web Share API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API
- MDN `HTMLCanvasElement.toBlob`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- MDN cross-origin images and canvas: https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image
- Anton (SIL OFL 1.1): https://fonts.google.com/specimen/Anton
- MDN IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- MDN `StorageManager.persist`: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- MDN `createImageBitmap`: https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap
- WebKit storage policy (7-day cap on script-writable storage): https://webkit.org/blog/14403/updates-to-storage-policy/
- Chrome Web Share permitted file types: https://developer.chrome.com/docs/capabilities/web-apis/web-share
- fflate: https://github.com/101arrowz/fflate
