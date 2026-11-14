import type { Plugin } from 'vite';

/**
 * Inline the built stylesheet into index.html (build only), so the first
 * paint needs a single request. The CSS must not contain relative url()s
 * (fonts are registered from JS or inlined as data URIs).
 */
export function inlineCssPlugin(): Plugin {
  return {
    name: 'fmitw:inline-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type !== 'asset' || !name.endsWith('.css')) continue;
        const css = String(file.source);
        if (/url\((?!["']?data:)/.test(css)) this.error(`${name} has a non-data url(); it can't be inlined`);
        const tag = new RegExp(`<link rel="stylesheet"[^>]*href="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
        if (!tag.test(source)) this.error(`no <link> for ${name} in ${html.fileName}`);
        source = source.replace(tag, () => `<style>${css}</style>`);
        delete bundle[name];
      }
      html.source = source;
    },
  };
}
