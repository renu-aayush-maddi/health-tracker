import { describe, expect, it } from 'vitest';
import { buildMonthGrid, effectiveEnd, eventsOnDay, layoutWeek } from './calendarLayout.js';

const week = [
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
];
const ev = (id, startDate, endDate = startDate) => ({ id, title: id, startDate, endDate });

describe('buildMonthGrid', () => {
  it('covers October 2026 in Monday-first weeks', () => {
    const weeks = buildMonthGrid(new Date(2026, 9, 15), 1);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe('2026-09-28');
    expect(weeks.at(-1)[6]).toBe('2026-11-01');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('supports Sunday-first weeks', () => {
    const weeks = buildMonthGrid(new Date(2026, 9, 15), 0);
    expect(weeks[0][0]).toBe('2026-09-27');
  });

  it('returns six weeks when the month needs them', () => {
    expect(buildMonthGrid(new Date(2026, 7, 1), 1)).toHaveLength(6); // Aug 2026 starts on a Saturday
  });
});

describe('effectiveEnd and eventsOnDay', () => {
  it('extends ongoing events to today', () => {
    expect(effectiveEnd({ startDate: '2026-09-28', endDate: null }, '2026-10-02')).toBe(
      '2026-10-02',
    );
    expect(effectiveEnd({ startDate: '2026-10-05', endDate: null }, '2026-10-02')).toBe(
      '2026-10-05',
    );
  });

  it('finds every event covering a day', () => {
    const events = [
      ev('a', '2026-10-01', '2026-10-03'),
      ev('b', '2026-10-03'),
      { ...ev('c', '2026-09-30'), endDate: null },
    ];
    expect(eventsOnDay(events, '2026-10-03', '2026-10-02').map((e) => e.id)).toEqual(['a', 'b']);
    expect(eventsOnDay(events, '2026-10-02', '2026-10-02').map((e) => e.id)).toEqual(['a', 'c']);
  });
});

describe('layoutWeek', () => {
  it('positions a multi-day event by column and span', () => {
    const { segments } = layoutWeek(week, [ev('fever', '2026-10-01', '2026-10-03')], '2026-10-02');
    expect(segments).toEqual([
      expect.objectContaining({
        startCol: 3,
        span: 3,
        lane: 0,
        continuesBefore: false,
        continuesAfter: false,
      }),
    ]);
  });

  it('clips events that cross week boundaries and marks the continuation', () => {
    const { segments } = layoutWeek(week, [ev('long', '2026-09-20', '2026-10-10')], '2026-10-02');
    expect(segments[0]).toMatchObject({
      startCol: 0,
      span: 7,
      continuesBefore: true,
      continuesAfter: true,
    });
  });

  it('stacks overlapping events into separate lanes and reuses free lanes', () => {
    const { segments, laneCount } = layoutWeek(
      week,
      [
        ev('a', '2026-09-28', '2026-09-30'),
        ev('b', '2026-09-29', '2026-10-01'),
        ev('c', '2026-10-01', '2026-10-02'),
      ],
      '2026-10-02',
    );
    const lanes = Object.fromEntries(segments.map((s) => [s.event.id, s.lane]));
    expect(lanes).toEqual({ a: 0, b: 1, c: 0 });
    expect(laneCount).toBe(2);
  });

  it('hides events beyond the lane limit and counts them per day', () => {
    const events = ['a', 'b', 'c', 'd'].map((id) => ev(id, '2026-10-01', '2026-10-02'));
    const { segments, hiddenByDay, laneCount } = layoutWeek(week, events, '2026-10-02', 3);
    expect(segments).toHaveLength(3);
    expect(laneCount).toBe(3);
    expect(hiddenByDay).toEqual([0, 0, 0, 1, 1, 0, 0]);
  });

  it('draws an ongoing event up to today only', () => {
    const { segments } = layoutWeek(
      week,
      [{ ...ev('cold', '2026-09-28'), endDate: null }],
      '2026-10-01',
    );
    expect(segments[0]).toMatchObject({ startCol: 0, span: 4, continuesAfter: false });
  });

  it('ignores events outside the week', () => {
    expect(
      layoutWeek(week, [ev('old', '2026-09-01', '2026-09-05')], '2026-10-02').segments,
    ).toEqual([]);
  });
});
