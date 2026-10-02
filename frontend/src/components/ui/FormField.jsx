import { useId } from 'react';
import styles from './Field.module.css';

/**
 * Label + control + hint + error, wired together for assistive tech.
 * `children` is a render function receiving the props the control must spread.
 */
export default function FormField({
  label,
  hint,
  error,
  required,
  hideLabel,
  className = '',
  children,
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`${styles.field} ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : styles.label}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
        className: `${styles.control} ${error ? styles.invalid : ''}`,
      })}
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
