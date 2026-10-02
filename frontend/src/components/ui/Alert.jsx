import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import styles from './Alert.module.css';

const ICONS = { error: CircleAlert, success: CircleCheck, info: Info };

/** Inline message. Errors are announced immediately (role="alert"). */
export default function Alert({ tone = 'error', title, children, action }) {
  const Icon = ICONS[tone];
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={20} aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        {title && <p className={styles.title}>{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}
