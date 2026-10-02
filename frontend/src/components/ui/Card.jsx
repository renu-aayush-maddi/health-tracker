import styles from './Card.module.css';

export default function Card({
  as: Tag = 'section',
  title,
  action,
  padded = true,
  className = '',
  children,
  ...rest
}) {
  return (
    <Tag className={`${styles.card} ${padded ? styles.padded : ''} ${className}`} {...rest}>
      {(title || action) && (
        <header className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </Tag>
  );
}
