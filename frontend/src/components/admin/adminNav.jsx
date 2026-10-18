import {
  Activity,
  CalendarClock,
  FileClock,
  FolderLock,
  Globe,
  LayoutDashboard,
  Pill,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Users,
} from 'lucide-react';

/**
 * Sidebar entries and the permission each needs. Filtering here only tidies the UI — the API
 * rejects anything the caller is not allowed to do regardless of what is rendered.
 */
export const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: 'system.read', end: true },
  { to: '/admin/users', label: 'Users', icon: Users, permission: 'users.read' },
  {
    to: '/admin/health-records',
    label: 'Health Records',
    icon: FolderLock,
    permission: 'health_records.read',
    sensitive: true,
  },
  {
    to: '/admin/medicines',
    label: 'Medicines',
    icon: Pill,
    permission: 'medicines.read',
    sensitive: true,
  },
  { to: '/admin/security', label: 'Security', icon: ShieldCheck, permission: 'security.read' },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText, permission: 'audit_logs.read' },
  { to: '/admin/sessions', label: 'Sessions', icon: CalendarClock, permission: 'sessions.read' },
  {
    to: '/admin/ip-addresses',
    label: 'IP Addresses',
    icon: Globe,
    permission: 'ip_addresses.read',
  },
  { to: '/admin/admins', label: 'Admin Management', icon: Activity, permission: 'admins.manage' },
  { to: '/admin/system', label: 'System Health', icon: ServerCog, permission: 'system.read' },
  { to: '/admin/reports', label: 'Reports', icon: FileClock, permission: 'reports.read' },
];
