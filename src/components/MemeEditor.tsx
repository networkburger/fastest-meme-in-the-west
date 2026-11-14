import type { TargetedFocusEvent } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { readDraft, writeDraft } from '../lib/draft';
import type { ResolvedTemplate } from '../lib/schema';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useMemeRenderer } from '../lib/useMemeRenderer';
import { CaptionField } from './CaptionField';
import { ExportActions } from './ExportActions';
import { MemePreview } from './MemePreview';
import { TopBar } from './TopBar';

const FIELD_GAP_PX = 8;

/** Keyboard counts as open when the visual viewport is this much shorter than its keyboard-less height. */
const KEYBOARD_RATIO = 0.75;

export function MemeEditor({ template }: { template: ResolvedTemplate }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    readDraft(
      template.id,
      template.fields.map((f) => f.id),
    ),
  );
  // Latest values, so a keystroke can save the draft immediately (not in an effect
  // after the next paint, which a quick reload or tab discard could beat).
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const { canvasRef, status, cache, truncatedFieldIds, retry } = useMemeRenderer(template, values);

  const touch = useMediaQuery('(pointer: coarse)');
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);
  compactRef.current = compact;

  const previewRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Start at the top; autofocus the first field only on fine pointers (§3.3).
  useEffect(() => {
    window.scrollTo(0, 0);
    if (touch) headingRef.current?.focus({ preventScroll: true });
    else fieldsRef.current?.querySelector('textarea')?.focus({ preventScroll: true });
  }, [template.id]); // once per template; `touch` is read at mount on purpose

  /** Scroll so the focused field sits directly below the sticky compact preview. */
  const positionField = useCallback((el: Element | null) => {
    const preview = previewRef.current;
    if (!compactRef.current || !preview || !(el instanceof HTMLElement) || !fieldsRef.current?.contains(el)) return;
    const target = el.closest('.caption-field') ?? el;
    const top = target.getBoundingClientRect().top + window.scrollY;
    const previewHeight = preview.getBoundingClientRect().height;
    window.scrollTo({ top: Math.max(0, top - previewHeight - FIELD_GAP_PX), behavior: 'instant' });
  }, []);

  // After entering compact mode the preview has shrunk: position once layout settles.
  useLayoutEffect(() => {
    if (compact) requestAnimationFrame(() => positionField(document.activeElement));
  }, [compact, positionField]);

  // Re-position when the keyboard opens; leave compact mode when it closes without a blur
  // (Android back dismisses the keyboard but leaves the textarea focused).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !touch) return;
    let baseline = { width: vv.width, height: vv.height };
    let keyboardOpen = false;
    const onResize = () => {
      if (Math.abs(vv.width - baseline.width) > 1) baseline = { width: vv.width, height: vv.height }; // rotation
      const open = vv.height < baseline.height * KEYBOARD_RATIO;
      if (!open) baseline.height = Math.max(baseline.height, vv.height);
      if (compactRef.current) {
        if (open) positionField(document.activeElement);
        else if (keyboardOpen && document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }
      keyboardOpen = open;
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, [touch, positionField]);

  function onFieldsFocus(e: TargetedFocusEvent<HTMLDivElement>) {
    if (touch) setCompact(true);
    if (compactRef.current) requestAnimationFrame(() => positionField(e.target as Element | null));
  }

  function onFieldsBlur(e: TargetedFocusEvent<HTMLDivElement>) {
    if (fieldsRef.current?.contains(e.relatedTarget as Node | null)) return; // moving between fields
    if (compactRef.current) {
      // Leaving compact mode: bring the full-size preview back into view.
      requestAnimationFrame(() => {
        const top = previewRef.current?.getBoundingClientRect().top ?? 0;
        if (top < 0) window.scrollBy({ top, behavior: 'instant' });
      });
    }
    setCompact(false);
    cache?.encodeNow().catch(() => {}); // have the PNG ready before the user reaches Share
  }

  function onPreviewPointerDown() {
    if (compact && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function setValue(id: string, value: string) {
    const next = { ...valuesRef.current, [id]: value };
    valuesRef.current = next;
    writeDraft(template.id, next);
    setValues(next);
  }

  return (
    <div className={`editor${compact ? ' editor--compact' : ''}`}>
      <TopBar title={template.name} headingRef={headingRef} />

      <div className="editor__body">
        <div className="editor__preview" ref={previewRef} onPointerDown={onPreviewPointerDown}>
          <MemePreview canvasRef={canvasRef} template={template} values={values} status={status} onRetry={retry} />
        </div>

        <div className="editor__panel">
          <div className="editor__fields" ref={fieldsRef} onFocusIn={onFieldsFocus} onFocusOut={onFieldsBlur}>
            {template.fields.map((field) => (
              <CaptionField
                key={field.id}
                field={field}
                value={values[field.id] ?? ''}
                truncated={truncatedFieldIds.includes(field.id)}
                onChange={(v) => setValue(field.id, v)}
              />
            ))}
          </div>
          <ExportActions cache={cache} />
        </div>
      </div>
    </div>
  );
}
