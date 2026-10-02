import { Link, useLocation, useNavigate } from 'react-router';
import { loginSchema } from '@health-tracker/shared';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import PasswordField from '../components/ui/PasswordField.jsx';
import TextField from '../components/ui/TextField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useZodForm } from '../hooks/useZodForm.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import styles from './AuthPage.module.css';

export default function LoginPage() {
  usePageTitle('Log in');
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useZodForm({ schema: loginSchema, initialValues: { email: '', password: '' } });

  const onSubmit = form.handleSubmit(async (credentials) => {
    await auth.login(credentials);
    navigate(location.state?.from ?? '/', { replace: true });
  });

  return (
    <>
      <h1 className={styles.heading}>Welcome back</h1>
      <p className={styles.subheading}>Log in to your private health diary.</p>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {auth.expired && !form.formError && (
          <Alert tone="info">Your session has ended. Please log in again.</Alert>
        )}
        {location.state?.passwordReset && !form.formError && (
          <Alert tone="success">Your password was reset. Log in with your new password.</Alert>
        )}
        {form.formError && <Alert>{form.formError}</Alert>}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          {...form.field('email')}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          required
          {...form.field('password')}
        />
        <Link to="/forgot-password" className={styles.inlineLink}>
          Forgot password?
        </Link>

        <Button type="submit" fullWidth loading={form.submitting}>
          Log in
        </Button>
      </form>

      <p className={styles.switch}>
        New here? <Link to="/register">Create an account</Link>
      </p>
    </>
  );
}
