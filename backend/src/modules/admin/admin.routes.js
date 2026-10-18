import { Router } from 'express';
import {
  adminAuditQuerySchema,
  adminDeleteUserSchema,
  adminHealthRecordQuerySchema,
  adminIdParamsSchema,
  adminIpBlockSchema,
  adminIpQuerySchema,
  adminIpUnblockSchema,
  adminMedicineQuerySchema,
  adminPermissionGrantSchema,
  adminPermissionParamsSchema,
  adminRangeQuerySchema,
  adminReauthSchema,
  adminRoleChangeSchema,
  adminSecurityQuerySchema,
  adminSessionQuerySchema,
  adminStatusChangeSchema,
  adminUpdateUserSchema,
  adminUserListQuerySchema,
  adminUserParamsSchema,
} from '@health-tracker/shared';
import { apiLimiter } from '../../middleware/rateLimiters.js';
import {
  requireAdmin,
  requirePermission,
  requireRecentAuth,
} from '../../middleware/requireAdmin.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireVerified } from '../../middleware/requireVerified.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './admin.controller.js';

export const adminRouter = Router();

// Every admin route is authenticated, verified, active (checked inside requireAuth) and held to
// an administrative role before any permission is considered.
adminRouter.use(requireAuth, requireVerified, requireAdmin, apiLimiter);

adminRouter.get('/me', controller.getMe);
adminRouter.post('/reauth', validate({ body: adminReauthSchema }), controller.reauthenticate);

adminRouter.get(
  '/dashboard',
  requirePermission('system.read'),
  validate({ query: adminRangeQuerySchema }),
  controller.getDashboard,
);

// ---- Accounts -------------------------------------------------------------
const byUser = validate({ params: adminUserParamsSchema });

adminRouter.get(
  '/users',
  requirePermission('users.read'),
  validate({ query: adminUserListQuerySchema }),
  controller.listUsers,
);
adminRouter.get('/users/:userId', requirePermission('users.read'), byUser, controller.getUser);
adminRouter.patch(
  '/users/:userId',
  requirePermission('users.update'),
  validate({ params: adminUserParamsSchema, body: adminUpdateUserSchema }),
  controller.updateUser,
);
adminRouter.post(
  '/users/:userId/status',
  requirePermission('users.block'),
  validate({ params: adminUserParamsSchema, body: adminStatusChangeSchema }),
  controller.changeStatus,
);
adminRouter.post(
  '/users/:userId/role',
  requirePermission('admins.manage'),
  requireRecentAuth,
  validate({ params: adminUserParamsSchema, body: adminRoleChangeSchema }),
  controller.changeRole,
);
adminRouter.post(
  '/users/:userId/force-logout',
  requirePermission('sessions.revoke'),
  byUser,
  controller.forceLogout,
);
adminRouter.post(
  '/users/:userId/password-reset',
  requirePermission('users.update'),
  byUser,
  controller.triggerPasswordReset,
);
adminRouter.delete(
  '/users/:userId',
  requirePermission('users.delete'),
  requireRecentAuth,
  validate({ params: adminUserParamsSchema, body: adminDeleteUserSchema }),
  controller.deleteUser,
);

// ---- Sessions -------------------------------------------------------------
adminRouter.get(
  '/sessions',
  requirePermission('sessions.read'),
  validate({ query: adminSessionQuerySchema }),
  controller.listSessions,
);
adminRouter.post(
  '/sessions/:id/revoke',
  requirePermission('sessions.revoke'),
  validate({ params: adminIdParamsSchema }),
  controller.revokeSession,
);

// ---- Security and audit ---------------------------------------------------
adminRouter.get(
  '/security',
  requirePermission('security.read'),
  validate({ query: adminSecurityQuerySchema }),
  controller.listSecurityEvents,
);
adminRouter.get(
  '/security-events/suspicious',
  requirePermission('security.read'),
  controller.getSuspiciousActivity,
);
adminRouter.get(
  '/audit-logs',
  requirePermission('audit_logs.read'),
  validate({ query: adminAuditQuerySchema }),
  controller.listAuditLogs,
);

// ---- IP addresses ---------------------------------------------------------
adminRouter.get(
  '/ip-addresses',
  requirePermission('ip_addresses.read'),
  validate({ query: adminIpQuerySchema }),
  controller.listIpAddresses,
);
adminRouter.post(
  '/ip-addresses/block',
  requirePermission('ip_addresses.block'),
  validate({ body: adminIpBlockSchema }),
  controller.blockIp,
);
adminRouter.post(
  '/ip-addresses/unblock',
  requirePermission('ip_addresses.block'),
  validate({ body: adminIpUnblockSchema }),
  controller.unblockIp,
);

// ---- Administrators -------------------------------------------------------
adminRouter.get('/admins', requirePermission('admins.manage'), controller.listAdmins);
adminRouter.post(
  '/admins/:userId/permissions',
  requirePermission('admins.manage'),
  requireRecentAuth,
  validate({ params: adminUserParamsSchema, body: adminPermissionGrantSchema }),
  controller.grantPermission,
);
adminRouter.delete(
  '/admins/:userId/permissions/:permission',
  requirePermission('admins.manage'),
  requireRecentAuth,
  validate({ params: adminPermissionParamsSchema }),
  controller.revokePermission,
);

// ---- System and reports ---------------------------------------------------
adminRouter.get('/system/health', requirePermission('system.read'), controller.getSystemHealth);
adminRouter.get(
  '/reports',
  requirePermission('reports.read'),
  validate({ query: adminRangeQuerySchema }),
  controller.getReports,
);

// ---- Medical content: separately permissioned, every access audited --------
adminRouter.get(
  '/health-records',
  requirePermission('health_records.read'),
  validate({ query: adminHealthRecordQuerySchema }),
  controller.listHealthRecords,
);
adminRouter.get(
  '/health-records/:id',
  requirePermission('health_records.read'),
  validate({ params: adminIdParamsSchema }),
  controller.getHealthRecord,
);
adminRouter.get(
  '/medicines',
  requirePermission('medicines.read'),
  validate({ query: adminMedicineQuerySchema }),
  controller.listMedicines,
);
