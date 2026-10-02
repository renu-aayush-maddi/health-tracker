// Pure layout logic for the month calendar. Dates are 'YYYY-MM-DD' strings, which compare
// correctly as plain strings.
import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { toISODate } from './dates.js';

/** Weeks (arrays of 7 ISO dates) covering the month that contains `monthDate`. */
export function buildMonthGrid(monthDate, weekStartsOn = 1) {
  const first = startOfWeek(startOfMonth(monthDate), { weekStartsOn });
  const last = endOfWeek(endOfMonth(monthDate), { weekStartsOn });
  const weeks = [];
  for (let day = first; day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => toISODate(addDays(day, i))));
  }
  return weeks;
}

/** Ongoing events are drawn up to today (never before their own start). */
export function effectiveEnd(event, today) {
  if (event.endDate) return event.endDate;
  return today > event.startDate ? today : event.startDate;
}

export function eventsOnDay(events, day, today) {
  return events.filter((event) => event.startDate <= day && effectiveEnd(event, today) >= day);
}

/**
 * Places the events overlapping one week into horizontal lanes.
 * Returns visible segments (column 0–6, span, lane, whether the bar continues into the
 * previous/next week), how many events each day had to hide, and the number of lanes used.
 */
export function layoutWeek(weekDays, events, today, maxLanes = 3) {
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  const segments = events
    .filter((event) => event.startDate <= weekEnd && effectiveEnd(event, today) >= weekStart)
    .map((event) => {
      const end = effectiveEnd(event, today);
      const startCol = weekDays.findIndex((day) => day >= event.startDate);
      const endCol = 6 - [...weekDays].reverse().findIndex((day) => day <= end);
      return {
        event,
        startCol,
        span: endCol - startCol + 1,
        continuesBefore: event.startDate < weekStart,
        continuesAfter: end > weekEnd,
      };
    })
    // Earlier starts first; among those, longer bars first so they get the top lanes.
    .sort(
      (a, b) =>
        a.startCol - b.startCol ||
        b.span - a.span ||
        a.event.startDate.localeCompare(b.event.startDate),
    );

  const laneEnds = []; // last occupied column per lane
  const visible = [];
  const hiddenByDay = Array(7).fill(0);

  for (const segment of segments) {
    let lane = laneEnds.findIndex((lastCol) => lastCol < segment.startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = segment.startCol + segment.span - 1;

    if (lane < maxLanes) {
      visible.push({ ...segment, lane });
    } else {
      for (let col = segment.startCol; col < segment.startCol + segment.span; col += 1)
        hiddenByDay[col] += 1;
    }
  }

  return { segments: visible, hiddenByDay, laneCount: Math.min(laneEnds.length, maxLanes) };
}
