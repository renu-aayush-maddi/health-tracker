import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../ui/Button.jsx';
import styles from './Pagination.module.css';

/** Server-side paging: the browser only ever holds one page of rows. */
export default function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav className={styles.bar} aria-label="Pagination">
      <p className={styles.count} aria-live="polite">
        {first}–{last} of {total}
      </p>
      <div className={styles.buttons}>
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronLeft}
          iconOnly
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous page
        </Button>
        <span className={styles.page}>
          Page {page} of {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronRight}
          iconOnly
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next page
        </Button>
      </div>
    </nav>
  );
}
