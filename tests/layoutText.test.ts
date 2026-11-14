import { describe, expect, it } from 'vitest';
import { ELLIPSIS, graphemes, layoutText, type Layout, type LayoutStyle, type Measurer } from '../src/lib/layoutText';

/**
 * Fixed-width fake: every code point is 0.6em wide, except zero-width joiners,
 * combining marks and variation selectors (cheap stand-in for grapheme counting).
 */
const ZERO_WIDTH = /[\u200D\u0300-\u036F\uFE0F]/gu;
const mono: Measurer = {
  width: (text, size) => [...text.replace(ZERO_WIDTH, '')].length * 0.6 * size,
  ascentRatio: 0.8,
  descentRatio: 0.2,
};

const base: LayoutStyle = {
  fontSize: 72,
  minFontSize: 28,
  strokeWidth: 5,
  align: 'center',
  verticalAlign: 'middle',
  maxLines: 2,
  lineHeight: 1.0,
};

const box = { width: 1040, height: 160 };

function expectInsideBox(layout: Layout, style: LayoutStyle, b: { width: number; height: number }, m = mono) {
  const eps = 1e-6;
  const sw = style.strokeWidth;
  for (const line of layout.lines) {
    expect(line.x - sw).toBeGreaterThanOrEqual(-eps);
    expect(line.x + line.width + sw).toBeLessThanOrEqual(b.width + eps);
    expect(line.y - layout.fontSize * m.ascentRatio - sw).toBeGreaterThanOrEqual(-eps);
    expect(line.y + layout.fontSize * m.descentRatio + sw).toBeLessThanOrEqual(b.height + eps);
  }
}

