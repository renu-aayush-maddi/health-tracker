import { CircleCheck, CircleX, ServerCog } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Skeleton, { SkeletonStack } from '../../components/ui/Skeleton.jsx';
import { useAdminSystem } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import styles from '../../components/admin/Admin.module.css';

const duration = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
};

function Status({ ok, children }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
      <Icon
        size={16}
        aria-hidden="true"
        style={{ color: ok ? 'var(--color-success)' : 'var(--color-danger)' }}
      />
      {children}
    </span>
  );
}

export default function AdminSystemPage() {
  usePageTitle('Admin · System');
  const query = useAdminSystem();

  if (query.isPending) {
    return (
      <SkeletonStack label="Loading system health…">
        <Skeleton height={180} radius="var(--radius-lg)" />
      </SkeletonStack>
    );
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title="System health" />
        <ErrorState
          title="Unable to load system health."
          error={query.error}
          onRetry={query.refetch}
        />
      </>
    );
  }

  const { api, database, integrations, activity } = query.data;

  return (
    <div className={styles.page}>
      <PageHeader
        title="System health"
        description="Operational status. Configuration values, credentials and keys are never shown here."
      />
      <div className={styles.detailGrid}>
        <div className={styles.page}>
          <Card title="API">
            <dl className={styles.definition}>
              <dt>Status</dt>
              <dd>
                <Status ok={api.status === 'ok'}>{api.status}</Status>
              </dd>
              <dt>Environment</dt>
              <dd>{api.environment}</dd>
              <dt>Uptime</dt>
              <dd>{duration(api.uptimeSeconds)}</dd>
            </dl>
          </Card>

          <Card title="Database">
            <dl className={styles.definition}>
              <dt>Status</dt>
              <dd>
                <Status ok={database.status === 'ok'}>{database.status}</Status>
              </dd>
              <dt>Latency</dt>
              <dd>{database.latencyMs} ms</dd>
              <dt>Migrations</dt>
              <dd>
                {database.migrations} applied · latest {database.latestMigration ?? '—'}
              </dd>
            </dl>
          </Card>
        </div>

        <div className={styles.page}>
          <Card title="Integrations">
            <dl className={styles.definition}>
              <dt>Email</dt>
              <dd>
                <Status ok={integrations.email.configured}>{integrations.email.provider}</Status>
              </dd>
              <dt>File storage</dt>
              <dd>
                <Status ok={integrations.fileStorage.configured}>
                  {integrations.fileStorage.provider}
                </Status>
              </dd>
              <dt>Backups</dt>
              <dd>
                <Status ok={integrations.backups.configured}>
                  {integrations.backups.configured
                    ? `keeping ${integrations.backups.retention}`
                    : 'not configured'}
                </Status>
              </dd>
            </dl>
          </Card>

          <Card title="Activity (24h)">
            <dl className={styles.definition}>
              <dt>Security events</dt>
              <dd>{activity.securityEvents24h}</dd>
              <dt>Failed events</dt>
              <dd>{activity.failedEvents24h}</dd>
            </dl>
            <p className={styles.statHint}>
              <ServerCog size={12} aria-hidden="true" className={styles.inlineIcon} />
              Refreshes automatically every 30 seconds.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
