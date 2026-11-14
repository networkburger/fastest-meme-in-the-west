import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';
import { inlineCssPlugin } from './build/inline-css-plugin.ts';
import { prerenderPlugin } from './build/prerender-plugin.ts';
import { templatesPlugin } from './build/templates-plugin.ts';

// `base: './'` keeps every asset URL relative, so the build works under a
// GitHub Pages project subpath (user.github.io/repo/) and at a root domain.
// Hash routing (src/lib/router.ts) means no server-side rewrites are needed.
export default defineConfig({
  base: './',
  plugins: [
    preact(),
    templatesPlugin(), // validated template library as `virtual:templates`
    prerenderPlugin(), // grid HTML in index.html: first paint without JS
    inlineCssPlugin(), // CSS in index.html: first paint in one request
  ],
  build: {
    // One JS file and no lazy chunks: skip Vite's module-preload helper.
    modulePreload: false,
  },
  // Allow phone testing over `tailscale serve` (HTTPS → Share/Copy work).
  server: { allowedHosts: ['.ts.net'] },
  preview: { allowedHosts: ['.ts.net'] },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
