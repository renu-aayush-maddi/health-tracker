import {
  readSessionToken,
  resolveSession,
  clearSessionCookie,
} from '../modules/auth/session.service.js';
import { unauthenticated } from '../utils/httpErrors.js';

/**
 * The only source of user identity in the API. Sets req.auth = { userId, sessionId, user }.
 * Route handlers must take the user ID from here, never from the body, query or URL.
 */
export async function requireAuth(req, res, next) {
  const token = readSessionToken(req);
  if (!token) return next(unauthenticated());

  const session = await resolveSession(token);
  if (!session) {
    clearSessionCookie(res);
    return next(unauthenticated('Your session has expired. Please log in again.'));
  }

  req.auth = { userId: session.user.id, sessionId: session.sessionId, user: session.user };
  next();
}
