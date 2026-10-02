export class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message = 'Please fix the highlighted fields.', fields) =>
  new HttpError(400, 'VALIDATION_ERROR', message, fields);

export const unauthenticated = (message = 'Please log in to continue.') =>
  new HttpError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'This request is not allowed.') =>
  new HttpError(403, 'FORBIDDEN', message);

export const notFound = (message = 'The requested resource was not found.') =>
  new HttpError(404, 'NOT_FOUND', message);

export const conflict = (code, message) => new HttpError(409, code, message);
