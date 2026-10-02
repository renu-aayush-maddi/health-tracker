import styles from './Skeleton.module.css';

/** Placeholder block shown while content loads. Hidden from assistive tech; pair with a status label. */
export default function Skeleton({ width = '100%', height = 16, radius, className = '' }) {
  return (
    <span
      className={`${styles.skeleton} ${className}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonStack({ label, children }) {
  return (
    <div role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  );
}
