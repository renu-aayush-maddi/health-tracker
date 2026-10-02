import { query } from '../../db/pool.js';

const PUBLIC_COLUMNS = 'id, name, email, preferences, created_at, email_verified_at';

export async function findUserByEmail(email) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserWithHashById(userId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function findUserById(userId) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [userId]);
  return rows[0] ?? null;
}

export async function createUser({ name, email, passwordHash }) {
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${PUBLIC_COLUMNS}`,
    [name, email, passwordHash],
  );
  return rows[0];
}

export async function updateUserPassword(userId, passwordHash, db = { query }) {
  await db.query('UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1', [
    userId,
    passwordHash,
  ]);
}

/** Silent upgrade of an old hash format; does not count as a password change. */
export async function replacePasswordHash(userId, passwordHash) {
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
}

export async function updateUserProfile(userId, { name, preferences }) {
  const { rows } = await query(
    `UPDATE users
        SET name = COALESCE($2, name),
            preferences = CASE WHEN $3::jsonb IS NULL THEN preferences ELSE preferences || $3::jsonb END
      WHERE id = $1
      RETURNING ${PUBLIC_COLUMNS}`,
    [userId, name ?? null, preferences ? JSON.stringify(preferences) : null],
  );
  return rows[0] ?? null;
}

export async function deleteUser(userId) {
  await query('DELETE FROM users WHERE id = $1', [userId]);
}
