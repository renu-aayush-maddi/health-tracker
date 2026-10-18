import { ROLE_PERMISSIONS } from '@health-tracker/shared';
import { badRequest, notFound } from '../../utils/httpErrors.js';
import { verifyPassword } from '../../utils/passwords.js';
import { permissionsFor } from '../../middleware/requireAdmin.js';
import { deleteSessionById, markReauthenticated } from '../auth/session.repository.js';
import { findUserWithHashById } from '../users/user.repository.js';
import { recordAudit, recordSecurityEvent } from './audit.service.js';
import {
  toAuditLog,
  toGrant,
  toIpAddress,
  toSecurityEvent,
  toSession,
} from './admin.serializer.js';
import * as dashboard from './dashboard.service.js';
import * as healthRecords from './healthRecords.service.js';
import * as ipRepo from './ipBlocklist.repository.js';
import * as logs from './logs.repository.js';
import * as permissions from './permission.service.js';
import * as reports from './reports.service.js';
import * as system from './system.service.js';
import * as users from './users.service.js';
import * as usersRepo from './users.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolves the requested chart/report window to a concrete date range. */
function dateRange({ days, from, to }) {
  const end = to ?? new Date().toLocaleDateString('en-CA');
  const start = from ?? new Date(Date.parse(end) - (days - 1) * DAY_MS).toLocaleDateString('en-CA');
  return { from: start, to: end };
}

/** What the signed-in administrator may do — lets the UI hide what it cannot use. */
export async function getMe(req, res) {
  const granted = await permissionsFor(req);
  res.json({
    user: {
      id: req.auth.userId,
      name: req.auth.user.name,
      email: req.auth.user.email,
      role: req.auth.user.role,
    },
    permissions: [...granted].sort(),
    roleDefaults: ROLE_PERMISSIONS[req.auth.user.role] ?? [],
    reauthenticatedAt: req.auth.session?.reauth_at ?? null,
  });
}

/** Password re-entry, unlocking high-risk actions for a short window. */
export async function reauthenticate(req, res) {
  const account = await findUserWithHashById(req.auth.userId);
  if (!account || !(await verifyPassword(account.password_hash, req.valid.body.password))) {
    await recordSecurityEvent(req, {
      userId: req.auth.userId,
      email: req.auth.user.email,
      type: 'REAUTH_FAILED',
      failureReason: 'WRONG_PASSWORD',
    });
    throw badRequest('That password is not correct.', {
      password: 'That password is not correct.',
    });
  }
  await markReauthenticated(req.auth.sessionId);
  await recordSecurityEvent(req, {
    userId: req.auth.userId,
    email: req.auth.user.email,
    type: 'REAUTH_SUCCESS',
    success: true,
  });
  res.status(204).end();
}

export async function getDashboard(req, res) {
  const [overview, trends] = await Promise.all([
    dashboard.getOverview(),
    dashboard.getTrends(dateRange(req.valid.query)),
  ]);
  res.json({ ...overview, trends });
}

export async function listUsers(req, res) {
  res.json(await users.listUsers(req.valid.query));
}

export async function getUser(req, res) {
  res.json(await users.getUserDetail(req, req.valid.params.userId));
}

export async function updateUser(req, res) {
  res.json({ user: await users.updateUser(req, req.valid.params.userId, req.valid.body) });
}

export async function changeStatus(req, res) {
  res.json({ user: await users.changeStatus(req, req.valid.params.userId, req.valid.body) });
}

export async function changeRole(req, res) {
  res.json({ user: await users.changeRole(req, req.valid.params.userId, req.valid.body) });
}

export async function forceLogout(req, res) {
  res.json(await users.forceLogout(req, req.valid.params.userId));
}

export async function triggerPasswordReset(req, res) {
  await users.triggerPasswordReset(req, req.valid.params.userId);
  res.status(202).json({ message: 'A password reset email has been sent.' });
}

export async function deleteUser(req, res) {
  await users.deleteUser(req, req.valid.params.userId, req.valid.body);
  res.status(204).end();
}

export async function listSessions(req, res) {
  const { rows, total } = await logs.listSessions(req.valid.query);
  res.json({
    items: rows.map(toSession),
    page: req.valid.query.page,
    pageSize: req.valid.query.pageSize,
    total,
  });
}

