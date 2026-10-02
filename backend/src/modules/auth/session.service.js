import { config } from '../../config/env.js';
import { generateToken, hashToken } from '../../utils/tokens.js';
import * as sessions from './session.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const lifetimes = {
  idleDays: config.SESSION_IDLE_DAYS,
  absoluteDays: config.SESSION_ABSOLUTE_DAYS,
};

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax',
  path: '/',
});

/** Creates a session row and sets the cookie. `db` lets callers include it in a transaction. */
export async function startSession(res, { userId, userAgent }, db) {
  const token = generateToken();
  await sessions.insertSession(
    {
      userId,
      tokenHash: hashToken(token),
      userAgent: userAgent?.slice(0, 255) ?? null,
      idleDays: lifetimes.idleDays,
    },
    db,
  );
  res.cookie(config.sessionCookieName, token, {
    ...cookieOptions(),
    maxAge: lifetimes.absoluteDays * DAY_MS,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.sessionCookieName, cookieOptions());
}

export function readSessionToken(req) {
  const token = req.cookies?.[config.sessionCookieName];
  return typeof token === 'string' && token.length > 0 && token.length <= 200 ? token : null;
}

/** Resolves a cookie token to { sessionId, user } or null, sliding the idle expiry when due. */
export async function resolveSession(token) {
  const row = await sessions.findActiveSession(hashToken(token));
  if (!row) return null;
  if (Date.now() - new Date(row.last_used_at).getTime() > TOUCH_INTERVAL_MS) {
    await sessions.touchSession(row.session_id, lifetimes);
  }
  return { sessionId: row.session_id, user: row };
}

/** Deletes the session behind the request's cookie, if any (used before issuing a new one). */
export async function revokeCurrentSession(req) {
  const token = readSessionToken(req);
  if (token) await sessions.deleteSessionByTokenHash(hashToken(token));
}

export async function endSession(req, res) {
  const token = readSessionToken(req);
  if (token) await sessions.deleteSessionByTokenHash(hashToken(token));
  clearSessionCookie(res);
}
