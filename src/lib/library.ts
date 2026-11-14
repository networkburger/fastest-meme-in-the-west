import { index, library as inlined, libraryUrl } from 'virtual:templates';
import type { ResolvedTemplate } from './schema';
import { once } from './useLoaded';

/** Grid data for every built-in template (small; part of the JS bundle). */
export const templateIndex = index;

/** Dev builds have the library inline; production fetches it (see templates-plugin). */
export const inlineLibrary = inlined ?? undefined;

/**
 * The full library (fields, styles, provenance): a separate JSON file in
 * production, fetched once. Deep links preload it from index.html.
 */
export const loadLibrary = once(
  (): Promise<ResolvedTemplate[]> =>
    inlined
      ? Promise.resolve(inlined)
      : fetch(libraryUrl!).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<ResolvedTemplate[]>;
        }),
);
