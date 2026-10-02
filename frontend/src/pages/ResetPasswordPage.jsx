import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LIMITS, resetPasswordSchema } from '@health-tracker/shared';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import PasswordField from '../components/ui/PasswordField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useZodForm } from '../hooks/useZodForm.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { authService } from '../services/authService.js';
import styles from './AuthPage.module.css';

/**
 * The emailed link carries the token in the URL fragment (#token=…), which browsers never send
 * to servers. We read it once, then strip it from the address bar and history.
 */
function takeTokenFromUrl() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (token) window.history.replaceState(window.history.state, '', window.location.pathname);
  return token;
}

export default function ResetPasswordPage() {
  usePageTitle('Choose a new password');
  const auth = useAuth();
  const navigate = useNavigate();
  const [token] = useState(takeTokenFromUrl);
  const form = useZodForm({
    schema: resetPasswordSchema,
    initialValues: { token: token ?? '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (body) => {
    await authService.resetPassword(body);
    // A reset signs out every session, including one on this device.
    if (auth.status === 'authenticated') await auth.logout().catch(() => {});
    navigate('/login', { replace: true, state: { passwordReset: true } });
  });

  if (!token) {
    return (
      <>
        <h1 className={styles.heading}>Reset link not valid</h1>
        <div className={styles.form}>
          <Alert>
            This reset link is incomplete or has already been used. Please request a new one.
          </Alert>
          <Button to="/forgot-password" fullWidth>
            Request a new link
          </Button>
        </div>
      </>
    );
  }

  const tokenError = form.errorFor('token');

  return (
    <>
      <h1 className={styles.heading}>Choose a new password</h1>
      <p className={styles.subheading}>You&apos;ll be signed out on all devices after resetting.</p>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {form.formError && (
          <Alert>
            {form.formError} <Link to="/forgot-password">Request a new link</Link>
          </Alert>
        )}
        {tokenError && <Alert>{tokenError}</Alert>}
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
        <Button type="submit" fullWidth loading={form.submitting}>
          Reset password
        </Button>
      </form>
    </>
  );
}
