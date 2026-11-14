declare module 'virtual:templates' {
  import type { ResolvedTemplate, TemplateSummary } from './lib/schema';
  /** What the grid needs, for every built-in template. */
  export const index: TemplateSummary[];
  /** Dev builds: the full library, inline. */
  export const library: ResolvedTemplate[] | null;
  /** Production builds: URL of the full library JSON. */
  export const libraryUrl: string | null;
}
