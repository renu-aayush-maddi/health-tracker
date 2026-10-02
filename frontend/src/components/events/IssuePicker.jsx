import { useId } from 'react';
import { HEALTH_ISSUES, LIMITS } from '@health-tracker/shared';
import TextField from '../ui/TextField.jsx';
import styles from './EventForm.module.css';

/**
 * Common issues as one-tap chips, plus "Other" for anything else.
 * All radios share name="healthIssue" so validation can focus the group.
 */
export default function IssuePicker({
  value,
  isCustom,
  onSelect,
  onSelectCustom,
  customField,
  error,
}) {
  const errorId = useId();
  return (
    <fieldset
      className={styles.fieldset}
      aria-describedby={error && !isCustom ? errorId : undefined}
    >
      <legend className={styles.fieldLegend}>
        Health issue
        <span className={styles.required} aria-hidden="true">
          {' '}
          *
        </span>
      </legend>
      <div className={styles.chips}>
        {HEALTH_ISSUES.map((issue) => (
          <label key={issue} className={styles.chip}>
            <input
              type="radio"
              name="healthIssue"
              value={issue}
              checked={!isCustom && value === issue}
              onChange={() => onSelect(issue)}
              className={styles.chipInput}
            />
            {issue}
          </label>
        ))}
        <label className={styles.chip}>
          <input
            type="radio"
            name="healthIssue"
            value="__other"
            checked={isCustom}
            onChange={onSelectCustom}
            className={styles.chipInput}
          />
          Other…
        </label>
      </div>
      {isCustom ? (
        <TextField
          label="Describe the health issue"
          required
          autoFocus
          maxLength={LIMITS.healthIssueMax}
          placeholder="e.g. Ear infection, Sprained ankle"
          className={styles.customIssue}
          {...customField}
        />
      ) : (
        error && (
          <p id={errorId} className={styles.fieldError}>
            {error}
          </p>
        )
      )}
    </fieldset>
  );
}
