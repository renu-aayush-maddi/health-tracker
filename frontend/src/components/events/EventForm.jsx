import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router';
import { Plus, SignalHigh, SignalLow, SignalMedium, Trash2 } from 'lucide-react';
import { healthEventSchema, LIMITS } from '@health-tracker/shared';
import { useFeatures } from '../../hooks/useHealthEvents.js';
import { useZodForm } from '../../hooks/useZodForm.js';
import { todayISO } from '../../utils/dates.js';
import PendingFiles from '../attachments/PendingFiles.jsx';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import SegmentedControl from '../ui/SegmentedControl.jsx';
import TextareaField from '../ui/TextareaField.jsx';
import TextField from '../ui/TextField.jsx';
import Toggle from '../ui/Toggle.jsx';
import { emptyMedicine, isPresetIssue } from './eventFormValues.js';
import IssuePicker from './IssuePicker.jsx';
import MedicineFields from './MedicineFields.jsx';
import SymptomInput from './SymptomInput.jsx';
import styles from './EventForm.module.css';

const SEVERITY_OPTIONS = [
  { value: 'mild', label: 'Mild', icon: SignalLow },
  { value: 'moderate', label: 'Moderate', icon: SignalMedium },
  { value: 'severe', label: 'Severe', icon: SignalHigh },
];

/**
 * `onSubmit(event, files)`: `event` is the validated payload; `files` are optional attachments
 * the caller uploads once the event exists.
 */
