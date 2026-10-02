// SQL for health events. Every function takes the authenticated userId first, and every
// statement filters on it: ownership is part of the query, never a separate check.
import { query } from '../../db/pool.js';

const SORTS = {
  start_desc: 'e.start_date DESC, e.created_at DESC',
  start_asc: 'e.start_date ASC, e.created_at ASC',
  end_desc: 'e.end_date DESC NULLS FIRST, e.start_date DESC', // ongoing first
  end_asc: 'e.end_date ASC NULLS LAST, e.start_date ASC',
  created_desc: 'e.created_at DESC',
};

const PREVIEW_SIZE = 3;

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
const likePattern = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function buildListFilters(userId, filters) {
  const params = [userId];
  const conditions = ['e.user_id = $1'];
  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replaceAll('?', `$${params.length}`));
  };

  if (filters.q) {
    add(
      `(e.title ILIKE ? OR e.health_issue ILIKE ? OR e.description ILIKE ? OR e.notes ILIKE ?
        OR array_to_string(e.symptoms, ' ') ILIKE ?
        OR EXISTS (SELECT 1 FROM medicines m
                    WHERE m.health_event_id = e.id AND m.user_id = e.user_id AND m.name ILIKE ?)
        OR EXISTS (SELECT 1 FROM attachments a
                    WHERE a.health_event_id = e.id AND a.user_id = e.user_id
                      AND (a.original_filename ILIKE ? OR array_to_string(a.tags, ' ') ILIKE ?)))`,
      likePattern(filters.q),
    );
  }
  if (filters.healthIssue) add('lower(e.health_issue) = lower(?)', filters.healthIssue);
  if (filters.status) add('e.status = ?', filters.status);
  if (filters.severity) add('e.severity = ?', filters.severity);
  // Date range keeps events that overlap it, including ongoing ones.
  if (filters.from) add('(e.end_date IS NULL OR e.end_date >= ?::date)', filters.from);
  if (filters.to) add('e.start_date <= ?::date', filters.to);

  return { where: conditions.join(' AND '), params };
}

export async function listEvents(userId, filters) {
  const { where, params } = buildListFilters(userId, filters);
  const orderBy = SORTS[filters.sort] ?? SORTS.start_desc;
  const offset = (filters.page - 1) * filters.pageSize;

  const [page, count] = await Promise.all([
    query(
      `SELECT e.id, e.title, e.health_issue, e.description, e.start_date, e.end_date, e.status,
              e.severity, e.symptoms, e.created_at, e.updated_at,
              (SELECT count(*)::int FROM medicines m
                WHERE m.health_event_id = e.id AND m.user_id = e.user_id) AS medicine_count,
              (SELECT count(*)::int FROM attachments a
                WHERE a.health_event_id = e.id AND a.user_id = e.user_id) AS attachment_count,
              (SELECT coalesce(json_agg(json_build_object('name', p.name, 'dosage', p.dosage)
                                        ORDER BY p.sort_order), '[]'::json)
                 FROM (SELECT name, dosage, sort_order FROM medicines m
                        WHERE m.health_event_id = e.id AND m.user_id = e.user_id
                        ORDER BY sort_order LIMIT ${PREVIEW_SIZE}) p) AS medicine_preview
         FROM health_events e
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.pageSize, offset],
    ),
    query(`SELECT count(*)::int AS total FROM health_events e WHERE ${where}`, params),
  ]);

  return { rows: page.rows, total: count.rows[0].total };
}

export async function findEvent(userId, eventId, db = { query }) {
  const { rows } = await db.query('SELECT * FROM health_events WHERE id = $1 AND user_id = $2', [
    eventId,
    userId,
  ]);
  return rows[0] ?? null;
}

export async function insertEvent(userId, data, db) {
  const { rows } = await db.query(
    `INSERT INTO health_events
       (user_id, title, health_issue, description, start_date, end_date, status, severity, symptoms, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      userId,
      data.title,
      data.healthIssue,
      data.description,
      data.startDate,
      data.endDate,
      data.status,
      data.severity,
      data.symptoms,
      data.notes,
    ],
  );
  return rows[0];
}

export async function updateEvent(userId, eventId, data, db) {
  const { rows } = await db.query(
    `UPDATE health_events
        SET title = $3, health_issue = $4, description = $5, start_date = $6, end_date = $7,
            status = $8, severity = $9, symptoms = $10, notes = $11
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [
      eventId,
      userId,
      data.title,
      data.healthIssue,
      data.description,
      data.startDate,
      data.endDate,
      data.status,
      data.severity,
      data.symptoms,
      data.notes,
    ],
  );
  return rows[0] ?? null;
}

export async function updateEventStatus(userId, eventId, { status, endDate }) {
  const { rows } = await query(
    'UPDATE health_events SET status = $3, end_date = $4 WHERE id = $1 AND user_id = $2 RETURNING *',
    [eventId, userId, status, endDate],
  );
  return rows[0] ?? null;
}

/** Bumps updated_at when only an event's medicines changed. */
export async function touchEvent(userId, eventId, db = { query }) {
  await db.query('UPDATE health_events SET updated_at = now() WHERE id = $1 AND user_id = $2', [
    eventId,
    userId,
  ]);
}

export async function deleteEvent(userId, eventId) {
  const { rowCount } = await query('DELETE FROM health_events WHERE id = $1 AND user_id = $2', [
    eventId,
    userId,
  ]);
  return rowCount > 0;
}

export async function listCalendarEvents(userId, { from, to }) {
  const { rows } = await query(
    `SELECT id, title, health_issue, start_date, end_date, status, severity
       FROM health_events
      WHERE user_id = $1 AND start_date <= $3::date AND (end_date IS NULL OR end_date >= $2::date)
      ORDER BY start_date, created_at
      LIMIT 500`,
    [userId, from, to],
  );
  return rows;
}

/** Health issues this user has recorded, most used first (feeds the filter dropdown). */
export async function listIssues(userId) {
  const { rows } = await query(
    `SELECT health_issue AS name, count(*)::int AS count
       FROM health_events WHERE user_id = $1
      GROUP BY health_issue
      ORDER BY count DESC, health_issue`,
    [userId],
  );
  return rows;
}
