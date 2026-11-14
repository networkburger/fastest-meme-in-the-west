import { MAX_THUMB_EDGE, THUMB_ASPECT_TOLERANCE, parseManifest, type Issue, type ParseResult } from './schema';

export interface ImageSizeReader {
  /** Natural size of the image at a manifest-relative path, or null if it doesn't exist / can't be read. */
  size(path: string): Promise<{ width: number; height: number } | null>;
}

/**
 * The one manifest validator (§4.3): schema and cross-field rules, then file checks.
 * CI calls it with a filesystem-backed reader; M2 pack import will call it with a zip-backed one.
 */
export async function validateManifest(json: unknown, files: ImageSizeReader): Promise<ParseResult> {
  const parsed = parseManifest(json);
  if (!parsed.ok) return parsed;

  const issues: Issue[] = [];
  await Promise.all(
    parsed.manifest.templates.map(async (t, ti) => {
      const [image, thumb] = await Promise.all([files.size(t.image), files.size(t.thumbnail)]);
      if (!image) {
        issues.push({ path: `templates.${ti}.image`, message: `image "${t.image}" is missing or unreadable` });
      } else if (image.width !== t.width || image.height !== t.height) {
        issues.push({
          path: `templates.${ti}.image`,
          message: `image is ${image.width}×${image.height} but the manifest says ${t.width}×${t.height}`,
        });
      }
      if (!thumb) {
        issues.push({ path: `templates.${ti}.thumbnail`, message: `thumbnail "${t.thumbnail}" is missing or unreadable` });
      } else {
        if (Math.max(thumb.width, thumb.height) > MAX_THUMB_EDGE) {
          issues.push({ path: `templates.${ti}.thumbnail`, message: `thumbnail longest edge must be ≤ ${MAX_THUMB_EDGE}px` });
        }
        const ratio = thumb.width / thumb.height / (t.width / t.height);
        if (Math.abs(ratio - 1) > THUMB_ASPECT_TOLERANCE) {
          issues.push({ path: `templates.${ti}.thumbnail`, message: `thumbnail aspect ratio doesn't match the image` });
        }
      }
    }),
  );
  return issues.length ? { ok: false, issues } : parsed;
}
