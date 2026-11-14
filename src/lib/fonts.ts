import { assetUrl } from './assets';
import { EXTENDED_UNICODE_RANGE, LATIN_UNICODE_RANGE, needsExtendedFont } from './fontRanges';
import type { Measurer } from './layoutText';

export const FONT_FAMILY = 'MemeFont';

export function fontString(weight: number, size: number): string {
  return `${weight} ${size}px "${FONT_FAMILY}", sans-serif`;
}

export interface FontMetrics {
  ascentRatio: number;
  descentRatio: number;
}

let latinFace: FontFace | null = null;
let extendedFace: FontFace | null = null;

/**
 * Register the bundled font (§4.4) as two subsets (scripts/build-fonts.mjs).
 * Registering downloads nothing: the browser fetches a subset only when text
 * on the page needs it, and the canvas loads it explicitly below.
 */
export function registerMemeFont() {
  if (latinFace || typeof FontFace === 'undefined') return;
  const face = (file: string, unicodeRange: string) =>
    new FontFace(FONT_FAMILY, `url(${assetUrl(`fonts/${file}`)}) format('woff2')`, {
      weight: '400',
      style: 'normal',
      display: 'block',
      unicodeRange,
    });
  latinFace = face('anton-latin.woff2', LATIN_UNICODE_RANGE);
  extendedFace = face('anton-ext.woff2', EXTENDED_UNICODE_RANGE);
  document.fonts.add(latinFace);
  document.fonts.add(extendedFace);
}

let loading: Promise<FontMetrics> | null = null;

/**
 * Explicitly load the font's Latin subset (§5.1). `document.fonts.ready` is not
 * enough: a font used only by a canvas is never requested by the page.
 */
export function loadMemeFont(): Promise<FontMetrics> {
  loading ??= (async () => {
    registerMemeFont();
    try {
      await latinFace!.load();
    } catch {
      throw new Error('The meme font failed to load.');
    }

    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.font = fontString(400, 100);
    const tm = ctx.measureText('Hg');
    const ascent = tm.fontBoundingBoxAscent || tm.actualBoundingBoxAscent;
    const descent = tm.fontBoundingBoxDescent || tm.actualBoundingBoxDescent;
    return { ascentRatio: ascent / 100, descentRatio: descent / 100 };
  })();
  loading.catch(() => {
    loading = null; // allow a retry
  });
  return loading;
}

/**
 * Resolves once the extended subset is loaded if `text` needs it (accented
 * Latin beyond Latin-1, Vietnamese, …); null if `text` is covered already.
 * A failed load resolves too: the canvas then falls back to a system font.
 */
export function ensureGlyphs(text: string): Promise<void> | null {
  if (!extendedFace || extendedFace.status === 'loaded' || !needsExtendedFont(text)) return null;
  return extendedFace.load().then(
    () => undefined,
    () => undefined,
  );
}

/** A Measurer backed by a canvas context; sets ctx.font only when the size changes. */
export function canvasMeasurer(ctx: CanvasRenderingContext2D, weight: number, metrics: FontMetrics): Measurer {
  let currentSize = -1;
  return {
    ascentRatio: metrics.ascentRatio,
    descentRatio: metrics.descentRatio,
    width(text, size) {
      if (size !== currentSize) {
        ctx.font = fontString(weight, size);
        currentSize = size;
      }
      return ctx.measureText(text).width;
    },
  };
}
