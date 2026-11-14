import { useLayoutEffect, useRef } from 'preact/hooks';
import type { ResolvedField } from '../lib/schema';

interface Props {
  field: ResolvedField;
  value: string;
  truncated: boolean;
  onChange: (value: string) => void;
}

/** One caption input: a textarea (newlines allowed) that grows to 4 rows, then scrolls (§3.3). */
export function CaptionField({ field, value, truncated, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const inputId = `field-${field.id}`;
  const noteId = `${inputId}-note`;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`; // CSS max-height caps at 4 rows
  }, [value]);

  return (
    <div className="caption-field">
      <div className="caption-field__head">
        <label className="caption-field__label" htmlFor={inputId}>
          {field.label}
        </label>
        {/* Shown by CSS only in compact mode, on the focused field: a visible way out of
            typing (§3.3). Pressing it mustn't move focus first, or the layout would shift
            under the finger; the click then blurs the field, which leaves compact mode. */}
        <button
          type="button"
          className="caption-field__done"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => ref.current?.blur()}
        >
          Done
        </button>
      </div>
      <textarea
        ref={ref}
        id={inputId}
        className="caption-field__input"
        rows={1}
        value={value}
        placeholder={field.placeholder}
        maxLength={field.maxLength}
        autoComplete="off"
        enterkeyhint="enter"
        aria-describedby={truncated ? noteId : undefined}
        onInput={(e) => onChange(e.currentTarget.value)}
      />
      {truncated && (
        <p id={noteId} className="caption-field__note">
          Too long — text was shortened.
        </p>
      )}
    </div>
  );
}
