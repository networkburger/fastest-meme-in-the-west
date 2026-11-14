import { useExternalStore } from './useExternalStore';

/** Hash routes (§3.5): `#/`, `#/t/<template-id>`. */
export type Route =
  | { name: 'grid' }
  | { name: 'editor'; templateId: string }
  | { name: 'debug' }
  | { name: 'notFound' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '' || path === '/') return { name: 'grid' };
  if (path === '/debug') return { name: 'debug' };
  const m = /^\/t\/([^/]+)$/.exec(path);
  if (m) {
    try {
      return { name: 'editor', templateId: decodeURIComponent(m[1]) };
    } catch {
      return { name: 'notFound' };
    }
  }
  return { name: 'notFound' };
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  // No window when prerendering at build time: that render is the grid.
  const hash = useExternalStore(subscribe, () => (typeof window === 'undefined' ? '' : window.location.hash));
  return parseHash(hash);
}

const IN_APP = 'fmitwInApp';

/**
 * Navigate with a real history entry (so Android back returns here), and mark
 * the new entry as reached from inside the app.
 */
function push(hash: string) {
  window.location.hash = hash;
  try {
    history.replaceState({ [IN_APP]: true }, '');
  } catch {
    /* ignore */
  }
}

export function templateHref(id: string) {
  return `#/t/${encodeURIComponent(id)}`;
}

/**
 * Click handler for in-app links. The links work as plain hash links before
 * the JS has loaded (the grid is prerendered); once it has, a plain click also
 * marks the new history entry as in-app (see goBack). Modified clicks (new
 * tab etc.) are left to the browser.
 */
export function followLink(e: MouseEvent) {
  const link = e.currentTarget as HTMLAnchorElement;
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  push(link.getAttribute('href')!);
}

/**
 * Header back button: go back if the app navigated here itself; otherwise
 * (deep link, restored tab) replace with the grid, so it never leaves the site.
 */
export function goBack() {
  const state = history.state as Record<string, unknown> | null;
  if (state?.[IN_APP]) history.back();
  else window.location.replace('#/');
}
