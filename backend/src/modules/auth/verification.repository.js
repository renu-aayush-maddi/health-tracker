import { query } from '../../db/pool.js';

export const MAX_ACTIVE_CODES = 3;

/** Adds a code and trims older ones, keeping the newest MAX_ACTIVE_CODES. */
export async function insertCode({ userId, codeHash, ttlMinutes }) {
  await query(
    `INSERT INTO email_verification_codes (user_id, code_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [userId, codeHash, ttlMinutes],
  );
  await query(
    `DELETE FROM email_verification_codes
      WHERE user_id = $1
        AND id NOT IN (SELECT id FROM email_verification_codes WHERE user_id = $1
                        ORDER BY created_at DESC LIMIT $2)`,
    [userId, MAX_ACTIVE_CODES],
  );
}

/** The user's codes, newest first. */
export async function findCodes(userId) {
  const { rows } = await query(
    `SELECT id, code_hash, attempts, expires_at > now() AS active,
            extract(epoch FROM now() - created_at)::int AS age_seconds
       FROM email_verification_codes WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

/** Counts a wrong guess against the newest code and returns its new total. */
export async function recordFailedAttempt(codeId) {
  const { rows } = await query(
    'UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
    [codeId],
  );
  return rows[0]?.attempts ?? 0;
}

export async function markVerified(userId) {
  await query('DELETE FROM email_verification_codes WHERE user_id = $1', [userId]);
  const { rows } = await query(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now())
      WHERE id = $1 RETURNING id, name, email, preferences, created_at, email_verified_at`,
    [userId],
  );
  return rows[0];
}

/** Unverified sign-ups older than `days` hold no data (data routes need a verified email). */
export async function deleteStaleUnverifiedUsers(days) {
  await query(
    `DELETE FROM users WHERE email_verified_at IS NULL AND created_at < now() - make_interval(days => $1)`,
    [days],
  );
  await query("DELETE FROM email_verification_codes WHERE expires_at < now() - interval '1 day'");
}
