import { useState } from 'react';
import { Link } from 'react-router';
import { forgotPasswordSchema } from '@health-tracker/shared';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import TextField from '../components/ui/TextField.jsx';
import { useZodForm } from '../hooks/useZodForm.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { authService } from '../services/authService.js';
import styles from './AuthPage.module.css';

export default function ForgotPasswordPage() {
  usePageTitle('Forgot password');
  const [sentMessage, setSentMessage] = useState(null);
  const form = useZodForm({ schema: forgotPasswordSchema, initialValues: { email: '' } });

  const onSubmit = form.handleSubmit(async (body) => {
    const res = await authService.forgotPassword(body);
    setSentMessage(res.message);
  });

  return (
    <>
      <h1 className={styles.heading}>Reset your password</h1>
      <p className={styles.subheading}>
        Enter your account email and we&apos;ll send you a link to choose a new password.
      </p>

      {sentMessage ? (
        <div className={styles.form}>
          <Alert tone="success">{sentMessage} The link expires in 30 minutes.</Alert>
          <Button to="/login" variant="secondary" fullWidth>
            Back to log in
          </Button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {form.formError && <Alert>{form.formError}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            {...form.field('email')}
          />
          <Button type="submit" fullWidth loading={form.submitting}>
            Send reset link
          </Button>
        </form>
      )}

      <p className={styles.switch}>
        Remembered it? <Link to="/login">Log in</Link>
      </p>
    </>
  );
}
