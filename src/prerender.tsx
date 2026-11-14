import { renderToString } from 'preact-render-to-string';
import { App } from './App';

/**
 * Build-time render of the grid into index.html (build/prerender-plugin.ts),
 * so the first paint needs no JavaScript. main.tsx then hydrates it.
 */
export async function prerender(): Promise<string> {
  return renderToString(<App />);
}
