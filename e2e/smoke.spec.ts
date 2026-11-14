import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import manifest from '../src/data/templates.json' with { type: 'json' };

// A template with at least two fields (the compact-mode test moves between them).
const first = manifest.templates.find((t) => t.fields.length >= 2)!;

/** A cheap fingerprint of the canvas pixels. */
function canvasHash(page: Page) {
  return page.locator('canvas').evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < data.length; i += 97) h = (h * 31 + data[i]) | 0;
    return h;
  });
}

async function openFirstTemplate(page: Page) {
  await page.goto('./');
  await page.getByRole('link', { name: first.name }).click();
  await expect(page).toHaveURL(new RegExp(`#/t/${first.id}$`));
  await expect(page.getByRole('heading', { name: first.name })).toBeVisible();
  // Rendered once the export actions enable.
  await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled();
}

/** What a phone user does to get the actions back: tap the preview (blurs the field). */
async function doneTyping(page: Page) {
  await page.locator('.editor__preview').click();
}

test('grid shows every template', async ({ page }) => {
  await page.goto('./');
  for (const t of manifest.templates) {
    await expect(page.getByRole('link', { name: t.name })).toBeVisible();
  }
});

test('editor shows one input per field, in manifest order', async ({ page }) => {
  for (const t of manifest.templates) {
    await page.goto(`./#/t/${t.id}`);
    // toHaveText retries: the editor may still be loading the library data.
    await expect(page.locator('.caption-field__label')).toHaveText(t.fields.map((f) => f.label));
  }
});

test('typing changes the canvas; clearing restores it', async ({ page }) => {
  await openFirstTemplate(page);
  const blank = await canvasHash(page);
  const input = page.getByLabel(first.fields[0].label);
  await input.fill('Hello from the west');
  await expect.poll(() => canvasHash(page)).not.toBe(blank);
  await input.fill('');
  await expect.poll(() => canvasHash(page)).toBe(blank);
});

test('Download produces a full-resolution PNG', async ({ page }) => {
  await openFirstTemplate(page);
  await page.getByLabel(first.fields[0].label).fill('Export me');
  await doneTyping(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${first.id}.png`);
  const png = await readFile(await download.path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(first.width);
  expect(png.readUInt32BE(20)).toBe(first.height);
});

test('back returns to the grid; header back never leaves the site', async ({ page }) => {
  await openFirstTemplate(page);
  await page.goBack();
  await expect(page.getByRole('link', { name: first.name })).toBeVisible();

  // Deep link straight into the editor: the header back button goes to the grid.
  await page.goto(`./#/t/${first.id}`);
  await page.getByRole('button', { name: 'Back to templates' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('link', { name: first.name })).toBeVisible();
});

test('captions survive a reload in the same tab', async ({ page }) => {
  await openFirstTemplate(page);
  await page.getByLabel(first.fields[0].label).fill('Still here');
  await page.reload();
  await expect(page.getByLabel(first.fields[0].label)).toHaveValue('Still here');
});

test('unknown template shows a recoverable error', async ({ page }) => {
  await page.goto('./#/t/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Template not found' })).toBeVisible();
  await page.getByRole('button', { name: 'All templates' }).click();
  await expect(page.getByRole('link', { name: first.name })).toBeVisible();
});

test('a crash while rendering shows a recoverable error, not a blank page', async ({ page }) => {
  await page.goto('./');
  // The editor reads matchMedia while rendering: make that throw.
  await page.evaluate(() => {
    window.matchMedia = () => {
      throw new Error('test crash');
    };
  });
  await page.getByRole('link', { name: first.name }).click();
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await page.getByRole('button', { name: 'All templates' }).click();
  await expect(page.getByRole('link', { name: first.name })).toBeVisible();
});

test('no network requests leave the origin', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost:4173/') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) {
      external.push(r.url());
    }
  });
  await openFirstTemplate(page);
  await page.getByLabel(first.fields[0].label).fill('Private');
  await doneTyping(page);
  await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled();
  expect(external).toEqual([]);
});

