import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

export const DEFAULT_DATE_FORMAT = 'dd MMM yyyy';

/** Today's date in the user's own time zone, as YYYY-MM-DD. */
export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Parses YYYY-MM-DD as a local calendar date (no UTC shift). */
export function parseDate(iso) {
  const date = parseISO(iso);
  return isValid(date) ? date : null;
}

export function toISODate(date) {
  return format(date, 'yyyy-MM-dd');
}

export function formatDate(iso, pattern = DEFAULT_DATE_FORMAT) {
  const date = iso ? parseDate(iso) : null;
  return date ? format(date, pattern) : '';
}

/** "01 Oct 2026 → 03 Oct 2026", "20 Sep 2026" for a single day, "Since 28 Sep 2026" if ongoing. */
export function formatDateRange(startDate, endDate, pattern = DEFAULT_DATE_FORMAT) {
  if (!endDate) return `Since ${formatDate(startDate, pattern)}`;
  if (startDate === endDate) return formatDate(startDate, pattern);
  return `${formatDate(startDate, pattern)} → ${formatDate(endDate, pattern)}`;
}

/** Inclusive length: "3 days", or "5 days so far" for ongoing issues. */
export function formatDuration(startDate, endDate) {
  const start = parseDate(startDate);
  const end = endDate ? parseDate(endDate) : new Date();
  if (!start || !end) return '';
  const days = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const label = days === 1 ? '1 day' : `${days} days`;
  return endDate ? label : `${label} so far`;
}

export function greetingForNow(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
