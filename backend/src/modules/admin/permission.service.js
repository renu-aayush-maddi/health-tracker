import { REAUTH_WINDOW_MINUTES, ROLE_PERMISSIONS } from '@health-tracker/shared';
import { query } from '../../db/pool.js';

export { REAUTH_WINDOW_MINUTES };

/**
 * Everything this account may do: the role's defaults plus any unexpired explicit grant.
 * Derived server-side from the user's own row — a role or permission sent by the client is
 * never consulted. Ordinary users need no query at all.
 */
export async function resolvePermissions(user) {
  const fromRole = ROLE_PERMISSIONS[user.role] ?? [];
  if (user.role === 'user') return new Set(fromRole);

  const { rows } = await query(
    `SELECT permission FROM admin_permissions
      WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())`,
    [user.id],
  );
  return new Set([...fromRole, ...rows.map((r) => r.permission)]);
}

/** Explicit grants for one account, including expired ones (shown in the admin UI). */
export async function listGrants(userId) {
  const { rows } = await query(
    `SELECT p.permission, p.granted_at, p.expires_at, p.reason,
            g.email AS granted_by_email,
            (p.expires_at IS NULL OR p.expires_at > now()) AS active
       FROM admin_permissions p
       LEFT JOIN users g ON g.id = p.granted_by
      WHERE p.user_id = $1
      ORDER BY p.granted_at DESC`,
    [userId],
  );
  return rows;
}

export async function grantPermission(
  { userId, permission, grantedBy, expiresAt, reason },
  db = { query },
) {
  await db.query(
    `INSERT INTO admin_permissions (user_id, permission, granted_by, expires_at, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, permission)
       DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = now(),
                     expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason`,
    [userId, permission, grantedBy, expiresAt ?? null, reason ?? null],
  );
}

export async function revokePermission({ userId, permission }, db = { query }) {
  const { rowCount } = await db.query(
    'DELETE FROM admin_permissions WHERE user_id = $1 AND permission = $2',
    [userId, permission],
  );
  return rowCount > 0;
}
