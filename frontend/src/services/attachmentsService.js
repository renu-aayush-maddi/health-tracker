import { api, uploadFile } from './apiClient.js';

const base = (eventId) => `/health-events/${eventId}/attachments`;

export const attachmentsService = {
  upload: (eventId, file, options) => uploadFile(base(eventId), file, options),
  updateTags: (eventId, attachmentId, tags) =>
    api.patch(`${base(eventId)}/${attachmentId}`, { tags }),
  /** Every file across the user's events ("Records"), filtered by `tag` and/or `q`. */
  records: (filters, options) => api.get('/attachments', { ...options, query: filters }),
  tags: (options) => api.get('/attachments/tags', options).then((res) => res.items),
  remove: (eventId, attachmentId) => api.delete(`${base(eventId)}/${attachmentId}`),
  /** Same-origin URL that streams the file (the session cookie authorizes it). */
  contentUrl: (eventId, attachmentId, { download = false } = {}) =>
    `${import.meta.env.VITE_API_BASE_URL ?? '/api'}${base(eventId)}/${attachmentId}/content${download ? '?download=true' : ''}`,
};

export const featuresService = {
  get: (options) => api.get('/features', options),
};
