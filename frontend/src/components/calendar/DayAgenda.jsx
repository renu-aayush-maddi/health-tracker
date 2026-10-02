import { format } from 'date-fns';
import { CalendarPlus, CalendarX } from 'lucide-react';
import { eventsOnDay } from '../../utils/calendarLayout.js';
import { parseDate } from '../../utils/dates.js';
import EventCard from '../events/EventCard.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import styles from './DayAgenda.module.css';

/** Events covering the selected day, with a shortcut to add one on that date. */
export default function DayAgenda({ day, events, today }) {
  const dayEvents = eventsOnDay(events, day, today);
  const canAdd = day <= today;

  return (
    <Card
      as="section"
      aria-live="polite"
      title={format(parseDate(day), 'EEEE, d MMMM')}
      action={
        canAdd && (
          <Button to={`/events/new?date=${day}`} variant="ghost" size="sm" icon={CalendarPlus}>
            Add
          </Button>
        )
      }
    >
      {dayEvents.length ? (
        <ul className={styles.list}>
          {dayEvents.map((event) => (
            <li key={event.id}>
              <EventCard event={{ ...event, medicineCount: 0, medicines: [] }} compact />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={CalendarX} title="No health events on this day." />
      )}
    </Card>
  );
}
