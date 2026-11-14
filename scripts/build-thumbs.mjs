// Create missing grid thumbnails and their AVIF versions for the built-in templates.
//   node scripts/build-thumbs.mjs [--force]
// For each template in src/data/templates.json:
//   - thumbnail (JPEG, the manifest's `thumbnail` path): created from the full image if
//     missing (longest edge 480 px, §4.2); an existing one is never overwritten
//   - <thumbnail>.avif: same size, encoded from the full image; rebuilt when older than
//     the image or thumbnail (or with --force). The grid serves it to browsers that
//     support AVIF, at about a third of the JPEG's size.
// Commit the output.
import fs from 'node:fs';
import sharp from 'sharp';

const MAX_THUMB_EDGE = 480;
const AVIF = { quality: 45, effort: 6 };
const force = process.argv.includes('--force');
const manifest = JSON.parse(fs.readFileSync('src/data/templates.json', 'utf8'));
const pub = (p) => `public/${p}`;
const mtime = (p) => fs.statSync(p).mtimeMs;

let jpegBytes = 0;
let avifBytes = 0;
for (const t of manifest.templates) {
  const image = pub(t.image);
  const thumb = pub(t.thumbnail);
  const avif = thumb.replace(/\.[a-z]+$/i, '.avif');
  if (!fs.existsSync(thumb)) {
    await sharp(image)
      .resize(MAX_THUMB_EDGE, MAX_THUMB_EDGE, { fit: 'inside' })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(thumb);
    console.log(`created ${thumb}`);
  }
  if (force || !fs.existsSync(avif) || mtime(avif) < Math.max(mtime(image), mtime(thumb))) {
    const { width, height } = await sharp(thumb).metadata();
    await sharp(image).resize(width, height, { fit: 'fill' }).avif(AVIF).toFile(avif);
    console.log(`encoded ${avif}`);
  }
  jpegBytes += fs.statSync(thumb).size;
  avifBytes += fs.statSync(avif).size;
}
console.log(`${manifest.templates.length} thumbnails: JPEG ${(jpegBytes / 1024).toFixed(0)} KB, AVIF ${(avifBytes / 1024).toFixed(0)} KB`);
