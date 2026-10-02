import styles from './EmptyState.module.css';

export default function EmptyState({ icon: Icon, title, description, action, compact = false }) {
  return (
    <div className={`${styles.empty} ${compact ? styles.compact : ''}`}>
      {Icon && (
        <span className={styles.icon} aria-hidden="true">
          <Icon size={compact ? 22 : 28} />
        </span>
      )}
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
