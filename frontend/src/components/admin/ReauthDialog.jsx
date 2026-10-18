import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import PasswordField from '../ui/PasswordField.jsx';
import { useAdminMutations } from '../../hooks/useAdmin.js';
import styles from './Admin.module.css';

/**
 * High-risk actions need the password again, even with a valid session. Shown when the API
 * answers REAUTH_REQUIRED; on success the caller's action is retried.
 */
export default function ReauthDialog({ open, action, onConfirmed, onCancel }) {
  const { reauth } = useAdminMutations();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const close = () => {
    setPassword('');
    setError(null);
    onCancel();
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      await reauth.mutateAsync(password);
      setPassword('');
      setError(null);
      onConfirmed();
    } catch (err) {
      setError(err.fields?.password ?? err.message);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={reauth.isPending}
      title="Confirm it's you"
      description={action ? `Re-enter your password to ${action}.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={reauth.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="reauth-form" loading={reauth.isPending}>
            Confirm
          </Button>
        </>
      }
    >
      <form id="reauth-form" onSubmit={submit} noValidate>
        <Alert tone="info">
          <span className={styles.inlineIcon}>
            <ShieldAlert size={16} aria-hidden="true" />
          </span>
          This unlocks high-risk actions for the next 10 minutes.
        </Alert>
        <PasswordField
          label="Your password"
          autoComplete="current-password"
          name="password"
          data-autofocus
          className={styles.reauthField}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          error={error}
        />
      </form>
    </Dialog>
  );
}
