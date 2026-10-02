import { query } from '../../db/pool.js';

export async function replaceResetToken({ userId, tokenHash, ttlMinutes }, db = { query }) {
  await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [
    userId,
  ]);
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [userId, tokenHash, ttlMinutes],
  );
}

/** Locks and returns a usable token row, or null if unknown, used or expired. */
export async function claimResetToken(tokenHash, db) {
  const { rows } = await db.query(
    `SELECT id, user_id FROM password_reset_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      FOR UPDATE`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function markResetTokenUsed({ tokenId, userId }, db) {
  await db.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [tokenId]);
  await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND id <> $2', [
    userId,
    tokenId,
  ]);
}
