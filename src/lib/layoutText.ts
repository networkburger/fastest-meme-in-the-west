import type { Style } from './schema';

/**
 * Text layout and auto-fit (§5.2). Pure and DOM-free: every measurement goes
 * through the injected Measurer, so tests can use a fake one.
 */

export interface Measurer {
  /** Advance width of `text` at `fontSize`, in source px. */
  width(text: string, fontSize: number): number;
  /** Font ascent / font size. */
  ascentRatio: number;
  /** Font descent / font size. */
  descentRatio: number;
}

export interface LayoutLine {
  text: string;
  /** Left edge of the line, relative to the unrotated box's top-left corner. */
  x: number;
  /** Alphabetic baseline, relative to the unrotated box's top-left corner. */
  y: number;
  width: number;
}

export interface Layout {
  fontSize: number;
  lines: LayoutLine[];
  truncated: boolean;
}

export type LayoutStyle = Pick<
  Style,
  'fontSize' | 'minFontSize' | 'strokeWidth' | 'align' | 'verticalAlign' | 'maxLines' | 'lineHeight'
>;

export const ELLIPSIS = '…'; // present in the bundled Anton build (checked)

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** Split into user-perceived characters, so emoji sequences and accents are never broken apart. */
export function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text);
}

/**
 * Greedy word wrap of one paragraph (no newlines) at size `size`. A word wider
 * than the line is broken at grapheme boundaries only if `breakWords` is set;
 * otherwise the wrap fails (null), so the caller can try a smaller size first.
 */
function wrapParagraph(paragraph: string, size: number, maxWidth: number, m: Measurer, breakWords: boolean): string[] | null {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['']; // blank line, kept on purpose
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (m.width(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = '';
    if (m.width(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    // Word wider than the line on its own: break it at grapheme boundaries.
    if (!breakWords) return null;
    let piece = '';
    for (const g of graphemes(word)) {
      if (piece && m.width(piece + g, size) > maxWidth) {
        lines.push(piece);
        piece = g;
      } else {
        piece += g;
      }
    }
    current = piece;
  }
  if (current) lines.push(current);
  return lines;
}

function wrapAll(paragraphs: string[], size: number, maxWidth: number, m: Measurer, breakWords: boolean): string[] | null {
  const lines: string[] = [];
  for (const p of paragraphs) {
    const wrapped = wrapParagraph(p, size, maxWidth, m, breakWords);
    if (!wrapped) return null;
    lines.push(...wrapped);
  }
  return lines;
}

function blockHeight(lineCount: number, size: number, style: LayoutStyle, m: Measurer): number {
  return (lineCount - 1) * size * style.lineHeight + size * (m.ascentRatio + m.descentRatio);
}

/** Largest number of lines whose block fits in `availH` at `size`. */
function linesThatFitHeight(size: number, availH: number, style: LayoutStyle, m: Measurer): number {
  const firstLine = size * (m.ascentRatio + m.descentRatio);
  if (firstLine > availH) return 0;
  return Math.floor((availH - firstLine) / (size * style.lineHeight) + 1e-9) + 1;
}

/** Trim trailing graphemes until `line + …` fits; returns the ellipsized line. */
function ellipsize(line: string, size: number, maxWidth: number, m: Measurer): string {
  const gs = graphemes(line);
  while (gs.length > 0 && m.width(gs.join('').trimEnd() + ELLIPSIS, size) > maxWidth) gs.pop();
  const result = gs.join('').trimEnd() + ELLIPSIS;
  return m.width(result, size) <= maxWidth ? result : '';
}

export function layoutText(
  text: string,
  style: LayoutStyle,
  box: { width: number; height: number },
  m: Measurer,
): Layout {
  const sw = style.strokeWidth;
  const availW = box.width - 2 * sw;
  const availH = box.height - 2 * sw;

  // Normalise line endings and drop leading/trailing whitespace (a trailing newline
  // typed mid-edit shouldn't shift the block); interior blank lines are kept.
  const normalised = text.replace(/\r\n?/g, '\n').trim();
  if (!normalised) return { fontSize: style.fontSize, lines: [], truncated: false };
  if (availW <= 0 || availH <= 0) return { fontSize: style.minFontSize, lines: [], truncated: true };

  const paragraphs = normalised.split('\n');

  // Largest integer size that fits. A linear scan (not binary search) because
  // wrapped fit isn't strictly monotonic in size; with maxLength ≤ 500 it's cheap.
  // First pass keeps every word whole (shrinking instead); only if no size
  // allows that does a second pass break overlong words.
  let size = style.fontSize;
  let lines: string[] | null = null;
  for (const breakWords of [false, true]) {
    for (size = style.fontSize; size >= style.minFontSize; size--) {
      const candidate = wrapAll(paragraphs, size, availW, m, breakWords);
      if (
        candidate &&
        candidate.length <= style.maxLines &&
        blockHeight(candidate.length, size, style, m) <= availH &&
        candidate.every((l) => m.width(l, size) <= availW)
      ) {
        lines = candidate;
        break;
      }
    }
    if (lines) break;
  }

  let truncated = false;
  if (!lines) {
    // Nothing fits: clamp to minFontSize, keep what fits, ellipsize the last kept line.
    size = style.minFontSize;
    const all = wrapAll(paragraphs, size, availW, m, true) ?? [];
    const keep = Math.min(style.maxLines, linesThatFitHeight(size, availH, style, m), all.length);
    let kept = all.slice(0, keep);
    const tooWide = kept.findIndex((l) => m.width(l, size) > availW); // a single huge grapheme
    if (tooWide >= 0) kept = kept.slice(0, tooWide);
    truncated = true;
    if (kept.length === 0) return { fontSize: size, lines: [], truncated };
    if (kept.length < all.length) kept[kept.length - 1] = ellipsize(kept[kept.length - 1], size, availW, m);
    lines = kept;
  }

  const ascent = size * m.ascentRatio;
  const block = blockHeight(lines.length, size, style, m);
  const top =
    style.verticalAlign === 'top' ? 0 : style.verticalAlign === 'bottom' ? availH - block : (availH - block) / 2;

  return {
    fontSize: size,
    truncated,
    lines: lines.map((text, i) => {
      const width = m.width(text, size);
      const x = style.align === 'left' ? 0 : style.align === 'right' ? availW - width : (availW - width) / 2;
      return { text, width, x: x + sw, y: top + ascent + i * size * style.lineHeight + sw };
    }),
  };
}
