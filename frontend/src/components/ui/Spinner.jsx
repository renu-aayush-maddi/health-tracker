import styles from './Spinner.module.css';

export default function Spinner({ size = 20, label }) {
  return (
    <span className={styles.wrapper} role={label ? 'status' : undefined}>
      <span className={styles.spinner} style={{ width: size, height: size }} aria-hidden="true" />
      {label && <span className="visually-hidden">{label}</span>}
    </span>
  );
}
