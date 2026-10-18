import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';

/** "4 Oct 2026, 19:32" — admin screens want precision, not the user's chosen date format. */
export function formatTimestamp(value) {
  if (!value) return '—';
  return format(parseISO(value), 'd MMM yyyy, HH:mm');
}

export function formatRelative(value) {
  if (!value) return 'Never';
  return `${formatDistanceToNowStrict(parseISO(value))} ago`;
}

export function formatDay(value) {
  return value ? format(parseISO(value), 'd MMM yyyy') : '—';
}

/** Mozilla/5.0 … Chrome/120 … → "Chrome on macOS". Best-effort, for recognising a device. */
export function describeUserAgent(ua) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : 'Browser';
  const platform = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown';
  return `${browser} on ${platform}`;
}
