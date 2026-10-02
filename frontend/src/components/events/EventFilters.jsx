import { useId, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { HEALTH_ISSUES } from '@health-tracker/shared';
import { useHealthIssues } from '../../hooks/useHealthEvents.js';
import { countActiveFilters, EMPTY_FILTERS } from '../../utils/eventFilters.js';
import { SEVERITY_LABELS, SORT_LABELS, STATUS_LABELS } from '../../utils/labels.js';
import Button from '../ui/Button.jsx';
import SelectField from '../ui/SelectField.jsx';
import TextField from '../ui/TextField.jsx';
import styles from './EventFilters.module.css';

const toOptions = (labels, allLabel) => [
  { value: '', label: allLabel },
  ...Object.entries(labels).map(([value, label]) => ({ value, label })),
];

export default function EventFilters({ filters, onChange, rangeError }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const issues = useHealthIssues();
  const active = countActiveFilters(filters);
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value });

  // The user's own issues first (most used), then the remaining presets.
  const used = (issues.data ?? []).map((i) => i.name);
  const issueOptions = [
    { value: '', label: 'All issues' },
    ...[...used, ...HEALTH_ISSUES.filter((issue) => !used.includes(issue))].map((issue) => ({
      value: issue,
      label: issue,
    })),
  ];

  return (
    <div className={styles.wrapper}>
      <div className={styles.topRow}>
        <div className={styles.search}>
          <Search size={18} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search events, medicines, notes…"
            aria-label="Search health events"
            value={filters.q}
            onChange={set('q')}
            maxLength={100}
          />
        </div>
        <Button
          variant="secondary"
          icon={SlidersHorizontal}
          className={styles.filterToggle}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          Filters{active ? ` (${active})` : ''}
        </Button>
        <SelectField
          label="Sort by"
          hideLabel
          className={styles.sort}
          options={Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label }))}
          value={filters.sort}
          onChange={set('sort')}
        />
      </div>

      <div id={panelId} className={`${styles.panel} ${open ? styles.open : ''}`}>
        <SelectField
          label="Health issue"
          options={issueOptions}
          value={filters.healthIssue}
          onChange={set('healthIssue')}
        />
        <SelectField
          label="Status"
          options={toOptions(STATUS_LABELS, 'All statuses')}
          value={filters.status}
          onChange={set('status')}
        />
        <SelectField
          label="Severity"
          options={toOptions(SEVERITY_LABELS, 'All severities')}
          value={filters.severity}
          onChange={set('severity')}
        />
        <TextField
          label="From"
          type="date"
          value={filters.from}
          max={filters.to || undefined}
          onChange={set('from')}
        />
        <TextField
          label="To"
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          onChange={set('to')}
          error={rangeError}
        />
        {active > 0 && (
          <Button
            variant="ghost"
            icon={X}
            className={styles.clear}
            onClick={() => onChange({ ...EMPTY_FILTERS, q: filters.q, sort: filters.sort })}
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
