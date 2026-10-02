// Named imports (not the `z` namespace) let bundlers drop Zod's locales and JSON-Schema
// tooling, which cuts the browser bundle from ~90 kB to ~24 kB gzipped.
import { iso, string, uuid as zodUuid } from 'zod';

const typeError = (label, kind) => (issue) =>
  issue.input === undefined || issue.input === null
    ? `${label} is required.`
    : `${label} must be ${kind}.`;

/** Trimmed, non-empty string with a max length. */
export const requiredText = (label, max) =>
  string({ error: typeError(label, 'text') })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

/** Optional string: blank, null and missing all normalize to null. */
export const optionalText = (label, max) =>
  string({ error: `${label} must be text.` })
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .nullish()
    .transform((value) => (value ? value : null));

const isoDateFormat = iso.date();

/** True for a real calendar date (leap years included) in YYYY-MM-DD form, 1900–2100. */
export const isValidIsoDate = (value) =>
  isoDateFormat.safeParse(value).success && value >= '1900-01-01' && value <= '2100-12-31';

export const isoDate = (label) =>
  string({ error: typeError(label, 'a date') })
    .trim()
    .min(1, `${label} is required.`)
    .refine(isValidIsoDate, `${label} must be a valid date.`);

/** Blank, null and missing normalize to null; anything else must be a valid date. */
export const optionalIsoDate = (label) =>
  string({ error: `${label} must be a valid date.` })
    .trim()
    .nullish()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || isValidIsoDate(value), `${label} must be a valid date.`);

export const uuid = (label = 'ID') => zodUuid({ error: `${label} is invalid.` });

/**
 * Converts a ZodError into { "field.path": "first message" } for the API's `fields` object
 * and for showing errors next to form inputs.
 */
export function toFieldErrors(zodError) {
  const fields = {};
  for (const issue of zodError.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_form';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}
