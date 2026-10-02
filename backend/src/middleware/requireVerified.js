import { HttpError } from '../utils/httpErrors.js';

/**
 * Health data is only available once the account's email is verified. Use after requireAuth.
 * The verify/resend endpoints, session info, logout and account deletion stay reachable.
 */
export function requireVerified(req, res, next) {
  if (req.auth?.user?.email_verified_at) return next();
  return next(
    new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email address to continue.'),
  );
}
