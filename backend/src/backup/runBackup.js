// Nightly full backup: all users' text data → Excel → AES-256-GCM → private Cloudinary storage.
// Keeps the newest BACKUP_RETENTION files. Run with `npm run backup` (see .github/workflows/backup.yml).
// Logs counts only; never record contents.
import { fileURLToPath } from 'node:url';
import { config } from '../config/env.js';
import { pool } from '../db/pool.js';
import { fetchFullBackup } from '../modules/export/export.repository.js';
import { buildWorkbook } from '../modules/export/workbook.js';
import { fileStorage } from '../services/fileStorage.js';
import { encryptBackup, parseBackupKey } from './crypto.js';

export async function runBackup({ now = new Date(), log = console.log } = {}) {
  if (!config.BACKUP_ENCRYPTION_KEY)
    throw new Error('BACKUP_ENCRYPTION_KEY is required to create backups.');
  if (!fileStorage) throw new Error('Backups need storage: set CLOUDINARY_URL.');
  const key = parseBackupKey(config.BACKUP_ENCRYPTION_KEY);

  const data = await fetchFullBackup();
  const workbook = await buildWorkbook(data, { scope: 'all', generatedAt: now });
  const encrypted = encryptBackup(workbook, key);
  const filename = `health-tracker-backup-${now.toISOString().replace(/[:.]/g, '-')}.xlsx.enc`;
  const stored = await fileStorage.putBackup(encrypted, filename);

  const existing = await fileStorage.listBackups(); // newest first
  const expired = existing.slice(config.BACKUP_RETENTION).map((b) => b.key);
  await fileStorage.removeBackups(expired);

  const summary = {
    key: stored.key,
    users: data.users.length,
    events: data.events.length,
    medicines: data.medicines.length,
    files: data.attachments.length,
    bytes: encrypted.length,
    removed: expired.length,
  };
  log(
    `Backup stored: ${summary.key} — ${summary.users} users, ${summary.events} events, ` +
      `${summary.medicines} medicines, ${summary.files} file records, ${summary.bytes} bytes; ` +
      `removed ${summary.removed} old backup(s).`,
  );
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBackup()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(`Backup failed: ${err.message}`);
      await pool.end();
      process.exit(1);
    });
}
