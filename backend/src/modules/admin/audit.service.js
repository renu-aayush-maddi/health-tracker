// Append-only logging. Two streams:
//   audit_logs      — what an administrator did
//   security_events — authentication and account security, for any account
// Neither ever receives a password, hash, session token, verification code or API key.
import { query } from '../../db/pool.js';

/** Actor details for an audit row, taken from the authenticated request. */
export function auditContext(req) {
  return {
    actorUserId: req.auth?.userId ?? null,
    actorEmail: req.auth?.user?.email ?? null,
    actorRole: req.auth?.user?.role ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
  };
}

/**
 * Records a privileged action. `db` lets the caller pass a transaction client so the action and
 * its audit row commit together — an audited action cannot succeed without its record.
 */
export async function recordAudit(
  req,
  {
    action,
    resourceType = null,
    resourceId = null,
    targetUserId = null,
    targetEmail = null,
    metadata = {},
  },
  db = { query },
) {
  const actor = auditContext(req);
  await db.query(
    `INSERT INTO audit_logs
       (actor_user_id, actor_email, actor_role, action, resource_type, resource_id,
        target_user_id, target_email, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      actor.actorUserId,
      actor.actorEmail,
      actor.actorRole,
      action,
      resourceType,
      resourceId,
      targetUserId,
      targetEmail,
      actor.ipAddress,
      actor.userAgent,
      metadata,
    ],
  );
}

/** Records an authentication/security event. Never throws into the request path. */
export async function recordSecurityEvent(
  req,
  { userId = null, email = null, type, success = false, failureReason = null, metadata = {} },
) {
  try {
    await query(
      `INSERT INTO security_events
         (user_id, email_attempted, event_type, ip_address, user_agent, success, failure_reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        email?.slice(0, 254) ?? null,
        type,
        req?.ip ?? null,
        req?.get('user-agent')?.slice(0, 255) ?? null,
        success,
        failureReason,
        metadata,
      ],
    );
  } catch (err) {
    // Security logging must never break sign-in; losing a row is better than locking people out.
    console.error(`Failed to record security event ${type}: ${err.message}`);
  }
}
