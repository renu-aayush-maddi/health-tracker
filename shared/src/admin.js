// Roles, account statuses and the permission model. Shared so the UI can hide what a viewer
// cannot use — but the backend re-derives permissions on every request and is the only authority.

export const ROLES = ['user', 'read_only_admin', 'admin', 'super_admin'];
export const ADMIN_ROLES = ['read_only_admin', 'admin', 'super_admin'];

export const ROLE_LABELS = {
  user: 'User',
  read_only_admin: 'Read-only admin',
  admin: 'Admin',
  super_admin: 'Super admin',
};

export const ACCOUNT_STATUSES = ['active', 'disabled', 'blocked', 'suspended'];

export const STATUS_LABELS = {
  active: 'Active',
  disabled: 'Disabled',
  blocked: 'Blocked',
  suspended: 'Suspended',
};

/** Only `active` accounts may sign in or use the API. */
export const isUsableStatus = (status) => status === 'active';

export const PERMISSIONS = [
  'users.read',
  'users.update',
  'users.block',
  'users.delete',
  'health_records.read',
  'health_records.update',
  'health_records.delete',
  'medicines.read',
  'medicines.update',
  'medicines.delete',
  'health_data.export',
  'audit_logs.read',
  'security.read',
  'sessions.read',
  'sessions.revoke',
  'ip_addresses.read',
  'ip_addresses.block',
  'admins.manage',
  'system.read',
  'reports.read',
];

/** Permissions that touch medical content. Every use of these is audited. */
export const HEALTH_PERMISSIONS = PERMISSIONS.filter(
  (p) =>
    p.startsWith('health_records.') || p.startsWith('medicines.') || p === 'health_data.export',
);

const READ_ONLY = [
  'users.read',
  'sessions.read',
  'security.read',
  'audit_logs.read',
  'ip_addresses.read',
  'system.read',
  'reports.read',
];

const ADMIN = [
  ...READ_ONLY,
  'users.update',
  'users.block',
  'sessions.revoke',
  'ip_addresses.block',
];

/**
 * Defaults per role. Anything not listed must be granted explicitly in `admin_permissions`.
 *
 * `health_data.export` is deliberately granted to nobody by default: viewing one record is a
 * support task, bulk-exporting everyone's medical history is not. Add it to super_admin below
 * if you want it on by default.
 */
export const ROLE_PERMISSIONS = {
  user: [],
  read_only_admin: READ_ONLY,
  admin: ADMIN,
  super_admin: [
    ...ADMIN,
    'users.delete',
    'admins.manage',
    'health_records.read',
    'health_records.update',
    'health_records.delete',
    'medicines.read',
    'medicines.update',
    'medicines.delete',
  ],
};

/**
 * Routes that additionally require a recent password re-entry. Listed here for documentation and
 * for the UI's benefit; the backend applies `requireRecentAuth` to these routes explicitly.
 */
export const REAUTH_ACTIONS = [
  'Change an account role',
  'Delete an account',
  'Grant or revoke an admin permission',
];

export const REAUTH_WINDOW_MINUTES = 10;

export const PERMISSION_DESCRIPTIONS = {
  'users.read': 'View accounts and their metadata',
  'users.update': 'Edit account name and email',
  'users.block': 'Block, suspend, disable or re-enable accounts',
  'users.delete': 'Permanently delete an account and all of its data',
  'health_records.read': 'Open the medical content of health events',
  'health_records.update': 'Edit a health event',
  'health_records.delete': 'Delete a health event',
  'medicines.read': 'Open medicine records',
  'medicines.update': 'Edit a medicine record',
  'medicines.delete': 'Delete a medicine record',
  'health_data.export': 'Export health data in bulk',
  'audit_logs.read': 'Read the audit log',
  'security.read': 'View authentication and security events',
  'sessions.read': 'View active sessions',
  'sessions.revoke': 'Sign other people out',
  'ip_addresses.read': 'View IP address activity',
  'ip_addresses.block': 'Block and unblock IP addresses',
  'admins.manage': 'Change roles and grant permissions',
  'system.read': 'View system health',
  'reports.read': 'View aggregate reports',
};

/** Admin/privileged actions written to `audit_logs`. */
export const AUDIT_ACTIONS = [
  'ADMIN_LOGIN',
  'USER_VIEWED',
  'USER_UPDATED',
  'USER_STATUS_CHANGED',
  'USER_ROLE_CHANGED',
  'USER_DELETED',
  'PASSWORD_RESET_TRIGGERED',
  'SESSION_REVOKED',
  'ALL_SESSIONS_REVOKED',
  'HEALTH_RECORD_VIEWED',
  'HEALTH_RECORD_UPDATED',
  'HEALTH_RECORD_DELETED',
  'MEDICINE_RECORD_VIEWED',
  'MEDICINE_RECORD_UPDATED',
  'MEDICINE_RECORD_DELETED',
  'HEALTH_DATA_EXPORTED',
  'IP_BLOCKED',
  'IP_UNBLOCKED',
  'ADMIN_PERMISSION_GRANTED',
  'ADMIN_PERMISSION_REVOKED',
];

/** Authentication and account-security events written to `security_events`. */
export const SECURITY_EVENT_TYPES = [
  'REGISTERED',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGIN_BLOCKED_ACCOUNT',
  'LOGIN_BLOCKED_IP',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'EMAIL_VERIFIED',
  'EMAIL_VERIFICATION_FAILED',
  'SESSION_REVOKED',
  'REAUTH_SUCCESS',
  'REAUTH_FAILED',
];

/** "USER_STATUS_CHANGED" → "User status changed" */
export const humanizeEvent = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
