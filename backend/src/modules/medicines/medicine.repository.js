// SQL for medicines. Medicines carry user_id (pinned to the parent event's owner by a
// composite foreign key), so every statement filters on both the event and the user.
import { query } from '../../db/pool.js';

const COLUMNS = 'id, name, dosage, frequency, start_date, end_date, notes, created_at, updated_at';

export async function listMedicines(userId, eventId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM medicines
      WHERE health_event_id = $1 AND user_id = $2
      ORDER BY sort_order, created_at`,
    [eventId, userId],
  );
  return rows;
}

export async function listMedicineIds(userId, eventId, db) {
  const { rows } = await db.query(
    'SELECT id FROM medicines WHERE health_event_id = $1 AND user_id = $2',
    [eventId, userId],
  );
  return rows.map((r) => r.id);
}

export async function insertMedicine(userId, eventId, medicine, sortOrder, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO medicines
       (health_event_id, user_id, name, dosage, frequency, start_date, end_date, notes, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      eventId,
      userId,
      medicine.name,
      medicine.dosage,
      medicine.frequency,
      medicine.startDate,
      medicine.endDate,
      medicine.notes,
      sortOrder,
    ],
  );
  return rows[0];
}

export async function updateMedicine(
  userId,
  eventId,
  medicineId,
  medicine,
  sortOrder,
  db = { query },
) {
  const { rows } = await db.query(
    `UPDATE medicines
        SET name = $4, dosage = $5, frequency = $6, start_date = $7, end_date = $8, notes = $9,
            sort_order = COALESCE($10, sort_order)
      WHERE id = $1 AND health_event_id = $2 AND user_id = $3
      RETURNING ${COLUMNS}`,
    [
      medicineId,
      eventId,
      userId,
      medicine.name,
      medicine.dosage,
      medicine.frequency,
      medicine.startDate,
      medicine.endDate,
      medicine.notes,
      sortOrder,
    ],
  );
  return rows[0] ?? null;
}

export async function deleteMedicinesExcept(userId, eventId, keepIds, db) {
  await db.query(
    'DELETE FROM medicines WHERE health_event_id = $1 AND user_id = $2 AND NOT (id = ANY($3::uuid[]))',
    [eventId, userId, keepIds],
  );
}

export async function deleteMedicine(userId, eventId, medicineId, db = { query }) {
  const { rowCount } = await db.query(
    'DELETE FROM medicines WHERE id = $1 AND health_event_id = $2 AND user_id = $3',
    [medicineId, eventId, userId],
  );
  return rowCount > 0;
}

export async function nextSortOrder(userId, eventId, db = { query }) {
  const { rows } = await db.query(
    'SELECT coalesce(max(sort_order) + 1, 0)::int AS next FROM medicines WHERE health_event_id = $1 AND user_id = $2',
    [eventId, userId],
  );
  return rows[0].next;
}

/** Distinct medicine names this user has recorded before, for autocomplete. */
export async function listMedicineNames(userId, search) {
  const pattern = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const { rows } = await query(
    `SELECT name FROM (
        SELECT DISTINCT ON (lower(name)) name, created_at
          FROM medicines
         WHERE user_id = $1 AND ($2::text IS NULL OR name ILIKE $2)
         ORDER BY lower(name), created_at DESC
     ) latest
     ORDER BY name
     LIMIT 10`,
    [userId, pattern],
  );
  return rows.map((r) => r.name);
}
