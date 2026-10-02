import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup, parseBackupKey } from '../src/backup/crypto.js';
import { runBackup } from '../src/backup/runBackup.js';
import { config } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';
import { fileStorage } from '../src/services/fileStorage.js';
import { createClient, registerUser, resetDatabase, server } from './helpers.js';

beforeEach(async () => {
  await resetDatabase();
  fileStorage.files.clear();
  fileStorage.backups.clear();
});
afterAll(() => pool.end());

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n');

async function seedUser(name, title) {
  const user = await registerUser({ name });
  const event = (
    await user.client.post('/api/health-events').send({
      title,
      healthIssue: 'Fever',
      startDate: '2026-10-01',
      endDate: '2026-10-03',
      status: 'resolved',
      severity: 'moderate',
      symptoms: ['Chills', 'Headache'],
      notes: '=HYPERLINK("http://evil.example","click")',
      medicines: [{ name: `${name} Paracetamol`, dosage: '500 mg', frequency: 'Twice a day' }],
    })
  ).body;
  await user.client
    .post(`/api/health-events/${event.id}/attachments`)
    .field('tags', JSON.stringify(['Prescription']))
    .attach('file', PDF, `${name}-rx.pdf`);
  return { ...user, event };
}

async function readWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = (name) => {
    const ws = workbook.getWorksheet(name);
    const [header, ...rows] = ws
      .getSheetValues()
      .slice(1)
      .map((r) => r.slice(1));
    return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  };
  return { workbook, sheet };
}

const binary = (req) =>
  req.buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

describe('per-user Excel export', () => {
  it("downloads only the signed-in user's own data", async () => {
    const asha = await seedUser('Asha', 'Asha fever');
    await seedUser('Bilal', 'Bilal fever');

    const res = await binary(asha.client.get('/api/users/me/export'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="health-tracker-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );
    expect(res.headers['cache-control']).toBe('private, no-store');

    const { workbook, sheet } = await readWorkbook(res.body);
    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      'About',
      'Health events',
      'Medicines',
      'Files',
    ]);

    const events = sheet('Health events');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      Title: 'Asha fever',
      'Health issue': 'Fever',
      'Start date': '2026-10-01',
      'End date': '2026-10-03',
      Status: 'Resolved',
      Severity: 'Moderate',
      Symptoms: 'Chills, Headache',
    });
    expect(sheet('Medicines').map((m) => m.Medicine)).toEqual(['Asha Paracetamol']);
    expect(sheet('Files')[0]).toMatchObject({
      'File name': 'Asha-rx.pdf',
      Tags: 'Prescription',
      Event: 'Asha fever',
    });

    // Text that looks like a formula stays plain text.
    const notesCell = workbook.getWorksheet('Health events').getRow(2).getCell(10);
    expect(notesCell.value).toBe('=HYPERLINK("http://evil.example","click")');
    expect(notesCell.formula).toBeUndefined();

    const everything = JSON.stringify(workbook.worksheets.map((w) => w.getSheetValues()));
    expect(everything).not.toContain('Bilal');
    expect(everything).not.toMatch(/argon2|storage_key|test\//);
  });

  it('works for a brand-new account and requires authentication', async () => {
    const { client } = await registerUser();
    const res = await binary(client.get('/api/users/me/export'));
    const { sheet } = await readWorkbook(res.body);
    expect(sheet('Health events')).toEqual([]);
    expect((await request(server).get('/api/users/me/export')).status).toBe(401);
    expect((await createClient().get('/api/users/me/export')).status).toBe(401);
  });
});

describe('backup encryption', () => {
  const key = parseBackupKey(Buffer.alloc(32, 1).toString('base64'));

  it('round-trips and uses a fresh IV each time', () => {
    const data = Buffer.from('health data');
    const a = encryptBackup(data, key);
    expect(decryptBackup(a, key).toString()).toBe('health data');
    expect(a.equals(encryptBackup(data, key))).toBe(false);
    expect(a.includes(Buffer.from('health data'))).toBe(false);
  });

  it('rejects the wrong key, tampered data and non-backup files', () => {
    const blob = encryptBackup(Buffer.from('health data'), key);
    expect(() =>
      decryptBackup(blob, parseBackupKey(Buffer.alloc(32, 2).toString('base64'))),
    ).toThrow(/wrong key/);
    const tampered = Buffer.from(blob);
    tampered[10] ^= 1;
    expect(() => decryptBackup(tampered, key)).toThrow(/wrong key, or the file is damaged/);
    expect(() => decryptBackup(Buffer.from('not a backup at all, really'), key)).toThrow(
      /Not a Health Tracker backup/,
    );
    expect(() => parseBackupKey('short')).toThrow(/32 bytes/);
  });
});

describe('scheduled full backup', () => {
  it('stores an encrypted workbook of every user (without secrets) and keeps only the newest copies', async () => {
    await seedUser('Asha', 'Asha fever');
    await seedUser('Bilal', 'Bilal fever');
    const logs = [];

    const summary = await runBackup({
      now: new Date('2026-10-02T02:00:00Z'),
      log: (m) => logs.push(m),
    });
    expect(summary).toMatchObject({ users: 2, events: 2, medicines: 2, files: 2, removed: 0 });
    expect(summary.key).toBe(
      `${config.CLOUDINARY_FOLDER}/backups/test/health-tracker-backup-2026-10-02T02-00-00-000Z.xlsx.enc`,
    );
    expect(logs.join(' ')).not.toMatch(/Asha|Bilal|fever/); // counts only

    const stored = await fileStorage.readBackup(summary.key);
    expect(stored.includes(Buffer.from('Asha'))).toBe(false); // encrypted at rest
    const xlsx = decryptBackup(stored, parseBackupKey(config.BACKUP_ENCRYPTION_KEY));
    const { workbook, sheet } = await readWorkbook(xlsx);
    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      'About',
      'Users',
      'Health events',
      'Medicines',
      'Files',
    ]);
    expect(
      sheet('Users')
        .map((u) => u.Name)
        .sort(),
    ).toEqual(['Asha', 'Bilal']);
    expect(
      sheet('Health events')
        .map((e) => e.Title)
        .sort(),
    ).toEqual(['Asha fever', 'Bilal fever']);
    expect(sheet('Health events')[0]['User email']).toMatch(/@example\.com$/);
    expect(JSON.stringify(workbook.worksheets.map((w) => w.getSheetValues()))).not.toMatch(
      /argon2|password|token/i,
    );

    // Retention (2 in tests): older backups are removed.
    await runBackup({ now: new Date('2026-10-03T02:00:00Z'), log: () => {} });
    const third = await runBackup({ now: new Date('2026-10-04T02:00:00Z'), log: () => {} });
    expect(third.removed).toBe(1);
    expect(
      (await fileStorage.listBackups()).map((b) => b.key.match(/backup-(\d{4}-\d{2}-\d{2})/)[1]),
    ).toEqual(['2026-10-04', '2026-10-03']);
  });
});
