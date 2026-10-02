// Builds the Excel workbook used by both the per-user download and the full server backup.
// Values are written as plain cells; text that starts with "=" stays text (exceljs only writes
// formulas for explicit { formula } values), so user input can never run as a formula.
import ExcelJS from 'exceljs';

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? ''));
const list = (values) => (values?.length ? values.join(', ') : '');
const capitalize = (value) => (value ? value[0].toUpperCase() + value.slice(1) : '');

function addSheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map(({ header, key, width }) => ({ header, key, width }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EFED' } };
  if (rows.length)
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  columns.forEach(({ wrap }, i) => {
    if (wrap) sheet.getColumn(i + 1).alignment = { wrapText: true, vertical: 'top' };
  });
  return sheet;
}

/**
 * @param data { users, events, medicines, attachments } rows from export.repository
 * @param options { scope: 'user' | 'all', generatedAt: Date }
 * @returns Buffer (.xlsx)
 */
export async function buildWorkbook(data, { scope, generatedAt = new Date() }) {
  const all = scope === 'all';
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Health Tracker';
  workbook.created = generatedAt;

  const userById = new Map(data.users.map((u) => [u.id, u]));
  const owner = (row) => (all ? { userEmail: userById.get(row.user_id)?.email ?? '' } : {});
  const ownerColumns = all ? [{ header: 'User email', key: 'userEmail', width: 28 }] : [];

  // Summary first, so the file explains itself when opened.
  const about = workbook.addWorksheet('About');
  about.columns = [
    { key: 'label', width: 24 },
    { key: 'value', width: 70 },
  ];
  [
    [
      'Health Tracker export',
      all ? 'Full backup (all users)' : `Personal data for ${data.users[0]?.email ?? ''}`,
    ],
    ['Generated at (UTC)', generatedAt.toISOString()],
    ['Health events', data.events.length],
    ['Medicines', data.medicines.length],
    ['Files (details only)', data.attachments.length],
    ...(all ? [['Users', data.users.length]] : []),
    [
      'Note',
      'A readable copy of recorded text. Uploaded files themselves are not included. Not medical advice.',
    ],
  ].forEach(([label, value]) => about.addRow({ label, value }));
  about.getColumn(1).font = { bold: true };

  if (all) {
    addSheet(
      workbook,
      'Users',
      [
        { header: 'User ID', key: 'id', width: 38 },
        { header: 'Name', key: 'name', width: 24 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Joined', key: 'created', width: 26 },
      ],
      data.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        created: iso(u.created_at),
      })),
    );
  }

  addSheet(
    workbook,
    'Health events',
    [
      ...ownerColumns,
      { header: 'Event ID', key: 'id', width: 38 },
      { header: 'Title', key: 'title', width: 28 },
      { header: 'Health issue', key: 'healthIssue', width: 18 },
      { header: 'Start date', key: 'startDate', width: 12 },
      { header: 'End date', key: 'endDate', width: 12 },
      { header: 'Status', key: 'status', width: 11 },
      { header: 'Severity', key: 'severity', width: 11 },
      { header: 'Symptoms', key: 'symptoms', width: 32, wrap: true },
      { header: 'Description', key: 'description', width: 40, wrap: true },
      { header: 'Notes', key: 'notes', width: 40, wrap: true },
      { header: 'Created', key: 'created', width: 26 },
      { header: 'Updated', key: 'updated', width: 26 },
    ],
    data.events.map((e) => ({
      ...owner(e),
      id: e.id,
      title: e.title,
      healthIssue: e.health_issue,
      startDate: e.start_date,
      endDate: e.end_date ?? 'Ongoing',
      status: capitalize(e.status),
      severity: capitalize(e.severity),
      symptoms: list(e.symptoms),
      description: e.description ?? '',
      notes: e.notes ?? '',
      created: iso(e.created_at),
      updated: iso(e.updated_at),
    })),
  );

  addSheet(
    workbook,
    'Medicines',
    [
      ...ownerColumns,
      { header: 'Event ID', key: 'eventId', width: 38 },
      { header: 'Event', key: 'event', width: 28 },
      { header: 'Medicine', key: 'name', width: 24 },
      { header: 'Dosage', key: 'dosage', width: 14 },
      { header: 'Frequency', key: 'frequency', width: 18 },
      { header: 'From', key: 'startDate', width: 12 },
      { header: 'To', key: 'endDate', width: 12 },
      { header: 'Notes', key: 'notes', width: 36, wrap: true },
    ],
    data.medicines.map((m) => ({
      ...owner(m),
      eventId: m.health_event_id,
      event: m.event_title,
      name: m.name,
      dosage: m.dosage ?? '',
      frequency: m.frequency ?? '',
      startDate: m.start_date ?? '',
      endDate: m.end_date ?? '',
      notes: m.notes ?? '',
    })),
  );

  addSheet(
    workbook,
    'Files',
    [
      ...ownerColumns,
      { header: 'Event ID', key: 'eventId', width: 38 },
      { header: 'Event', key: 'event', width: 28 },
      { header: 'File name', key: 'filename', width: 34 },
      { header: 'Type', key: 'type', width: 18 },
      { header: 'Size (KB)', key: 'sizeKb', width: 10 },
      { header: 'Tags', key: 'tags', width: 30 },
      { header: 'Uploaded', key: 'uploaded', width: 26 },
    ],
    data.attachments.map((a) => ({
      ...owner(a),
      eventId: a.health_event_id,
      event: a.event_title,
      filename: a.original_filename,
      type: a.content_type,
      sizeKb: Math.ceil(a.size_bytes / 1024),
      tags: list(a.tags),
      uploaded: iso(a.created_at),
    })),
  );

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
