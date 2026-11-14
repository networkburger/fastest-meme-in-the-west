import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { parseManifest, type ResolvedTemplate, type TemplateSummary } from '../src/lib/schema.ts';

const ID = 'virtual:templates';
const RESOLVED_ID = '\0' + ID;
/** Replaced in index.html with the library JSON's URL (empty in dev). */
export const LIBRARY_URL_PLACEHOLDER = '__FMITW_LIBRARY_URL__';
/** Replaced in index.html with {template id: image path} (empty in dev). */
export const IMAGES_PLACEHOLDER = '__FMITW_IMAGES__';

/** Path of the AVIF version of a thumbnail (scripts/build-thumbs.mjs). */
export function avifThumbnail(thumbnail: string): string {
  return thumbnail.replace(/\.[a-z]+$/i, '.avif');
}

/**
 * The built-in template library (§4.3), validated and resolved at build time,
 * so Zod never ships to the browser and an invalid manifest fails the build
 * (or shows the dev overlay). `virtual:templates` exports:
 *
 *   index       what the grid needs (id, name, thumbnail, size), in the JS bundle
 *   libraryUrl  build: URL of the full resolved library, emitted as a hashed JSON
 *               asset and fetched only when a page needs it (src/lib/library.ts)
 *   library     dev: the full library inline (no fetch)
 */
export function templatesPlugin(manifestPath = 'src/data/templates.json', publicDir = 'public'): Plugin[] {
  const file = path.resolve(manifestPath);
  let isBuild = false;
  let libraryRef: string | undefined;
  let images: Record<string, string> = {};

  return [
    {
      name: 'fmitw:templates',
      configResolved(config) {
        isBuild = config.command === 'build';
      },
      resolveId(id) {
        return id === ID ? RESOLVED_ID : undefined;
      },
      load(id) {
        if (id !== RESOLVED_ID) return;
        this.addWatchFile(file);
        let json: unknown;
        try {
          json = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (err) {
          this.error(`${manifestPath} is not valid JSON: ${(err as Error).message}`);
        }
        const result = parseManifest(json);
        if (!result.ok) {
          this.error(`${manifestPath} failed validation:\n${result.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`);
        }
        const library: ResolvedTemplate[] = result.templates;
        images = Object.fromEntries(library.map((t) => [t.id, t.image]));
        const index: TemplateSummary[] = library.map(({ id, name, thumbnail, width, height }) => ({
          id,
          name,
          thumbnail,
          width,
          height,
          ...(fs.existsSync(path.resolve(publicDir, avifThumbnail(thumbnail))) && { avif: true as const }),
        }));
        const exportIndex = `export const index = ${JSON.stringify(index)};`;
        if (!isBuild) return `${exportIndex}\nexport const library = ${JSON.stringify(library)};\nexport const libraryUrl = null;`;
        libraryRef = this.emitFile({ type: 'asset', name: 'templates.json', source: JSON.stringify(library) });
        return `${exportIndex}\nexport const library = null;\nexport const libraryUrl = import.meta.ROLLUP_FILE_URL_${libraryRef};`;
      },
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          // Dev: nothing to preload (the library is inline).
          return isBuild ? html : html.replace(LIBRARY_URL_PLACEHOLDER, '').replace(IMAGES_PLACEHOLDER, '{}');
        },
      },
      handleHotUpdate(ctx) {
        // Editing the manifest reloads the page with the re-validated library.
        if (path.resolve(ctx.file) !== file) return;
        const mod = ctx.server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) {
          ctx.server.moduleGraph.invalidateModule(mod);
          ctx.server.ws.send({ type: 'full-reload' });
        }
        return [];
      },
    },
    {
      // After Vite has written index.html: fill in the deep-link preloads.
      name: 'fmitw:templates-html',
      apply: 'build',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const html = bundle['index.html'];
        if (!html || html.type !== 'asset' || !libraryRef) return;
        html.source = String(html.source)
          .replace(LIBRARY_URL_PLACEHOLDER, `./${this.getFileName(libraryRef)}`)
          .replace(IMAGES_PLACEHOLDER, JSON.stringify(images));
      },
    },
  ];
}
