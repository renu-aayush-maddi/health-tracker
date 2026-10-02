import { toAttachment } from '../attachments/attachment.service.js';

// Row → API shape. Only these fields ever leave the API (no user_id).

export function toMedicine(row) {
  return {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    frequency: row.frequency,
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Compact form for lists: no notes, plus a medicine count and a short preview. */
export function toEventSummary(row) {
  return {
    id: row.id,
    title: row.title,
    healthIssue: row.health_issue,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    severity: row.severity,
    symptoms: row.symptoms,
    medicineCount: row.medicine_count,
    medicines: row.medicine_preview,
    attachmentCount: row.attachment_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toEvent(row, medicineRows, attachmentRows = []) {
  return {
    id: row.id,
    title: row.title,
    healthIssue: row.health_issue,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    severity: row.severity,
    symptoms: row.symptoms,
    notes: row.notes,
    medicines: medicineRows.map(toMedicine),
    attachments: attachmentRows.map(toAttachment),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCalendarEvent(row) {
  return {
    id: row.id,
    title: row.title,
    healthIssue: row.health_issue,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    severity: row.severity,
  };
}