describe('layoutText', () => {
  it('returns no lines for empty or whitespace-only text', () => {
    for (const text of ['', '   ', '\n\n', ' \t\n ']) {
      const l = layoutText(text, base, box, mono);
      expect(l.lines).toEqual([]);
      expect(l.truncated).toBe(false);
    }
  });

  it('keeps short text at the starting size on one line', () => {
    const l = layoutText('HELLO', base, box, mono);
    expect(l.fontSize).toBe(72);
    expect(l.lines.map((x) => x.text)).toEqual(['HELLO']);
    expect(l.truncated).toBe(false);
  });

  it('steps the size down before truncating', () => {
    const text = 'ONE DOES NOT SIMPLY WRITE A LONG CAPTION LIKE THIS';
    const l = layoutText(text, base, box, mono);
    expect(l.truncated).toBe(false);
    expect(l.fontSize).toBeLessThan(72);
    expect(l.fontSize).toBeGreaterThanOrEqual(28);
    expect(l.lines.length).toBeLessThanOrEqual(2);
    expect(l.lines.map((x) => x.text).join(' ')).toBe(text);
  });

  it('chooses the largest size that fits', () => {
    const text = 'ONE DOES NOT SIMPLY WRITE A LONG CAPTION LIKE THIS';
    const l = layoutText(text, base, box, mono);
    const bigger = layoutText(text, { ...base, fontSize: l.fontSize + 1, minFontSize: l.fontSize + 1 }, box, mono);
    expect(bigger.truncated).toBe(true);
  });

  it('truncates with an ellipsis at minFontSize and respects maxLines', () => {
    const text = 'WORD '.repeat(200);
    const l = layoutText(text, base, box, mono);
    expect(l.truncated).toBe(true);
    expect(l.fontSize).toBe(28);
    expect(l.lines.length).toBeLessThanOrEqual(2);
    expect(l.lines.at(-1)!.text.endsWith(ELLIPSIS)).toBe(true);
    expectInsideBox(l, base, box);
  });

  it('honours explicit newlines and keeps interior blank lines', () => {
    const style = { ...base, maxLines: 3 };
    const l = layoutText('TOP\n\nBOTTOM', style, { width: 1040, height: 400 }, mono);
    expect(l.lines.map((x) => x.text)).toEqual(['TOP', '', 'BOTTOM']);
  });

  it('ignores leading and trailing newlines', () => {
    const l = layoutText('\nHELLO\n', base, box, mono);
    expect(l.lines.map((x) => x.text)).toEqual(['HELLO']);
  });

  it('shrinks rather than splitting a word that fits whole at a smaller size', () => {
    const b = { width: 400, height: 160 };
    const l = layoutText('DOCUMENTATION', base, b, mono);
    // At 72px the word would need splitting into two lines; whole, it fits at 50px.
    expect(l.lines.map((x) => x.text)).toEqual(['DOCUMENTATION']);
    expect(l.fontSize).toBe(50);
    expect(l.truncated).toBe(false);
    expectInsideBox(l, base, b);
  });

  it('breaks a single overlong word at grapheme boundaries', () => {
    const style = { ...base, maxLines: 8 };
    const b = { width: 400, height: 600 };
    const word = 'SUPERCALIFRAGILISTICEXPIALIDOCIOUS'.repeat(3);
    const l = layoutText(word, style, b, mono);
    expect(l.truncated).toBe(false);
    expect(l.lines.length).toBeGreaterThan(1);
    expect(l.lines.map((x) => x.text).join('')).toBe(word);
    expectInsideBox(l, style, b);
  });

  it('never splits an emoji ZWJ sequence or a combining accent', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    const eAcute = 'é';
    const style = { ...base, maxLines: 6, strokeWidth: 0 };
    for (const unit of [family, eAcute]) {
      const l = layoutText(unit.repeat(30), style, { width: 300, height: 600 }, mono);
      for (const line of l.lines) {
        const clusters = graphemes(line.text.replace(ELLIPSIS, ''));
        for (const c of clusters) expect(c).toBe(unit);
      }
    }
  });

  it('keeps every line (with outline) inside the box for many inputs', () => {
    const texts = [
      'A',
      'SHORT',
      'A MEDIUM LENGTH CAPTION',
      'A VERY LONG CAPTION THAT GOES ON AND ON AND ON WITHOUT ANY REGARD FOR THE SIZE OF THE BOX',
      'LINE ONE\nLINE TWO\nLINE THREE\nLINE FOUR',
      'X'.repeat(300),
      '\u{1F600} '.repeat(40),
    ];
    const boxes = [
      { width: 1040, height: 160 },
      { width: 300, height: 120 },
      { width: 120, height: 400 },
      { width: 60, height: 40 },
    ];
    for (const text of texts) {
      for (const b of boxes) {
        for (const align of ['left', 'center', 'right'] as const) {
          for (const verticalAlign of ['top', 'middle', 'bottom'] as const) {
            for (const strokeWidth of [0, 3, 8]) {
              const style = { ...base, align, verticalAlign, strokeWidth, maxLines: 3, minFontSize: 12 };
              const l = layoutText(text, style, b, mono);
              expectInsideBox(l, style, b);
              expect(l.lines.length).toBeLessThanOrEqual(3);
            }
          }
        }
      }
    }
  });

  it('positions lines according to alignment', () => {
    const b = { width: 1000, height: 200 };
    const sw = 5;
    const left = layoutText('HI', { ...base, align: 'left', verticalAlign: 'top' }, b, mono);
    expect(left.lines[0].x).toBe(sw);
    expect(left.lines[0].y).toBeCloseTo(sw + 72 * 0.8);
    const right = layoutText('HI', { ...base, align: 'right', verticalAlign: 'bottom' }, b, mono);
    expect(right.lines[0].x + right.lines[0].width).toBeCloseTo(b.width - sw);
    expect(right.lines[0].y + 72 * 0.2).toBeCloseTo(b.height - sw);
  });

  it('draws nothing when the box is smaller than the outline', () => {
    const l = layoutText('HELLO', { ...base, strokeWidth: 50 }, { width: 80, height: 80 }, mono);
    expect(l.lines).toEqual([]);
    expect(l.truncated).toBe(true);
  });

  it('is deterministic', () => {
    const text = 'THE SAME INPUT\nGIVES THE SAME OUTPUT EVERY SINGLE TIME';
    expect(layoutText(text, base, box, mono)).toEqual(layoutText(text, base, box, mono));
  });
});
