import { useState } from 'react';
import LineChart from '../../components/charts/LineChart.jsx';
import Card from '../../components/ui/Card.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import SelectField from '../../components/ui/SelectField.jsx';
import Skeleton, { SkeletonStack } from '../../components/ui/Skeleton.jsx';
import { useAdminDashboard } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import styles from '../../components/admin/Admin.module.css';

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function Stat({ label, value, hint }) {
  return (
    <div className={styles.stat}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue}>{value}</p>
      {hint && <p className={styles.statHint}>{hint}</p>}
    </div>
  );
}

export default function AdminDashboardPage() {
  usePageTitle('Admin dashboard');
  const [days, setDays] = useState('30');
  const dashboard = useAdminDashboard({ days });

  const header = (
    <PageHeader
      title="Platform overview"
      description="Aggregate figures only — no individual health information appears on this page."
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

  if (dashboard.isPending) {
    return (
      <>
        {header}
        <SkeletonStack label="Loading platform overview…">
          <div className={styles.stats}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height={92} radius="var(--radius-lg)" />
            ))}
          </div>
        </SkeletonStack>
      </>
    );
  }

  if (dashboard.isError) {
    return (
      <>
        {header}
        <ErrorState
          title="Unable to load the dashboard."
          error={dashboard.error}
          onRetry={dashboard.refetch}
        />
      </>
    );
  }

  const { users, usage, security, trends } = dashboard.data;
  const single = (label, points) => [{ id: label, label, color: 'var(--chart-1)', points }];

  return (
    <div className={styles.page}>
      {header}

      <section aria-label="Accounts">
        <h2 className={styles.statLabel}>Accounts</h2>
        <div className={styles.stats}>
          <Stat label="Total users" value={users.total} hint={`${users.admins} administrator(s)`} />
          <Stat label="Active (30 days)" value={users.active} hint={`${users.inactive} inactive`} />
          <Stat label="New today" value={users.new_today} hint={`${users.new_week} this week`} />
          <Stat label="New this month" value={users.new_month} />
          <Stat
            label="Blocked"
            value={users.blocked}
            hint={`${users.suspended} suspended, ${users.disabled} disabled`}
          />
          <Stat label="Unverified email" value={users.unverified} />
        </div>
      </section>

      <section aria-label="Usage">
        <h2 className={styles.statLabel}>Health Tracker usage</h2>
        <div className={styles.stats}>
          <Stat
            label="Health events"
            value={usage.health_events}
            hint={`${usage.events_today} today`}
          />
          <Stat
            label="This week"
            value={usage.events_week}
            hint={`${usage.events_month} this month`}
          />
          <Stat label="Medicine records" value={usage.medicines} />
          <Stat label="Uploaded files" value={usage.attachments} />
        </div>
      </section>

      <section aria-label="Security">
        <h2 className={styles.statLabel}>Security</h2>
        <div className={styles.stats}>
          <Stat label="Logins today" value={security.logins_today} />
          <Stat
            label="Failed events today"
            value={security.failures_today}
            hint={`${security.failures_week} this week`}
          />
          <Stat label="Active sessions" value={security.active_sessions} />
          <Stat label="Blocked IPs" value={security.blocked_ips} />
        </div>
      </section>

      <div className={styles.charts}>
        <Card>
          <LineChart
            title="New registrations"
            series={single('Registrations', trends.registrations)}
          />
        </Card>
        <Card>
          <LineChart
            title="Health events created"
            series={single('Health events', trends.healthEvents)}
          />
        </Card>
        <Card>
          <LineChart
            title="Sign-ins: successful vs failed"
            series={[
              { id: 'ok', label: 'Successful', color: 'var(--chart-1)', points: trends.logins },
              {
                id: 'failed',
                label: 'Failed',
                color: 'var(--chart-2)',
                points: trends.failedLogins,
              },
            ]}
          />
        </Card>
        <Card>
          <LineChart
            title="Daily active users"
            series={single('Active users', trends.activeUsers)}
          />
        </Card>
      </div>
    </div>
  );
}
