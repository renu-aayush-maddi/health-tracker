import { Search, X } from 'lucide-react';
import Button from '../ui/Button.jsx';
import SelectField from '../ui/SelectField.jsx';
import TextField from '../ui/TextField.jsx';
import styles from './FilterBar.module.css';

const option = (value, label) => ({ value, label });

/**
 * One row of filters above a table. `fields` is a small declarative list so each admin page
 * describes its filters rather than rebuilding the markup.
 */
export default function FilterBar({ fields, values, onChange, onClear, searchLabel = 'Search' }) {
  const set = (name) => (event) => onChange({ ...values, [name]: event.target.value, page: 1 });
  const active = fields.some((field) => field.name !== 'q' && values[field.name]);

  return (
    <div className={styles.bar}>
      {fields.map((field) => {
        if (field.type === 'search') {
          return (
            <div key={field.name} className={styles.search}>
              <Search size={18} className={styles.icon} aria-hidden="true" />
              <input
                type="search"
                className={styles.input}
                placeholder={field.placeholder ?? 'Search…'}
                aria-label={searchLabel}
                value={values[field.name] ?? ''}
                onChange={set(field.name)}
                maxLength={100}
              />
            </div>
          );
        }
        if (field.type === 'select') {
          return (
            <SelectField
              key={field.name}
              label={field.label}
              className={styles.field}
              options={[
                option('', field.allLabel ?? `All ${field.label.toLowerCase()}`),
                ...field.options,
              ]}
              value={values[field.name] ?? ''}
              onChange={set(field.name)}
            />
          );
        }
        return (
          <TextField
            key={field.name}
            label={field.label}
            type={field.type}
            className={styles.field}
            value={values[field.name] ?? ''}
            onChange={set(field.name)}
          />
        );
      })}
      {active && (
        <Button variant="ghost" size="sm" icon={X} className={styles.clear} onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
  );
}
