import { pipeline } from 'node:stream/promises';
import * as service from './attachment.service.js';

/** RFC 6266 Content-Disposition with a UTF-8 filename and an ASCII fallback. */
function contentDisposition(type, filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function list(req, res) {
  res.json(await service.listAttachments(req.auth.userId, req.valid.params.eventId));
}

export async function upload(req, res) {
  res.status(201).json(
    // req.body holds the multipart text fields (an optional "tags" JSON array).
    await service.uploadAttachment(req.auth.userId, req.valid.params.eventId, req.file, req.body),
  );
}

/** Streams the file to its owner: inline for viewing, or as a download with its original name. */
export async function content(req, res) {
  const { eventId, attachmentId } = req.valid.params;
  const { file, stream } = await service.openAttachment(req.auth.userId, eventId, attachmentId);
  res.set({
    'Content-Type': file.contentType,
    'Content-Disposition': contentDisposition(
      req.valid.query.download ? 'attachment' : 'inline',
      file.filename,
    ),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    // Allow the browser's built-in image/PDF viewers, nothing else.
    'Content-Security-Policy':
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'self'",
  });
  await pipeline(stream, res);
}

export async function remove(req, res) {
  const { eventId, attachmentId } = req.valid.params;
  await service.deleteAttachment(req.auth.userId, eventId, attachmentId);
  res.status(204).end();
}

export async function updateTags(req, res) {
  const { eventId, attachmentId } = req.valid.params;
  res.json(
    await service.updateAttachmentTags(req.auth.userId, eventId, attachmentId, req.valid.body.tags),
  );
}

export async function records(req, res) {
  res.json(await service.listRecords(req.auth.userId, req.valid.query));
}

export async function tags(req, res) {
  res.json({ items: await service.listTags(req.auth.userId) });
}
