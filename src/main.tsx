import { hydrate, render } from 'preact';
import { App, warmEditor } from './App';
import { registerMemeFont } from './lib/fonts';
import { parseHash } from './lib/router';
import './styles.css';

registerMemeFont();

const route = parseHash(location.hash);
// Deep link to a template: fetch its image as soon as the library data arrives,
// rather than after the editor has rendered.
if (route.name === 'editor') warmEditor(route.templateId);

const root = document.getElementById('root')!;
if (root.firstElementChild && route.name === 'grid') {
  // index.html holds the prerendered grid: attach to it rather than rebuild it.
  hydrate(<App />, root);
} else {
  // Any other route (or a dev build, which has no prerendered markup).
  root.textContent = '';
  render(<App />, root);
}
// index.html hides the prerendered grid on deep links until this point.
delete document.documentElement.dataset.deeplink;
