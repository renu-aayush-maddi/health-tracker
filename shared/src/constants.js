// Values shared by the API (authoritative validation) and the UI (forms, filters, badges).

export const HEALTH_ISSUES = [
  'Fever',
  'Cold',
  'Cough',
  'Headache',
  'Migraine',
  'Stomach Pain',
  'Back Pain',
  'Allergy',
  'Infection',
  'Sore Throat',
  'Flu',
  'Food Poisoning',
];

/** Sentinel used by the UI's issue picker; never stored. The user's custom text is stored instead. */
export const OTHER_HEALTH_ISSUE = 'Other';

export const EVENT_STATUSES = ['ongoing', 'resolved'];

export const SEVERITIES = ['mild', 'moderate', 'severe'];

export const EVENT_SORTS = ['start_desc', 'start_asc', 'end_desc', 'end_asc', 'created_desc'];

export const DATE_FORMATS = ['dd MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'];

export const THEMES = ['system', 'light', 'dark'];

export const WEEK_STARTS = ['monday', 'sunday'];

export const DEFAULT_PREFERENCES = {
  theme: 'system',
  dateFormat: 'dd MMM yyyy',
  weekStart: 'monday',
};

export const LIMITS = {
  nameMax: 100,
  emailMax: 254,
  passwordMin: 10,
  passwordMax: 128,
  titleMax: 150,
  healthIssueMax: 100,
  descriptionMax: 2000,
  notesMax: 5000,
  symptomMax: 60,
  symptomsMaxCount: 30,
  medicineNameMax: 120,
  dosageMax: 60,
  frequencyMax: 60,
  medicineNotesMax: 1000,
  medicinesMaxCount: 30,
  searchMax: 100,
  pageSizeMax: 50,
  calendarRangeMaxDays: 100,
};

/**
 * Optional medical-record attachments (photos, scans, PDFs). The API checks the file's actual
 * content, not just its extension or declared type.
 */
export const ATTACHMENT_TYPES = {
  'image/jpeg': { label: 'JPEG image', extensions: ['.jpg', '.jpeg'], previewable: true },
  'image/png': { label: 'PNG image', extensions: ['.png'], previewable: true },
  'image/webp': { label: 'WebP image', extensions: ['.webp'], previewable: true },
  'image/heic': { label: 'HEIC photo', extensions: ['.heic', '.heif'], previewable: false },
  'application/pdf': { label: 'PDF document', extensions: ['.pdf'], previewable: false },
};

export const ATTACHMENT_LIMITS = {
  maxBytes: 10 * 1024 * 1024, // also Cloudinary's free-plan per-file limit
  maxPerEvent: 20,
  filenameMax: 255,
};

/** One-tap suggestions for tagging records; users can add any tag of their own. */
export const ATTACHMENT_TAG_SUGGESTIONS = [
  'Prescription',
  'Lab report',
  'Scan',
  'X-ray',
  'Doctor’s note',
  'Discharge summary',
  'Bill',
  'Insurance',
  'Vaccination',
];

export const TAG_LIMITS = { tagMax: 30, tagsPerFile: 10 };
