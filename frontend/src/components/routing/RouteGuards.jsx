import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext.jsx';
import FullPageStatus from '../ui/FullPageStatus.jsx';

function SessionGate({ children }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <FullPageStatus message="Loading your health diary…" />;
  if (auth.status === 'error')
    return <FullPageStatus error={auth.error?.message} onRetry={auth.retry} />;
  return children;
}

/** Signed-out visitors are sent to login and returned to the page they wanted afterwards. */
export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();
  return (
    <SessionGate>
      {auth.status === 'authenticated' ? (
        <Outlet />
      ) : (
        <Navigate to="/login" replace state={{ from: location.pathname }} />
      )}
    </SessionGate>
  );
}

/** Login/register pages are pointless when already signed in. */
export function PublicOnly() {
  const auth = useAuth();
  const location = useLocation();
  return (
    <SessionGate>
      {auth.status === 'authenticated' ? (
        <Navigate to={location.state?.from ?? '/'} replace />
      ) : (
        <Outlet />
      )}
    </SessionGate>
  );
}
