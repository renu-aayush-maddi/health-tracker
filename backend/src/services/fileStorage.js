// Where attachment bytes live. Cloudinary in development/production; an in-memory store for
// automated tests. Callers only use: upload, read, remove. Storage URLs never leave the API:
// files are streamed to their owner through our own endpoint.
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env.js';

const SIGNED_URL_TTL_SECONDS = 60; // only used server-side, immediately
const READ_TIMEOUT_MS = 30_000;

const backupPrefix = () => `${config.CLOUDINARY_FOLDER}/backups/${config.NODE_ENV}/`;

/** PDFs are stored as "raw" files: delivered byte-for-byte, never transformed. */
export const resourceTypeFor = (contentType) =>
  contentType.startsWith('image/') ? 'image' : 'raw';

function cloudinaryStorage() {
  const {
    username: apiKey,
    password: apiSecret,
    hostname: cloudName,
  } = new URL(config.CLOUDINARY_URL);
  cloudinary.config({
    cloud_name: cloudName,
    api_key: decodeURIComponent(apiKey),
    api_secret: decodeURIComponent(apiSecret),
    secure: true,
  });

  return {
    upload(buffer, { resourceType }) {
      const key = `${config.CLOUDINARY_FOLDER}/${config.NODE_ENV}/${randomUUID()}`;
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: key,
            resource_type: resourceType,
            // "authenticated": no public URL exists; every view needs a signature we issue.
            type: 'authenticated',
            overwrite: false,
            use_filename: false,
            unique_filename: false,
          },
          (error, result) => (error ? reject(error) : resolve({ key: result.public_id })),
        );
        stream.end(buffer);
      });
    },

    /** Fetches the original bytes through a short-lived signed URL; returns a Node stream. */
    async read(key, { resourceType }) {
      const url = cloudinary.utils.private_download_url(key, null, {
        resource_type: resourceType,
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
      });
      const response = await fetch(url, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
      if (!response.ok || !response.body)
        throw new Error(`Storage read failed with status ${response.status}`);
      return Readable.fromWeb(response.body);
    },

    // ---- Encrypted backups (raw, authenticated) ----
    async putBackup(buffer, filename) {
      const publicId = `${backupPrefix()}${filename}`;
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { public_id: publicId, resource_type: 'raw', type: 'authenticated', overwrite: false },
          (error, result) => (error ? reject(error) : resolve({ key: result.public_id })),
        );
        stream.end(buffer);
      });
    },

    async listBackups() {
      const result = await cloudinary.api.resources({
        type: 'authenticated',
        resource_type: 'raw',
        prefix: backupPrefix(),
        max_results: 500,
      });
      return result.resources
        .map((r) => ({ key: r.public_id, createdAt: r.created_at, bytes: r.bytes }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async readBackup(key) {
      const url = cloudinary.utils.private_download_url(key, null, {
        resource_type: 'raw',
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
      });
      const response = await fetch(url, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Backup download failed with status ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },

    async removeBackups(keys) {
      if (keys.length)
        await cloudinary.api.delete_resources(keys, {
          resource_type: 'raw',
          type: 'authenticated',
        });
    },

    async remove(files) {
      for (const resourceType of ['image', 'raw']) {
        const keys = files.filter((f) => f.resourceType === resourceType).map((f) => f.key);
        // The Admin API accepts up to 100 public IDs per call.
        for (let i = 0; i < keys.length; i += 100) {
          await cloudinary.api.delete_resources(keys.slice(i, i + 100), {
            resource_type: resourceType,
            type: 'authenticated',
            invalidate: true,
          });
        }
      }
    },
  };
}

function memoryStorage() {
  const files = new Map();
  const backups = new Map(); // key -> { buffer, createdAt }
  return {
    files, // exposed for tests
    backups,
    async putBackup(buffer, filename) {
      const key = `${backupPrefix()}${filename}`;
      backups.set(key, { buffer, createdAt: new Date().toISOString() });
      return { key };
    },
    async listBackups() {
      return [...backups.entries()]
        .map(([key, b]) => ({ key, createdAt: b.createdAt, bytes: b.buffer.length }))
        .sort((a, b) => b.key.localeCompare(a.key));
    },
    async readBackup(key) {
      return backups.get(key).buffer;
    },
    async removeBackups(keys) {
      keys.forEach((key) => backups.delete(key));
    },
    async upload(buffer) {
      const key = `test/${randomUUID()}`;
      files.set(key, buffer);
      return { key };
    },
    async read(key) {
      if (!files.has(key)) throw new Error('Not found in memory storage');
      return Readable.from([files.get(key)]);
    },
    async remove(list) {
      list.forEach(({ key }) => files.delete(key));
    },
  };
}

function createStorage() {
  if (config.fileStorage === 'memory') return memoryStorage();
  if (config.CLOUDINARY_URL) return cloudinaryStorage();
  return null; // attachments disabled
}

export const fileStorage = createStorage();
