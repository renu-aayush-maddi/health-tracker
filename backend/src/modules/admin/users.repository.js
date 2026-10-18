// Administrative views of accounts. Deliberately metadata-only: counts and dates, never the
// content of a health event, symptom, note or medicine.
import { query } from '../../db/pool.js';

const SORTS = {
  created_desc: 'u.created_at DESC',
  created_asc: 'u.created_at ASC',
  activity_desc: 'u.last_activity_at DESC NULLS LAST',
  name_asc: 'lower(u.name) ASC',
  email_asc: 'u.email ASC',
};

const likePattern = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const COUNTS = `
  (SELECT count(*)::int FROM health_events e WHERE e.user_id = u.id) AS health_event_count,
  (SELECT count(*)::int FROM medicines m WHERE m.user_id = u.id) AS medicine_count,
  (SELECT count(*)::int FROM attachments a WHERE a.user_id = u.id) AS attachment_count,
  (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()) AS session_count`;

function buildFilters(filters) {
  const params = [];
  const conditions = ['TRUE'];
  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replaceAll('?', `$${params.length}`));
  };

  if (filters.q) add('(u.name ILIKE ? OR u.email ILIKE ?)', likePattern(filters.q));
  if (filters.role) add('u.role = ?', filters.role);
  if (filters.status) add('u.status = ?', filters.status);
  if (filters.from) add('u.created_at >= ?::date', filters.from);
  if (filters.to) add("u.created_at < (?::date + interval '1 day')", filters.to);

  return { where: conditions.join(' AND '), params };
}

export async function listUsers(filters) {
  const { where, params } = buildFilters(filters);
  const orderBy = SORTS[filters.sort] ?? SORTS.created_desc;
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, count] = await Promise.all([
    query(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.status_reason, u.created_at,
              u.last_login_at, u.last_activity_at, u.last_ip, u.email_verified_at, ${COUNTS}
         FROM users u WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.pageSize, offset],
    ),
    query(`SELECT count(*)::int AS total FROM users u WHERE ${where}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

export async function findUserDetail(userId) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.status_reason, u.status_changed_at,
            u.created_at, u.updated_at, u.last_login_at, u.last_activity_at, u.last_ip,
            u.email_verified_at, u.password_changed_at,
            c.email AS status_changed_by_email, ${COUNTS}
       FROM users u
       LEFT JOIN users c ON c.id = u.status_changed_by
      WHERE u.id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

/** Addresses this account has been seen from, newest first. */
export async function listUserIps(userId, limit = 10) {
  const { rows } = await query(
    `SELECT ip_address, max(created_at) AS last_seen, min(created_at) AS first_seen,
            count(*)::int AS events
       FROM security_events
      WHERE user_id = $1 AND ip_address IS NOT NULL
      GROUP BY ip_address
      ORDER BY last_seen DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

export async function countRecentFailedLogins(userId, hours = 24) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM security_events
      WHERE user_id = $1 AND success = false AND created_at > now() - make_interval(hours => $2)`,
    [userId, hours],
  );
  return rows[0].n;
}

export async function updateUserName(userId, name, db = { query }) {
  const { rows } = await db.query(
    'UPDATE users SET name = $2 WHERE id = $1 RETURNING id, name, email',
    [userId, name],
  );
  return rows[0] ?? null;
}

export async function setStatus({ userId, status, reason, actorId }, db = { query }) {
  const { rows } = await db.query(
    `UPDATE users
        SET status = $2, status_reason = $3, status_changed_at = now(), status_changed_by = $4
      WHERE id = $1
      RETURNING id, email, status, status_reason`,
    [userId, status, reason ?? null, actorId],
  );
  return rows[0] ?? null;
}

export async function setRole(userId, role, db = { query }) {
  const { rows } = await db.query(
    'UPDATE users SET role = $2 WHERE id = $1 RETURNING id, email, role',
    [userId, role],
  );
  return rows[0] ?? null;
}

export async function deleteUser(userId, db = { query }) {
  const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [userId]);
  return rowCount > 0;
}

export async function countSuperAdmins(db = { query }) {
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM users WHERE role = 'super_admin' AND status = 'active'",
  );
  return rows[0].n;
}

/**
 * A privacy-preserving timeline: security events plus admin actions taken against the account,
 * and health activity only as counts per day — never titles, symptoms or medicines.
 */
export async function listUserActivity(userId, limit = 50) {
  const { rows } = await query(
    `(
       SELECT created_at, event_type AS event, 'security' AS source, success,
              ip_address::text AS ip, failure_reason AS detail, NULL::text AS actor
         FROM security_events WHERE user_id = $1
     )
     UNION ALL
     (
       SELECT created_at, action AS event, 'admin' AS source, true AS success,
              ip_address::text AS ip, NULL::text AS detail, actor_email AS actor
         FROM audit_logs WHERE target_user_id = $1
     )
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

/** Every account holding an administrative role. Small by nature, so this is not paginated. */
export async function listAdminAccounts() {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.status_reason, u.created_at,
            u.last_login_at, u.last_activity_at, u.last_ip, u.email_verified_at, ${COUNTS}
       FROM users u
      WHERE u.role <> 'user'
      ORDER BY u.role DESC, u.email`,
  );
  return rows;
}
