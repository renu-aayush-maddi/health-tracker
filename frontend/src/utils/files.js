import { ATTACHMENT_LIMITS, ATTACHMENT_TYPES } from '@health-tracker/shared';

const EXTENSIONS = Object.values(ATTACHMENT_TYPES).flatMap((type) => type.extensions);

/** Value for <input type="file" accept>. */
export const ACCEPT_ATTRIBUTE = [...Object.keys(ATTACHMENT_TYPES), ...EXTENSIONS].join(',');

export const MAX_FILE_MB = ATTACHMENT_LIMITS.maxBytes / (1024 * 1024);

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const isImage = (contentType) => contentType?.startsWith('image/');

/**
 * Quick check before uploading, so obvious problems show up immediately. The server re-checks
 * the actual file content.
 */
export function checkFile(file) {
  const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
  if (!ATTACHMENT_TYPES[file.type] && !EXTENSIONS.includes(extension)) {
    return `${file.name}: only photos (JPG, PNG, WebP, HEIC) and PDFs can be attached.`;
  }
  if (file.size > ATTACHMENT_LIMITS.maxBytes)
    return `${file.name} is larger than ${MAX_FILE_MB} MB.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}
