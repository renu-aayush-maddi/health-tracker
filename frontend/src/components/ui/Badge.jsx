import { CircleCheck, CircleDot, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';
import { SEVERITY_LABELS, STATUS_LABELS } from '../../utils/labels.js';
import styles from './Badge.module.css';

const STATUS = {
  ongoing: { label: STATUS_LABELS.ongoing, icon: CircleDot },
  resolved: { label: STATUS_LABELS.resolved, icon: CircleCheck },
};

const SEVERITY = {
  mild: { label: SEVERITY_LABELS.mild, icon: SignalLow },
  moderate: { label: SEVERITY_LABELS.moderate, icon: SignalMedium },
  severe: { label: SEVERITY_LABELS.severe, icon: SignalHigh },
};

// Each badge pairs color with an icon and a text label, so meaning never depends on color alone.
function Badge({ tone, icon: Icon, label, srPrefix }) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      <Icon size={14} aria-hidden="true" />
      <span>
        {srPrefix && <span className="visually-hidden">{srPrefix}: </span>}
        {label}
      </span>
    </span>
  );
}

export function StatusBadge({ status }) {
  const config = STATUS[status];
  return config ? (
    <Badge tone={status} icon={config.icon} label={config.label} srPrefix="Status" />
  ) : null;
}

export function SeverityBadge({ severity }) {
  const config = SEVERITY[severity];
  return config ? (
    <Badge tone={severity} icon={config.icon} label={config.label} srPrefix="Severity" />
  ) : null;
}
