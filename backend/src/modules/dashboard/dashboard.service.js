import { query } from '../../db/pool.js';
import * as eventRepo from '../healthEvents/healthEvent.repository.js';
import { toEventSummary } from '../healthEvents/healthEvent.serializer.js';

const LIST_SIZE = 5;

/** Everything on the dashboard, computed only from this user's own records. */
export async function getDashboard(userId) {
  const listOptions = { page: 1, pageSize: LIST_SIZE, sort: 'start_desc' };

  const [totals, ongoing, recent, common] = await Promise.all([
    query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'ongoing')::int AS ongoing,
              count(*) FILTER (WHERE status = 'resolved')::int AS resolved
         FROM health_events WHERE user_id = $1`,
      [userId],
    ),
    eventRepo.listEvents(userId, { ...listOptions, status: 'ongoing' }),
    eventRepo.listEvents(userId, listOptions),
    query(
      `SELECT health_issue AS name, count(*)::int AS count
         FROM health_events
        WHERE user_id = $1 AND start_date >= current_date - interval '12 months'
        GROUP BY health_issue
        ORDER BY count DESC, max(start_date) DESC
        LIMIT 1`,
      [userId],
    ),
  ]);

  return {
    totals: totals.rows[0],
    ongoing: ongoing.rows.map(toEventSummary),
    recent: recent.rows.map(toEventSummary),
    mostCommonIssue: common.rows[0] ?? null,
  };
}
