import { useId } from 'react';
import styles from './Toggle.module.css';

/** On/off switch backed by a real checkbox (role="switch"), so it works with keyboard and screen readers. */
export default function Toggle({ label, description, checked, onChange, name }) {
  const id = useId();
  return (
    <div className={styles.row}>
      <span className={styles.text}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      <input
        id={id}
        name={name}
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}
