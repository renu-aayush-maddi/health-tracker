import { Link, useNavigate } from 'react-router';
import { LIMITS, registerSchema } from '@health-tracker/shared';
import Alert from '../components/ui/Alert.jsx';
import Button from '../components/ui/Button.jsx';
import PasswordField from '../components/ui/PasswordField.jsx';
import TextField from '../components/ui/TextField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useZodForm } from '../hooks/useZodForm.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import styles from './AuthPage.module.css';

export default function RegisterPage() {
  usePageTitle('Create account');
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const form = useZodForm({
    schema: registerSchema,
    initialValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (details) => {
    const user = await auth.register(details);
    toast.success(`Welcome, ${user.name}! Your account is ready.`);
    navigate('/', { replace: true });
  });

  return (
    <>
      <h1 className={styles.heading}>Create your account</h1>
      <p className={styles.subheading}>Keep a private record of your health history.</p>

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
          autoComplete="email"
          inputMode="email"
          required
          {...form.field('email')}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          required
          hint={`At least ${LIMITS.passwordMin} characters. A short phrase works well.`}
          {...form.field('password')}
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          required
          {...form.field('confirmPassword')}
        />

        <Button type="submit" fullWidth loading={form.submitting}>
          Create account
        </Button>
      </form>

      <p className={styles.switch}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </>
  );
}