test('touch: typing pins a compact preview and hides the actions until done', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'compact mode is for touch devices');
  await openFirstTemplate(page);
  const actions = page.getByRole('group', { name: 'Export' });
  await expect(actions).toBeVisible();

  await page.getByLabel(first.fields[1].label).click();
  await expect(page.locator('.editor--compact')).toBeVisible();
  await expect(actions).toBeHidden();

  // The compact preview stays on screen and the focused field sits just below it.
  const preview = await page.locator('.editor__preview').boundingBox();
  const field = await page.getByLabel(first.fields[1].label).boundingBox();
  const viewport = page.viewportSize()!;
  expect(preview!.y).toBeGreaterThanOrEqual(-1);
  expect(preview!.height).toBeLessThanOrEqual(viewport.height * 0.3 + 20);
  expect(field!.y).toBeGreaterThan(preview!.y + preview!.height - 1);
  expect(field!.y + field!.height).toBeLessThan(viewport.height);

  // A visible Done button on the focused field, also on screen, leaves compact mode.
  const done = page.getByRole('button', { name: 'Done' });
  await expect(done).toHaveCount(1);
  const doneBox = (await done.boundingBox())!;
  expect(doneBox.y).toBeGreaterThan(preview!.y + preview!.height - 1);
  await done.click();
  await expect(page.locator('.editor--compact')).toHaveCount(0);
  await expect(done).toBeHidden();
  await expect(actions).toBeVisible();
  // The whole preview is back in view, not scrolled off the top.
  await expect.poll(async () => (await page.locator('.editor__preview').boundingBox())!.y).toBeGreaterThanOrEqual(0);
});

test('Copy hides itself (and stays hidden) when the browser refuses image copies', async ({ page }) => {
  // Simulate Chrome builds that report support but reject every image write.
  await page.addInitScript(() => {
    navigator.clipboard.write = () => Promise.reject(new DOMException('Clipboard write is not allowed.', 'NotAllowedError'));
  });
  await openFirstTemplate(page);
  const copy = page.getByRole('button', { name: 'Copy' });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.getByText("This browser doesn't allow copying images.")).toBeVisible();
  await expect(copy).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled();
  await expect(copy).toHaveCount(0);
});

test('fonts: the grid paints without the caption font; extended glyphs load only when typed', async ({ page }) => {
  const fonts: string[] = [];
  let loaded = false;
  const beforeLoad: string[] = [];
  page.on('request', (r) => {
    if (!r.url().endsWith('.woff2')) return;
    fonts.push(r.url().split('/').pop()!);
    if (!loaded) beforeLoad.push(r.url());
  });
  await page.goto('./'); // resolves on the load event
  loaded = true;
  // The masthead font is inlined; the caption font is only warmed once the page is idle.
  expect(beforeLoad).toEqual([]);

  await page.getByRole('link', { name: first.name }).click();
  await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled();
  const field = page.getByLabel(first.fields[0].label);
  await field.fill('Plain café text');
  await page.waitForTimeout(300);
  expect(fonts).toEqual(['anton-latin.woff2']);

  const before = await canvasHash(page);
  await field.fill('Łódź');
  await expect.poll(() => fonts).toContain('anton-ext.woff2');
  await expect.poll(() => canvasHash(page)).not.toBe(before);
});

test('the grid is prerendered: it shows, and its links work, without JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /Fastest Meme/i })).toBeVisible();
  await expect(page.getByRole('link', { name: first.name })).toHaveAttribute('href', `#/t/${first.id}`);
  await expect(page.locator('.tile')).toHaveCount(manifest.templates.length);
  await ctx.close();
});

test('a deep link opens the editor without flashing the grid', async ({ page }) => {
  let gridShown = false;
  await page.exposeFunction('reportGridShown', () => (gridShown = true));
  await page.addInitScript(() => {
    // Watch for any frame where a tile is laid out and visible.
    const check = () => {
      const tile = document.querySelector('.tile');
      if (tile && (tile as HTMLElement).offsetParent !== null) (window as unknown as { reportGridShown(): void }).reportGridShown();
      else if (!document.querySelector('.editor')) requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  await page.goto(`./#/t/${first.id}`);
  await expect(page.getByRole('heading', { name: first.name })).toBeVisible();
  expect(gridShown).toBe(false);
  // …and going back to the grid afterwards shows it normally.
  await page.getByRole('button', { name: 'Back to templates' }).click();
  await expect(page.getByRole('link', { name: first.name })).toBeVisible();
});

test('a deep link fetches each asset once (head preloads are reused)', async ({ page }) => {
  const counts = new Map<string, number>();
  page.on('request', (r) => {
    const name = r.url().split('/').pop()!;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  await page.goto(`./#/t/${first.id}`);
  await expect(page.locator('.preview[data-state="ready"]')).toBeVisible();
  const image = first.image.split('/').pop()!;
  expect(counts.get(image)).toBe(1);
  expect(counts.get('anton-latin.woff2')).toBe(1);
  expect([...counts].filter(([n]) => /^templates-.*\.json$/.test(n)).map(([, c]) => c)).toEqual([1]);
});

test('if the template data fails to load, the editor offers a retry', async ({ page }) => {
  let fail = true;
  await page.route(/templates-[^/]*\.json$/, (route) => (fail ? route.abort() : route.continue()));
  await page.goto(`./#/t/${first.id}`);
  await expect(page.getByRole('heading', { name: "Couldn't load the templates" })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.preview[data-state="ready"]')).toBeVisible();
});
