# Fastest Meme in the West — Product & Technical Specification v0.2

**Status:** Ready for implementation. Behaviours that depend on the device (§3.3 keyboard layout, §6 copy/share) are binding through their acceptance criteria; the suggested techniques may change after testing on real devices.
**Platform:** Static web application (mobile-first)
**Hosting:** GitHub Pages
**Principle:** Fast, private, ad-free meme creation with as few interactions as possible.

## 0. Changes from v0.1

| Area | v0.2 decision | Section |
|---|---|---|
| Keyboard vs preview | While a field has focus on touch devices, a compact sticky preview stays visible above the focused field | §3.3 |
| Action bar | In normal page flow and sticky at the bottom; hidden while a text field has focus on touch devices | §3.3 |
| Share timing | PNG is encoded ahead of time and cached; Share uses the cached `File` synchronously inside the tap handler | §6.1 |
| Font | Logical family `MemeFont`, bundled Anton (SIL OFL 1.1), loaded explicitly with `document.fonts.load` | §4.4, §5.1 |
| State after share | Current template and captions are saved in `sessionStorage` and restored after the tab is discarded | §3.4 |
| Routing | Hash routing (`#/`, `#/t/<id>`, `#/credits`); Vite `base: './'` | §3.5, §8 |
| Text fitting | Accounts for outline and font metrics; measurer injected for tests; grapheme-safe word breaking | §5.2 |
| Inputs | `<textarea>` with a per-field `maxLength` | §3.3, §4.2 |
| Schema | Manifest-level `defaults.style` (one shallow merge); stricter validation; image-size cap; dimensions checked in CI | §4 |
| Provenance | Required `provenance` per template, plus a Credits screen | §4.2, §3.6 |
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
- A Credits screen listing image sources and licences.
- Works in mobile browsers, with a usable desktop layout.
- Clear loading and error states when a template cannot be loaded or an export fails.
- No external service required at runtime except GitHub Pages' static asset hosting.

### Explicitly excluded from v0.1

- User image uploads or arbitrary image URLs.
- Dragging or resizing text regions; custom positioning or font controls.
- Image editing, filters, stickers, effects, or video/GIF memes.
- Template creation or an admin UI.
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

The editor leaves compact mode when focus leaves all caption fields (keyboard dismissed, the preview tapped, or Android back). Tapping the preview blurs the active field. Detect entering and leaving with `focusin`/`focusout` on the field container. Use `focusout` with a `relatedTarget` check so that moving between fields does not cause flicker.

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

