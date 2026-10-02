import { HeartPulse } from 'lucide-react';
import Button from './Button.jsx';
import Spinner from './Spinner.jsx';
import styles from './FullPageStatus.module.css';

/** Whole-screen loading or failure state, used before the app shell can render. */
export default function FullPageStatus({ message, error, onRetry }) {
  return (
    <div className={styles.wrapper}>
      <HeartPulse size={36} className={styles.logo} aria-hidden="true" />
      {error ? (
        <>
          <p className={styles.message} role="alert">
            {error}
          </p>
          {onRetry && <Button onClick={onRetry}>Try again</Button>}
        </>
      ) : (
        <>
          <Spinner size={24} label={message} />
          <p className={styles.message} aria-hidden="true">
            {message}
          </p>
        </>
      )}
    </div>
  );
}
