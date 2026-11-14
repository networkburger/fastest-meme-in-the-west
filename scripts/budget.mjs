// Size budget for the production build (run after `vite build`; part of `npm run build`).
//   node scripts/budget.mjs
// Fails if any file group is over its budget, so the page can't quietly grow back.
// Sizes are gzip -9 (as served) for text, raw bytes for binary formats. 1 KB = 1024 bytes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIST = 'dist';
const KB = 1024;
// The JS carries a small grid entry per template (~45 bytes gzipped) and the library
// data ~150 bytes per template, so those budgets grow with the library: adding
// templates never fails the build, growing the code does. The HTML budget is fixed:
// it is what fits in the first round trip.
const templateCount = JSON.parse(fs.readFileSync('src/data/templates.json', 'utf8')).templates.length;
const JS_BUDGET_KB = 28.5 + 0.045 * templateCount; // 30 KB at 34 templates

/** [label, glob-ish matcher on the dist-relative path, budget in KB, 'total' | 'each'] */
const BUDGETS = [
  ['HTML + inline CSS (first paint, one request)', (f) => f === 'index.html', 14, 'total'],
  [`JavaScript (28.5 KB + ${templateCount} templates)`, (f) => f.endsWith('.js'), JS_BUDGET_KB, 'total'],
  [`Template library data (${templateCount} × 0.2 KB)`, (f) => /^assets\/templates-.*\.json$/.test(f), 0.2 * templateCount, 'total'],
  ['Caption font, Latin subset', (f) => f === 'fonts/anton-latin.woff2', 25, 'total'],
  ['Caption font, extended subset', (f) => f === 'fonts/anton-ext.woff2', 35, 'total'],
  ['Grid thumbnail (AVIF), each', (f) => /^templates\/thumbs\/.*\.avif$/.test(f), 25, 'each'],
];

const TEXT = /\.(html|js|css|json|svg|txt)$/;
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const files = walk(DIST).map((p) => {
  const rel = path.relative(DIST, p).split(path.sep).join('/');
  const buf = fs.readFileSync(p);
  return { rel, size: TEXT.test(rel) ? zlib.gzipSync(buf, { level: 9 }).length : buf.length };
});

let failed = false;
const fmt = (b) => `${(b / KB).toFixed(1)} KB`;
for (const [label, match, budgetKb, mode] of BUDGETS) {
  const group = files.filter((f) => match(f.rel));
  if (group.length === 0) {
    console.log(`?  ${label}: no files matched`);
    failed = true;
    continue;
  }
  const limit = budgetKb * KB;
  if (mode === 'each') {
    const over = group.filter((f) => f.size > limit);
    const largest = group.reduce((a, b) => (b.size > a.size ? b : a));
    console.log(`${over.length ? '✗' : '✓'}  ${label}: largest ${fmt(largest.size)} (${largest.rel}) / ${budgetKb} KB`);
    for (const f of over) console.log(`     over: ${f.rel} ${fmt(f.size)}`);
    failed ||= over.length > 0;
  } else {
    const total = group.reduce((a, f) => a + f.size, 0);
    console.log(`${total > limit ? '✗' : '✓'}  ${label}: ${fmt(total)} / ${budgetKb.toFixed(1)} KB`);
    failed ||= total > limit;
  }
}
if (failed) {
  console.error('\nSize budget exceeded (scripts/budget.mjs). Trim the build, or raise the budget deliberately.');
  process.exit(1);
}
