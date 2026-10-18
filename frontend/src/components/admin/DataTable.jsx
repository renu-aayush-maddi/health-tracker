import Skeleton, { SkeletonStack } from '../ui/Skeleton.jsx';
import styles from './DataTable.module.css';

/**
 * Admin tables. `columns`: [{ key, header, render?, align?, hideBelow? }].
 * Scrolls horizontally rather than squashing columns; a caption names the table for screen readers.
 */
export default function DataTable({ caption, columns, rows, rowKey, loading, empty, stale }) {
  if (loading) {
    return (
      <SkeletonStack label={`Loading ${caption.toLowerCase()}…`}>
        <div className={styles.loading}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={44} radius="var(--radius-sm)" />
          ))}
        </div>
      </SkeletonStack>
    );
  }

  if (!rows.length) return empty;

  return (
    <div
      className={`${styles.wrapper} ${stale ? styles.stale : ''}`}
      // The table scrolls sideways on narrow screens, so it needs to be focusable for people
      // scrolling with the keyboard (axe: scrollable-region-focusable).
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`${column.align === 'right' ? styles.right : ''} ${
                  column.hideBelow ? styles[`hide_${column.hideBelow}`] : ''
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`${column.align === 'right' ? styles.right : ''} ${
                    column.hideBelow ? styles[`hide_${column.hideBelow}`] : ''
                  }`}
                >
                  {column.render ? column.render(row) : (row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
