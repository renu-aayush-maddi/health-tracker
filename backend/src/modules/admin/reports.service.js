import { query } from '../../db/pool.js';

/**
 * Aggregate reports. The privacy report is the one that matters most: it makes administrators'
 * access to medical content visible, so the people with power are themselves accountable.
 */
export async function getReports({ from, to }) {
  const range = [from, to];

  const [users, usage, security, privacy, privacyDetail] = await Promise.all([
    query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE created_at >= $1::date)::int AS new_in_range,
              count(*) FILTER (WHERE last_activity_at >= $1::date)::int AS active_in_range,
              count(*) FILTER (WHERE status <> 'active')::int AS restricted,
              count(*) FILTER (WHERE email_verified_at IS NULL)::int AS unverified
         FROM users`,
      [from],
    ),
    query(
      `SELECT (SELECT count(*)::int FROM health_events WHERE created_at >= $1::date) AS health_events,
              (SELECT count(*)::int FROM medicines WHERE created_at >= $1::date) AS medicines,
              (SELECT count(*)::int FROM attachments WHERE created_at >= $1::date) AS attachments,
              (SELECT count(DISTINCT user_id)::int FROM health_events WHERE created_at >= $1::date) AS contributing_users`,
      [from],
    ),
    query(
      `SELECT count(*) FILTER (WHERE event_type = 'LOGIN_SUCCESS')::int AS successful_logins,
              count(*) FILTER (WHERE event_type = 'LOGIN_FAILED')::int AS failed_logins,
              count(*) FILTER (WHERE event_type = 'LOGIN_BLOCKED_IP')::int AS blocked_by_ip,
              count(*) FILTER (WHERE event_type = 'LOGIN_BLOCKED_ACCOUNT')::int AS blocked_accounts,
              count(*) FILTER (WHERE event_type = 'PASSWORD_RESET_REQUESTED')::int AS reset_requests
         FROM security_events WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')`,
      range,
    ),
    query(
      `SELECT count(*)::int AS sensitive_accesses,
              count(DISTINCT actor_user_id)::int AS administrators
         FROM audit_logs
        WHERE action IN ('HEALTH_RECORD_VIEWED', 'MEDICINE_RECORD_VIEWED', 'HEALTH_DATA_EXPORTED')
          AND created_at >= $1::date AND created_at < ($2::date + interval '1 day')`,
      range,
    ),
    query(
      `SELECT actor_email, actor_role, action, count(*)::int AS accesses, max(created_at) AS last_access
         FROM audit_logs
        WHERE action IN ('HEALTH_RECORD_VIEWED', 'MEDICINE_RECORD_VIEWED', 'HEALTH_DATA_EXPORTED')
          AND created_at >= $1::date AND created_at < ($2::date + interval '1 day')
        GROUP BY actor_email, actor_role, action
        ORDER BY accesses DESC LIMIT 50`,
      range,
    ),
  ]);

  return {
    range: { from, to },
    users: users.rows[0],
    usage: usage.rows[0],
    security: security.rows[0],
    privacy: { ...privacy.rows[0], byAdministrator: privacyDetail.rows },
  };
}
