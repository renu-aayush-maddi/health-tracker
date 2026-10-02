import { NavLink } from 'react-router';
import { HeartPulse, LogOut, Plus } from 'lucide-react';
import { ADD_EVENT_PATH, NAV_ITEMS } from './navItems.js';
import styles from './Sidebar.module.css';

/** Tablet: compact icon rail. Desktop: full sidebar with labels. */
export default function Sidebar({ user, onLogout }) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">
          <HeartPulse size={20} />
        </span>
        <span className={styles.brandName}>Health Tracker</span>
      </div>

      <NavLink to={ADD_EVENT_PATH} className={styles.addButton}>
        <Plus size={20} aria-hidden="true" />
        <span className={styles.addLabel}>Add event</span>
      </NavLink>

      <nav aria-label="Main">
        <ul className={styles.navList}>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
              >
                <Icon size={20} aria-hidden="true" />
                <span className={styles.navLabel}>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.footer}>
        <div className={styles.user}>
          <span className={styles.avatar} aria-hidden="true">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <span className={styles.userText}>
            <span className={styles.userName}>{user.name}</span>
            <span className={styles.userEmail}>{user.email}</span>
          </span>
        </div>
        <button type="button" className={styles.logout} onClick={onLogout}>
          <LogOut size={18} aria-hidden="true" />
          <span className={styles.navLabel}>Log out</span>
        </button>
      </div>
    </aside>
  );
}
