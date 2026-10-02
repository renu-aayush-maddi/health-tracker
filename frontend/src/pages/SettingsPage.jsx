import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FileSpreadsheet, LogOut, Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import {
  changePasswordSchema,
  DATE_FORMATS,
  LIMITS,
  updateProfileSchema,
} from '@health-tracker/shared';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import PasswordField from '../components/ui/PasswordField.jsx';
import SegmentedControl from '../components/ui/SegmentedControl.jsx';
import SelectField from '../components/ui/SelectField.jsx';
import TextField from '../components/ui/TextField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useZodForm } from '../hooks/useZodForm.js';
import { authService } from '../services/authService.js';
import { usersService } from '../services/usersService.js';
import { formatDate, todayISO } from '../utils/dates.js';
import styles from './SettingsPage.module.css';

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

function AccountSection() {
  const auth = useAuth();
  const toast = useToast();
  const form = useZodForm({ schema: updateProfileSchema, initialValues: { name: auth.user.name } });

  const onSubmit = form.handleSubmit(async ({ name }) => {
    const user = await usersService.updateProfile({ name });
    auth.updateUser(user);
    form.reset({ name: user.name });
    toast.success('Your name was updated.');
  });

  return (
    <Card title="Account">
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <TextField
          label="Name"
          autoComplete="name"
          required
          maxLength={LIMITS.nameMax}
          {...form.field('name')}
        />
        <TextField
          label="Email"
          type="email"
          value={auth.user.email}
          readOnly
          hint="Your email is used to log in."
        />
        <Button
          type="submit"
          className={styles.submit}
          loading={form.submitting}
          disabled={!form.isDirty}
        >
          Save
        </Button>
      </form>
    </Card>
  );
}

function PasswordSection() {
  const toast = useToast();
  const empty = { currentPassword: '', newPassword: '', confirmPassword: '' };
  const form = useZodForm({ schema: changePasswordSchema, initialValues: empty });

  const onSubmit = form.handleSubmit(async (passwords) => {
    await authService.changePassword(passwords);
    form.reset(empty);
    toast.success('Password changed successfully. Other devices have been signed out.');
  });

  return (
    <Card title="Password">
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <PasswordField
          label="Current password"
          autoComplete="current-password"
          required
          {...form.field('currentPassword')}
        />
        <PasswordField
          label="New password"
          autoComplete="new-password"
          required
          hint={`At least ${LIMITS.passwordMin} characters.`}
          {...form.field('newPassword')}
        />
        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          required
          {...form.field('confirmPassword')}
        />
        <Button type="submit" className={styles.submit} loading={form.submitting}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

function PreferencesSection() {
  const auth = useAuth();
  const toast = useToast();
  // Local copy so controls respond instantly; the server save follows.
  const [preferences, setPreferences] = useState(auth.user.preferences);
  const [saving, setSaving] = useState(false);
  const sample = todayISO();

  const save = async (changes) => {
    const previous = preferences;
    setPreferences({ ...previous, ...changes });
    setSaving(true);
    try {
      const user = await usersService.updateProfile({ preferences: changes });
      auth.updateUser(user);
      setPreferences(user.preferences);
      toast.success('Preferences saved.');
    } catch (err) {
      setPreferences(previous);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Preferences" aria-busy={saving}>
      <div className={styles.form}>
        <SegmentedControl
          legend="Theme"
          name="theme"
          options={THEME_OPTIONS}
          value={preferences.theme}
          onChange={(theme) => save({ theme })}
        />
        <SelectField
          label="Date format"
          value={preferences.dateFormat}
          onChange={(e) => save({ dateFormat: e.target.value })}
          options={DATE_FORMATS.map((pattern) => ({
            value: pattern,
            label: formatDate(sample, pattern),
          }))}
        />
        <SelectField
          label="Week starts on"
          value={preferences.weekStart}
          onChange={(e) => save({ weekStart: e.target.value })}
          options={[
            { value: 'monday', label: 'Monday' },
            { value: 'sunday', label: 'Sunday' },
          ]}
        />
      </div>
    </Card>
  );
}

function DataSection() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const filename = await usersService.exportData();
      toast.success(`Downloaded ${filename}.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Your data">
      <div className={styles.form}>
        <p className={styles.muted}>
          Download an Excel copy of everything you’ve recorded: health events, symptoms, medicines,
          notes, and the names and tags of your files (the files themselves aren’t included).
        </p>
        <Button
          variant="secondary"
          icon={FileSpreadsheet}
          className={styles.submit}
          loading={busy}
          onClick={download}
        >
          Download my data (Excel)
        </Button>
      </div>
    </Card>
  );
}

function DeleteAccountDialog({ open, onClose }) {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!password) return setError('Enter your password to confirm.');
    setDeleting(true);
    try {
      await usersService.deleteAccount(password);
      await auth.logout().catch(() => {});
      toast.success('Your account and all its data have been deleted.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.fields?.password ?? err.message);
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={deleting}
      title="Delete your account?"
      description="This permanently deletes your account, every health event and every medicine you've recorded. This cannot be undone."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" form="delete-account-form" loading={deleting}>
            Delete account
          </Button>
        </>
      }
    >
      <form id="delete-account-form" onSubmit={submit} noValidate>
        <PasswordField
          label="Enter your password to confirm"
          autoComplete="current-password"
          name="password"
          data-autofocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          error={error}
        />
      </form>
    </Dialog>
  );
}

export default function SettingsPage() {
  usePageTitle('Settings');
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const logout = async () => {
    await auth.logout();
    toast.success('You have been logged out.');
    navigate('/login', { replace: true });
  };

  return (
    <>
      <PageHeader title="Settings" description="Manage your account and preferences." />
      <div className={styles.grid}>
        <div className={styles.column}>
          <AccountSection />
          <PreferencesSection />
        </div>
        <div className={styles.column}>
          <PasswordSection />
          <DataSection />
          <Card title="Session">
            <div className={styles.actions}>
              <Button variant="secondary" icon={LogOut} onClick={logout}>
                Log out
              </Button>
              <Button
                variant="ghost"
                icon={Trash2}
                className={styles.danger}
                onClick={() => setDeleteOpen(true)}
              >
                Delete account…
              </Button>
            </div>
          </Card>
        </div>
      </div>
      <p className={styles.disclaimer}>
        Health Tracker stores only what you record. It does not diagnose conditions or give medical
        advice.
      </p>
      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </>
  );
}
