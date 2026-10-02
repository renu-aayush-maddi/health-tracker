import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { addDays, addMonths, endOfWeek, format, startOfWeek } from 'date-fns';
import { eventsOnDay, layoutWeek } from '../../utils/calendarLayout.js';
import { parseDate, toISODate } from '../../utils/dates.js';
import styles from './MonthGrid.module.css';

const MAX_LANES = 3;

function moveDay(day, key, weekStartsOn) {
  const date = parseDate(day);
  switch (key) {
    case 'ArrowLeft':
      return addDays(date, -1);
    case 'ArrowRight':
      return addDays(date, 1);
    case 'ArrowUp':
      return addDays(date, -7);
    case 'ArrowDown':
      return addDays(date, 7);
    case 'Home':
      return startOfWeek(date, { weekStartsOn });
    case 'End':
      return endOfWeek(date, { weekStartsOn });
    case 'PageUp':
      return addMonths(date, -1);
    case 'PageDown':
      return addMonths(date, 1);
    default:
      return null;
  }
}

/**
 * Month view. Multi-day events are bars laid out in lanes per week. In `compact` mode (phones)
 * bars are thin decorative stripes and tapping a day shows its events in the agenda instead.
 * Keyboard: arrows move between days, Home/End jump within the week, PageUp/PageDown change month.
 */
export default function MonthGrid({
  weeks,
  month,
  events,
  today,
  selectedDay,
  onSelectDay,
  weekStartsOn,
  compact,
}) {
  const gridRef = useRef(null);
  const focusAfterRender = useRef(null);
  const monthKey = format(month, 'yyyy-MM');

  useEffect(() => {
    if (focusAfterRender.current && focusAfterRender.current === selectedDay) {
      gridRef.current?.querySelector(`[data-day="${selectedDay}"]`)?.focus();
      focusAfterRender.current = null;
    }
  }, [selectedDay, weeks]);

  const onKeyDown = (event) => {
    const next = moveDay(selectedDay, event.key, weekStartsOn);
    if (!next) return;
    event.preventDefault();
    const day = toISODate(next);
    focusAfterRender.current = day;
    onSelectDay(day);
  };

  const weekdays = weeks[0].map((day) => parseDate(day));

  return (
    <div className={styles.calendar}>
      <div className={styles.weekdays} aria-hidden="true">
        {weekdays.map((date) => (
          <span key={date.toISOString()}>
            <span className={styles.weekdayLong}>{format(date, 'EEE')}</span>
            <span className={styles.weekdayShort}>{format(date, 'EEEEE')}</span>
          </span>
        ))}
      </div>

      <div ref={gridRef} role="group" aria-label={format(month, 'MMMM yyyy')} onKeyDown={onKeyDown}>
        {weeks.map((week) => {
          const { segments, hiddenByDay, laneCount } = layoutWeek(week, events, today, MAX_LANES);
          const rows = [
            'var(--day-header)',
            laneCount && `repeat(${laneCount}, var(--bar-height))`,
            'minmax(var(--more-height), 1fr)',
          ];
          return (
            <div
              key={week[0]}
              className={styles.week}
              style={{ gridTemplateRows: rows.filter(Boolean).join(' ') }}
            >
              {week.map((day, col) => {
                const date = parseDate(day);
                const count = eventsOnDay(events, day, today).length;
                const label = `${format(date, 'EEEE, d MMMM yyyy')}${
                  count ? `, ${count} health ${count === 1 ? 'event' : 'events'}` : ''
                }`;
                return (
                  <button
                    key={day}
                    type="button"
                    data-day={day}
                    className={[
                      styles.day,
                      format(date, 'yyyy-MM') !== monthKey && styles.outside,
                      day === today && styles.today,
                      day === selectedDay && styles.selected,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ gridColumn: col + 1 }}
                    tabIndex={day === selectedDay ? 0 : -1}
                    aria-label={label}
                    aria-pressed={day === selectedDay}
                    aria-current={day === today ? 'date' : undefined}
                    onClick={() => onSelectDay(day)}
                  >
                    <span className={styles.dayNumber}>{format(date, 'd')}</span>
                  </button>
                );
              })}

              {segments.map(({ event, startCol, span, lane, continuesBefore, continuesAfter }) => {
                const className = [
                  styles.bar,
                  styles[event.severity ?? 'none'],
                  event.status === 'ongoing' && styles.ongoing,
                  continuesBefore && styles.continuesBefore,
                  continuesAfter && styles.continuesAfter,
                ]
                  .filter(Boolean)
                  .join(' ');
                const placement = {
                  gridColumn: `${startCol + 1} / span ${span}`,
                  gridRow: lane + 2,
                };
                return compact ? (
                  <span key={event.id} className={className} style={placement} aria-hidden="true" />
                ) : (
                  <Link
                    key={event.id}
                    to={`/history/${event.id}`}
                    className={className}
                    style={placement}
                    title={event.title}
                  >
                    {continuesBefore && <span className="visually-hidden">continued: </span>}
                    <span className={styles.barLabel}>{event.title}</span>
                  </Link>
                );
              })}

              {hiddenByDay.map((hidden, col) =>
                hidden ? (
                  <button
                    key={week[col]}
                    type="button"
                    tabIndex={-1}
                    className={styles.more}
                    style={{ gridColumn: col + 1, gridRow: laneCount + 2 }}
                    onClick={() => onSelectDay(week[col])}
                  >
                    +{hidden}
                    <span className={styles.moreWord}> more</span>
                  </button>
                ) : null,
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
