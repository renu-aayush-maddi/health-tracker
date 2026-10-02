import { useState } from 'react';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DayAgenda from '../components/calendar/DayAgenda.jsx';
import MonthGrid from '../components/calendar/MonthGrid.jsx';
import Button from '../components/ui/Button.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCalendarEvents } from '../hooks/useHealthEvents.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { buildMonthGrid } from '../utils/calendarLayout.js';
import { parseDate, todayISO, toISODate } from '../utils/dates.js';
import styles from './CalendarPage.module.css';

export default function CalendarPage() {
  usePageTitle('Calendar');
  const { user } = useAuth();
  const today = todayISO();
  const weekStartsOn = user.preferences.weekStart === 'sunday' ? 0 : 1;
  const compact = useMediaQuery('(max-width: 639px)');

  const [selectedDay, setSelectedDay] = useState(today);
  const month = startOfMonth(parseDate(selectedDay));
  const weeks = buildMonthGrid(month, weekStartsOn);
  const range = { from: weeks[0][0], to: weeks.at(-1)[6] };
  const calendar = useCalendarEvents(range);
  const events = calendar.data ?? [];

  /** Month buttons select the 1st of the target month, or today when it falls in that month. */
  const goToMonth = (delta) => {
    const target = startOfMonth(addMonths(month, delta));
    setSelectedDay(format(target, 'yyyy-MM') === today.slice(0, 7) ? today : toISODate(target));
  };

  return (
    <>
      <PageHeader title="Calendar" description="Your health events, month by month." />

      <div className={styles.toolbar}>
        <div className={styles.nav}>
          <Button
            variant="secondary"
            size="sm"
            icon={ChevronLeft}
            iconOnly
            onClick={() => goToMonth(-1)}
          >
            Previous month
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={ChevronRight}
            iconOnly
            onClick={() => goToMonth(1)}
          >
            Next month
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSelectedDay(today)}
            disabled={selectedDay === today}
          >
            Today
          </Button>
        </div>
        <h2 className={styles.month} aria-live="polite">
          {format(month, 'MMMM yyyy')}
        </h2>
        <span className={styles.status}>
          {calendar.isFetching && <Spinner size={16} label="Loading events" />}
        </span>
      </div>

      {calendar.isError && (
        <ErrorState
          compact
          title="Unable to load calendar events."
          error={calendar.error}
          onRetry={calendar.refetch}
        />
      )}

      <div className={styles.layout}>
        <MonthGrid
          weeks={weeks}
          month={month}
          events={events}
          today={today}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          weekStartsOn={weekStartsOn}
          compact={compact}
        />
        <DayAgenda day={selectedDay} events={events} today={today} />
      </div>
    </>
  );
}
