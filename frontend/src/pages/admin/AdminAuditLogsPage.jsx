import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { AUDIT_ACTIONS, humanizeEvent } from '@health-tracker/shared';
import DataTable from '../../components/admin/DataTable.jsx';
import FilterBar from '../../components/admin/FilterBar.jsx';
import Pagination from '../../components/admin/Pagination.jsx';
import Alert from '../../components/ui/Alert.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useAdminAuditLogs } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { formatTimestamp } from '../../utils/adminFormat.js';
import styles from '../../components/admin/Admin.module.css';

const EMPTY = { action: '', ip: '', from: '', to: '', page: 1 };

const FIELDS = [
  {
    name: 'action',
    type: 'select',
    label: 'Action',
    allLabel: 'All actions',
    options: AUDIT_ACTIONS.map((action) => ({ value: action, label: humanizeEvent(action) })),
  },
  { name: 'ip', type: 'text', label: 'IP address' },
  { name: 'from', type: 'date', label: 'From' },
  { name: 'to', type: 'date', label: 'To' },
];

const SENSITIVE = ['HEALTH_RECORD_VIEWED', 'MEDICINE_RECORD_VIEWED', 'HEALTH_DATA_EXPORTED'];

export default function AdminAuditLogsPage() {
  usePageTitle('Admin · Audit logs');
  const [filters, setFilters] = useState(EMPTY);
  const query = useAdminAuditLogs(filters);

  const columns = [
    { key: 'createdAt', header: 'When', render: (row) => formatTimestamp(row.createdAt) },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <span className={SENSITIVE.includes(row.action) ? styles.sensitiveChip : undefined}>
          {humanizeEvent(row.action)}
        </span>
      ),
    },
    { key: 'actorEmail', header: 'Administrator', render: (row) => row.actorEmail ?? '—' },
    { key: 'targetEmail', header: 'Target', render: (row) => row.targetEmail ?? '—' },
    { key: 'ipAddress', header: 'IP', render: (row) => row.ipAddress ?? '—', hideBelow: 'md' },
    {
      key: 'metadata',
      header: 'Details',
      hideBelow: 'lg',
      render: (row) =>
        row.metadata && Object.keys(row.metadata).length > 0 ? (
          <span className={styles.mono}>
            {Object.entries(row.metadata)
              .map(([key, value]) => `${key}=${value}`)
              .join(' · ')}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  if (query.isError) {
    return (
      <>
        <PageHeader title="Audit logs" />
        <ErrorState
          title="Unable to load the audit log."
          error={query.error}
          onRetry={query.refetch}
        />
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Audit logs" description="Every administrative action, append-only." />
      <Alert tone="info">
        These records cannot be edited or deleted by anyone, including super admins — the database
        rejects any attempt to change them.
      </Alert>
      <FilterBar
        fields={FIELDS}
        values={filters}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY)}
      />
      <DataTable
        caption="Audit log"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        loading={query.isPending}
        stale={query.isPlaceholderData}
        empty={<EmptyState icon={ScrollText} title="No audit entries match." />}
      />
      {query.data && (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onChange={(page) => setFilters((f) => ({ ...f, page }))}
        />
      )}
    </div>
  );
}
