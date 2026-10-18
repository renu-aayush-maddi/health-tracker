import { NavLink, Outlet } from 'react-router';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import { ROLE_LABELS } from '@health-tracker/shared';
import { ADMIN_NAV } from '../components/admin/adminNav.jsx';
import FullPageStatus from '../components/ui/FullPageStatus.jsx';
import { useAdminMe } from '../hooks/useAdmin.js';
import styles from './AdminLayout.module.css';

export default function AdminLayout() {
  const me = useAdminMe();

  if (me.isPending) return <FullPageStatus message="Loading the admin area…" />;
  if (me.isError) return <FullPageStatus error={me.error?.message} onRetry={me.refetch} />;

  const items = ADMIN_NAV.filter((item) => me.can(item.permission));

  return (
    <div className={styles.shell}>
      <a href="#admin-content" className="skip-link">
        Skip to content
      </a>

      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            <ShieldCheck size={18} />
          </span>
          <span>
            <span className={styles.brandName}>Administration</span>
            <span className={styles.role}>{ROLE_LABELS[me.data.user.role]}</span>
          </span>
        </div>

        <nav aria-label="Admin sections">
          <ul className={styles.navList}>
            {items.map(({ to, label, icon: Icon, end, sensitive }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className={styles.navLabel}>{label}</span>
                  {sensitive && (
                    <span className={styles.sensitive} title="Access is recorded">
                      <Lock size={12} aria-hidden="true" />
                      <span className="visually-hidden">Access to this section is recorded</span>
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.footer}>
          <p className={styles.account}>{me.data.user.email}</p>
          <NavLink to="/" className={styles.backLink}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back to Health Tracker
          </NavLink>
        </div>
      </aside>

      <main id="admin-content" className={styles.main} tabIndex={-1}>
        <Outlet context={{ me }} />
      </main>
    </div>
  );
}