- Routes: `#/` (grid), `#/t/<template-id>` (editor), `#/credits` (credits). An unknown route or template id shows "Template not found" with a link back to the grid.
- Opening a template sets `location.hash`, which creates a history entry, so system back (including Android's back button) returns to the grid.
- The header back button calls `history.back()` if the app navigated to the editor itself (tracked in memory). Otherwise, for example after opening a deep link or restoring a discarded tab, it calls `location.replace('#/')`, so back never leaves the site unexpectedly.
- When returning to the grid, restore its scroll position and focus the thumbnail of the template just left.

### 3.6 Credits

`#/credits`, linked from the grid footer, lists each template's name, source, licence and attribution from `provenance` (§4.2), plus the font and its licence. This satisfies attribution licences such as CC BY and the SIL OFL.

### 3.7 Accessibility

- Thumbnails are buttons whose accessible name is the template name (`<img alt="">` inside a labelled button, or `alt` set to the name).
- The preview canvas has `role="img"` and an `aria-label` of `"<template name>: <non-empty captions joined with ' / '>"`, updated after typing stops for 500 ms.
- On entering the editor with assistive technology, move focus to the editor heading (`tabindex="-1"`). Autofocus on fine pointers (§3.3) takes precedence on desktop.
- Status messages (Copied, Saved, export errors, truncation notes) go to a single `aria-live="polite"` region.
- Interactive elements meet WCAG AA contrast and have visible focus outlines.

### 3.8 Interaction defaults

- Empty or whitespace-only fields render nothing.
- Exports are disabled only while the image or font is loading, or if rendering failed. Exporting a template with no captions is valid.

## 4. Template format

### 4.1 Files and URLs

- The manifest is `src/data/templates.json`, imported by the app and so bundled.
- Template images and thumbnails live under `public/templates/`.
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

**When validation runs:**

1. **CI (blocking):** `tests/manifest.test.ts` validates the real manifest. It also checks with the `image-size` dev dependency that every `image` and `thumbnail` exists in `public/`, that each image's real size equals `width`/`height` and is within the 2048 px cap, and that each thumbnail matches its image's aspect ratio. Deploy runs only if tests pass.
2. **At app startup:** parse with the same schema. On failure, show a manifest-error screen listing each issue's path and message, rather than a blank page.
3. **When an image loads:** if the decoded natural size differs from `width`/`height`, show an error for that template only ("This template's image doesn't match its settings — try reloading"). The grid and other templates keep working.

Image size guideline: under 500 KB per image and under 60 KB per thumbnail.

### 4.4 Fonts

- The logical family `MemeFont` maps to **Anton Regular** (SIL Open Font License 1.1). It is a condensed bold sans in the same style as Impact. Impact itself is not redistributable.
- Ship it as `src/assets/fonts/anton-regular.woff2`, declared in `src/styles.css` with a relative `url()`, so Vite hashes and rewrites it under the deployment base. Use `font-display: block`.
- Do **not** name the family `Impact` or any other system font name. A load failure must not silently fall back to a similar-looking local font.
- Copy the OFL text to `public/licenses/OFL-Anton.txt` and link it from Credits.
- During implementation, check that the bundled file contains U+2026 (…). If not, the ellipsis in §5.2 is `"..."`.
- Emoji and characters the font doesn't have fall back to system fonts, so exports containing them can differ slightly between devices. This is accepted.

### 4.5 Licensing policy

Only add templates whose `provenance.license` lets this site redistribute the image: public domain/CC0, CC BY (with attribution), or written permission from the rights holder. Record the permission in `provenance`. Do not add copyrighted film or TV stills without permission.

## 5. Rendering specification

Use the browser's native Canvas 2D API, not Fabric.js or Konva.

### 5.1 Pipeline

1. **Font (once per app load):** `await document.fonts.load('400 72px "MemeFont"')`. An empty result is a font-load error. Do not rely on `document.fonts.ready`: a font used only by the canvas is never requested, so `ready` can resolve without it. Then measure the vertical metrics once: `ascentRatio` and `descentRatio` = `fontBoundingBoxAscent` / `fontBoundingBoxDescent` of `measureText('Hg')` at 100 px, divided by 100.
2. **Image (once per template open):** load with `new Image()`, `decoding = 'async'`, `await img.decode()`. Check the natural size (§4.3). Errors appear in the editor with a Retry button.
3. **Canvas:** create one canvas at the image's natural size, owned outside React render (a ref in `MemePreview`).
4. **Each render:**
   - clear, then `drawImage` the full image;
   - for every field with non-empty text, transform it (`uppercase`), lay it out (§5.2) and draw it (§5.3).
5. **Preview:** the same canvas, scaled with CSS only. No DOM text overlays.
6. **Export:** encode the same canvas to an `image/png` Blob (§6.1).

**Scheduling:**

- Field values live in React state.
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
3. **Wrapping at size `s`:** in each paragraph, split words on runs of whitespace other than newlines, and greedily fill lines up to `availW`. A word wider than `availW` on its own is broken at **grapheme boundaries** (`Intl.Segmenter` with `granularity: 'grapheme'`), so emoji sequences and accented characters are never split.
4. **Fit test at size `s`:** the wrapped line count `n` is ≤ `maxLines`, and the block height `(n − 1)·s·lineHeight + s·(ascentRatio + descentRatio)` is ≤ `availH`.
5. **Size search:** try integer sizes from `fontSize` down to `minFontSize` in steps of 1 px and use the first that fits. A linear scan is used rather than binary search because wrapped fit is not strictly monotonic in size. With `maxLength` ≤ 500 the cost is negligible.
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
| Copy | In the click handler, synchronously: `navigator.clipboard.write([new ClipboardItem({ 'image/png': fresh ? cache.blob : encodePromise })])`. Passing a Promise is valid here, and Safari requires it. | Success: "Copied". Failure: "Couldn't copy the image — use Share or Download instead." Never fall back to copying text only. |
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
  src/
    assets/
      fonts/
        anton-regular.woff2
    components/
      TemplateGrid.tsx
      MemeEditor.tsx
      MemePreview.tsx
      CaptionField.tsx
      ExportActions.tsx
      Credits.tsx
      ErrorScreen.tsx
    data/
      templates.json
    lib/
      schema.ts        # Zod schema, style merge, resolved types
      assets.ts        # BASE_URL-aware path resolution
      router.ts        # hash routing, in-app navigation tracking
      draft.ts         # sessionStorage draft (§3.4)
      fonts.ts         # font load + metrics (§5.1)
      layoutText.ts    # pure layout/fitting (§5.2)
      renderMeme.ts    # canvas drawing (§5.3)
      exportMeme.ts    # encode cache, share/copy/download (§6)
      capabilities.ts  # feature detection (§6.2)
    App.tsx
    main.tsx
    styles.css
  tests/
    layoutText.test.ts
    schema.test.ts     # schema rules with synthetic manifests
    manifest.test.ts   # real manifest + files on disk (§4.3)
  e2e/
    smoke.spec.ts
  index.html
  vite.config.ts
  playwright.config.ts
  package.json
  README.md
```

## 8. Tech stack and deployment

- React + TypeScript for the editor and template browsing.
- Vite for builds and local development, with **`base: './'`**. Hash routing means the app never needs server-side path rewrites, so relative asset URLs work under any subpath. Do not hard-code `/` as an asset prefix anywhere.
- Plain CSS for a simple responsive UI. No component library.
- Native Canvas 2D for all drawing and export.
- Zod for manifest validation in CI and at app startup (§4.3).
- `image-size` (dev dependency only) for the CI manifest check.
- Vitest for unit tests. Playwright (Chromium) for smoke tests: grid renders, a template opens, typing changes canvas pixels, Download produces a PNG of the correct size, back returns to the grid.
- GitHub Actions on push to `main`: `npm ci` → `npm test` → `npm run build` → Playwright smoke against `vite preview` → `actions/upload-pages-artifact` (`dist`) → `actions/deploy-pages`. Set the repository's Pages source to "GitHub Actions".
- `index.html` viewport: `width=device-width, initial-scale=1, viewport-fit=cover`.
- No backend endpoints, service worker, analytics SDK, third-party runtime APIs or remote fonts.

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
14. Credits lists provenance for every template and the font licence.
15. The app does not depend on a running backend or an account, and user-entered text is never sent anywhere or put in the URL.

**Manual test matrix on real devices:** Chrome Android (primary), Safari iOS, desktop Chromium, desktop Safari. Playwright covers smoke tests. Check clipboard, native sharing, downloads, keyboard behaviour, tab-discard restore and saving to Photos by hand, because they depend on OS and browser permissions and UI. To force a tab discard on Android, use `chrome://discards` or open several heavy apps.

## 10. Build sequence

1. Scaffold Vite + React + TypeScript with `base: './'`, hash router, CI workflow and deploy to Pages (empty shell).
2. Schema, style merge, validation and the manifest CI test (§4).
3. Add three templates with different layouts (one with a rotated field), thumbnails and recorded provenance. Bundle Anton and its licence.
4. `layoutText` with the injected measurer and its full unit tests. Then `fonts.ts` and `renderMeme`.
5. Template grid, editor, live preview, compact editing mode, draft restore and Credits.
6. Encode cache, the three export actions, capability detection and fallbacks.
7. Test on Android and iOS: tune compact mode and share behaviour against criteria 9–12, then deploy.

## 11. Deliberately deferred

- PWA installability and offline cached templates.
- Image import and arbitrary template creation.
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
- Don't build template-editor functionality.
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

## 14. Technical references

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
