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

const isVerified = (auth) => auth.status === 'authenticated' && auth.user.emailVerified;
const needsVerification = (auth) => auth.status === 'authenticated' && !auth.user.emailVerified;

/**
 * The app itself: signed-out visitors go to login, unverified accounts to the code screen.
 * Both return to the page originally requested afterwards.
 */
export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();
  let content = <Outlet />;
  if (needsVerification(auth))
    content = <Navigate to="/verify-email" replace state={{ from: location.pathname }} />;
  else if (!isVerified(auth))
    content = <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <SessionGate>{content}</SessionGate>;
}

/** Login/register pages are pointless when already signed in. */
export function PublicOnly() {
  const auth = useAuth();
  const location = useLocation();
  let content = <Outlet />;
  if (needsVerification(auth))
    content = <Navigate to="/verify-email" replace state={location.state} />;
  else if (isVerified(auth)) content = <Navigate to={location.state?.from ?? '/'} replace />;
  return <SessionGate>{content}</SessionGate>;
}

/** The verification screen: only for signed-in accounts that still need to verify. */
export function RequireUnverified() {
  const auth = useAuth();
  const location = useLocation();
  let content = <Outlet />;
  if (auth.status === 'unauthenticated') content = <Navigate to="/login" replace />;
  else if (isVerified(auth)) content = <Navigate to={location.state?.from ?? '/'} replace />;
  return <SessionGate>{content}</SessionGate>;
}
