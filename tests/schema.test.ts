import { describe, expect, it } from 'vitest';
import { boxCorners, parseManifest } from '../src/lib/schema';
import { validateManifest } from '../src/lib/manifest';

function sample() {
  return {
    version: 1,
    defaults: {
      maxLength: 200,
      style: {
        fontFamily: 'MemeFont',
        fontSize: 72,
        minFontSize: 28,
        fontWeight: 400,
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 4,
        align: 'center',
        verticalAlign: 'middle',
        uppercase: true,
        maxLines: 2,
        lineHeight: 1.05,
      },
    },
    templates: [
      {
        id: 'example',
        name: 'Example',
        image: 'templates/example.jpg',
        thumbnail: 'templates/thumbs/example.jpg',
        width: 1200,
        height: 900,
        provenance: { source: 'test', license: 'CC0-1.0', attribution: null },
        fields: [
          { id: 'top', label: 'Top', box: { x: 80, y: 40, width: 1040, height: 160 } },
          { id: 'sign', label: 'Sign', box: { x: 700, y: 380, width: 300, height: 120, rotation: -8 }, style: { fontSize: 48, minFontSize: 20 } },
        ],
      },
    ],
  };
}

type Sample = ReturnType<typeof sample>;
function mutate(fn: (m: Sample) => void) {
  const m = sample();
  fn(m);
  return parseManifest(m);
}

function expectIssue(result: ReturnType<typeof parseManifest>, pathPart: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.some((i) => i.path.includes(pathPart))).toBe(true);
}

describe('parseManifest', () => {
  it('accepts a valid manifest and shallow-merges styles over defaults', () => {
    const r = parseManifest(sample());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [top, sign] = r.templates[0].fields;
    expect(top.style.fontSize).toBe(72);
    expect(top.maxLength).toBe(200);
    expect(top.box.rotation).toBe(0);
    expect(sign.style.fontSize).toBe(48);
    expect(sign.style.color).toBe('#FFFFFF');
    expect(sign.box.rotation).toBe(-8);
  });

  it('rejects unknown keys', () => {
    expectIssue(mutate((m) => Object.assign(m.templates[0], { colour: 'red' })), 'templates.0');
  });

  it('rejects duplicate template and field ids', () => {
    expectIssue(mutate((m) => m.templates.push(structuredClone(m.templates[0]))), 'templates.1.id');
    expectIssue(mutate((m) => (m.templates[0].fields[1].id = 'top')), 'fields.1.id');
  });

  it('rejects minFontSize > fontSize after merging', () => {
    expectIssue(mutate((m) => (m.templates[0].fields[0] = { ...m.templates[0].fields[0], style: { minFontSize: 100 } } as never)), 'fields.0.style');
  });

  it('rejects unbundled fonts and weights', () => {
    expectIssue(mutate((m) => (m.defaults.style.fontFamily = 'Impact')), 'fontFamily');
    expectIssue(mutate((m) => (m.defaults.style.fontWeight = 700)), 'fontWeight');
  });

  it('rejects boxes outside the image, including after rotation', () => {
    expectIssue(mutate((m) => (m.templates[0].fields[0].box.width = 2000)), 'fields.0.box');
    // fits unrotated, but a 45° rotation pushes the corners out of a 1200×900 image
    expectIssue(mutate((m) => (m.templates[0].fields[0].box = { x: 0, y: 0, width: 1200, height: 160, rotation: 45 } as never)), 'fields.0.box');
  });

  it('rejects root-absolute, scheme and parent-directory paths', () => {
    for (const p of ['/templates/x.jpg', 'https://example.com/x.jpg', '../x.jpg', 'templates/x.gif']) {
      expectIssue(mutate((m) => (m.templates[0].image = p)), 'image');
    }
  });

  it('rejects bad colours, ids, versions and oversized images', () => {
    expectIssue(mutate((m) => (m.defaults.style.color = 'white')), 'color');
    expectIssue(mutate((m) => (m.templates[0].id = 'Has Spaces')), 'templates.0.id');
    expectIssue(mutate((m) => (m.version = 2)), 'version');
    expectIssue(mutate((m) => (m.templates[0].width = 4000)), 'width');
  });
});

describe('boxCorners', () => {
  it('rotates clockwise about the centre', () => {
    const corners = boxCorners({ x: 0, y: 0, width: 100, height: 100, rotation: 90 });
    // top-left corner moves to top-right
    expect(corners[0].x).toBeCloseTo(100);
    expect(corners[0].y).toBeCloseTo(0);
  });
});

describe('validateManifest', () => {
  const sizes: Record<string, { width: number; height: number }> = {
    'templates/example.jpg': { width: 1200, height: 900 },
    'templates/thumbs/example.jpg': { width: 480, height: 360 },
  };

  it('passes when files match', async () => {
    const r = await validateManifest(sample(), { size: async (p) => sizes[p] ?? null });
    expect(r.ok).toBe(true);
  });

  it('reports missing files, size mismatches and bad thumbnails', async () => {
    const missing = await validateManifest(sample(), { size: async () => null });
    expect(missing.ok).toBe(false);

    const wrongSize = await validateManifest(sample(), {
      size: async (p) => (p.includes('thumbs') ? sizes[p] : { width: 1000, height: 900 }),
    });
    expect(!wrongSize.ok && wrongSize.issues[0].message).toMatch(/1000×900/);

    const badThumb = await validateManifest(sample(), {
      size: async (p) => (p.includes('thumbs') ? { width: 480, height: 480 } : sizes[p]),
    });
    expect(!badThumb.ok && badThumb.issues[0].message).toMatch(/aspect ratio/);
  });
});
