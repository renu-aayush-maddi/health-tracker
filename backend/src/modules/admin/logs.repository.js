// Read side of the two append-only logs, plus aggregated IP activity and session listings.
import { query } from '../../db/pool.js';

const paginate = async (select, countSelect, where, params, { page, pageSize }) => {
  const offset = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    query(
      `${select} WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    ),
    query(`${countSelect} WHERE ${where}`, params),
  ]);
  return { rows: rows.rows, total: total.rows[0].total };
};

function filters(spec) {
  const params = [];
  const conditions = ['TRUE'];
  for (const [sql, value] of spec) {
    if (value === null || value === undefined || value === '') continue;
    params.push(value);
    conditions.push(sql.replaceAll('?', `$${params.length}`));
  }
  return { where: conditions.join(' AND '), params };
}

export async function listAuditLogs(f) {
  const { where, params } = filters([
    ['action = ?', f.action],
    ['actor_user_id = ?', f.actorUserId],
    ['target_user_id = ?', f.targetUserId],
    ['ip_address = ?::inet', f.ip],
    ['created_at >= ?::date', f.from],
    ["created_at < (?::date + interval '1 day')", f.to],
  ]);
  return paginate(
    `SELECT id, actor_user_id, actor_email, actor_role, action, resource_type, resource_id,
            target_user_id, target_email, ip_address::text AS ip_address, user_agent, metadata, created_at
       FROM audit_logs`,
    'SELECT count(*)::int AS total FROM audit_logs',
    where,
    params,
    f,
  );
}

export async function listSecurityEvents(f) {
  const { where, params } = filters([
    ['event_type = ?', f.type],
    ['user_id = ?', f.userId],
    ['ip_address = ?::inet', f.ip],
    ['success = ?', f.outcome ? f.outcome === 'success' : null],
    ['created_at >= ?::date', f.from],
    ["created_at < (?::date + interval '1 day')", f.to],
  ]);
  return paginate(
    `SELECT id, user_id, email_attempted, event_type, ip_address::text AS ip_address,
            user_agent, success, failure_reason, metadata, created_at
       FROM security_events`,
    'SELECT count(*)::int AS total FROM security_events',
    where,
    params,
    f,
  );
}

/**
 * IP activity aggregated from the security log, joined to the blocklist.
 * Never exposes session tokens — only counts and timestamps.
 */
export async function listIpAddresses(f) {
  const params = [];
  const conditions = ['e.ip_address IS NOT NULL'];
  if (f.q) {
    params.push(`%${f.q}%`);
    conditions.push(`e.ip_address::text ILIKE $${params.length}`);
  }
  const where = conditions.join(' AND ');
  const having = f.onlyBlocked ? 'HAVING bool_or(b.ip_address IS NOT NULL)' : '';
  const offset = (f.page - 1) * f.pageSize;

  const grouped = `
    FROM security_events e
    LEFT JOIN ip_blocklist b
      ON b.ip_address = e.ip_address AND (b.expires_at IS NULL OR b.expires_at > now())
    WHERE ${where}
    GROUP BY e.ip_address ${having}`;

  const [rows, total] = await Promise.all([
    query(
      `SELECT e.ip_address::text AS ip_address,
              min(e.created_at) AS first_seen,
              max(e.created_at) AS last_seen,
              count(DISTINCT e.user_id)::int AS user_count,
              count(*) FILTER (WHERE e.event_type = 'LOGIN_SUCCESS')::int AS successful_logins,
              count(*) FILTER (WHERE e.success = false)::int AS failed_events,
              bool_or(b.ip_address IS NOT NULL) AS blocked,
              max(b.reason) AS block_reason
       ${grouped}
       ORDER BY max(e.created_at) DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.pageSize, offset],
    ),
    query(`SELECT count(*)::int AS total FROM (SELECT e.ip_address ${grouped}) agg`, params),
  ]);
  return { rows: rows.rows, total: total.rows[0].total };
}

export async function listSessions(f) {
  const params = [];
  const conditions = ['s.expires_at > now()'];
  if (f.userId) {
    params.push(f.userId);
    conditions.push(`s.user_id = $${params.length}`);
  }
  const where = conditions.join(' AND ');
  const offset = (f.page - 1) * f.pageSize;

  const [rows, total] = await Promise.all([
    query(
      `SELECT s.id, s.user_id, u.email, u.name, u.role, s.created_at, s.last_used_at,
              s.expires_at, s.ip_address::text AS ip_address, s.user_agent
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE ${where}
        ORDER BY s.last_used_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, f.pageSize, offset],
    ),
    query(`SELECT count(*)::int AS total FROM sessions s WHERE ${where}`, params),
  ]);
  return { rows: rows.rows, total: total.rows[0].total };
}

export async function findSession(sessionId) {
  const { rows } = await query(
    `SELECT s.id, s.user_id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
    [sessionId],
  );
  return rows[0] ?? null;
}

/**
 * Cheap signals of trouble, computed on demand from the security log.
 * Deliberately simple: no behavioural profiling, only repeated failures.
 */
export async function findSuspiciousActivity({ hours = 24, threshold = 5 } = {}) {
  const [byIp, byAccount, spread] = await Promise.all([
    query(
      `SELECT ip_address::text AS ip_address, count(*)::int AS failures,
              count(DISTINCT email_attempted)::int AS accounts_tried, max(created_at) AS last_seen
         FROM security_events
        WHERE success = false AND ip_address IS NOT NULL
          AND created_at > now() - make_interval(hours => $1)
        GROUP BY ip_address HAVING count(*) >= $2
        ORDER BY failures DESC LIMIT 20`,
      [hours, threshold],
    ),
    query(
      `SELECT email_attempted, count(*)::int AS failures, max(created_at) AS last_seen
         FROM security_events
        WHERE success = false AND email_attempted IS NOT NULL
          AND created_at > now() - make_interval(hours => $1)
        GROUP BY email_attempted HAVING count(*) >= $2
        ORDER BY failures DESC LIMIT 20`,
      [hours, threshold],
    ),
    query(
      `SELECT u.email, count(DISTINCT e.ip_address)::int AS ip_count, max(e.created_at) AS last_seen
         FROM security_events e JOIN users u ON u.id = e.user_id
        WHERE e.created_at > now() - make_interval(hours => $1) AND e.ip_address IS NOT NULL
        GROUP BY u.email HAVING count(DISTINCT e.ip_address) >= 3
        ORDER BY ip_count DESC LIMIT 20`,
      [hours],
    ),
  ]);

  return {
    repeatedFailuresByIp: byIp.rows,
    repeatedFailuresByAccount: byAccount.rows,
    accountsSeenFromManyIps: spread.rows,
  };
}
