// The admin API speaks camelCase like the rest of the API. These also act as allow-lists:
// a column added to a table later cannot leak through without being named here.

export const toSession = (row) => ({
  id: row.id,
  userId: row.user_id,
  userEmail: row.email,
  userName: row.name,
  userRole: row.role,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  expiresAt: row.expires_at,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
});

export const toAuditLog = (row) => ({
  id: row.id,
  actorUserId: row.actor_user_id,
  actorEmail: row.actor_email,
  actorRole: row.actor_role,
  action: row.action,
  resourceType: row.resource_type,
  resourceId: row.resource_id,
  targetUserId: row.target_user_id,
  targetEmail: row.target_email,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  metadata: row.metadata,
  createdAt: row.created_at,
});

export const toSecurityEvent = (row) => ({
  id: row.id,
  userId: row.user_id,
  email: row.email_attempted,
  type: row.event_type,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  success: row.success,
  failureReason: row.failure_reason,
  metadata: row.metadata,
  createdAt: row.created_at,
});

export const toIpAddress = (row) => ({
  ipAddress: row.ip_address,
  firstSeen: row.first_seen,
  lastSeen: row.last_seen,
  userCount: row.user_count,
  successfulLogins: row.successful_logins,
  failedEvents: row.failed_events,
  blocked: row.blocked,
  blockReason: row.block_reason,
});

export const toGrant = (row) => ({
  permission: row.permission,
  grantedAt: row.granted_at,
  grantedByEmail: row.granted_by_email,
  expiresAt: row.expires_at,
  reason: row.reason,
  active: row.active,
});

export const toActivityEntry = (row) => ({
  at: row.created_at,
  event: row.event,
  source: row.source,
  success: row.success,
  ipAddress: row.ip,
  detail: row.detail,
  actorEmail: row.actor,
});
