import { useEffect, useState } from 'react';
import { FolderOpen, History, ListChecks, Plus, SearchX } from 'lucide-react';
import RecordsList from '../components/attachments/RecordsList.jsx';
import DeleteEventDialog from '../components/events/DeleteEventDialog.jsx';
import EventCard from '../components/events/EventCard.jsx';
import EventFilters from '../components/events/EventFilters.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Skeleton, { SkeletonStack } from '../components/ui/Skeleton.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useEventList } from '../hooks/useHealthEvents.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { countActiveFilters, EMPTY_FILTERS } from '../utils/eventFilters.js';
import { readSessionState, writeSessionState } from '../utils/sessionState.js';
import { panelId, tabId } from '../utils/tabs.js';
import styles from './HistoryPage.module.css';

const STORAGE_KEY = 'historyFilters';
const VIEW_KEY = 'historyView';
const RECORD_FILTERS_KEY = 'recordFilters';
const VIEWS = [
  { id: 'events', label: 'Events', icon: ListChecks },
  { id: 'records', label: 'Records', icon: FolderOpen },
];

function ListSkeleton() {
  return (
    <SkeletonStack label="Loading health history…">
      <div className={styles.list}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={132} radius="var(--radius-lg)" />
        ))}
      </div>
    </SkeletonStack>
  );
}

export default function HistoryPage() {
  usePageTitle('Health History');
  const [filters, setFilters] = useState(() => readSessionState(STORAGE_KEY, EMPTY_FILTERS));
  const [eventToDelete, setEventToDelete] = useState(null);
  const [view, setView] = useState(() => readSessionState(VIEW_KEY, { view: 'events' }).view);
  const [recordFilters, setRecordFilters] = useState(() =>
    readSessionState(RECORD_FILTERS_KEY, { q: '', tag: '' }),
  );
  const search = useDebouncedValue(filters.q.trim(), 300);

  useEffect(() => writeSessionState(STORAGE_KEY, filters), [filters]);
  useEffect(() => writeSessionState(VIEW_KEY, { view }), [view]);
  useEffect(() => writeSessionState(RECORD_FILTERS_KEY, recordFilters), [recordFilters]);

  const rangeError =
    filters.from && filters.to && filters.to < filters.from
      ? '"To" date cannot be earlier than "From" date.'
      : undefined;
  const query = {
    q: search,
    healthIssue: filters.healthIssue,
    status: filters.status,
    severity: filters.severity,
    from: filters.from,
    to: rangeError ? '' : filters.to,
    sort: filters.sort,
  };
  const list = useEventList(query);

  const events = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const filtering = Boolean(search) || countActiveFilters(filters) > 0;

  let content;
  if (list.isPending) {
    content = <ListSkeleton />;
  } else if (list.isError) {
    content = (
      <ErrorState
        title="Unable to load health history."
        error={list.error}
        onRetry={list.refetch}
      />
    );
  } else if (total === 0 && !filtering) {
    content = (
      <EmptyState
        icon={History}
        title="No health events yet."
        description="Start tracking your health history by adding your first event."
        action={
          <Button to="/events/new" icon={Plus}>
            Add health event
          </Button>
        }
      />
    );
  } else if (total === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No events match your search."
        description="Try different words or clear some filters."
        action={
          <Button
            variant="secondary"
            onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}
          >
            Clear search and filters
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        <ul className={`${styles.list} ${list.isPlaceholderData ? styles.stale : ''}`}>
          {events.map((event) => (
            <li key={event.id}>
              <EventCard event={event} onDelete={setEventToDelete} />
            </li>
          ))}
        </ul>
        <div className={styles.footer}>
          <p className={styles.count}>
            Showing {events.length} of {total}
          </p>
          {list.hasNextPage && (
            <Button
              variant="secondary"
              onClick={() => list.fetchNextPage()}
              loading={list.isFetchingNextPage}
            >
              Load more
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Health History"
        description="Every health event and record you've saved."
        actions={
          <Button to="/events/new" icon={Plus}>
            Add event
          </Button>
        }
      />
      <Tabs label="History view" prefix="history" tabs={VIEWS} value={view} onChange={setView} />
      {view === 'events' ? (
        <div
          role="tabpanel"
          id={panelId('history', 'events')}
          aria-labelledby={tabId('history', 'events')}
        >
          <EventFilters filters={filters} onChange={setFilters} rangeError={rangeError} />
          <p className="visually-hidden" aria-live="polite">
            {list.isSuccess ? `${total} ${total === 1 ? 'event' : 'events'} found` : ''}
          </p>
          {content}
        </div>
      ) : (
        <div
          role="tabpanel"
          id={panelId('history', 'records')}
          aria-labelledby={tabId('history', 'records')}
        >
          <RecordsList filters={recordFilters} onFiltersChange={setRecordFilters} />
        </div>
      )}
      <DeleteEventDialog event={eventToDelete} onClose={() => setEventToDelete(null)} />
    </>
  );
}
