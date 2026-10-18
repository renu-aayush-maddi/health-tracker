import { useId, useMemo, useState } from 'react';
import styles from './LineChart.module.css';

const PADDING = { top: 12, right: 12, bottom: 24, left: 36 };
const VIEW = { width: 720, height: 220 };

const niceCeiling = (value) => {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
};

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Time series as thin lines on a shared axis — never two y-scales.
 * `series`: [{ id, label, color, points: [{ date, count }] }].
 * A legend appears from two series up, the latest value is labelled directly, and a hidden
 * table carries the same numbers for screen readers and for anyone who cannot use the hover.
 */
export default function LineChart({ title, series, height = VIEW.height }) {
  const titleId = useId();
  const [hoverIndex, setHoverIndex] = useState(null);

  const { paths, xFor, yFor, max, dates, ticks } = useMemo(() => {
    const points = series[0]?.points ?? [];
    const allCounts = series.flatMap((s) => s.points.map((p) => p.count));
    const peak = niceCeiling(Math.max(1, ...allCounts));
    const innerWidth = VIEW.width - PADDING.left - PADDING.right;
    const innerHeight = height - PADDING.top - PADDING.bottom;
    const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

    const x = (i) => PADDING.left + i * stepX;
    const y = (value) => PADDING.top + innerHeight - (value / peak) * innerHeight;

    return {
      paths: series.map((s) => ({
        ...s,
        d: s.points
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`)
          .join(' '),
      })),
      xFor: x,
      yFor: y,
      max: peak,
      dates: points.map((p) => p.date),
      // Four y gridlines is enough to read a value without turning the plot into graph paper.
      ticks: [0, peak / 2, peak],
    };
  }, [series, height]);

  if (!series.length || !series[0].points.length) {
    return <p className={styles.empty}>No data for this period yet.</p>;
  }

  const multi = series.length > 1;
  const hovered = hoverIndex === null ? null : dates[hoverIndex];

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    const index = Math.round(ratio * (dates.length - 1));
    setHoverIndex(Math.min(dates.length - 1, Math.max(0, index)));
  };

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption} id={titleId}>
        {title}
        {multi && (
          <span className={styles.legend}>
            {series.map((s) => (
              <span key={s.id} className={styles.legendItem}>
                <span
                  className={styles.swatch}
                  style={{ background: s.color }}
                  aria-hidden="true"
                />
                {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>

      <div className={styles.plot} onMouseMove={onMove} onMouseLeave={() => setHoverIndex(null)}>
        <svg
          viewBox={`0 0 ${VIEW.width} ${height}`}
          className={styles.svg}
          role="img"
          aria-labelledby={titleId}
          preserveAspectRatio="none"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={VIEW.width - PADDING.right}
                y1={yFor(tick)}
                y2={yFor(tick)}
                className={styles.grid}
              />
              <text
                x={PADDING.left - 8}
                y={yFor(tick) + 4}
                className={styles.axisText}
                textAnchor="end"
              >
                {Math.round(tick)}
              </text>
            </g>
          ))}

          {hoverIndex !== null && (
            <line
              x1={xFor(hoverIndex)}
              x2={xFor(hoverIndex)}
              y1={PADDING.top}
              y2={height - PADDING.bottom}
              className={styles.crosshair}
            />
          )}

          {paths.map((s) => (
            <path key={s.id} d={s.d} fill="none" stroke={s.color} className={styles.line} />
          ))}

          {hoverIndex !== null &&
            paths.map((s) => (
              <circle
                key={s.id}
                cx={xFor(hoverIndex)}
                cy={yFor(s.points[hoverIndex]?.count ?? 0)}
                r="5"
                fill={s.color}
                className={styles.marker}
              />
            ))}

          <text x={PADDING.left} y={height - 6} className={styles.axisText}>
            {shortDate(dates[0])}
          </text>
          <text
            x={VIEW.width - PADDING.right}
            y={height - 6}
            className={styles.axisText}
            textAnchor="end"
          >
            {shortDate(dates.at(-1))}
          </text>
        </svg>

        {hoverIndex !== null && (
          <div
            className={styles.tooltip}
            style={{ left: `${(hoverIndex / Math.max(1, dates.length - 1)) * 100}%` }}
            role="status"
          >
            <p className={styles.tooltipDate}>{shortDate(hovered)}</p>
            {series.map((s) => (
              <p key={s.id} className={styles.tooltipRow}>
                <span
                  className={styles.swatch}
                  style={{ background: s.color }}
                  aria-hidden="true"
                />
                {s.label}: <strong>{s.points[hoverIndex]?.count ?? 0}</strong>
              </p>
            ))}
          </div>
        )}
      </div>

      <table className="visually-hidden">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((s) => (
              <th key={s.id} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date, i) => (
            <tr key={date}>
              <th scope="row">{date}</th>
              {series.map((s) => (
                <td key={s.id}>{s.points[i]?.count ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="visually-hidden">Peak value {max}.</p>
    </figure>
  );
}
