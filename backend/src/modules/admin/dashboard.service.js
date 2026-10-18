// Platform overview. Every figure here is an aggregate count — no row of medical content is
// read, so this page is safe for any administrative role.
import { query } from '../../db/pool.js';

export async function getOverview() {
  const [users, activity, security, health] = await Promise.all([
    query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS new_today,
             count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new_week,
             count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new_month,
             count(*) FILTER (WHERE last_activity_at > now() - interval '30 days')::int AS active,
             count(*) FILTER (WHERE last_activity_at IS NULL
                                 OR last_activity_at <= now() - interval '30 days')::int AS inactive,
             count(*) FILTER (WHERE status = 'blocked')::int AS blocked,
             count(*) FILTER (WHERE status = 'disabled')::int AS disabled,
             count(*) FILTER (WHERE status = 'suspended')::int AS suspended,
             count(*) FILTER (WHERE role <> 'user')::int AS admins,
             count(*) FILTER (WHERE email_verified_at IS NULL)::int AS unverified
        FROM users`),
    query(`
      SELECT (SELECT count(*)::int FROM health_events) AS health_events,
             (SELECT count(*)::int FROM health_events WHERE created_at > now() - interval '1 day') AS events_today,
             (SELECT count(*)::int FROM health_events WHERE created_at > now() - interval '7 days') AS events_week,
             (SELECT count(*)::int FROM health_events WHERE created_at > now() - interval '30 days') AS events_month,
             (SELECT count(*)::int FROM medicines) AS medicines,
             (SELECT count(*)::int FROM attachments) AS attachments`),
    query(`
      SELECT count(*) FILTER (WHERE event_type = 'LOGIN_SUCCESS'
                                AND created_at > now() - interval '1 day')::int AS logins_today,
             count(*) FILTER (WHERE success = false
                                AND created_at > now() - interval '1 day')::int AS failures_today,
             count(*) FILTER (WHERE success = false
                                AND created_at > now() - interval '7 days')::int AS failures_week
        FROM security_events`),
    query(`
      SELECT (SELECT count(*)::int FROM sessions WHERE expires_at > now()) AS active_sessions,
             (SELECT count(*)::int FROM ip_blocklist
               WHERE expires_at IS NULL OR expires_at > now()) AS blocked_ips`),
  ]);

  return {
    users: users.rows[0],
    usage: activity.rows[0],
    security: { ...security.rows[0], ...health.rows[0] },
  };
}

/** Daily counts for the dashboard charts, zero-filled so the line has no gaps. */
export async function getTrends({ from, to }) {
  const series = async (sql, params = []) => {
    const { rows } = await query(
      `WITH days AS (SELECT generate_series($1::date, $2::date, '1 day')::date AS day)
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COALESCE(v.count, 0)::int AS count
         FROM days d LEFT JOIN (${sql}) v ON v.day = d.day
        ORDER BY d.day`,
      [from, to, ...params],
    );
    return rows;
  };

  const [registrations, healthEvents, logins, failedLogins, activeUsers] = await Promise.all([
    series(`SELECT created_at::date AS day, count(*) AS count FROM users
             WHERE created_at >= $1::date GROUP BY 1`),
    series(`SELECT created_at::date AS day, count(*) AS count FROM health_events
             WHERE created_at >= $1::date GROUP BY 1`),
    series(`SELECT created_at::date AS day, count(*) AS count FROM security_events
             WHERE event_type = 'LOGIN_SUCCESS' AND created_at >= $1::date GROUP BY 1`),
    series(`SELECT created_at::date AS day, count(*) AS count FROM security_events
             WHERE success = false AND created_at >= $1::date GROUP BY 1`),
    series(`SELECT created_at::date AS day, count(DISTINCT user_id) AS count FROM security_events
             WHERE user_id IS NOT NULL AND success = true AND created_at >= $1::date GROUP BY 1`),
  ]);

  return { registrations, healthEvents, logins, failedLogins, activeUsers };
}
