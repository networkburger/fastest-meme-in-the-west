// Regenerate the subset fonts in public/fonts/ from fonts-src/.
//   node scripts/build-fonts.mjs
// Run after changing the source font or the subsets below; commit the output.
//
//   src/assets/fonts/anton-title.woff2  only the masthead's capitals; small enough that
//                      Vite inlines it into the CSS, so the title paints without a font request
//   anton-latin.woff2  Basic Latin + Latin-1 + common punctuation; loaded by the editor
//   anton-ext.woff2    every other character Anton has; loaded only when a caption needs it
//
// Hinting is dropped (unused by high-DPI phone screens), kerning and other layout features kept.
import fs from 'node:fs';
import subsetFont from 'subset-font';
import { LATIN_RANGES, TITLE_TEXT, inRanges } from '../src/lib/fontRanges.ts';

const source = fs.readFileSync('fonts-src/anton-regular.woff2');
fs.mkdirSync('public/fonts', { recursive: true });
fs.mkdirSync('src/assets/fonts', { recursive: true });

// Every BMP code point; the subsetter keeps only those the font has.
const all = [];
for (let cp = 0x20; cp <= 0xffff; cp++) if (cp < 0xd800 || cp > 0xdfff) all.push(cp);
const text = (cps) => String.fromCodePoint(...cps);

const subsets = {
  'src/assets/fonts/anton-title.woff2': TITLE_TEXT,
  'public/fonts/anton-latin.woff2': text(all.filter((cp) => inRanges(cp, LATIN_RANGES))),
  'public/fonts/anton-ext.woff2': text(all.filter((cp) => !inRanges(cp, LATIN_RANGES))),
};
for (const [name, chars] of Object.entries(subsets)) {
  const buf = await subsetFont(source, chars, { targetFormat: 'woff2', noHinting: true });
  fs.writeFileSync(name, buf);
  console.log(`${name.padEnd(40)} ${(buf.length / 1024).toFixed(1)} KB`);
}
