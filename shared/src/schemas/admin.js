import { array, coerce, object, string } from 'zod';
import {
  ACCOUNT_STATUSES,
  ADMIN_ROLES,
  AUDIT_ACTIONS,
  PERMISSIONS,
  ROLES,
  SECURITY_EVENT_TYPES,
} from '../admin.js';
import { LIMITS } from '../constants.js';
import { isoDate, optionalIsoDate, optionalText, requiredText, uuid } from './common.js';

const choice = (label, allowed) =>
  string({ error: `Choose a valid ${label}.` })
    .trim()
    .nullish()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || allowed.includes(value), `Choose a valid ${label}.`);

const page = () =>
  coerce.number({ error: 'Page must be a number.' }).int().min(1).max(10_000).default(1);
const pageSize = (max = LIMITS.pageSizeMax) =>
  coerce.number({ error: 'Page size must be a number.' }).int().min(1).max(max).default(25);

/** Rejects "to" earlier than "from" on any filter pair. */
const orderedRange = (data, ctx) => {
  if (data.from && data.to && data.to < data.from) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: '"To" date cannot be earlier than "from" date.',
    });
  }
};

export const ADMIN_USER_SORTS = [
  'created_desc',
  'created_asc',
  'activity_desc',
  'name_asc',
  'email_asc',
];

export const adminUserListQuerySchema = object({
  q: optionalText('Search', LIMITS.searchMax),
  role: choice('role', ROLES),
  status: choice('status', ACCOUNT_STATUSES),
  from: optionalIsoDate('From date'),
  to: optionalIsoDate('To date'),
  sort: choice('sort order', ADMIN_USER_SORTS).transform((value) => value ?? 'created_desc'),
  page: page(),
  pageSize: pageSize(),
}).superRefine(orderedRange);

export const adminUpdateUserSchema = object({
  name: requiredText('Name', LIMITS.nameMax).optional(),
}).refine((data) => data.name !== undefined, 'Nothing to update.');

export const adminStatusChangeSchema = object({
  status: string({ error: 'Choose a status.' }).refine(
    (value) => ACCOUNT_STATUSES.includes(value),
    'Choose a status.',
  ),
  reason: optionalText('Reason', 500),
}).superRefine((data, ctx) => {
  // Restricting an account without saying why makes the audit trail useless.
  if (data.status !== 'active' && !data.reason) {
    ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason for this change.' });
  }
});

export const adminRoleChangeSchema = object({
  role: string({ error: 'Choose a role.' }).refine(
    (value) => ROLES.includes(value),
    'Choose a role.',
  ),
  reason: optionalText('Reason', 500),
});

export const adminPermissionGrantSchema = object({
  permission: string({ error: 'Choose a permission.' }).refine(
    (value) => PERMISSIONS.includes(value),
    'Choose a permission.',
  ),
  expiresAt: optionalIsoDate('Expiry date'),
  reason: optionalText('Reason', 500),
});

export const adminPermissionParamsSchema = object({
  userId: uuid('Account'),
  permission: string().refine((value) => PERMISSIONS.includes(value), 'Unknown permission.'),
});

export const adminAuditQuerySchema = object({
  action: choice('action', AUDIT_ACTIONS),
  actorUserId: uuid('Administrator').nullish(),
  targetUserId: uuid('Account').nullish(),
  ip: optionalText('IP address', 45),
  from: optionalIsoDate('From date'),
  to: optionalIsoDate('To date'),
  page: page(),
  pageSize: pageSize(),
}).superRefine(orderedRange);

export const adminSecurityQuerySchema = object({
  type: choice('event type', SECURITY_EVENT_TYPES),
  outcome: choice('outcome', ['success', 'failure']),
  userId: uuid('Account').nullish(),
  ip: optionalText('IP address', 45),
  from: optionalIsoDate('From date'),
  to: optionalIsoDate('To date'),
  page: page(),
  pageSize: pageSize(),
}).superRefine(orderedRange);

export const adminSessionQuerySchema = object({
  userId: uuid('Account').nullish(),
  page: page(),
  pageSize: pageSize(),
});

export const adminIpQuerySchema = object({
  q: optionalText('Search', 45),
  onlyBlocked: string()
    .optional()
    .transform((value) => value === 'true'),
  page: page(),
  pageSize: pageSize(),
});

export const adminIpBlockSchema = object({
  ip: requiredText('IP address', 45).refine(
    // Accepts IPv4/IPv6 literals; Postgres `inet` rejects anything malformed as a backstop.
    (value) => /^[0-9a-fA-F:.]+$/.test(value),
    'Enter a valid IP address.',
  ),
  reason: optionalText('Reason', 500),
  expiresAt: optionalIsoDate('Expiry date'),
});

export const adminIpUnblockSchema = object({ ip: requiredText('IP address', 45) });

export const adminReauthSchema = object({
  password: string({ error: 'Enter your password.' })
    .min(1, 'Enter your password.')
    .max(LIMITS.passwordMax),
});

export const adminDeleteUserSchema = object({
  confirmEmail: requiredText('Email', LIMITS.emailMax),
  reason: optionalText('Reason', 500),
});

/** Chart/report windows. `days` covers the presets; from/to a custom range. */
export const adminRangeQuerySchema = object({
  days: coerce.number().int().min(1).max(365).default(30),
  from: optionalIsoDate('From date'),
  to: optionalIsoDate('To date'),
}).superRefine(orderedRange);

export const adminHealthRecordQuerySchema = object({
  q: optionalText('Search', LIMITS.searchMax),
  userId: uuid('Account').nullish(),
  healthIssue: optionalText('Health issue', LIMITS.healthIssueMax),
  from: optionalIsoDate('From date'),
  to: optionalIsoDate('To date'),
  page: page(),
  pageSize: pageSize(),
}).superRefine(orderedRange);

export const adminMedicineQuerySchema = object({
  q: optionalText('Search', LIMITS.searchMax),
  userId: uuid('Account').nullish(),
  page: page(),
  pageSize: pageSize(),
});

export const adminUserParamsSchema = object({ userId: uuid('Account') });
export const adminIdParamsSchema = object({ id: uuid('Record') });

export const adminCreateAdminSchema = object({
  email: requiredText('Email', LIMITS.emailMax),
  role: string().refine((value) => ADMIN_ROLES.includes(value), 'Choose an administrative role.'),
  permissions: array(string()).max(PERMISSIONS.length).default([]),
  reason: optionalText('Reason', 500),
});

export { isoDate };
