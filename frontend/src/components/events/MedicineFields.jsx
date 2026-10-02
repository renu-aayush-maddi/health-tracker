import { useId } from 'react';
import { LIMITS } from '@health-tracker/shared';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { useMedicineNames } from '../../hooks/useHealthEvents.js';
import TextField from '../ui/TextField.jsx';
import TextareaField from '../ui/TextareaField.jsx';
import styles from './MedicineFields.module.css';

const FREQUENCY_SUGGESTIONS = [
  'Once a day',
  'Twice a day',
  'Three times a day',
  'Every 4 hours',
  'Every 6 hours',
  'Every 8 hours',
  'At bedtime',
  'With meals',
  'As needed',
];

/**
 * Inputs for one medicine. `prefix` is the path inside the form ("medicines.0." or "").
 * Name suggestions come from medicines this user has recorded before.
 */
export default function MedicineFields({ form, prefix = '', autoFocusName = false }) {
  const nameListId = useId();
  const frequencyListId = useId();
  const nameField = form.field(`${prefix}name`);
  const search = useDebouncedValue(String(nameField.value).trim(), 250);
  const suggestions = useMedicineNames(search || undefined);

  return (
    <div className={styles.grid}>
      <TextField
        label="Medicine name"
        required
        className={styles.full}
        list={nameListId}
        autoComplete="off"
        autoFocus={autoFocusName}
        data-autofocus={autoFocusName || undefined} /* used when rendered inside a <Dialog> */
        maxLength={LIMITS.medicineNameMax}
        placeholder="e.g. Paracetamol"
        {...nameField}
      />
      <datalist id={nameListId}>
        {(suggestions.data ?? []).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <TextField
        label="Dosage"
        placeholder="e.g. 500 mg"
        maxLength={LIMITS.dosageMax}
        {...form.field(`${prefix}dosage`)}
      />
      <TextField
        label="Frequency"
        placeholder="e.g. Twice a day"
        list={frequencyListId}
        autoComplete="off"
        maxLength={LIMITS.frequencyMax}
        {...form.field(`${prefix}frequency`)}
      />
      <datalist id={frequencyListId}>
        {FREQUENCY_SUGGESTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      <TextField label="From" type="date" {...form.field(`${prefix}startDate`)} />
      <TextField label="To" type="date" {...form.field(`${prefix}endDate`)} />
      <TextareaField
        label="Notes"
        rows={2}
        className={styles.full}
        placeholder="e.g. Taken after food"
        maxLength={LIMITS.medicineNotesMax}
        {...form.field(`${prefix}notes`)}
      />
    </div>
  );
}
