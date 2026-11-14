/**
 * How the caption font is split (scripts/build-fonts.mjs). Shared with the app
 * so it knows when a caption needs the extended subset.
 */

/** Basic Latin, Latin-1 and common punctuation/symbols: the eagerly loaded subset. */
export const LATIN_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

/** The masthead title (rendered uppercase); its letters get their own tiny inlined subset. */
export const TITLE_TEXT = 'FASTEST MEME IN THE WEST';

export function inRanges(cp: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([a, b]) => cp >= a && cp <= b);
}

/** CSS `unicode-range` value for the Latin subset. */
export const LATIN_UNICODE_RANGE = LATIN_RANGES.map(([a, b]) =>
  a === b ? `U+${a.toString(16)}` : `U+${a.toString(16)}-${b.toString(16)}`,
).join(', ');

/** CSS `unicode-range` value covering every code point outside the Latin subset. */
export const EXTENDED_UNICODE_RANGE = (() => {
  const out: string[] = [];
  let next = 0;
  for (const [a, b] of LATIN_RANGES) {
    if (a > next) out.push(`U+${next.toString(16)}-${(a - 1).toString(16)}`);
    next = b + 1;
  }
  out.push(`U+${next.toString(16)}-10ffff`);
  return out.join(', ');
})();

/** True if any character of `text` is outside the Latin subset. */
export function needsExtendedFont(text: string): boolean {
  for (const ch of text) if (!inRanges(ch.codePointAt(0)!, LATIN_RANGES)) return true;
  return false;
}
