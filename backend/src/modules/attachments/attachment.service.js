import path from 'node:path';
import {
  ATTACHMENT_LIMITS,
  ATTACHMENT_TYPES,
  attachmentTagsSchema,
  toFieldErrors,
} from '@health-tracker/shared';
import { fileStorage, resourceTypeFor } from '../../services/fileStorage.js';
import { detectFileType } from '../../utils/fileType.js';
import { HttpError, badRequest, notFound } from '../../utils/httpErrors.js';
import * as eventRepo from '../healthEvents/healthEvent.repository.js';
import * as repo from './attachment.repository.js';

const UNSUPPORTED_TYPE =
  'This file type isn’t supported. Upload a photo (JPG, PNG, WebP, HEIC) or a PDF.';

const storageError = (action) =>
  new HttpError(502, 'STORAGE_ERROR', `Couldn't ${action} the file right now. Please try again.`);

const disabled = () =>
  new HttpError(503, 'ATTACHMENTS_DISABLED', 'File uploads are not available right now.');

/** API shape: metadata only. Storage keys and URLs are never listed. */
export function toAttachment(row) {
  return {
    id: row.id,
    filename: row.original_filename,
    contentType: row.content_type,
    size: row.size_bytes,
    previewable: ATTACHMENT_TYPES[row.content_type]?.previewable ?? false,
    tags: row.tags ?? [],
    createdAt: row.created_at,
  };
}

async function assertEventOwned(userId, eventId) {
  if (!(await eventRepo.findEvent(userId, eventId))) throw notFound('Health event not found.');
}

/** Keeps a readable display name: no directories, control characters or excess length. */
export function cleanFilename(name) {
  const base = path.basename(String(name ?? '').replaceAll('\\', '/'));
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'file').slice(0, ATTACHMENT_LIMITS.filenameMax);
}

export async function listAttachments(userId, eventId) {
  await assertEventOwned(userId, eventId);
  const rows = await repo.listAttachments(userId, eventId);
  return { items: rows.map(toAttachment) };
}

/** Tags arrive as a JSON array in the multipart field "tags" (optional). */
function parseUploadTags(raw) {
  if (raw === undefined || raw === '') return [];
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw badRequest(undefined, { tags: 'Tags must be a list.' });
  }
  const result = attachmentTagsSchema.safeParse(value);
  if (!result.success) throw badRequest(undefined, toFieldErrors(result.error));
  return result.data;
}

export async function uploadAttachment(userId, eventId, file, fields = {}) {
  if (!fileStorage) throw disabled();
  const tags = parseUploadTags(fields.tags);
  await assertEventOwned(userId, eventId);
  if (!file) throw badRequest('Choose a file to upload.', { file: 'Choose a file to upload.' });
  if ((await repo.countAttachments(userId, eventId)) >= ATTACHMENT_LIMITS.maxPerEvent) {
    throw badRequest(undefined, {
      file: `An event can have at most ${ATTACHMENT_LIMITS.maxPerEvent} files.`,
    });
  }

  const contentType = detectFileType(file.buffer);
  if (!contentType) throw badRequest(UNSUPPORTED_TYPE, { file: UNSUPPORTED_TYPE });

  const resourceType = resourceTypeFor(contentType);
  let stored;
  try {
    stored = await fileStorage.upload(file.buffer, { resourceType });
  } catch (err) {
    console.error('Attachment upload to storage failed:', err?.message ?? err);
    throw storageError('upload');
  }

  try {
    const row = await repo.insertAttachment(userId, eventId, {
      filename: cleanFilename(file.originalname),
      contentType,
      size: file.size,
      storageKey: stored.key,
      resourceType,
      tags,
    });
    await eventRepo.touchEvent(userId, eventId);
    return toAttachment(row);
  } catch (err) {
    // Don't leave an orphaned file in storage if the database write fails.
    await fileStorage.remove([{ key: stored.key, resourceType }]).catch(() => {});
    throw err;
  }
}

/** Returns the file's metadata and a stream of its bytes, for the owner only. */
export async function openAttachment(userId, eventId, attachmentId) {
  if (!fileStorage) throw disabled();
  const row = await repo.findAttachment(userId, eventId, attachmentId);
  if (!row) throw notFound('File not found.');
  try {
    const stream = await fileStorage.read(row.storage_key, {
      resourceType: row.storage_resource_type,
    });
    return { file: toAttachment(row), stream };
  } catch (err) {
    console.error('Attachment read from storage failed:', err?.message ?? err);
    throw storageError('open');
  }
}

export async function deleteAttachment(userId, eventId, attachmentId) {
  if (!fileStorage) throw disabled();
  const row = await repo.findAttachment(userId, eventId, attachmentId);
  if (!row) throw notFound('File not found.');
  // Remove from storage first, so a failure never leaves a file we no longer track.
  try {
    await fileStorage.remove([{ key: row.storage_key, resourceType: row.storage_resource_type }]);
  } catch (err) {
    console.error('Attachment delete from storage failed:', err?.message ?? err);
    throw storageError('delete');
  }
  await repo.deleteAttachment(userId, eventId, attachmentId);
  await eventRepo.touchEvent(userId, eventId);
}

/**
 * Best-effort storage cleanup after an event or account is deleted (the metadata rows are already
 * gone via ON DELETE CASCADE). Failures are logged with storage keys only, which are random IDs.
 */
export async function removeStoredFiles(files) {
  if (!files.length || !fileStorage) return;
  try {
    await fileStorage.remove(files);
  } catch (err) {
    console.error(
      `Failed to delete ${files.length} stored file(s); remove manually:`,
      files.map((f) => f.key).join(', '),
      err?.message ?? err,
    );
  }
}

export async function updateAttachmentTags(userId, eventId, attachmentId, tags) {
  const row = await repo.updateAttachmentTags(userId, eventId, attachmentId, tags);
  if (!row) throw notFound('File not found.');
  return toAttachment(row);
}

/** The "Records" view: every file the user has, with the event it belongs to. */
export async function listRecords(userId, filters) {
  const { rows, total } = await repo.listUserAttachments(userId, filters);
  return {
    items: rows.map((row) => ({
      ...toAttachment(row),
      event: {
        id: row.health_event_id,
        title: row.event_title,
        healthIssue: row.event_health_issue,
        startDate: row.event_start_date,
      },
    })),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
  };
}

export function listTags(userId) {
  return repo.listUserTags(userId);
}
