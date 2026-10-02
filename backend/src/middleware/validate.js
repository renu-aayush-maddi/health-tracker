import { toFieldErrors } from '@health-tracker/shared';
import { badRequest, notFound } from '../utils/httpErrors.js';

/**
 * Validates request parts against Zod schemas and exposes the parsed (trimmed, coerced,
 * unknown-keys-stripped) values on `req.valid`. Handlers read only from `req.valid`.
 */
export function validate({ body, query, params }) {
  return (req, res, next) => {
    req.valid ??= {};
    // A malformed ID in the URL is indistinguishable from a record that doesn't exist.
    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) return next(notFound());
      req.valid.params = result.data;
    }
    for (const [part, schema] of [
      ['query', query],
      ['body', body],
    ]) {
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) return next(badRequest(undefined, toFieldErrors(result.error)));
      req.valid[part] = result.data;
    }
    next();
  };
}
