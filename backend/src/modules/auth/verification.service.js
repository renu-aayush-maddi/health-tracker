import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpError, badRequest } from '../../utils/httpErrors.js';
import { sendVerificationCodeEmail } from '../../utils/mailer.js';
import * as codes from './verification.repository.js';

export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;

const hashCode = (userId, code) => createHash('sha256').update(`${userId}:${code}`).digest('hex');

/**
 * Emails a fresh 6-digit code, replacing any previous one. Sending happens in the background so
 * responses don't wait on the mail server; failures are logged and the user can resend.
 */
export async function issueCode(user) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await codes.upsertCode({
    userId: user.id,
    codeHash: hashCode(user.id, code),
    ttlMinutes: CODE_TTL_MINUTES,
  });
  sendVerificationCodeEmail({
    to: user.email,
    name: user.name,
    code,
    expiresInMinutes: CODE_TTL_MINUTES,
  }).catch((err) => console.error('Failed to send verification email:', err.message));
}

/** "Resend code" with a cooldown, so the address can't be flooded. */
export async function resendCode(user) {
  const existing = await codes.findCode(user.id);
  if (existing && existing.age_seconds < RESEND_COOLDOWN_SECONDS) {
    const wait = RESEND_COOLDOWN_SECONDS - existing.age_seconds;
    throw new HttpError(
      429,
      'RESEND_TOO_SOON',
      `Please wait ${wait} seconds before requesting another code.`,
    );
  }
  await issueCode(user);
}

/** On login: make sure an unverified user has a usable code waiting in their inbox. */
export async function ensureActiveCode(user) {
  const existing = await codes.findCode(user.id);
  if (!existing || !existing.active || existing.attempts >= MAX_ATTEMPTS) await issueCode(user);
}

export async function verifyCode(user, code) {
  const existing = await codes.findCode(user.id);
  const expired = () =>
    badRequest('This code has expired. Request a new one.', {
      code: 'This code has expired. Request a new one.',
    });

  if (!existing || !existing.active) throw expired();
  if (existing.attempts >= MAX_ATTEMPTS) {
    throw badRequest('Too many incorrect attempts. Request a new code.', {
      code: 'Too many incorrect attempts. Request a new code.',
    });
  }

  const matches = timingSafeEqual(
    Buffer.from(existing.code_hash),
    Buffer.from(hashCode(user.id, code)),
  );
  if (!matches) {
    const attempts = await codes.recordFailedAttempt(user.id);
    const left = MAX_ATTEMPTS - attempts;
    const message =
      left > 0
        ? `That code isn't right. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'Too many incorrect attempts. Request a new code.';
    throw badRequest(message, { code: message });
  }

  return codes.markVerified(user.id);
}
