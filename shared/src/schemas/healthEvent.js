import { array, coerce, object, string } from 'zod';
import { EVENT_SORTS, EVENT_STATUSES, LIMITS, SEVERITIES, TAG_LIMITS } from '../constants.js';
import {
  isoDate,
  isValidIsoDate,
  optionalIsoDate,
  optionalText,
  requiredText,
  uuid,
} from './common.js';

const END_BEFORE_START = 'End date cannot be earlier than start date.';

/** One of `allowed`, with blank/missing normalized to null. */
const optionalChoice = (label, allowed) =>
  string({ error: `Choose a valid ${label}.` })
    .trim()
    .nullish()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || allowed.includes(value), `Choose a valid ${label}.`);

const statusField = string({ error: 'Choose a status.' }).refine(
  (value) => EVENT_STATUSES.includes(value),
  'Choose a status.',
);

/** Ongoing issues have no end date; resolved ones need one, on or after the start. */
function checkStatusAndDates(data, ctx) {
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: END_BEFORE_START });
  }
  if (data.status === 'resolved' && !data.endDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'Add an end date, or mark the issue as ongoing.',
    });
  }
  if (data.status === 'ongoing' && data.endDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: "An ongoing issue can't have an end date.",
    });
  }
}

export const medicineSchema = object({
  // Present when updating an existing medicine as part of an event update; absent for new ones.
  id: uuid('Medicine').optional(),
  name: requiredText('Medicine name', LIMITS.medicineNameMax),
  dosage: optionalText('Dosage', LIMITS.dosageMax),
  frequency: optionalText('Frequency', LIMITS.frequencyMax),
  startDate: optionalIsoDate('Start date'),
  endDate: optionalIsoDate('End date'),
  notes: optionalText('Medicine notes', LIMITS.medicineNotesMax),
}).superRefine((data, ctx) => {
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: END_BEFORE_START });
  }
});

const symptomsField = array(requiredText('Symptom', LIMITS.symptomMax), {
  error: 'Symptoms must be a list.',
})
  .max(LIMITS.symptomsMaxCount, `Add at most ${LIMITS.symptomsMaxCount} symptoms.`)
  .default([])
  // Drop case-insensitive duplicates, keeping the first spelling.
  .transform((list) =>
    list.filter((s, i) => list.findIndex((o) => o.toLowerCase() === s.toLowerCase()) === i),
  );

export const healthEventSchema = object({
  title: requiredText('Title', LIMITS.titleMax),
  healthIssue: requiredText('Health issue', LIMITS.healthIssueMax),
  description: optionalText('Description', LIMITS.descriptionMax),
  startDate: isoDate('Start date'),
  endDate: optionalIsoDate('End date'),
  status: statusField,
  severity: optionalChoice('severity', SEVERITIES),
  symptoms: symptomsField,
  notes: optionalText('Notes', LIMITS.notesMax),
  medicines: array(medicineSchema, { error: 'Medicines must be a list.' })
    .max(LIMITS.medicinesMaxCount, `Add at most ${LIMITS.medicinesMaxCount} medicines.`)
    .default([]),
})
  .superRefine(checkStatusAndDates)
  .superRefine((data, ctx) => {
    const ids = data.medicines.map((m) => m.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['medicines'],
        message: 'Each medicine can only appear once.',
      });
    }
  });

/** PATCH: quick status change, e.g. "Mark resolved" from the dashboard. Needs the event's start date to compare. */
export const eventStatusSchema = object({
  status: statusField,
  endDate: optionalIsoDate('End date'),
}).superRefine(checkStatusAndDates);

export const listEventsQuerySchema = object({
  q: optionalText('Search', LIMITS.searchMax),
  healthIssue: optionalText('Health issue', LIMITS.healthIssueMax),
  status: optionalChoice('status', EVENT_STATUSES),
  severity: optionalChoice('severity', SEVERITIES),
  from: optionalIsoDate('From date'),
  to: optionalIsoDate('To date'),
  sort: optionalChoice('sort order', EVENT_SORTS).transform((value) => value ?? 'start_desc'),
  page: coerce.number({ error: 'Page must be a number.' }).int().min(1).max(10_000).default(1),
  pageSize: coerce
    .number({ error: 'Page size must be a number.' })
    .int()
    .min(1)
    .max(LIMITS.pageSizeMax)
    .default(20),
}).superRefine((data, ctx) => {
  if (data.from && data.to && data.to < data.from) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: '"To" date cannot be earlier than "from" date.',
    });
  }
});

const DAY_MS = 24 * 60 * 60 * 1000;

export const calendarQuerySchema = object({
  from: isoDate('From date'),
  to: isoDate('To date'),
}).superRefine((data, ctx) => {
  if (!isValidIsoDate(data.from) || !isValidIsoDate(data.to)) return;
  const days = (Date.parse(data.to) - Date.parse(data.from)) / DAY_MS;
  if (days < 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: '"To" date cannot be earlier than "from" date.',
    });
  } else if (days > LIMITS.calendarRangeMaxDays) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: `Date range can be at most ${LIMITS.calendarRangeMaxDays} days.`,
    });
  }
});

export const medicineNamesQuerySchema = object({
  q: optionalText('Search', LIMITS.medicineNameMax),
});

export const eventParamsSchema = object({ eventId: uuid('Health event') });

export const medicineParamsSchema = object({
  eventId: uuid('Health event'),
  medicineId: uuid('Medicine'),
});

export const attachmentParamsSchema = object({
  eventId: uuid('Health event'),
  attachmentId: uuid('File'),
});

export const attachmentContentQuerySchema = object({
  download: string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
});

/** Tags on a file: trimmed, ≤ 30 chars, ≤ 10, duplicates (ignoring case) dropped. */
export const attachmentTagsSchema = array(requiredText('Tag', TAG_LIMITS.tagMax), {
  error: 'Tags must be a list.',
})
  .max(TAG_LIMITS.tagsPerFile, `Add at most ${TAG_LIMITS.tagsPerFile} tags.`)
  .default([])
  .transform((list) =>
    list.filter((t, i) => list.findIndex((o) => o.toLowerCase() === t.toLowerCase()) === i),
  );

export const updateAttachmentSchema = object({ tags: attachmentTagsSchema });

export const listAttachmentsQuerySchema = object({
  q: optionalText('Search', LIMITS.searchMax),
  tag: optionalText('Tag', TAG_LIMITS.tagMax),
  page: coerce.number({ error: 'Page must be a number.' }).int().min(1).max(10_000).default(1),
  pageSize: coerce
    .number({ error: 'Page size must be a number.' })
    .int()
    .min(1)
    .max(LIMITS.pageSizeMax)
    .default(20),
});
