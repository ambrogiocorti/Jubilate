import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactElement<Record<string, unknown>>;
  hideLabel?: boolean;
}

/** Wires label, hint and error to the control via ids (accessible names/descriptions). */
export function Field({ label, hint, error, children, hideLabel }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'field__label'}>{label}</label>
      {cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && <div id={hintId} className="field__hint">{hint}</div>}
      {error && <div id={errorId} className="field__error">{error}</div>}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
