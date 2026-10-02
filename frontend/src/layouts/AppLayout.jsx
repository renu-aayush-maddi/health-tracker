import { Outlet, useNavigate } from 'react-router';
import { BottomNav, TopBar } from '../components/navigation/MobileNav.jsx';
import Sidebar from '../components/navigation/Sidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { UploadsProvider } from '../context/UploadsContext.jsx';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.logout();
    toast.success('You have been logged out.');
    navigate('/login', { replace: true });
  };

  return (
    <UploadsProvider>
      <div className={styles.shell}>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Sidebar user={auth.user} onLogout={handleLogout} />
        <div className={styles.column}>
          <TopBar user={auth.user} />
          <main id="main-content" className={styles.main} tabIndex={-1}>
            <Outlet context={{ onLogout: handleLogout }} />
          </main>
        </div>
        <BottomNav />
      </div>
    </UploadsProvider>
  );
}
