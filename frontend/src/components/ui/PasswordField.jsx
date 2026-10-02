import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import FormField from './FormField.jsx';
import styles from './Field.module.css';

export default function PasswordField({ label, hint, error, required, className, ...inputProps }) {
  const [visible, setVisible] = useState(false);

  return (
    <FormField label={label} hint={hint} error={error} required={required} className={className}>
      {(controlProps) => (
        <div className={styles.withAction}>
          <input type={visible ? 'text' : 'password'} {...controlProps} {...inputProps} />
          <button
            type="button"
            className={styles.inputAction}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
          >
            {visible ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </FormField>
  );
}