export async function revokeSession(req, res) {
  const session = await logs.findSession(req.valid.params.id);
  if (!session) throw notFound('Session not found.');
  await deleteSessionById(session.id);
  await recordAudit(req, {
    action: 'SESSION_REVOKED',
    resourceType: 'session',
    resourceId: session.id,
    targetUserId: session.user_id,
    targetEmail: session.email,
  });
  res.status(204).end();
}

export async function listSecurityEvents(req, res) {
  const { rows, total } = await logs.listSecurityEvents(req.valid.query);
  res.json({
    items: rows.map(toSecurityEvent),
    page: req.valid.query.page,
    pageSize: req.valid.query.pageSize,
    total,
  });
}

export async function getSuspiciousActivity(req, res) {
  res.json(await logs.findSuspiciousActivity());
}

export async function listAuditLogs(req, res) {
  const { rows, total } = await logs.listAuditLogs(req.valid.query);
  res.json({
    items: rows.map(toAuditLog),
    page: req.valid.query.page,
    pageSize: req.valid.query.pageSize,
    total,
  });
}

export async function listIpAddresses(req, res) {
  const { rows, total } = await logs.listIpAddresses(req.valid.query);
  res.json({
    items: rows.map(toIpAddress),
    page: req.valid.query.page,
    pageSize: req.valid.query.pageSize,
    total,
  });
}

export async function blockIp(req, res) {
  const { ip, reason, expiresAt } = req.valid.body;
  const block = await ipRepo.blockIp({ ip, reason, blockedBy: req.auth.userId, expiresAt });
  await recordAudit(req, {
    action: 'IP_BLOCKED',
    resourceType: 'ip_address',
    metadata: { ip, reason: reason ?? null, expiresAt: expiresAt ?? null },
  });
  res.json({ block });
}

export async function unblockIp(req, res) {
  const { ip } = req.valid.body;
  if (!(await ipRepo.unblockIp(ip))) throw notFound('That address is not blocked.');
  await recordAudit(req, { action: 'IP_UNBLOCKED', resourceType: 'ip_address', metadata: { ip } });
  res.status(204).end();
}

export async function listAdmins(req, res) {
  const admins = await usersRepo.listAdminAccounts();
  const withGrants = await Promise.all(
    admins.map(async (row) => ({
      ...users.toAdminUserSummary(row),
      grants: (await permissions.listGrants(row.id)).map(toGrant),
    })),
  );
  res.json({ items: withGrants });
}

export async function grantPermission(req, res) {
  const { permission, expiresAt, reason } = req.valid.body;
  const target = await usersRepo.findUserDetail(req.valid.params.userId);
  if (!target) throw notFound('Account not found.');
  if (!users.isAdminRole(target.role)) {
    throw badRequest('Permissions can only be granted to administrative accounts.');
  }

  await permissions.grantPermission({
    userId: target.id,
    permission,
    grantedBy: req.auth.userId,
    expiresAt,
    reason,
  });
  await recordAudit(req, {
    action: 'ADMIN_PERMISSION_GRANTED',
    resourceType: 'permission',
    targetUserId: target.id,
    targetEmail: target.email,
    metadata: { permission, expiresAt: expiresAt ?? null, reason: reason ?? null },
  });
  res.status(201).json({ permission, expiresAt: expiresAt ?? null });
}

export async function revokePermission(req, res) {
  const { userId, permission } = req.valid.params;
  const target = await usersRepo.findUserDetail(userId);
  if (!target) throw notFound('Account not found.');
  if (!(await permissions.revokePermission({ userId, permission }))) {
    throw notFound('That permission is not granted.');
  }
  await recordAudit(req, {
    action: 'ADMIN_PERMISSION_REVOKED',
    resourceType: 'permission',
    targetUserId: userId,
    targetEmail: target.email,
    metadata: { permission },
  });
  res.status(204).end();
}

export async function getSystemHealth(req, res) {
  res.json(await system.getSystemHealth());
}

export async function getReports(req, res) {
  res.json(await reports.getReports(dateRange(req.valid.query)));
}

export async function listHealthRecords(req, res) {
  res.json(await healthRecords.listRecords(req.valid.query));
}

export async function getHealthRecord(req, res) {
  res.json(await healthRecords.getRecord(req, req.valid.params.id));
}

export async function listMedicines(req, res) {
  res.json(await healthRecords.listMedicineRecords(req, req.valid.query));
}
