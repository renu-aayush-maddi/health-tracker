import { query } from '../../db/pool.js';

/** The active block for an IP, or null. Expired entries are ignored, not deleted. */
export async function findActiveBlock(ip) {
  if (!ip) return null;
  const { rows } = await query(
    `SELECT ip_address, reason, blocked_at, expires_at FROM ip_blocklist
      WHERE ip_address = $1::inet AND (expires_at IS NULL OR expires_at > now())`,
    [ip],
  );
  return rows[0] ?? null;
}

export async function blockIp({ ip, reason, blockedBy, expiresAt }) {
  const { rows } = await query(
    `INSERT INTO ip_blocklist (ip_address, reason, blocked_by, expires_at)
     VALUES ($1::inet, $2, $3, $4)
     ON CONFLICT (ip_address)
       DO UPDATE SET reason = EXCLUDED.reason, blocked_by = EXCLUDED.blocked_by,
                     blocked_at = now(), expires_at = EXCLUDED.expires_at
     RETURNING ip_address, reason, blocked_at, expires_at`,
    [ip, reason ?? null, blockedBy ?? null, expiresAt ?? null],
  );
  return rows[0];
}

export async function unblockIp(ip) {
  const { rowCount } = await query('DELETE FROM ip_blocklist WHERE ip_address = $1::inet', [ip]);
  return rowCount > 0;
}
