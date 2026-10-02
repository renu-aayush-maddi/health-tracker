import { Outlet } from 'react-router';
import { HeartPulse } from 'lucide-react';
import styles from './AuthLayout.module.css';

export default function AuthLayout() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            <HeartPulse size={24} />
          </span>
          <span className={styles.brandName}>Health Tracker</span>
        </div>
        <div className={styles.card}>
          <Outlet />
        </div>
      </main>
      <footer className={styles.footer}>
        A private record of what you enter. Not medical advice.
      </footer>
    </div>
  );
}
