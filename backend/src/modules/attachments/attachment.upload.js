import multer from 'multer';
import { ATTACHMENT_LIMITS } from '@health-tracker/shared';
import { HttpError, badRequest } from '../../utils/httpErrors.js';

// Files are held in memory (≤10 MB, one per request) and streamed to storage, never written to disk.
const parser = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8', // keep non-ASCII file names intact
  // One file plus an optional small "tags" field (a JSON array).
  limits: { fileSize: ATTACHMENT_LIMITS.maxBytes, files: 1, fields: 1, fieldSize: 2048, parts: 2 },
}).single('file');

const MAX_MB = ATTACHMENT_LIMITS.maxBytes / (1024 * 1024);

/** Parses a multipart upload with field "file", turning multer errors into API errors. */
export function parseUpload(req, res, next) {
  parser(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new HttpError(413, 'FILE_TOO_LARGE', `Files can be up to ${MAX_MB} MB.`, {
          file: `Files can be up to ${MAX_MB} MB.`,
        }),
      );
    }
    if (err instanceof multer.MulterError) {
      return next(
        badRequest('Upload one file using the "file" field.', {
          file: 'Upload one file at a time.',
        }),
      );
    }
    return next(badRequest('The upload could not be read. Please try again.'));
  });
}
