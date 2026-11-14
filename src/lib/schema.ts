import { z } from 'zod';

/** Logical font families bundled with the app, and the weights each provides (§4.4). */
export const BUNDLED_FONTS = { MemeFont: [400] } as const;
export type FontFamily = keyof typeof BUNDLED_FONTS;

/** Longest permitted image edge, in source pixels (§4.2). */
export const MAX_IMAGE_EDGE = 2048;
/** Longest permitted thumbnail edge (§4.2). */
export const MAX_THUMB_EDGE = 480;
/** Permitted thumbnail/image aspect-ratio difference (§4.2). */
export const THUMB_ASPECT_TOLERANCE = 0.01;

const fontFamilies = Object.keys(BUNDLED_FONTS) as [FontFamily, ...FontFamily[]];

const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'must be #RGB or #RRGGBB');
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must use lowercase a-z, 0-9 and single hyphens');
const relativePath = z
  .string()
  .min(1)
  .refine(
    (p) => !p.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.includes('\\') && !p.split('/').includes('..'),
    'must be a relative path (no leading "/", scheme, "\\" or "..")',
  );
const imagePath = relativePath.refine((p) => /\.(jpe?g|png|webp)$/i.test(p), 'must end in .jpg, .jpeg, .png or .webp');

export const styleSchema = z.strictObject({
  fontFamily: z.enum(fontFamilies),
  fontSize: z.number().int().positive(),
  minFontSize: z.number().int().min(1),
  fontWeight: z.number().int().min(100).max(900).multipleOf(100),
  color: hexColor,
  strokeColor: hexColor,
  strokeWidth: z.number().min(0),
  align: z.enum(['left', 'center', 'right']),
  verticalAlign: z.enum(['top', 'middle', 'bottom']),
  uppercase: z.boolean(),
  maxLines: z.number().int().min(1),
  lineHeight: z.number().min(0.8).max(2),
});

const boxSchema = z.strictObject({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().min(-180).max(180).optional(),
});

const fieldSchema = z.strictObject({
  id: slug,
  label: z.string().min(1).max(80),
  placeholder: z.string().max(120).optional(),
  box: boxSchema,
  maxLength: z.number().int().min(1).max(500).optional(),
  style: styleSchema.partial().optional(),
});

const templateSchema = z.strictObject({
  id: slug,
  name: z.string().min(1).max(80),
  image: imagePath,
  thumbnail: imagePath,
  width: z.number().int().positive().max(MAX_IMAGE_EDGE),
  height: z.number().int().positive().max(MAX_IMAGE_EDGE),
  provenance: z.strictObject({
    source: z.string().min(1),
    license: z.string().min(1),
    attribution: z.string().min(1).nullable(),
  }),
  fields: z.array(fieldSchema).min(1),
});

export const manifestSchema = z.strictObject({
  version: z.literal(1),
  defaults: z.strictObject({
    maxLength: z.number().int().min(1).max(500),
    style: styleSchema,
  }),
  templates: z.array(templateSchema).min(1),
});

export type Style = z.infer<typeof styleSchema>;
export type Box = z.infer<typeof boxSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type TemplateEntry = Manifest['templates'][number];
export type Provenance = TemplateEntry['provenance'];

export interface ResolvedField {
  id: string;
  label: string;
  placeholder?: string;
  box: Required<Box>;
  maxLength: number;
  style: Style;
}

export interface ResolvedTemplate {
  id: string;
  name: string;
  image: string;
  thumbnail: string;
  width: number;
  height: number;
  provenance: Provenance;
  fields: ResolvedField[];
}

/**
 * The part of a template the grid needs; shipped in the JS bundle. `avif`
 * marks that an AVIF thumbnail exists next to the JPEG (scripts/build-thumbs.mjs).
 */
export type TemplateSummary = Pick<ResolvedTemplate, 'id' | 'name' | 'thumbnail' | 'width' | 'height'> & { avif?: true };

export interface Issue {
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; manifest: Manifest; templates: ResolvedTemplate[] }
  | { ok: false; issues: Issue[] };

/** Corners of a box after rotating it clockwise by `rotation` degrees about its centre. */
export function boxCorners(box: Box): { x: number; y: number }[] {
  const r = ((box.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([dx, dy]) => {
    const px = (dx * box.width) / 2;
    const py = (dy * box.height) / 2;
    return { x: cx + px * cos - py * sin, y: cy + px * sin + py * cos };
  });
}

/** Shallow merge of a field's partial style over the manifest defaults: the only cascade (§4.2). */
export function resolveStyle(defaults: Style, override: Partial<Style> | undefined): Style {
  return { ...defaults, ...override };
}

export function resolveTemplates(manifest: Manifest): ResolvedTemplate[] {
  return manifest.templates.map((t) => ({
    id: t.id,
    name: t.name,
    image: t.image,
    thumbnail: t.thumbnail,
    width: t.width,
    height: t.height,
    provenance: t.provenance,
    fields: t.fields.map((f) => ({
      id: f.id,
      label: f.label,
      placeholder: f.placeholder,
      box: { ...f.box, rotation: f.box.rotation ?? 0 },
      maxLength: f.maxLength ?? manifest.defaults.maxLength,
      style: resolveStyle(manifest.defaults.style, f.style),
    })),
  }));
}

const EDGE_EPSILON = 0.5; // tolerate float error when a rotated corner touches the image edge

/** Rules that span several values: uniqueness, merged-style consistency and bounds (§4.3). */
function crossChecks(manifest: Manifest): Issue[] {
  const issues: Issue[] = [];
  const templateIds = new Set<string>();
  manifest.templates.forEach((t, ti) => {
    const tPath = `templates.${ti}`;
    if (templateIds.has(t.id)) issues.push({ path: `${tPath}.id`, message: `duplicate template id "${t.id}"` });
    templateIds.add(t.id);

    const fieldIds = new Set<string>();
    t.fields.forEach((f, fi) => {
      const fPath = `${tPath}.fields.${fi}`;
      if (fieldIds.has(f.id)) issues.push({ path: `${fPath}.id`, message: `duplicate field id "${f.id}" in template "${t.id}"` });
      fieldIds.add(f.id);

      const style = resolveStyle(manifest.defaults.style, f.style);
      if (style.minFontSize > style.fontSize) {
        issues.push({ path: `${fPath}.style`, message: `minFontSize (${style.minFontSize}) must not exceed fontSize (${style.fontSize})` });
      }
      const weights: readonly number[] = BUNDLED_FONTS[style.fontFamily];
      if (!weights.includes(style.fontWeight)) {
        issues.push({ path: `${fPath}.style.fontWeight`, message: `${style.fontFamily} is only bundled in weight(s) ${weights.join(', ')}` });
      }

      const outside = boxCorners(f.box).some(
        (c) => c.x < -EDGE_EPSILON || c.y < -EDGE_EPSILON || c.x > t.width + EDGE_EPSILON || c.y > t.height + EDGE_EPSILON,
      );
      if (outside) issues.push({ path: `${fPath}.box`, message: `box (after rotation) extends outside the ${t.width}×${t.height} image` });
    });
  });
  return issues;
}

/** Schema + cross-field validation, without touching any files. */
export function parseManifest(json: unknown): ParseResult {
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join('.') || '(root)', message: i.message })),
    };
  }
  const issues = crossChecks(parsed.data);
  if (issues.length) return { ok: false, issues };
  return { ok: true, manifest: parsed.data, templates: resolveTemplates(parsed.data) };
}
