import { useState } from 'react';
import Card from '../../components/ui/Card.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import SelectField from '../../components/ui/SelectField.jsx';
import Skeleton, { SkeletonStack } from '../../components/ui/Skeleton.jsx';
import { humanizeEvent } from '@health-tracker/shared';
import { useAdminReports } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { formatDay, formatTimestamp } from '../../utils/adminFormat.js';
import styles from '../../components/admin/Admin.module.css';

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const Row = ({ label, value }) => (
  <>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </>
);

export default function AdminReportsPage() {
  usePageTitle('Admin · Reports');
  const [days, setDays] = useState('30');
  const query = useAdminReports({ days });

  const header = (
    <PageHeader
      title="Reports"
      description="Aggregate totals for the selected period."
      actions={
        <SelectField
          label="Period"
          hideLabel
          options={RANGES}
          value={days}
          onChange={(event) => setDays(event.target.value)}
        />
      }
    />
  );

  if (query.isPending) {
    return (
      <>
        {header}
        <SkeletonStack label="Loading reports…">
          <Skeleton height={220} radius="var(--radius-lg)" />
        </SkeletonStack>
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        {header}
        <ErrorState title="Unable to load reports." error={query.error} onRetry={query.refetch} />
      </>
    );
  }

  const { range, users, usage, security, privacy } = query.data;

  return (
    <div className={styles.page}>
      {header}
      <p className={styles.muted}>
        {formatDay(range.from)} – {formatDay(range.to)}
      </p>

      <div className={styles.detailGrid}>
        <div className={styles.page}>
          <Card title="Users">
            <dl className={styles.definition}>
              <Row label="Total" value={users.total} />
              <Row label="New in period" value={users.new_in_range} />
              <Row label="Active in period" value={users.active_in_range} />
              <Row label="Restricted" value={users.restricted} />
              <Row label="Unverified" value={users.unverified} />
            </dl>
          </Card>

          <Card title="Application usage">
            <dl className={styles.definition}>
              <Row label="Health events" value={usage.health_events} />
              <Row label="Medicines" value={usage.medicines} />
              <Row label="Files" value={usage.attachments} />
              <Row label="Contributing users" value={usage.contributing_users} />
            </dl>
          </Card>

          <Card title="Security">
            <dl className={styles.definition}>
              <Row label="Successful logins" value={security.successful_logins} />
              <Row label="Failed logins" value={security.failed_logins} />
              <Row label="Blocked by IP" value={security.blocked_by_ip} />
              <Row label="Blocked accounts" value={security.blocked_accounts} />
              <Row label="Password reset requests" value={security.reset_requests} />
            </dl>
          </Card>
        </div>

        <Card title="Privacy — access to medical content">
          <dl className={styles.definition}>
            <Row label="Sensitive accesses" value={privacy.sensitive_accesses} />
            <Row label="Administrators involved" value={privacy.administrators} />
          </dl>
          {privacy.byAdministrator.length === 0 ? (
            <p className={styles.muted}>
              No administrator opened anyone&apos;s medical information in this period.
            </p>
          ) : (
            <ul
              className={styles.timeline}
              tabIndex={0}
              aria-label="Sensitive data access by administrator"
            >
              {privacy.byAdministrator.map((row) => (
                <li key={`${row.actor_email}-${row.action}`} className={styles.timelineItem}>
                  <span className={styles.timelineTime}>{row.accesses}×</span>
                  <span>
                    {row.actor_email}
                    <span className={styles.muted}> · {humanizeEvent(row.action)}</span>
                    <span className={styles.muted}> · last {formatTimestamp(row.last_access)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.statHint}>
            This report exists so that access to sensitive data is itself visible and reviewable.
          </p>
        </Card>
      </div>
    </div>
  );
}
