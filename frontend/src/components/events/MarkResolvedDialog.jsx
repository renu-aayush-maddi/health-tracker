import { useState } from 'react';
import { useEventMutations } from '../../hooks/useHealthEvents.js';
import { useToast } from '../../context/ToastContext.jsx';
import { todayISO } from '../../utils/dates.js';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import TextField from '../ui/TextField.jsx';

function ResolveForm({ event, onDone, formId }) {
  const today = todayISO();
  const [endDate, setEndDate] = useState(event.startDate > today ? event.startDate : today);
  const [fieldError, setFieldError] = useState(null);
  const [formError, setFormError] = useState(null);
  const { updateStatus } = useEventMutations();
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!endDate) return setFieldError('Choose the date it ended.');
    if (endDate < event.startDate)
      return setFieldError('End date cannot be earlier than start date.');
    try {
      await updateStatus.mutateAsync({ eventId: event.id, status: 'resolved', endDate });
      toast.success(`${event.title} marked as resolved.`);
      onDone();
    } catch (err) {
      if (err.fields?.endDate) setFieldError(err.fields.endDate);
      else setFormError(err.message);
    }
  };

  return (
    <form id={formId} onSubmit={submit} noValidate>
      {formError && <Alert>{formError}</Alert>}
      <TextField
        label="Ended on"
        type="date"
        name="endDate"
        required
        data-autofocus
        min={event.startDate}
        value={endDate}
        onChange={(e) => {
          setEndDate(e.target.value);
          setFieldError(null);
        }}
        error={fieldError}
      />
    </form>
  );
}

export default function MarkResolvedDialog({ event, open, onClose }) {
  const { updateStatus } = useEventMutations();
  const formId = 'mark-resolved-form';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Mark as resolved"
      description={event ? `When did "${event.title}" end?` : undefined}
      busy={updateStatus.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={updateStatus.isPending}>
            Mark resolved
          </Button>
        </>
      }
    >
      {event && <ResolveForm event={event} onDone={onClose} formId={formId} />}
    </Dialog>
  );
}
