// Data for Excel exports. Two deliberately separate entry points:
// - fetchUserExport(userId): one user's own data (HTTP: "Download my data")
// - fetchFullBackup(): every user's data, used ONLY by the offline backup job (no HTTP route).
import { query } from '../../db/pool.js';

const EVENT_SQL = `
  SELECT e.id, e.user_id, e.title, e.health_issue, e.description, e.start_date, e.end_date,
         e.status, e.severity, e.symptoms, e.notes, e.created_at, e.updated_at
    FROM health_events e`;

const MEDICINE_SQL = `
  SELECT m.health_event_id, m.user_id, e.title AS event_title, m.name, m.dosage, m.frequency,
         m.start_date, m.end_date, m.notes, m.sort_order
    FROM medicines m JOIN health_events e ON e.id = m.health_event_id AND e.user_id = m.user_id`;

// File metadata only: names, types, sizes, tags. Never storage keys, never file contents.
const ATTACHMENT_SQL = `
  SELECT a.health_event_id, a.user_id, e.title AS event_title, a.original_filename,
         a.content_type, a.size_bytes, a.tags, a.created_at
    FROM attachments a JOIN health_events e ON e.id = a.health_event_id AND e.user_id = a.user_id`;

export async function fetchUserExport(userId) {
  const [user, events, medicines, attachments] = await Promise.all([
    query('SELECT id, name, email, created_at FROM users WHERE id = $1', [userId]),
    query(`${EVENT_SQL} WHERE e.user_id = $1 ORDER BY e.start_date DESC, e.created_at DESC`, [
      userId,
    ]),
    query(`${MEDICINE_SQL} WHERE m.user_id = $1 ORDER BY e.start_date DESC, m.sort_order`, [
      userId,
    ]),
    query(`${ATTACHMENT_SQL} WHERE a.user_id = $1 ORDER BY a.created_at DESC`, [userId]),
  ]);
  return {
    users: user.rows,
    events: events.rows,
    medicines: medicines.rows,
    attachments: attachments.rows,
  };
}

export async function fetchFullBackup() {
  const [users, events, medicines, attachments] = await Promise.all([
    // Never password hashes, sessions or reset tokens.
    query('SELECT id, name, email, created_at FROM users ORDER BY created_at'),
    query(`${EVENT_SQL} ORDER BY e.user_id, e.start_date DESC`),
    query(`${MEDICINE_SQL} ORDER BY m.user_id, e.start_date DESC, m.sort_order`),
    query(`${ATTACHMENT_SQL} ORDER BY a.user_id, a.created_at DESC`),
  ]);
  return {
    users: users.rows,
    events: events.rows,
    medicines: medicines.rows,
    attachments: attachments.rows,
  };
}
