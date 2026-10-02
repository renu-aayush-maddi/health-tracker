import { useRef } from 'react';
import { panelId, tabId } from '../../utils/tabs.js';
import styles from './Tabs.module.css';

/**
 * WAI-ARIA tabs: arrow keys / Home / End move between tabs. Render each panel yourself with
 * role="tabpanel", id={panelId(prefix, id)} and aria-labelledby={tabId(prefix, id)}.
 */
export default function Tabs({ label, prefix, tabs, value, onChange }) {
  const list = useRef(null);

  const onKeyDown = (event) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[
      event.key
    ];
    if (next === undefined) return;
    event.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    onChange(tab.id);
    list.current?.querySelector(`#${tabId(prefix, tab.id)}`)?.focus();
  };

  return (
    <div ref={list} role="tablist" aria-label={label} className={styles.tabs} onKeyDown={onKeyDown}>
      {tabs.map(({ id, label: tabLabel, icon: Icon }) => (
        <button
          key={id}
          id={tabId(prefix, id)}
          type="button"
          role="tab"
          aria-selected={value === id}
          aria-controls={panelId(prefix, id)}
          tabIndex={value === id ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={16} aria-hidden="true" />}
          {tabLabel}
        </button>
      ))}
    </div>
  );
}
