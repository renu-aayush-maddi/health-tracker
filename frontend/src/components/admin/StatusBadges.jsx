import { ROLE_LABELS, STATUS_LABELS } from '@health-tracker/shared';
import styles from './StatusBadges.module.css';

const STATUS_TONE = {
  active: 'ok',
  disabled: 'muted',
  suspended: 'warn',
  blocked: 'bad',
};

const ROLE_TONE = {
  user: 'muted',
  read_only_admin: 'info',
  admin: 'info',
  super_admin: 'strong',
};

/** Status and role never rely on colour alone — each badge carries its label. */
export function AccountStatusBadge({ status }) {
  return (
    <span className={`${styles.badge} ${styles[STATUS_TONE[status] ?? 'muted']}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function RoleBadge({ role }) {
  if (role === 'user') return <span className={styles.plain}>{ROLE_LABELS.user}</span>;
  return (
    <span className={`${styles.badge} ${styles[ROLE_TONE[role] ?? 'muted']}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export function OutcomeBadge({ success }) {
  return (
    <span className={`${styles.badge} ${success ? styles.ok : styles.bad}`}>
      {success ? 'Success' : 'Failed'}
    </span>
  );
}
