import { useEventMutations } from '../../hooks/useHealthEvents.js';
import { useToast } from '../../context/ToastContext.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';

/** Deleting is permanent, so it always goes through this confirmation. */
export default function DeleteEventDialog({ event, onClose, onDeleted }) {
  const { remove } = useEventMutations();
  const toast = useToast();

  const confirm = async () => {
    try {
      await remove.mutateAsync(event.id);
      toast.success('Health event deleted successfully.');
      onClose();
      onDeleted?.();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <ConfirmDialog
      open={Boolean(event)}
      title="Delete health event?"
      description="This will permanently delete this health record and its associated medicines."
      confirmLabel="Delete"
      loading={remove.isPending}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
