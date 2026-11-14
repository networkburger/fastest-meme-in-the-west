import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { imageSize } from 'image-size';
import { avifThumbnail } from '../build/templates-plugin.ts';
import { validateManifest } from '../src/lib/manifest';
import manifest from '../src/data/templates.json';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

/** Reads real image sizes from public/, as the deployed app would see them. */
const fsReader = {
  async size(path: string) {
    try {
      const { width, height } = imageSize(await readFile(publicDir + path));
      return width && height ? { width, height } : null;
    } catch {
      return null;
    }
  },
};

describe('the built-in template library (src/data/templates.json)', () => {
  it('passes validateManifest against the files in public/', async () => {
    const result = await validateManifest(manifest, fsReader);
    // Print readable issues if this fails.
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  // Licence gate (§4.3, §4.5). By default it only warns: the library knowingly includes
  // templates whose licence is unknown. LICENCE_GATE=strict makes it fail instead.
  it('reports templates without a known licence (LICENCE_GATE=strict to enforce)', () => {
    const unknown = manifest.templates
      .filter((t) => t.provenance.license.trim().toLowerCase() === 'unknown')
      .map((t) => t.id);
    if (process.env.LICENCE_GATE === 'strict') {
      expect(unknown, 'templates with licence "unknown"').toEqual([]);
    } else if (unknown.length > 0) {
      console.warn(`Licence gate (warning only): ${unknown.length} templates have licence "unknown": ${unknown.join(', ')}`);
    }
  });

  it('has an up-to-date AVIF for every thumbnail (run: node scripts/build-thumbs.mjs)', async () => {
    for (const t of manifest.templates) {
      const jpeg = await fsReader.size(t.thumbnail);
      const avif = await fsReader.size(avifThumbnail(t.thumbnail));
      expect(avif, `${t.id}: missing or unreadable ${avifThumbnail(t.thumbnail)}`).not.toBeNull();
      expect(avif, `${t.id}: AVIF thumbnail size differs from the JPEG`).toEqual(jpeg);
    }
  });
});
