import { medicineSchema } from '@health-tracker/shared';
import { useToast } from '../../context/ToastContext.jsx';
import { useMedicineMutations } from '../../hooks/useHealthEvents.js';
import { useZodForm } from '../../hooks/useZodForm.js';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import MedicineFields from './MedicineFields.jsx';

const FORM_ID = 'medicine-form';

function toValues(medicine, defaultStartDate) {
  return {
    name: medicine?.name ?? '',
    dosage: medicine?.dosage ?? '',
    frequency: medicine?.frequency ?? '',
    startDate: medicine ? (medicine.startDate ?? '') : (defaultStartDate ?? ''),
    endDate: medicine?.endDate ?? '',
    notes: medicine?.notes ?? '',
  };
}

function MedicineForm({ medicine, defaultStartDate, onDone, mutations }) {
  const toast = useToast();
  const form = useZodForm({
    schema: medicineSchema,
    initialValues: toValues(medicine, defaultStartDate),
  });

  const onSubmit = form.handleSubmit(async (data) => {
    if (medicine) {
      await mutations.update.mutateAsync({ medicineId: medicine.id, medicine: data });
      toast.success('Medicine updated.');
    } else {
      await mutations.add.mutateAsync(data);
      toast.success('Medicine added.');
    }
    onDone();
  });

  return (
    <form id={FORM_ID} onSubmit={onSubmit} noValidate>
      {form.formError && <Alert>{form.formError}</Alert>}
      <MedicineFields form={form} autoFocusName />
    </form>
  );
}

/** Add or edit a single medicine from the event details page. `medicine` null = add. */
export default function MedicineDialog({ open, eventId, medicine, defaultStartDate, onClose }) {
  const mutations = useMedicineMutations(eventId);
  const busy = mutations.add.isPending || mutations.update.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={medicine ? 'Edit medicine' : 'Add medicine'}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={busy}>
            {medicine ? 'Save medicine' : 'Add medicine'}
          </Button>
        </>
      }
    >
      <MedicineForm
        medicine={medicine}
        defaultStartDate={defaultStartDate}
        onDone={onClose}
        mutations={mutations}
      />
    </Dialog>
  );
}
