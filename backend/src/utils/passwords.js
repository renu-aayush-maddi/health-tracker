import argon2 from 'argon2';

// OWASP Password Storage Cheat Sheet: Argon2id, 19 MiB memory, 2 iterations, parallelism 1.
const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

let dummyHashPromise;

export function hashPassword(password) {
  return argon2.hash(password, HASH_OPTIONS);
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function needsRehash(hash) {
  return argon2.needsRehash(hash, HASH_OPTIONS);
}

/**
 * Runs a full verification against a throwaway hash so that "unknown email" takes as long
 * as "wrong password", preventing account discovery through response timing.
 */
export async function burnPasswordCheck(password) {
  dummyHashPromise ??= hashPassword('dummy-password-for-timing-equalization');
  await verifyPassword(await dummyHashPromise, password);
  return false;
}
