import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { LIMITS } from '@health-tracker/shared';
import styles from './EventForm.module.css';

/** Free-text symptoms entered as removable chips. Enter or comma adds; pending text is kept on blur. */
export default function SymptomInput({ symptoms, onChange, error }) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const full = symptoms.length >= LIMITS.symptomsMaxCount;

  const commit = () => {
    const symptom = draft.trim().slice(0, LIMITS.symptomMax);
    if (symptom && !full && !symptoms.some((s) => s.toLowerCase() === symptom.toLowerCase())) {
      onChange([...symptoms, symptom]);
    }
    setDraft('');
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && !draft && symptoms.length) {
      onChange(symptoms.slice(0, -1));
    }
  };

  return (
    <div className={styles.symptoms}>
      <label htmlFor={inputId} className={styles.fieldLabel}>
        Symptoms
      </label>
      <div className={styles.symptomEntry}>
        <input
          id={inputId}
          name="symptoms"
          className={`${styles.input} ${error ? styles.inputInvalid : ''}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={full ? 'Symptom limit reached' : 'e.g. Body pain'}
          disabled={full}
          maxLength={LIMITS.symptomMax}
          aria-describedby={`${error ? errorId : ''} ${hintId}`.trim()}
          aria-invalid={error ? true : undefined}
          enterKeyHint="done"
        />
        <button
          type="button"
          className={styles.addSymptom}
          onClick={commit}
          disabled={!draft.trim() || full}
        >
          <Plus size={18} aria-hidden="true" />
          <span className="visually-hidden">Add symptom</span>
        </button>
      </div>
      <p id={hintId} className={styles.fieldHint}>
        Press Enter after each symptom.
      </p>
      {error && (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      )}
      {symptoms.length > 0 && (
        <ul className={styles.symptomList} aria-label="Added symptoms">
          {symptoms.map((symptom) => (
            <li key={symptom} className={styles.symptomChip}>
              {symptom}
              <button
                type="button"
                onClick={() => onChange(symptoms.filter((s) => s !== symptom))}
                aria-label={`Remove ${symptom}`}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
