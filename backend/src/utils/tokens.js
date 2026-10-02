import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token, URL-safe. Given to the client; never stored. */
export function generateToken() {
  return randomBytes(32).toString('base64url');
}

/** What we store and look up instead of the raw token. */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
