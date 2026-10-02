import { describe, expect, it } from 'vitest';
import { formatDate, formatDateRange, formatDuration } from './dates.js';

describe('date formatting', () => {
  it('formats dates without time-zone shifts', () => {
    expect(formatDate('2026-10-01')).toBe('01 Oct 2026');
    expect(formatDate('2026-10-01', 'yyyy-MM-dd')).toBe('2026-10-01');
    expect(formatDate(null)).toBe('');
  });

  it('formats ranges, single days and ongoing issues', () => {
    expect(formatDateRange('2026-10-01', '2026-10-03')).toBe('01 Oct 2026 → 03 Oct 2026');
    expect(formatDateRange('2026-09-20', '2026-09-20')).toBe('20 Sep 2026');
    expect(formatDateRange('2026-09-28', null)).toBe('Since 28 Sep 2026');
  });

  it('counts durations inclusively', () => {
    expect(formatDuration('2026-10-01', '2026-10-03')).toBe('3 days');
    expect(formatDuration('2026-10-01', '2026-10-01')).toBe('1 day');
    expect(formatDuration('2026-10-01', null)).toMatch(/days? so far$/);
  });
});
