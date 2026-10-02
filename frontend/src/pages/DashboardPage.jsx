import { useState } from 'react';
import { Activity, CircleCheck, CircleDot, HeartPulse, Layers, Plus } from 'lucide-react';
import EventCard from '../components/events/EventCard.jsx';
import MarkResolvedDialog from '../components/events/MarkResolvedDialog.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Skeleton, { SkeletonStack } from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDashboard } from '../hooks/useHealthEvents.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { greetingForNow } from '../utils/dates.js';
import styles from './DashboardPage.module.css';

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <div className={`${styles.stat} ${styles[tone] ?? ''}`}>
      <span className={styles.statIcon} aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <SkeletonStack label="Loading your health overview…">
      <div className={styles.stats}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={104} radius="var(--radius-lg)" />
        ))}
      </div>
      <div className={styles.columns}>
        <Skeleton height={240} radius="var(--radius-lg)" />
        <Skeleton height={240} radius="var(--radius-lg)" />
      </div>
    </SkeletonStack>
  );
}

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const dashboard = useDashboard();
  const [eventToResolve, setEventToResolve] = useState(null);

  const header = (
    <PageHeader
      title={`${greetingForNow()}, ${user.name.split(' ')[0]}`}
      description="Here's an overview of your health history."
      actions={
        <Button to="/events/new" icon={Plus}>
          Add event
        </Button>
      }
    />
  );

  if (dashboard.isPending) {
    return (
      <>
        {header}
        <DashboardSkeleton />
      </>
    );
  }

  if (dashboard.isError) {
    return (
      <>
        {header}
        <ErrorState
          title="Unable to load your dashboard."
          error={dashboard.error}
          onRetry={dashboard.refetch}
        />
      </>
    );
  }

  const { totals, ongoing, recent, mostCommonIssue } = dashboard.data;

  if (totals.total === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={HeartPulse}
            title="No health events yet."
            description="Start tracking your health history by adding your first event. It takes less than a minute."
            action={
              <Button to="/events/new" icon={Plus}>
                Add health event
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {header}

      <section aria-label="Summary" className={styles.stats}>
        <StatCard label="Total events" value={totals.total} icon={Layers} />
        <StatCard label="Ongoing" value={totals.ongoing} icon={CircleDot} tone="ongoing" />
        <StatCard label="Resolved" value={totals.resolved} icon={CircleCheck} tone="resolved" />
      </section>

      {mostCommonIssue && mostCommonIssue.count > 1 && (
        <p className={styles.insight}>
          <Activity size={16} aria-hidden="true" />
          Most recorded in the last 12 months: <strong>{mostCommonIssue.name}</strong> (
          {mostCommonIssue.count} times)
        </p>
      )}

      <div className={styles.columns}>
        <Card title="Ongoing now">
          {ongoing.length ? (
            <ul className={styles.list}>
              {ongoing.map((event) => (
                <li key={event.id} className={styles.ongoingItem}>
                  <EventCard event={event} compact />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={CircleCheck}
                    className={styles.resolveButton}
                    onClick={() => setEventToResolve(event)}
                  >
                    Mark resolved
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={CircleCheck}
              title="Nothing ongoing"
              description="No active health issues right now."
            />
          )}
        </Card>

        <Card
          title="Recent events"
          action={
            <Button to="/history" variant="ghost" size="sm">
              View all
            </Button>
          }
        >
          <ul className={styles.list}>
            {recent.map((event) => (
              <li key={event.id}>
                <EventCard event={event} compact />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <MarkResolvedDialog
        event={eventToResolve}
        open={Boolean(eventToResolve)}
        onClose={() => setEventToResolve(null)}
      />
    </>
  );
}
