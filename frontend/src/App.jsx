import { createBrowserRouter, RouterProvider } from 'react-router';
import { PublicOnly, RequireAuth } from './components/routing/RouteGuards.jsx';
import RouteError from './components/routing/RouteError.jsx';
import ThemeSync from './components/routing/ThemeSync.jsx';
import SlowServerNotice from './components/ui/SlowServerNotice.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import AuthLayout from './layouts/AuthLayout.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';

/** App pages load on demand, so signing in doesn't wait for the calendar, forms, etc. */
const page = (load) => () => load().then((module) => ({ Component: module.default }));

const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // Reachable signed in or out: a reset link may be opened on a device with an active session.
      { path: '/reset-password', element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', lazy: page(() => import('./pages/DashboardPage.jsx')) },
          { path: '/history', lazy: page(() => import('./pages/HistoryPage.jsx')) },
          { path: '/history/:eventId', lazy: page(() => import('./pages/EventDetailPage.jsx')) },
          { path: '/events/new', lazy: page(() => import('./pages/EventFormPage.jsx')) },
          { path: '/events/:eventId/edit', lazy: page(() => import('./pages/EventFormPage.jsx')) },
          { path: '/calendar', lazy: page(() => import('./pages/CalendarPage.jsx')) },
          { path: '/settings', lazy: page(() => import('./pages/SettingsPage.jsx')) },
          { path: '*', lazy: page(() => import('./pages/NotFoundPage.jsx')) },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <>
      <ThemeSync />
      <SlowServerNotice />
      <RouterProvider router={router} />
    </>
  );
}
