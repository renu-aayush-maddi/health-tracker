import { query } from '../../db/pool.js';

export async function insertSession({ userId, tokenHash, userAgent, idleDays }, db = { query }) {
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [userId, tokenHash, userAgent, idleDays],
  );
}

/** Returns the session and its user, or null if the token is unknown or expired. */
export async function findActiveSession(tokenHash) {
  const { rows } = await query(
    `SELECT s.id AS session_id, s.last_used_at,
            u.id, u.name, u.email, u.preferences, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/** Slides the idle window forward, never past the absolute lifetime. */
export async function touchSession(sessionId, { idleDays, absoluteDays }) {
  await query(
    `UPDATE sessions
        SET last_used_at = now(),
            expires_at = LEAST(created_at + make_interval(days => $3), now() + make_interval(days => $2))
      WHERE id = $1`,
    [sessionId, idleDays, absoluteDays],
  );
}

export async function deleteSessionByTokenHash(tokenHash) {
  await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export async function deleteSessionById(sessionId, db = { query }) {
  await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

/** Revokes every session for a user, optionally keeping one (the caller's). */
export async function deleteUserSessions(userId, { exceptSessionId } = {}, db = { query }) {
  await db.query('DELETE FROM sessions WHERE user_id = $1 AND ($2::uuid IS NULL OR id <> $2)', [
    userId,
    exceptSessionId ?? null,
  ]);
}

export async function deleteExpiredSessionsAndTokens() {
  await query('DELETE FROM sessions WHERE expires_at <= now()');
  await query("DELETE FROM password_reset_tokens WHERE expires_at <= now() - interval '1 day'");
}
