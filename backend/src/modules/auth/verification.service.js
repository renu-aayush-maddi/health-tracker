import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpError, badRequest } from '../../utils/httpErrors.js';
import { sendVerificationCodeEmail } from '../../utils/mailer.js';
import * as codes from './verification.repository.js';

export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;

const hashCode = (userId, code) => createHash('sha256').update(`${userId}:${code}`).digest('hex');

/**
 * Emails a new 6-digit code. Earlier codes stay valid until they expire (the newest 3 are kept),
 * because emails can arrive late or out of order. Sending happens in the background so the
 * response doesn't wait on the mail server; failures are logged and the user can resend.
 */
export async function issueCode(user, { waitForDelivery = false } = {}) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await codes.insertCode({
    userId: user.id,
    codeHash: hashCode(user.id, code),
    ttlMinutes: CODE_TTL_MINUTES,
  });
  const sending = sendVerificationCodeEmail({
    to: user.email,
    name: user.name,
    code,
    expiresInMinutes: CODE_TTL_MINUTES,
  });

  // Registration doesn't wait on the mail provider. "Resend" does, so a broken mail setup is
  // reported to the person instead of leaving them on the code screen with nothing arriving.
  if (!waitForDelivery) {
    sending.catch((err) => console.error('Failed to send verification email:', err.message));
    return;
  }
  try {
    await sending;
  } catch (err) {
    console.error('Failed to send verification email:', err.message);
    throw new HttpError(
      502,
      'EMAIL_SEND_FAILED',
      "We couldn't send the email just now. Please try again in a minute.",
    );
  }
}

/** "Resend code" with a cooldown, so the address can't be flooded. */
export async function resendCode(user) {
  const [newest] = await codes.findCodes(user.id);
  if (newest && newest.age_seconds < RESEND_COOLDOWN_SECONDS) {
    const wait = RESEND_COOLDOWN_SECONDS - newest.age_seconds;
    throw new HttpError(
      429,
      'RESEND_TOO_SOON',
      `Please wait ${wait} seconds before requesting another code.`,
    );
  }
  await issueCode(user, { waitForDelivery: true });
}

/** On login: make sure an unverified user has a usable code waiting in their inbox. */
export async function ensureActiveCode(user) {
  const [newest] = await codes.findCodes(user.id);
  if (!newest || !newest.active || newest.attempts >= MAX_ATTEMPTS) await issueCode(user);
}

const matchesCode = (row, expectedHash) =>
  timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(expectedHash));

/**
 * Accepts any unexpired code among the user's recent ones. Wrong guesses count against the
 * newest code; after MAX_ATTEMPTS the user must request a new code (cooldown and an hourly
 * limit cap guessing overall).
 */
export async function verifyCode(user, code) {
  const all = await codes.findCodes(user.id);
  const active = all.filter((row) => row.active);
  if (!active.length) {
    throw badRequest('This code has expired. Request a new one.', {
      code: 'This code has expired. Request a new one.',
    });
  }

  const [newest] = all;
  if (newest.attempts >= MAX_ATTEMPTS) {
    throw badRequest('Too many incorrect attempts. Request a new code.', {
      code: 'Too many incorrect attempts. Request a new code.',
    });
  }

  const expectedHash = hashCode(user.id, code);
  // Compare against every active code (no early exit) so timing doesn't reveal which matched.
  const matched = active.map((row) => matchesCode(row, expectedHash)).some(Boolean);
  if (!matched) {
    const attempts = await codes.recordFailedAttempt(newest.id);
    const left = MAX_ATTEMPTS - attempts;
    const message =
      left > 0
        ? `That code isn't right. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'Too many incorrect attempts. Request a new code.';
    throw badRequest(message, { code: message });
  }

  return codes.markVerified(user.id);
}
