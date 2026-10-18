import { ADMIN_ROLES } from '@health-tracker/shared';
import { withTransaction } from '../../db/pool.js';
import { HttpError, badRequest, notFound } from '../../utils/httpErrors.js';
import { listStoredFiles } from '../attachments/attachment.repository.js';
import { removeStoredFiles } from '../attachments/attachment.service.js';
import { deleteUserSessions } from '../auth/session.repository.js';
import { requestPasswordReset } from '../auth/auth.service.js';
import { recordAudit } from './audit.service.js';
import { listGrants } from './permission.service.js';
import { toActivityEntry, toGrant } from './admin.serializer.js';
import * as repo from './users.repository.js';

const userNotFound = () => notFound('Account not found.');
const refuse = (message) => new HttpError(409, 'NOT_ALLOWED', message);

/**
 * Invariants that protect the platform from its own administrators. Enforced here, in the
 * service, so every route shares them — not in the UI.
 */
async function assertActionAllowed({ actor, target, action, db }) {
  if (actor.userId === target.id) {
    throw refuse(`You cannot ${action} your own account.`);
  }
  // Losing the last super admin would leave nobody able to manage roles.
  if (target.role === 'super_admin' && (await repo.countSuperAdmins(db)) <= 1) {
    throw refuse(`${target.email} is the only active super admin, so you cannot ${action} them.`);
  }
}

export async function listUsers(filters) {
  const { rows, total } = await repo.listUsers(filters);
  return {
    items: rows.map(toAdminUserSummary),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
  };
}

export function toAdminUserSummary(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    statusReason: row.status_reason,
    emailVerified: Boolean(row.email_verified_at),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    lastActivityAt: row.last_activity_at,
    lastIp: row.last_ip,
    healthEventCount: row.health_event_count,
    medicineCount: row.medicine_count,
    attachmentCount: row.attachment_count,
    sessionCount: row.session_count,
  };
}

/** Account detail: metadata, security context and explicit permission grants. No health content. */
export async function getUserDetail(req, userId) {
  const row = await repo.findUserDetail(userId);
  if (!row) throw userNotFound();

  const [ips, failedLogins, activity, grants] = await Promise.all([
    repo.listUserIps(userId),
    repo.countRecentFailedLogins(userId),
    repo.listUserActivity(userId),
    listGrants(userId),
  ]);

  await recordAudit(req, {
    action: 'USER_VIEWED',
    resourceType: 'user',
    resourceId: userId,
    targetUserId: userId,
    targetEmail: row.email,
  });

  return {
    ...toAdminUserSummary(row),
    updatedAt: row.updated_at,
    passwordChangedAt: row.password_changed_at,
    statusChangedAt: row.status_changed_at,
    statusChangedByEmail: row.status_changed_by_email,
    security: {
      knownIps: ips.map((row) => ({
        ipAddress: row.ip_address,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        events: row.events,
      })),
      failedLoginsLast24h: failedLogins,
    },
    grants: grants.map(toGrant),
    activity: activity.map(toActivityEntry),
  };
}

export async function updateUser(req, userId, { name }) {
  const target = await repo.findUserDetail(userId);
  if (!target) throw userNotFound();

  return withTransaction(async (client) => {
    const updated = await repo.updateUserName(userId, name, client);
    await recordAudit(
      req,
      {
        action: 'USER_UPDATED',
        resourceType: 'user',
        resourceId: userId,
        targetUserId: userId,
        targetEmail: target.email,
        metadata: { from: { name: target.name }, to: { name } },
      },
      client,
    );
    return updated;
  });
}

/** Blocking, disabling, suspending or restoring an account. Revokes sessions when restricting. */
export async function changeStatus(req, userId, { status, reason }) {
  const target = await repo.findUserDetail(userId);
  if (!target) throw userNotFound();
  if (target.status === status) throw badRequest(`This account is already ${status}.`);
  if (status !== 'active')
    await assertActionAllowed({ actor: req.auth, target, action: `${status} ` });

  return withTransaction(async (client) => {
    const updated = await repo.setStatus(
      { userId, status, reason, actorId: req.auth.userId },
      client,
    );
    // Restricting an account takes effect immediately, not when its sessions happen to expire.
    if (status !== 'active') await deleteUserSessions(userId, {}, client);
    await recordAudit(
      req,
      {
        action: 'USER_STATUS_CHANGED',
        resourceType: 'user',
        resourceId: userId,
        targetUserId: userId,
        targetEmail: target.email,
        metadata: { from: target.status, to: status, reason: reason ?? null },
      },
      client,
    );
    return updated;
  });
}

export async function changeRole(req, userId, { role, reason }) {
  const target = await repo.findUserDetail(userId);
  if (!target) throw userNotFound();
  if (target.role === role) throw badRequest(`This account is already ${role}.`);
  await assertActionAllowed({ actor: req.auth, target, action: 'change the role of' });

  return withTransaction(async (client) => {
    const updated = await repo.setRole(userId, role, client);
    await recordAudit(
      req,
      {
        action: 'USER_ROLE_CHANGED',
        resourceType: 'user',
        resourceId: userId,
        targetUserId: userId,
        targetEmail: target.email,
        metadata: { from: target.role, to: role, reason: reason ?? null },
      },
      client,
    );
    return updated;
  });
}

export async function forceLogout(req, userId) {
  const target = await repo.findUserDetail(userId);
  if (!target) throw userNotFound();

  return withTransaction(async (client) => {
    await deleteUserSessions(userId, {}, client);
    await recordAudit(
      req,
      {
        action: 'ALL_SESSIONS_REVOKED',
        resourceType: 'user',
        resourceId: userId,
        targetUserId: userId,
        targetEmail: target.email,
      },
      client,
    );
    return { sessions: target.session_count };
  });
}

/** Sends the normal reset email. The administrator never sees or sets the password. */
export async function triggerPasswordReset(req, userId) {
  const target = await repo.findUserDetail(userId);
  if (!target) throw userNotFound();

  await requestPasswordReset({ email: target.email });
  await recordAudit(req, {
    action: 'PASSWORD_RESET_TRIGGERED',
    resourceType: 'user',
    resourceId: userId,
    targetUserId: userId,
    targetEmail: target.email,
  });
}

/**
 * Permanent deletion. The account's health data goes with it (ON DELETE CASCADE) and its
 * uploaded files are removed from storage, but the audit trail is deliberately preserved.
 */
export async function deleteUser(req, userId, { confirmEmail, reason }) {
  const target = await repo.findUserDetail(userId);
  if (!target) throw userNotFound();
  if (confirmEmail.toLowerCase() !== target.email) {
    throw badRequest('The email you typed does not match this account.', {
      confirmEmail: 'The email you typed does not match this account.',
    });
  }
  await assertActionAllowed({ actor: req.auth, target, action: 'delete' });

  const files = await listStoredFiles(userId);
  await withTransaction(async (client) => {
    // Audit first: the row must survive the deletion it describes.
    await recordAudit(
      req,
      {
        action: 'USER_DELETED',
        resourceType: 'user',
        resourceId: userId,
        targetUserId: userId,
        targetEmail: target.email,
        metadata: {
          reason: reason ?? null,
          healthEvents: target.health_event_count,
          medicines: target.medicine_count,
          attachments: target.attachment_count,
        },
      },
      client,
    );
    await repo.deleteUser(userId, client);
  });
  await removeStoredFiles(files);
}

export const isAdminRole = (role) => ADMIN_ROLES.includes(role);
