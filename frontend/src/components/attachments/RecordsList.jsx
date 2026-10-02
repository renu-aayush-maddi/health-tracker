import { useState } from 'react';
import { Link } from 'react-router';
import { Download, FileText, FolderOpen, Image as ImageIcon, Search, SearchX } from 'lucide-react';
import { useDateFormat } from '../../hooks/useDateFormat.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { useRecords, useTagSuggestions } from '../../hooks/useHealthEvents.js';
import { attachmentsService } from '../../services/attachmentsService.js';
import { formatBytes, isImage } from '../../utils/files.js';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton, { SkeletonStack } from '../ui/Skeleton.jsx';
import { TagList } from '../ui/TagInput.jsx';
import ImagePreviewDialog from './ImagePreviewDialog.jsx';
import styles from './RecordsList.module.css';

/** Every uploaded record across all events, filterable by tag and searchable by name. */
export default function RecordsList({ filters, onFiltersChange }) {
  const dates = useDateFormat();
  const { ownTags } = useTagSuggestions();
  const [preview, setPreview] = useState(null);
  const search = useDebouncedValue(filters.q.trim(), 300);
  const records = useRecords({ q: search, tag: filters.tag });

  const items = records.data?.pages.flatMap((page) => page.items) ?? [];
  const total = records.data?.pages[0]?.total ?? 0;
  const filtering = Boolean(search || filters.tag);

  let content;
  if (records.isPending) {
    content = (
      <SkeletonStack label="Loading records…">
        <div className={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={76} radius="var(--radius-lg)" />
          ))}
        </div>
      </SkeletonStack>
    );
  } else if (records.isError) {
    content = (
      <ErrorState
        title="Unable to load your records."
        error={records.error}
        onRetry={records.refetch}
      />
    );
  } else if (total === 0 && !filtering) {
    content = (
      <EmptyState
        icon={FolderOpen}
        title="No records yet."
        description="Attach prescriptions, lab reports or scans to any health event and they’ll all appear here."
      />
    );
  } else if (total === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No records match."
        description="Try another tag or search term."
        action={
          <Button variant="secondary" onClick={() => onFiltersChange({ q: '', tag: '' })}>
            Show all records
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        <ul className={`${styles.list} ${records.isPlaceholderData ? styles.stale : ''}`}>
          {items.map((record) => {
            const Icon = isImage(record.contentType) ? ImageIcon : FileText;
            return (
              <li key={record.id} className={styles.record}>
                <span className={styles.icon} aria-hidden="true">
                  <Icon size={20} />
                </span>
                <div className={styles.body}>
                  {record.previewable ? (
                    <button
                      type="button"
                      className={styles.name}
                      title={record.filename}
                      onClick={() => setPreview(record)}
                    >
                      {record.filename}
                    </button>
                  ) : (
                    <a
                      className={styles.name}
                      title={record.filename}
                      href={attachmentsService.contentUrl(record.event.id, record.id)}
                      target="_blank"
                      rel="noopener"
                    >
                      {record.filename}
                      <span className="visually-hidden"> (opens in a new tab)</span>
                    </a>
                  )}
                  <p className={styles.meta}>
                    <Link to={`/history/${record.event.id}`} className={styles.eventLink}>
                      {record.event.title}
                    </Link>{' '}
                    · {dates.date(record.event.startDate)} · {formatBytes(record.size)}
                  </p>
                  <TagList tags={record.tags} className={styles.tags} />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Download}
                  iconOnly
                  href={attachmentsService.contentUrl(record.event.id, record.id, {
                    download: true,
                  })}
                >
                  {`Download ${record.filename}`}
                </Button>
              </li>
            );
          })}
        </ul>
        <div className={styles.footer}>
          <p className={styles.count}>
            Showing {items.length} of {total}
          </p>
          {records.hasNextPage && (
            <Button
              variant="secondary"
              onClick={() => records.fetchNextPage()}
              loading={records.isFetchingNextPage}
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
      <div className={styles.controls}>
        <div className={styles.search}>
          <Search size={18} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search file names, tags, events…"
            aria-label="Search records"
            value={filters.q}
            maxLength={100}
            onChange={(e) => onFiltersChange({ ...filters, q: e.target.value })}
          />
        </div>
        {ownTags.length > 0 && (
          <div className={styles.tagFilter} role="group" aria-label="Filter by tag">
            <button
              type="button"
              className={styles.tagButton}
              aria-pressed={!filters.tag}
              onClick={() => onFiltersChange({ ...filters, tag: '' })}
            >
              All
            </button>
            {ownTags.map((tag) => {
              const active = filters.tag.toLowerCase() === tag.name.toLowerCase();
              return (
                <button
                  key={tag.name}
                  type="button"
                  className={styles.tagButton}
                  aria-pressed={active}
                  onClick={() => onFiltersChange({ ...filters, tag: active ? '' : tag.name })}
                >
                  {tag.name} <span className={styles.tagCount}>{tag.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {records.isSuccess ? `${total} ${total === 1 ? 'record' : 'records'} found` : ''}
      </p>
      {content}
      <ImagePreviewDialog
        eventId={preview?.event.id}
        attachment={preview}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
