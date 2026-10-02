// SQL for attachment metadata. Like medicines, every statement filters on both the event and
// the authenticated user; a composite foreign key pins each row to its event's owner.
import { query } from '../../db/pool.js';

const COLUMNS =
  'id, health_event_id, original_filename, content_type, size_bytes, storage_key, storage_resource_type, tags, created_at';

export async function listAttachments(userId, eventId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM attachments
      WHERE health_event_id = $1 AND user_id = $2
      ORDER BY created_at`,
    [eventId, userId],
  );
  return rows;
}

export async function countAttachments(userId, eventId) {
  const { rows } = await query(
    'SELECT count(*)::int AS n FROM attachments WHERE health_event_id = $1 AND user_id = $2',
    [eventId, userId],
  );
  return rows[0].n;
}

export async function insertAttachment(userId, eventId, file) {
  const { rows } = await query(
    `INSERT INTO attachments
       (health_event_id, user_id, original_filename, content_type, size_bytes, storage_key, storage_resource_type, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [
      eventId,
      userId,
      file.filename,
      file.contentType,
      file.size,
      file.storageKey,
      file.resourceType,
      file.tags,
    ],
  );
  return rows[0];
}

export async function findAttachment(userId, eventId, attachmentId) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM attachments WHERE id = $1 AND health_event_id = $2 AND user_id = $3`,
    [attachmentId, eventId, userId],
  );
  return rows[0] ?? null;
}

export async function deleteAttachment(userId, eventId, attachmentId) {
  await query('DELETE FROM attachments WHERE id = $1 AND health_event_id = $2 AND user_id = $3', [
    attachmentId,
    eventId,
    userId,
  ]);
}

/** Storage keys for files that must be removed from storage alongside an event or account. */
export async function listStoredFiles(userId, { eventId } = {}) {
  const { rows } = await query(
    `SELECT storage_key AS key, storage_resource_type AS "resourceType"
       FROM attachments
      WHERE user_id = $1 AND ($2::uuid IS NULL OR health_event_id = $2)`,
    [userId, eventId ?? null],
  );
  return rows;
}

export async function updateAttachmentTags(userId, eventId, attachmentId, tags) {
  const { rows } = await query(
    `UPDATE attachments SET tags = $4
      WHERE id = $1 AND health_event_id = $2 AND user_id = $3
      RETURNING ${COLUMNS}`,
    [attachmentId, eventId, userId, tags],
  );
  return rows[0] ?? null;
}

/** All of a user's files across events, newest first, optionally filtered by tag and name. */
export async function listUserAttachments(userId, { q, tag, page, pageSize }) {
  const params = [userId];
  const conditions = ['a.user_id = $1'];
  if (tag) {
    params.push(tag);
    // Case-insensitive tag match.
    conditions.push(
      `EXISTS (SELECT 1 FROM unnest(a.tags) t WHERE lower(t) = lower($${params.length}))`,
    );
  }
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(a.original_filename ILIKE ${p} OR array_to_string(a.tags, ' ') ILIKE ${p} OR e.title ILIKE ${p})`,
    );
  }
  const where = conditions.join(' AND ');
  const from =
    'FROM attachments a JOIN health_events e ON e.id = a.health_event_id AND e.user_id = a.user_id';

  const [page_, count] = await Promise.all([
    query(
      `SELECT ${COLUMNS.split(', ')
        .map((c) => `a.${c}`)
        .join(', ')},
              e.title AS event_title, e.health_issue AS event_health_issue, e.start_date AS event_start_date
         ${from} WHERE ${where}
        ORDER BY a.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    ),
    query(`SELECT count(*)::int AS total ${from} WHERE ${where}`, params),
  ]);
  return { rows: page_.rows, total: count.rows[0].total };
}

/** Tags this user has used, most used first (for suggestions and filters). */
export async function listUserTags(userId) {
  const { rows } = await query(
    `-- Spelling variants ("Lab report"/"lab report") count as one tag; byte order (COLLATE "C")
     -- prefers the capitalized spelling for display.
     SELECT (array_agg(t ORDER BY t COLLATE "C"))[1] AS name, count(*)::int AS count
       FROM attachments a, unnest(a.tags) t
      WHERE a.user_id = $1
      GROUP BY lower(t)
      ORDER BY count DESC, name`,
    [userId],
  );
  return rows;
}
