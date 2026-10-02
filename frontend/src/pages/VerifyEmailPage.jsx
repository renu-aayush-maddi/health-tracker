import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { MailCheck } from 'lucide-react';
import { verifyEmailSchema } from '@health-tracker/shared';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import TextField from '../components/ui/TextField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useZodForm } from '../hooks/useZodForm.js';
import { authService } from '../services/authService.js';
import styles from './AuthPage.module.css';

const RESEND_COOLDOWN_SECONDS = 60;

/** j***@example.com — enough to recognise the address without showing all of it. */
const maskEmail = (email) =>
  email.replace(
    /^(.)(.*)(@.*)$/,
    (_, first, rest, domain) => `${first}${'•'.repeat(Math.min(rest.length, 6))}${domain}`,
  );

export default function VerifyEmailPage() {
  usePageTitle('Verify your email');
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const form = useZodForm({ schema: verifyEmailSchema, initialValues: { code: '' } });

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = form.handleSubmit(async ({ code }) => {
    await auth.verifyEmail(code);
    toast.success('Email verified. Welcome to Health Tracker!');
    navigate(location.state?.from ?? '/', { replace: true });
  });

  const resend = async () => {
    setResending(true);
    try {
      await authService.resendVerification();
      toast.success('A new code is on its way.');
      form.reset({ code: '' });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      toast.error(err.message);
      const wait = Number(err.message.match(/wait (\d+) seconds/)?.[1]);
      if (wait) setCooldown(wait);
    } finally {
      setResending(false);
    }
  };

  const logout = async () => {
    await auth.logout();
    navigate('/login', { replace: true });
  };

  const codeField = form.field('code');

  return (
    <>
      <span className={styles.badge} aria-hidden="true">
        <MailCheck size={24} />
      </span>
      <h1 className={styles.heading}>Check your email</h1>
      <p className={styles.subheading}>
        We sent a 6-digit code to <strong>{maskEmail(auth.user.email)}</strong>. Enter it below to
        finish creating your account. It expires in 10 minutes.
      </p>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {form.formError && <Alert>{form.formError}</Alert>}
        <TextField
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={7}
          placeholder="123456"
          className={styles.codeField}
          {...codeField}
          onChange={(event) =>
            codeField.onChange({ target: { value: event.target.value.replace(/[^\d ]/g, '') } })
          }
        />
        <Button type="submit" fullWidth loading={form.submitting}>
          Verify email
        </Button>
      </form>

      <p className={styles.switch}>
        Didn&apos;t get it? Check your spam folder, or{' '}
        <button
          type="button"
          className={styles.textButton}
          onClick={resend}
          disabled={cooldown > 0 || resending}
        >
          {cooldown > 0 ? `resend in ${cooldown}s` : 'send a new code'}
        </button>
        .
      </p>
      <p className={styles.switch}>
        Wrong account?{' '}
        <button type="button" className={styles.textButton} onClick={logout}>
          Log out
        </button>
      </p>
    </>
  );
}
