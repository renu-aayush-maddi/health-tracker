// Administrative access to medical content. Everything here is permission-gated and every read
// writes an audit row before the content is returned — see docs/ADMIN.md §E.
import { query } from '../../db/pool.js';
import { notFound } from '../../utils/httpErrors.js';
import { listMedicines } from '../medicines/medicine.repository.js';
import { listAttachments } from '../attachments/attachment.repository.js';
import { toEvent } from '../healthEvents/healthEvent.serializer.js';
import { recordAudit } from './audit.service.js';

const likePattern = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Index of health events across accounts. Returns only what is needed to find a record —
 * owner, issue, dates, counts — never descriptions, symptoms or notes.
 */
export async function listRecords(filters) {
  const params = [];
  const conditions = ['TRUE'];
  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (filters.userId) add('e.user_id = ?', filters.userId);
  if (filters.healthIssue) add('lower(e.health_issue) = lower(?)', filters.healthIssue);
  if (filters.from) add('e.start_date >= ?::date', filters.from);
  if (filters.to) add('e.start_date <= ?::date', filters.to);
  // Search is restricted to the owner's email and the issue label; free-text notes are not searchable.
  if (filters.q) add('(u.email ILIKE ? OR e.health_issue ILIKE ?)', likePattern(filters.q));

  const where = conditions.join(' AND ');
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, total] = await Promise.all([
    query(
      `SELECT e.id, e.user_id, u.email AS user_email, e.health_issue, e.start_date, e.end_date,
              e.status, e.severity, e.created_at, e.updated_at,
              (SELECT count(*)::int FROM medicines m WHERE m.health_event_id = e.id) AS medicine_count,
              (SELECT count(*)::int FROM attachments a WHERE a.health_event_id = e.id) AS attachment_count
         FROM health_events e JOIN users u ON u.id = e.user_id
        WHERE ${where}
        ORDER BY e.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.pageSize, offset],
    ),
    query(
      `SELECT count(*)::int AS total FROM health_events e JOIN users u ON u.id = e.user_id WHERE ${where}`,
      params,
    ),
  ]);

  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.user_email,
      healthIssue: row.health_issue,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      severity: row.severity,
      medicineCount: row.medicine_count,
      attachmentCount: row.attachment_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    page: filters.page,
    pageSize: filters.pageSize,
    total: total.rows[0].total,
  };
}

/** Full medical content of one event. Audited before it is returned. */
export async function getRecord(req, eventId) {
  const { rows } = await query(
    `SELECT e.*, u.email AS user_email FROM health_events e JOIN users u ON u.id = e.user_id
      WHERE e.id = $1`,
    [eventId],
  );
  const event = rows[0];
  if (!event) throw notFound('Health record not found.');

  await recordAudit(req, {
    action: 'HEALTH_RECORD_VIEWED',
    resourceType: 'health_event',
    resourceId: eventId,
    targetUserId: event.user_id,
    targetEmail: event.user_email,
    metadata: { healthIssue: event.health_issue },
  });

  const [medicines, attachments] = await Promise.all([
    listMedicines(event.user_id, eventId),
    listAttachments(event.user_id, eventId),
  ]);
  return {
    ...toEvent(event, medicines, attachments),
    userId: event.user_id,
    userEmail: event.user_email,
  };
}

export async function listMedicineRecords(req, filters) {
  const params = [];
  const conditions = ['TRUE'];
  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (filters.userId) add('m.user_id = ?', filters.userId);
  if (filters.q) add('(m.name ILIKE ? OR u.email ILIKE ?)', likePattern(filters.q));

  const where = conditions.join(' AND ');
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, total] = await Promise.all([
    query(
      `SELECT m.id, m.user_id, u.email AS user_email, m.health_event_id, m.name, m.dosage,
              m.frequency, m.start_date, m.end_date, m.created_at, m.updated_at
         FROM medicines m JOIN users u ON u.id = m.user_id
        WHERE ${where}
        ORDER BY m.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.pageSize, offset],
    ),
    query(
      `SELECT count(*)::int AS total FROM medicines m JOIN users u ON u.id = m.user_id WHERE ${where}`,
      params,
    ),
  ]);

  // Medicine names are medical content, so listing them is audited like opening a record.
  await recordAudit(req, {
    action: 'MEDICINE_RECORD_VIEWED',
    resourceType: 'medicine_list',
    targetUserId: filters.userId ?? null,
    metadata: { returned: rows.rows.length, filteredByUser: Boolean(filters.userId) },
  });

  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.user_email,
      eventId: row.health_event_id,
      name: row.name,
      dosage: row.dosage,
      frequency: row.frequency,
      startDate: row.start_date,
      endDate: row.end_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    page: filters.page,
    pageSize: filters.pageSize,
    total: total.rows[0].total,
  };
}
