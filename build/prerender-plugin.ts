import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Plugin, type ResolvedConfig } from 'vite';

const ROOT_TAG = '<div id="root"></div>';

/**
 * After the client build, render the app's start page to HTML and put it in
 * dist/index.html's #root, so the grid paints before any JavaScript runs.
 * `entry` must export `prerender(): Promise<string>`. It is bundled with a
 * separate SSR build (same config and plugins), so it adds nothing to the
 * client bundle.
 */
export function prerenderPlugin(entry = 'src/prerender.tsx'): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'fmitw:prerender',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      if (config.build.ssr) return; // this is the nested build below
      const outDir = path.resolve(config.root, 'node_modules/.cache/fmitw-prerender');
      await build({
        configFile: config.configFile,
        mode: config.mode,
        logLevel: 'warn',
        // SSR builds turn a relative base into '/'; asset URLs must match the client's.
        define: { 'import.meta.env.BASE_URL': JSON.stringify(config.base) },
        build: {
          ssr: entry,
          outDir,
          emptyOutDir: true,
          copyPublicDir: false,
          rollupOptions: { output: { entryFileNames: 'prerender.mjs' } },
        },
      });
      const mod = await import(`${pathToFileURL(path.join(outDir, 'prerender.mjs')).href}?t=${Date.now()}`);
      const html: string = await mod.prerender();
      const file = path.resolve(config.root, config.build.outDir, 'index.html');
      const page = fs.readFileSync(file, 'utf8');
      if (!page.includes(ROOT_TAG)) this.error(`${file} has no empty ${ROOT_TAG} to prerender into`);
      fs.writeFileSync(file, page.replace(ROOT_TAG, () => `<div id="root">${html}</div>`));
      config.logger.info(`prerendered ${entry} into ${path.relative(config.root, file)} (${(html.length / 1024).toFixed(1)} kB)`);
    },
  };
}
