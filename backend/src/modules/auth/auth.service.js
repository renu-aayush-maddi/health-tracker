import { config } from '../../config/env.js';
import { withTransaction } from '../../db/pool.js';
import { HttpError, badRequest } from '../../utils/httpErrors.js';
import { sendPasswordResetEmail } from '../../utils/mailer.js';
import {
  burnPasswordCheck,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../../utils/passwords.js';
import { generateToken, hashToken } from '../../utils/tokens.js';
import * as users from '../users/user.repository.js';
import * as resetTokens from './resetToken.repository.js';
import { deleteUserSessions } from './session.repository.js';
import { startSession } from './session.service.js';

const RESET_TOKEN_TTL_MINUTES = 60;
const UNIQUE_VIOLATION = '23505';

const invalidCredentials = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');

export async function registerUser({ name, email, password }) {
  const passwordHash = await hashPassword(password);
  try {
    return await users.createUser({ name, email, passwordHash });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.', {
        email: 'An account with this email already exists.',
      });
    }
    throw err;
  }
}

export async function authenticate({ email, password }) {
  const user = await users.findUserByEmail(email);
  if (!user) {
    await burnPasswordCheck(password);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(user.password_hash, password))) throw invalidCredentials();

  if (needsRehash(user.password_hash)) {
    await users.replacePasswordHash(user.id, await hashPassword(password));
  }
  return user;
}

/** Verifies the current password, stores the new one, revokes all sessions and issues a fresh one. */
export async function changePassword({ userId, currentPassword, newPassword, userAgent }, res) {
  const user = await users.findUserWithHashById(userId);
  if (!user || !(await verifyPassword(user.password_hash, currentPassword))) {
    // 400 rather than 401: the session is valid, only the form input is wrong.
    throw badRequest('Current password is incorrect.', {
      currentPassword: 'Current password is incorrect.',
    });
  }

  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
    await users.updateUserPassword(userId, passwordHash, client);
    await deleteUserSessions(userId, {}, client);
    await startSession(res, { userId, userAgent }, client);
  });
}

/** Always resolves the same way, whether or not the email has an account. */
export async function requestPasswordReset({ email }) {
  const user = await users.findUserByEmail(email);
  if (!user) return;

  const token = generateToken();
  await resetTokens.replaceResetToken({
    userId: user.id,
    tokenHash: hashToken(token),
    ttlMinutes: RESET_TOKEN_TTL_MINUTES,
  });

  // The token travels in the URL fragment, which browsers never send to servers or in Referer.
  const resetUrl = `${config.APP_ORIGIN}/reset-password#token=${token}`;
  // Not awaited: response time must not reveal whether an email was sent.
  sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl,
    expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
  }).catch((err) => console.error('Failed to send password reset email:', err.message));
}

export async function resetPassword({ token, newPassword }) {
  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
    const claimed = await resetTokens.claimResetToken(hashToken(token), client);
    if (!claimed) {
      throw new HttpError(
        400,
        'INVALID_RESET_TOKEN',
        'This reset link is invalid or has expired. Please request a new one.',
      );
    }
    await users.updateUserPassword(claimed.user_id, passwordHash, client);
    // Completing a reset proves control of the inbox, so it also verifies the email. This lets
    // the real owner reclaim an address someone else signed up with but never verified.
    await client.query(
      'UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1',
      [claimed.user_id],
    );
    await resetTokens.markResetTokenUsed({ tokenId: claimed.id, userId: claimed.user_id }, client);
    await deleteUserSessions(claimed.user_id, {}, client);
  });
}
