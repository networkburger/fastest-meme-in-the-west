import { canvasMeasurer, fontString, type FontMetrics } from './fonts';
import { layoutText } from './layoutText';
import type { ResolvedTemplate, Style } from './schema';

export interface RenderResult {
  truncatedFieldIds: string[];
}

/** Locale-independent, so output is deterministic across devices. */
export function transformText(text: string, style: Style): string {
  return style.uppercase ? text.toUpperCase() : text;
}

/** Draw the template image and every non-empty caption onto `ctx` at source resolution (§5.3). */
export function renderMeme(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  template: ResolvedTemplate,
  values: Readonly<Record<string, string>>,
  metrics: FontMetrics,
): RenderResult {
  const truncatedFieldIds: string[] = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, template.width, template.height);
  ctx.drawImage(image, 0, 0, template.width, template.height);

  for (const field of template.fields) {
    const raw = values[field.id] ?? '';
    if (!raw.trim()) continue;
    const { style, box } = field;
    const layout = layoutText(transformText(raw, style), style, box, canvasMeasurer(ctx, style.fontWeight, metrics));
    if (layout.truncated) truncatedFieldIds.push(field.id);
    if (layout.lines.length === 0) continue;

    ctx.save();
    ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
    ctx.rotate((box.rotation * Math.PI) / 180);
    ctx.translate(-box.width / 2, -box.height / 2);
    ctx.font = fontString(style.fontWeight, layout.fontSize);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    if (style.strokeWidth > 0) {
      // Stroke first at double width, then fill on top: the visible outline is
      // exactly strokeWidth outside the glyph, matching layoutText's inset.
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.lineWidth = style.strokeWidth * 2;
      ctx.strokeStyle = style.strokeColor;
      for (const line of layout.lines) ctx.strokeText(line.text, line.x, line.y);
    }
    ctx.fillStyle = style.color;
    for (const line of layout.lines) ctx.fillText(line.text, line.x, line.y);
    ctx.restore();
  }
  return { truncatedFieldIds };
}
