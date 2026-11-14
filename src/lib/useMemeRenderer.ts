import { useEffect, useRef, useState } from 'preact/hooks';
import { assetUrl, loadImage } from './assets';
import { ExportCache } from './exportMeme';
import { ensureGlyphs, loadMemeFont, type FontMetrics } from './fonts';
import { renderMeme } from './renderMeme';
import type { ResolvedTemplate } from './schema';

export type RenderStatus = { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string };

interface Assets {
  image: HTMLImageElement;
  metrics: FontMetrics;
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Owns the canvas, decoded image, font metrics and export cache for one template.
 * Component state holds the caption values; decoding and drawing stay outside the
 * render path and happen at most once per animation frame (§5.1).
 */
export function useMemeRenderer(template: ResolvedTemplate, values: Readonly<Record<string, string>>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [assets, setAssets] = useState<Assets | null>(null);
  const [status, setStatus] = useState<RenderStatus>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [cache, setCache] = useState<ExportCache | null>(null);
  const [truncatedFieldIds, setTruncated] = useState<string[]>([]);

  // Load font + image once per template (and on Retry). Never per keystroke.
  useEffect(() => {
    let cancelled = false;
    setStatus({ state: 'loading' });
    setAssets(null);
    Promise.all([loadMemeFont(), loadImage(assetUrl(template.image))])
      .then(([metrics, image]) => {
        if (cancelled) return;
        if (image.naturalWidth !== template.width || image.naturalHeight !== template.height) {
          throw new Error("This template's image doesn't match its settings. Try reloading the page.");
        }
        setAssets({ image, metrics });
        setStatus({ state: 'ready' });
      })
      .catch((err: unknown) => {
        if (!cancelled) setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [template, attempt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!assets || !canvas) return;
    const c = new ExportCache(canvas, `${template.id}.png`);
    setCache(c);
    return () => {
      c.dispose();
      setCache(null);
    };
  }, [assets, template.id]);

  // Captions with characters beyond Latin-1 need the font's extended subset: fetch it
  // once, then redraw (until then those characters use the fallback font).
  const [glyphsLoaded, setGlyphsLoaded] = useState(0);
  useEffect(() => {
    let cancelled = false;
    ensureGlyphs(Object.values(values).join(''))?.then(() => {
      if (!cancelled) setGlyphsLoaded((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [values]);

  // Re-render on caption changes; a newer change in the same frame cancels the older one.
  useEffect(() => {
    if (!assets || !cache) return;
    const frame = requestAnimationFrame(() => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) {
        setStatus({ state: 'error', message: 'Canvas is not available in this browser.' });
        return;
      }
      try {
        const result = renderMeme(ctx, assets.image, template, values, assets.metrics);
        setTruncated((prev) => (sameIds(prev, result.truncatedFieldIds) ? prev : result.truncatedFieldIds));
        cache.markRendered();
      } catch {
        setStatus({ state: 'error', message: 'Something went wrong drawing this meme.' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [assets, cache, template, values, glyphsLoaded]);

  return {
    canvasRef,
    status,
    cache: status.state === 'ready' ? cache : null,
    truncatedFieldIds,
    retry: () => setAttempt((a) => a + 1),
  };
}
