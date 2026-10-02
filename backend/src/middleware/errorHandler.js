import { HttpError } from '../utils/httpErrors.js';

// Maps known errors to the public error format. Anything unexpected becomes a generic 500;
// details are logged server-side only and never sent to the client.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    const body = { code: err.code, message: err.message };
    if (err.fields) body.fields = err.fields;
    return res.status(err.status).json({ error: body });
  }

  // Malformed JSON body or oversized payload from express.json().
  if (err.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body.' } });
  }
  if (err.type === 'entity.too.large') {
    return res
      .status(413)
      .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request is too large.' } });
  }

  // Log a sanitized copy: Postgres errors carry `detail`/`where` fields that can include the
  // offending row's values, i.e. someone's health data, which must never reach the logs.
  const { name, code, message, stack } = err;
  console.error(`[${req.method} ${req.originalUrl.split('?')[0]}]`, { name, code, message, stack });
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
}

export function notFoundHandler(req, res) {
  res
    .status(404)
    .json({ error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' } });
}
