// Backup tools for the owner of the deployment:
//   npm run backup:list                       list stored backups (newest first)
//   npm run backup:fetch [-- <key>]           download + decrypt (default: latest) into ./backups/
//   npm run backup:decrypt -- <file.enc> [out.xlsx]   decrypt a file you already downloaded
// Needs BACKUP_ENCRYPTION_KEY (and CLOUDINARY_URL for list/fetch) in the environment or .env.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { fileStorage } from '../services/fileStorage.js';
import { decryptBackup, parseBackupKey } from './crypto.js';

const OUT_DIR = path.resolve(process.cwd(), '..', 'backups');

const key = () => parseBackupKey(config.BACKUP_ENCRYPTION_KEY);
const requireStorage = () => {
  if (!fileStorage) throw new Error('Set CLOUDINARY_URL to reach stored backups.');
  return fileStorage;
};

async function list() {
  const backups = await requireStorage().listBackups();
  if (!backups.length) return console.log('No backups stored yet.');
  backups.forEach((b) => console.log(`${b.createdAt}  ${String(b.bytes).padStart(9)} B  ${b.key}`));
}

async function fetchBackup(requestedKey) {
  const storage = requireStorage();
  const target = requestedKey ?? (await storage.listBackups())[0]?.key;
  if (!target) throw new Error('No backups stored yet.');
  const xlsx = decryptBackup(await storage.readBackup(target), key());
  await mkdir(OUT_DIR, { recursive: true });
  const out = path.join(
    OUT_DIR,
    `${path.basename(target).replace(/\.enc$/, '')}`.replace(/(\.xlsx)?$/, '.xlsx'),
  );
  await writeFile(out, xlsx, { mode: 0o600 });
  console.log(`Decrypted backup written to ${out}`);
}

async function decryptFile(input, output) {
  if (!input) throw new Error('Usage: npm run backup:decrypt -- <file.enc> [out.xlsx]');
  const out = output ?? input.replace(/\.enc$/, '').replace(/(\.xlsx)?$/, '.xlsx');
  await writeFile(out, decryptBackup(await readFile(input), key()), { mode: 0o600 });
  console.log(`Decrypted backup written to ${out}`);
}

const [command, ...args] = process.argv.slice(2);
const commands = { list, fetch: fetchBackup, decrypt: decryptFile };

if (!commands[command]) {
  console.error('Usage: cli.js <list | fetch [key] | decrypt <file.enc> [out.xlsx]>');
  process.exit(1);
}
commands[command](...args)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
