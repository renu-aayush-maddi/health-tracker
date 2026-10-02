import { useId } from 'react';
import styles from './SegmentedControl.module.css';

/** A labelled group of radio buttons rendered as segments. `options`: [{ value, label, icon }]. */
export default function SegmentedControl({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  action,
}) {
  const errorId = useId();
  return (
    <fieldset className={styles.fieldset} aria-describedby={error ? errorId : undefined}>
      <div className={styles.legendRow}>
        <legend className={styles.legend}>{legend}</legend>
        {action}
      </div>
      <div className={styles.segments}>
        {options.map(({ value: optionValue, label, icon: Icon }) => (
          <label key={optionValue} className={styles.segment}>
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
              className={styles.input}
            />
            {Icon && <Icon size={16} aria-hidden="true" />}
            <span>{label}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
