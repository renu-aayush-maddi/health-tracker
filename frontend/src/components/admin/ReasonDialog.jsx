import { useState } from 'react';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import TextareaField from '../ui/TextareaField.jsx';
import TextField from '../ui/TextField.jsx';

/**
 * Confirmation for an administrative action, spelling out the consequences and collecting a
 * reason for the audit log. `confirmText` additionally requires the exact text to be typed.
 */
export default function ReasonDialog({
  open,
  title,
  description,
  consequences = [],
  confirmLabel,
  confirmText,
  reasonRequired = true,
  tone = 'danger',
  loading,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState(null);

  const close = () => {
    setReason('');
    setTyped('');
    setError(null);
    onCancel();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (reasonRequired && !reason.trim()) return setError('Give a reason for this change.');
    if (confirmText && typed.trim().toLowerCase() !== confirmText.toLowerCase()) {
      return setError(`Type ${confirmText} exactly to confirm.`);
    }
    try {
      await onConfirm({ reason: reason.trim() || null, confirmText: typed.trim() });
      close();
    } catch (err) {
      setError(Object.values(err.fields ?? {})[0] ?? err.message);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={loading}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading} data-autofocus>
            Cancel
          </Button>
          <Button
            type="submit"
            form="reason-form"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="reason-form" onSubmit={submit} noValidate>
        {consequences.length > 0 && (
          <Alert tone="info">
            This will:
            <ul>
              {consequences.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
        <TextareaField
          label="Reason"
          rows={2}
          required={reasonRequired}
          hint="Recorded in the audit log."
          maxLength={500}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />
        {confirmText && (
          <TextField
            label={`Type ${confirmText} to confirm`}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
          />
        )}
      </form>
    </Dialog>
  );
}
