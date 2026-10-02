// AES-256-GCM encryption for backup files. Format: "HTBK1" | 12-byte IV | ciphertext | 16-byte tag.
// GCM authenticates the data, so a corrupted or tampered file fails to decrypt instead of
// producing garbage.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const MAGIC = Buffer.from('HTBK1');
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseBackupKey(base64) {
  const key = Buffer.from(base64 ?? '', 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
  return key;
}

export function encryptBackup(plaintext, key) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, iv, ciphertext, cipher.getAuthTag()]);
}

export function decryptBackup(blob, key) {
  if (
    blob.length < MAGIC.length + IV_BYTES + TAG_BYTES ||
    !blob.subarray(0, MAGIC.length).equals(MAGIC)
  ) {
    throw new Error('Not a Health Tracker backup file.');
  }
  const iv = blob.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ciphertext = blob.subarray(MAGIC.length + IV_BYTES, blob.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Could not decrypt: wrong key, or the file is damaged.');
  }
}
