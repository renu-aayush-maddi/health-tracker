import { config } from '../config/env.js';
import { forbidden } from '../utils/httpErrors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// The only endpoint that accepts multipart bodies: attachment uploads.
const UPLOAD_PATH = /^\/health-events\/[^/]+\/attachments\/?$/;

/**
 * CSRF defense in depth (the session cookie is also SameSite=Lax):
 * state-changing requests must come from our own origin and carry a JSON body type,
 * which a cross-site HTML form cannot send. Uploads must be multipart; for that one route the
 * Origin check and the SameSite cookie remain the protection.
 */
export function requireSameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin !== config.APP_ORIGIN) {
    return next(forbidden('Request origin not allowed.'));
  }

  const hasBody = req.get('content-length') > 0 || req.get('transfer-encoding');
  const multipartAllowed =
    req.method === 'POST' && UPLOAD_PATH.test(req.path) && req.is('multipart/form-data');
  if (hasBody && !req.is('application/json') && !multipartAllowed) {
    return next(forbidden('Requests must use application/json.'));
  }
  return next();
}

/** Health data must never be stored by shared caches or the back/forward cache. */
export function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
