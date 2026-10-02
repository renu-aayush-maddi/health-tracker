import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { TAG_LIMITS } from '@health-tracker/shared';
import styles from './TagInput.module.css';

/**
 * Free-text tags as removable chips, plus one-tap suggestions. Enter or comma adds a tag;
 * pending text is kept when the field loses focus.
 */
export default function TagInput({ label = 'Tags', tags, onChange, suggestions = [], autoFocus }) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const hintId = useId();
  const full = tags.length >= TAG_LIMITS.tagsPerFile;
  const has = (tag) => tags.some((t) => t.toLowerCase() === tag.toLowerCase());

  const add = (value) => {
    const tag = value.trim().slice(0, TAG_LIMITS.tagMax);
    if (tag && !full && !has(tag)) onChange([...tags, tag]);
  };

  const commit = () => {
    add(draft);
    setDraft('');
  };

  const available = suggestions.filter((s) => !has(s)).slice(0, 10);

  return (
    <div className={styles.wrapper}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      {tags.length > 0 && (
        <ul className={styles.chips} aria-label="Added tags">
          {tags.map((tag) => (
            <li key={tag} className={styles.chip}>
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                aria-label={`Remove tag ${tag}`}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.entry}>
        <input
          id={inputId}
          className={styles.input}
          value={draft}
          autoFocus={autoFocus}
          data-autofocus={autoFocus || undefined}
          maxLength={TAG_LIMITS.tagMax}
          disabled={full}
          placeholder={full ? 'Tag limit reached' : 'Type a tag, e.g. Blood test'}
          aria-describedby={hintId}
          enterKeyHint="done"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            }
          }}
        />
        <button
          type="button"
          className={styles.addButton}
          onClick={commit}
          disabled={!draft.trim() || full}
        >
          <Plus size={18} aria-hidden="true" />
          <span className="visually-hidden">Add tag</span>
        </button>
      </div>
      <p id={hintId} className={styles.hint}>
        Press Enter after each tag, or pick one below.
      </p>
      {available.length > 0 && !full && (
        <div className={styles.suggestions} role="group" aria-label="Suggested tags">
          {available.map((tag) => (
            <button
              key={tag}
              type="button"
              className={styles.suggestion}
              onClick={() => add(tag)}
              aria-label={`Add tag ${tag}`}
            >
              <Plus size={12} aria-hidden="true" />
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Read-only tag chips. */
export function TagList({ tags, className = '' }) {
  if (!tags?.length) return null;
  return (
    <ul className={`${styles.chips} ${styles.readOnly} ${className}`} aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag} className={styles.chip}>
          {tag}
        </li>
      ))}
    </ul>
  );
}