export default function EventForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
  existingFileCount = 0,
}) {
  const form = useZodForm({ schema: healthEventSchema, initialValues });
  const features = useFeatures();
  const { values, setField, setValues } = form;
  const [isCustomIssue, setIsCustomIssue] = useState(
    () => Boolean(initialValues.healthIssue) && !isPresetIssue(initialValues.healthIssue),
  );
  const [autoTitle, setAutoTitle] = useState(initialValues.title || null);
  const [newMedicineKey, setNewMedicineKey] = useState(null);
  const ongoing = values.status === 'ongoing';
  const today = todayISO();

  // Guard against losing work: in-app navigation asks first; closing the tab triggers the browser prompt.
  const blocker = useBlocker(form.isDirty && !form.submitting);
  useEffect(() => {
    if (!form.isDirty) return undefined;
    const warn = (event) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [form.isDirty]);

  /** Picking an issue fills the title too, unless the user has typed their own title. */
  const fillTitleFrom = (issue) => {
    if (!values.title.trim() || values.title === autoTitle) {
      setField('title', issue);
      setAutoTitle(issue);
    }
  };

  const selectIssue = (issue) => {
    setIsCustomIssue(false);
    setField('healthIssue', issue);
    fillTitleFrom(issue);
  };

  const selectCustomIssue = () => {
    setIsCustomIssue(true);
    setField('healthIssue', '');
  };

  const customIssueField = form.field('healthIssue');
  const onCustomIssueBlur = () => {
    customIssueField.onBlur();
    if (values.healthIssue.trim()) fillTitleFrom(values.healthIssue.trim());
  };

  const setOngoing = (isOngoing) => {
    setValues((prev) => ({
      ...prev,
      status: isOngoing ? 'ongoing' : 'resolved',
      endDate: isOngoing ? '' : prev.endDate || (prev.startDate > today ? prev.startDate : today),
    }));
  };

  const addMedicine = () => {
    const medicine = emptyMedicine(values.startDate);
    setNewMedicineKey(medicine.key);
    setValues((prev) => ({ ...prev, medicines: [...prev.medicines, medicine] }));
  };

  const removeMedicine = (index) => {
    setValues((prev) => ({ ...prev, medicines: prev.medicines.filter((_, i) => i !== index) }));
  };

  const symptomsError =
    form.errorFor('symptoms') ??
    values.symptoms.map((_, i) => form.errorFor(`symptoms.${i}`)).find(Boolean);

  return (
    <>
      <form
        className={styles.form}
        onSubmit={form.handleSubmit((event) => onSubmit(event, values.files))}
        noValidate
      >
        {form.formError && <Alert>{form.formError}</Alert>}

        <section className={styles.section} aria-labelledby="event-what">
          <h2 id="event-what" className={styles.sectionTitle}>
            What happened?
          </h2>
          <IssuePicker
            value={values.healthIssue}
            isCustom={isCustomIssue}
            onSelect={selectIssue}
            onSelectCustom={selectCustomIssue}
            customField={{ ...customIssueField, onBlur: onCustomIssueBlur }}
            error={form.errorFor('healthIssue')}
          />
          <TextField
            label="Title"
            required
            maxLength={LIMITS.titleMax}
            hint="A short name you'll recognize later."
            {...form.field('title')}
          />
          <TextareaField
            label="Description"
            rows={3}
            maxLength={LIMITS.descriptionMax}
            placeholder="What happened, in your own words (optional)"
            {...form.field('description')}
          />
        </section>

        <section className={styles.section} aria-labelledby="event-when">
          <h2 id="event-when" className={styles.sectionTitle}>
            When?
          </h2>
          <div className={styles.dateGrid}>
            <TextField
              label="Started"
              type="date"
              required
              max={today}
              {...form.field('startDate')}
            />
            {!ongoing && (
              <TextField
                label="Ended"
                type="date"
                required
                min={values.startDate || undefined}
                {...form.field('endDate')}
              />
            )}
          </div>
          <Toggle
            name="status"
            label="Still ongoing"
            description={
              ongoing ? "Turn off once it's over to add an end date." : 'This issue has ended.'
            }
            checked={ongoing}
            onChange={setOngoing}
          />
          {ongoing && form.errorFor('endDate') && (
            <p className={styles.fieldError}>{form.errorFor('endDate')}</p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="event-how">
          <h2 id="event-how" className={styles.sectionTitle}>
            How did it feel?
          </h2>
          <SegmentedControl
            legend="Severity (optional)"
            name="severity"
            options={SEVERITY_OPTIONS}
            value={values.severity}
            onChange={(severity) => setField('severity', severity)}
            error={form.errorFor('severity')}
            action={
              values.severity && (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => setField('severity', '')}
                >
                  Clear
                </button>
              )
            }
          />
          <SymptomInput
            symptoms={values.symptoms}
            onChange={(symptoms) => setField('symptoms', symptoms)}
            error={symptomsError}
          />
        </section>

        <section className={styles.section} aria-labelledby="event-medicines" id="medicines">
          <h2 id="event-medicines" className={styles.sectionTitle}>
            Medicines
          </h2>
          {values.medicines.length === 0 && (
            <p className={styles.sectionHint}>
              Record anything you took for this, with dosage and timing.
            </p>
          )}
          {values.medicines.map((medicine, index) => (
            <div
              key={medicine.key}
              role="group"
              aria-labelledby={`medicine-${medicine.key}`}
              className={styles.medicineCard}
            >
              <h3 id={`medicine-${medicine.key}`} className={styles.medicineHeading}>
                Medicine {index + 1}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                iconOnly
                className={styles.removeMedicine}
                onClick={() => removeMedicine(index)}
              >
                {`Remove medicine ${index + 1}${medicine.name ? ` (${medicine.name})` : ''}`}
              </Button>
              <MedicineFields
                form={form}
                prefix={`medicines.${index}.`}
                autoFocusName={medicine.key === newMedicineKey}
              />
            </div>
          ))}
          {form.errorFor('medicines') && (
            <p className={styles.fieldError}>{form.errorFor('medicines')}</p>
          )}
          {values.medicines.length < LIMITS.medicinesMaxCount && (
            <Button
              variant="secondary"
              icon={Plus}
              onClick={addMedicine}
              className={styles.addMedicine}
            >
              Add medicine
            </Button>
          )}
        </section>

        {features.data?.attachments && (
          <section className={styles.section} aria-labelledby="event-files">
            <h2 id="event-files" className={styles.sectionTitle}>
              Records &amp; files
            </h2>
            <PendingFiles
              files={values.files}
              onChange={(files) => setField('files', files)}
              existingCount={existingFileCount}
            />
          </section>
        )}

        <section className={styles.section} aria-labelledby="event-notes">
          <h2 id="event-notes" className={styles.sectionTitle}>
            Notes
          </h2>
          <TextareaField
            label="Notes"
            hideLabel
            rows={3}
            maxLength={LIMITS.notesMax}
            placeholder="Anything else worth remembering (optional)"
            {...form.field('notes')}
          />
        </section>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel} disabled={form.submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={form.submitting}>
            {submitLabel}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Discard unsaved changes?"
        description="You have changes that haven't been saved. If you leave now, they will be lost."
        confirmLabel="Discard changes"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </>
  );
}
