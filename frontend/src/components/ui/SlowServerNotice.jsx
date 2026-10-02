import { useSyncExternalStore } from 'react';
import { hasSlowRequests, subscribeToSlowRequests } from '../../services/apiClient.js';
import Spinner from './Spinner.jsx';
import styles from './SlowServerNotice.module.css';

/**
 * Shown while any request has taken more than a few seconds, typically the API waking up
 * after being idle on a free hosting plan, so people don't assume the app is broken.
 */
export default function SlowServerNotice() {
  const slow = useSyncExternalStore(subscribeToSlowRequests, hasSlowRequests, () => false);
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {slow && (
        <div className={styles.notice}>
          <Spinner size={16} />
          <span>Waking up the server… this can take up to a minute.</span>
        </div>
      )}
    </div>
  );
}
