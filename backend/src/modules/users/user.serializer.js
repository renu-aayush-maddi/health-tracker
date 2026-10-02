import { DEFAULT_PREFERENCES } from '@health-tracker/shared';

/** The only shape of a user that ever leaves the API. Never includes password_hash. */
export function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    preferences: { ...DEFAULT_PREFERENCES, ...row.preferences },
    createdAt: row.created_at,
  };
}
