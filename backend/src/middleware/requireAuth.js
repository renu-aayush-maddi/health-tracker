import {
  readSessionToken,
  resolveSession,
  clearSessionCookie,
} from '../modules/auth/session.service.js';
import { unauthenticated } from '../utils/httpErrors.js';
import { requireActiveAccount } from './requireActiveAccount.js';

/**
 * The only source of user identity in the API. Sets req.auth = { userId, sessionId, user, session }
 * and rejects accounts whose status is not active.
 * Route handlers must take the user ID from here, never from the body, query or URL.
 */
export async function requireAuth(req, res, next) {
  const token = readSessionToken(req);
  if (!token) return next(unauthenticated());

  const session = await resolveSession(token, { ipAddress: req.ip });
  if (!session) {
    clearSessionCookie(res);
    return next(unauthenticated('Your session has expired. Please log in again.'));
  }

  req.auth = {
    userId: session.user.id,
    sessionId: session.sessionId,
    user: session.user,
    session: session.session,
  };
  // Composed here rather than per-router so a blocked account cannot slip through a route that
  // forgot to add the check.
  return requireActiveAccount(req, res, next);
}
