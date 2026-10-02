import { Link } from 'react-router';
import { Paperclip, Pencil, Pill, Trash2 } from 'lucide-react';
import { useDateFormat } from '../../hooks/useDateFormat.js';
import { formatDuration } from '../../utils/dates.js';
import { SeverityBadge, StatusBadge } from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import styles from './EventCard.module.css';

function medicineSummary(event) {
  if (!event.medicineCount) return null;
  const [first] = event.medicines;
  const label = [first.name, first.dosage].filter(Boolean).join(' · ');
  const more = event.medicineCount - 1;
  return more > 0 ? `${label} +${more} more` : label;
}

/** The whole card opens the event; Edit and Delete sit above the link layer. */
export default function EventCard({ event, onDelete, compact = false }) {
  const dates = useDateFormat();
  const medicines = medicineSummary(event);

  return (
    <article className={`${styles.card} ${compact ? styles.compact : ''}`}>
      <div className={styles.top}>
        <span className={styles.issue}>{event.healthIssue}</span>
        <StatusBadge status={event.status} />
      </div>

      <h3 className={styles.title}>
        <Link to={`/history/${event.id}`} className={styles.link}>
          {event.title}
        </Link>
      </h3>
      <p className={styles.dates}>
        {dates.range(event.startDate, event.endDate)}
        <span className={styles.duration}> · {formatDuration(event.startDate, event.endDate)}</span>
      </p>

      {!compact && event.description && <p className={styles.description}>{event.description}</p>}

      {(event.severity || medicines || event.attachmentCount > 0 || !compact) && (
        <div className={styles.bottom}>
          <div className={styles.meta}>
            <SeverityBadge severity={event.severity} />
            {medicines && (
              <span className={styles.medicines}>
                <Pill size={14} aria-hidden="true" />
                <span className="visually-hidden">
                  {event.medicineCount === 1
                    ? '1 medicine: '
                    : `${event.medicineCount} medicines: `}
                </span>
                {medicines}
              </span>
            )}
            {event.attachmentCount > 0 && (
              <span className={styles.medicines}>
                <Paperclip size={14} aria-hidden="true" />
                {event.attachmentCount === 1 ? '1 file' : `${event.attachmentCount} files`}
              </span>
            )}
          </div>
          {!compact && (
            <div className={styles.actions}>
              <Button
                to={`/events/${event.id}/edit`}
                variant="ghost"
                size="sm"
                icon={Pencil}
                iconOnly
              >
                {`Edit ${event.title}`}
              </Button>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  iconOnly
                  onClick={() => onDelete(event)}
                >
                  {`Delete ${event.title}`}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
