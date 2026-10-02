import { object, string } from 'zod';
import { DATE_FORMATS, LIMITS, THEMES, WEEK_STARTS } from '../constants.js';
import { requiredText } from './common.js';

const choice = (label, allowed) =>
  string({ error: `Choose a valid ${label}.` }).refine(
    (value) => allowed.includes(value),
    `Choose a valid ${label}.`,
  );

export const preferencesSchema = object({
  theme: choice('theme', THEMES).optional(),
  dateFormat: choice('date format', DATE_FORMATS).optional(),
  weekStart: choice('week start', WEEK_STARTS).optional(),
});

export const updateProfileSchema = object({
  name: requiredText('Name', LIMITS.nameMax).optional(),
  preferences: preferencesSchema.optional(),
}).refine(
  (data) => data.name !== undefined || data.preferences !== undefined,
  'Nothing to update.',
);

export const deleteAccountSchema = object({
  password: string({ error: 'Enter your password to confirm.' })
    .min(1, 'Enter your password to confirm.')
    .max(LIMITS.passwordMax, 'Password is too long.'),
});
