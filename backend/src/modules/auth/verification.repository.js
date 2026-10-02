import { query } from '../../db/pool.js';

/** Replaces any existing code for the user (one active code at a time). */
export async function upsertCode({ userId, codeHash, ttlMinutes }) {
  await query(
    `INSERT INTO email_verification_codes (user_id, code_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))
     ON CONFLICT (user_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, created_at = now()`,
    [userId, codeHash, ttlMinutes],
  );
}

export async function findCode(userId) {
  const { rows } = await query(
    `SELECT code_hash, attempts, expires_at > now() AS active,
            extract(epoch FROM now() - created_at)::int AS age_seconds
       FROM email_verification_codes WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

/** Counts a wrong guess and returns the new total. */
export async function recordFailedAttempt(userId) {
  const { rows } = await query(
    'UPDATE email_verification_codes SET attempts = attempts + 1 WHERE user_id = $1 RETURNING attempts',
    [userId],
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
