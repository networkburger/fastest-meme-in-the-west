// Page-weight and load-speed measurement for the production build.
//   npm run build && node scripts/measure.mjs [--runs 3]
// Serves dist/ gzip-compressed (as GitHub Pages does) and loads it in Chromium
// emulating a mid-range phone: Lighthouse's "Slow 4G" network (150 ms RTT,
// 1.6 Mbit/s down) and 4x CPU slowdown. Cold cache every run; medians reported.
import { chromium, devices } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve('dist');
const runs = Number(process.argv[process.argv.indexOf('--runs') + 1]) || 3;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) return res.writeHead(404).end();
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  const headers = { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' };
  if (COMPRESS.has(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    body = zlib.gzipSync(body, { level: 9 });
    headers['content-encoding'] = 'gzip';
  }
  res.writeHead(200, headers).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CI ? undefined : process.env.PW_CHROMIUM_PATH ?? '/usr/bin/chromium' });

async function load(hash, ready) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const bytes = {};
  let requests = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes[e.requestId] = e.encodedDataLength; });
  const kinds = {};
  cdp.on('Network.responseReceived', (e) => { requests++; kinds[e.requestId] = e.type; });
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    // Timestamp the editor becoming ready from inside the page: Playwright's own
    // polling is slow under CPU throttling and would overstate the time.
    new MutationObserver(() => {
      if (!window.__editorReady && document.querySelector('.preview[data-state="ready"]')) window.__editorReady = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
  await page.goto(base + hash, { waitUntil: 'load' });
  const readyMs = await ready(page);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => ({
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
    lcp: window.__lcp,
  }));
  const byKind = {};
  for (const [id, n] of Object.entries(bytes)) byKind[kinds[id] ?? 'Other'] = (byKind[kinds[id] ?? 'Other'] ?? 0) + n;
  await ctx.close();
  return { ...m, readyMs, requests, totalKB: Object.values(bytes).reduce((a, b) => a + b, 0) / 1024, byKind };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
// "ready" = the page is usable, timed in-page (ms since navigation start):
//   grid: the last on-screen thumbnail has arrived (resource timing)
//   editor: the preview canvas has been drawn
const scenarios = {
  'grid (#/)': ['', async (p) => {
    await p.waitForFunction(() => { const imgs = [...document.querySelectorAll('.tile img')].filter((i) => i.getBoundingClientRect().top < innerHeight); return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth); });
    return p.evaluate(() => {
      const urls = [...document.querySelectorAll('.tile img')].filter((i) => i.getBoundingClientRect().top < innerHeight).map((i) => i.currentSrc);
      return Math.max(...performance.getEntriesByType('resource').filter((e) => urls.includes(e.name)).map((e) => e.responseEnd));
    });
  }],
  'editor deep link': ['#/t/drake-hotline-bling', async (p) => {
    await p.waitForSelector('.preview[data-state="ready"]');
    return p.evaluate(() => window.__editorReady);
  }],
};
for (const [name, [hash, ready]] of Object.entries(scenarios)) {
  const rs = [];
  for (let i = 0; i < runs; i++) rs.push(await load(hash, ready));
  const kinds = Object.keys(rs[0].byKind);
  console.log(`\n${name}  (median of ${runs})`);
  console.log(`  FCP ${median(rs.map((r) => r.fcp)).toFixed(0)} ms   LCP ${median(rs.map((r) => r.lcp)).toFixed(0)} ms   ready ${median(rs.map((r) => r.readyMs)).toFixed(0)} ms`);
  console.log(`  transferred ${median(rs.map((r) => r.totalKB)).toFixed(1)} KB in ${rs[0].requests} requests: ` + kinds.map((k) => `${k} ${(median(rs.map((r) => r.byKind[k] ?? 0)) / 1024).toFixed(1)} KB`).join(', '));
}
await browser.close();
server.close();
