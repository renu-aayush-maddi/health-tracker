import { Link, NavLink } from 'react-router';
import { HeartPulse, Plus } from 'lucide-react';
import { ADD_EVENT_PATH, NAV_ITEMS } from './navItems.js';
import styles from './MobileNav.module.css';

export function TopBar({ user }) {
  return (
    <header className={styles.topBar}>
      <Link to="/" className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">
          <HeartPulse size={18} />
        </span>
        Health Tracker
      </Link>
      <Link
        to="/settings"
        className={styles.avatar}
        aria-label={`Account settings for ${user.name}`}
      >
        {user.name.charAt(0).toUpperCase()}
      </Link>
    </header>
  );
}

/** Two destinations, a prominent Add button, two destinations. */
export function BottomNav() {
  const [first, second, third, fourth] = NAV_ITEMS;
  const item = ({ to, label, icon: Icon, end }) => (
    <li key={to}>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
      >
        <Icon size={22} aria-hidden="true" />
        <span>{label}</span>
      </NavLink>
    </li>
  );

  return (
    <nav className={styles.bottomNav} aria-label="Main">
      <ul className={styles.list}>
        {item(first)}
        {item(second)}
        <li>
          <Link to={ADD_EVENT_PATH} className={styles.add}>
            <span className={styles.addCircle}>
              <Plus size={24} aria-hidden="true" />
            </span>
            <span className="visually-hidden">Add health event</span>
          </Link>
        </li>
        {item(third)}
        {item(fourth)}
      </ul>
    </nav>
  );
}
