import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { RenderStatus } from '../lib/useMemeRenderer';
import type { ResolvedTemplate } from '../lib/schema';

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  template: ResolvedTemplate;
  values: Readonly<Record<string, string>>;
  status: RenderStatus;
  onRetry: () => void;
}

function describe(template: ResolvedTemplate, values: Readonly<Record<string, string>>) {
  const captions = template.fields.map((f) => values[f.id]?.trim()).filter(Boolean);
  return captions.length ? `${template.name}: ${captions.join(' / ')}` : template.name;
}

/** The exact export canvas, scaled with CSS only; no DOM text overlays (§5.1). */
export function MemePreview({ canvasRef, template, values, status, onRetry }: Props) {
  const [label, setLabel] = useState(() => describe(template, values));
  useEffect(() => {
    const t = setTimeout(() => setLabel(describe(template, values)), 500);
    return () => clearTimeout(t);
  }, [template, values]);

  return (
    <div className="preview" data-state={status.state}>
      <canvas
        ref={canvasRef}
        className="preview__canvas"
        width={template.width}
        height={template.height}
        role="img"
        aria-label={label}
      />
      {status.state === 'loading' && (
        <div className="preview__overlay" aria-hidden="true">
          <span className="spinner" />
        </div>
      )}
      {status.state === 'error' && (
        <div className="preview__overlay preview__overlay--error" role="alert">
          <p>{status.message}</p>
          <button type="button" className="button button--secondary" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
