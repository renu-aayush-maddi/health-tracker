import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import {
  PublicOnly,
  RequireAdmin,
  RequireAuth,
  RequireUnverified,
} from './components/routing/RouteGuards.jsx';
import RouteError from './components/routing/RouteError.jsx';
import ThemeSync from './components/routing/ThemeSync.jsx';
import SlowServerNotice from './components/ui/SlowServerNotice.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import AuthLayout from './layouts/AuthLayout.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import VerifyEmailPage from './pages/VerifyEmailPage.jsx';

/** App pages load on demand, so signing in doesn't wait for the calendar, forms, etc. */
const page = (load) => () => load().then((module) => ({ Component: module.default }));

const router = createBrowserRouter([
  {
    // The static host serves the app's entry file at /index.html, so that address is a common
    // bookmark or typed URL. It is not a page; send it to the real home route. The auth guards
    // there then decide between the dashboard and the login screen.
    path: '/index.html',
    element: <Navigate to="/" replace />,
  },
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
      {
        element: <RequireUnverified />,
        children: [{ path: '/verify-email', element: <VerifyEmailPage /> }],
      },
    ],
  },
  {
    // The admin area is a separate lazy chunk, so ordinary users never download it.
    element: <RequireAdmin />,
    errorElement: <RouteError />,
    children: [
      {
        lazy: () =>
          import('./layouts/AdminLayout.jsx').then((module) => ({ Component: module.default })),
        children: [
          { path: '/admin', lazy: page(() => import('./pages/admin/AdminDashboardPage.jsx')) },
          { path: '/admin/users', lazy: page(() => import('./pages/admin/AdminUsersPage.jsx')) },
          {
            path: '/admin/users/:userId',
            lazy: page(() => import('./pages/admin/AdminUserDetailPage.jsx')),
          },
          {
            path: '/admin/health-records',
            lazy: page(() => import('./pages/admin/AdminHealthRecordsPage.jsx')),
          },
          {
            path: '/admin/medicines',
            lazy: page(() => import('./pages/admin/AdminMedicinesPage.jsx')),
          },
          {
            path: '/admin/security',
            lazy: page(() => import('./pages/admin/AdminSecurityPage.jsx')),
          },
          {
            path: '/admin/audit-logs',
            lazy: page(() => import('./pages/admin/AdminAuditLogsPage.jsx')),
          },
          {
            path: '/admin/sessions',
            lazy: page(() => import('./pages/admin/AdminSessionsPage.jsx')),
          },
          {
            path: '/admin/ip-addresses',
            lazy: page(() => import('./pages/admin/AdminIpAddressesPage.jsx')),
          },
          { path: '/admin/admins', lazy: page(() => import('./pages/admin/AdminAdminsPage.jsx')) },
          { path: '/admin/system', lazy: page(() => import('./pages/admin/AdminSystemPage.jsx')) },
          {
            path: '/admin/reports',
            lazy: page(() => import('./pages/admin/AdminReportsPage.jsx')),
          },
        ],
      },
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
