import { useState } from 'react';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { SECURITY_EVENT_TYPES, humanizeEvent } from '@health-tracker/shared';
import DataTable from '../../components/admin/DataTable.jsx';
import FilterBar from '../../components/admin/FilterBar.jsx';
import Pagination from '../../components/admin/Pagination.jsx';
import { OutcomeBadge } from '../../components/admin/StatusBadges.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useAdminSecurity, useSuspiciousActivity } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { describeUserAgent, formatTimestamp } from '../../utils/adminFormat.js';
import styles from '../../components/admin/Admin.module.css';

const EMPTY = { type: '', outcome: '', ip: '', from: '', to: '', page: 1 };

const FIELDS = [
  {
    name: 'type',
    type: 'select',
    label: 'Event',
    allLabel: 'All events',
    options: SECURITY_EVENT_TYPES.map((type) => ({ value: type, label: humanizeEvent(type) })),
  },
  {
    name: 'outcome',
    type: 'select',
    label: 'Outcome',
    allLabel: 'All outcomes',
    options: [
      { value: 'success', label: 'Success' },
      { value: 'failure', label: 'Failure' },
    ],
  },
  { name: 'ip', type: 'text', label: 'IP address' },
  { name: 'from', type: 'date', label: 'From' },
  { name: 'to', type: 'date', label: 'To' },
];

function Suspicious() {
  const query = useSuspiciousActivity();
  if (query.isPending || query.isError) return null;
  const { repeatedFailuresByIp, repeatedFailuresByAccount, accountsSeenFromManyIps } = query.data;
  const nothing =
    !repeatedFailuresByIp.length &&
    !repeatedFailuresByAccount.length &&
    !accountsSeenFromManyIps.length;

  return (
    <Card title="Suspicious activity (last 24 hours)">
      {nothing ? (
        <EmptyState
          compact
          icon={ShieldCheck}
          title="Nothing unusual"
          description="No repeated failures."
        />
      ) : (
        <div className={styles.page}>
          {repeatedFailuresByIp.length > 0 && (
            <div>
              <p className={styles.statHint}>Repeated failures from one address</p>
              <ul className={styles.permissionList}>
                {repeatedFailuresByIp.map((row) => (
                  <li
                    key={row.ip_address}
                    className={`${styles.permissionChip} ${styles.sensitiveChip}`}
                  >
                    {row.ip_address}: {row.failures} failures, {row.accounts_tried} account(s)
                  </li>
                ))}
              </ul>
            </div>
          )}
          {repeatedFailuresByAccount.length > 0 && (
            <div>
              <p className={styles.statHint}>Repeated failures against one account</p>
              <ul className={styles.permissionList}>
                {repeatedFailuresByAccount.map((row) => (
                  <li
                    key={row.email_attempted}
                    className={`${styles.permissionChip} ${styles.sensitiveChip}`}
                  >
                    {row.email_attempted}: {row.failures}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {accountsSeenFromManyIps.length > 0 && (
            <div>
              <p className={styles.statHint}>Accounts seen from several addresses</p>
              <ul className={styles.permissionList}>
                {accountsSeenFromManyIps.map((row) => (
                  <li key={row.email} className={styles.permissionChip}>
                    {row.email}: {row.ip_count} addresses
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function AdminSecurityPage() {
  usePageTitle('Admin · Security');
  const [filters, setFilters] = useState(EMPTY);
  const query = useAdminSecurity(filters);

  const columns = [
    { key: 'createdAt', header: 'When', render: (row) => formatTimestamp(row.createdAt) },
    { key: 'type', header: 'Event', render: (row) => humanizeEvent(row.type) },
    { key: 'success', header: 'Outcome', render: (row) => <OutcomeBadge success={row.success} /> },
    { key: 'email', header: 'Account', render: (row) => row.email ?? '—' },
    { key: 'ipAddress', header: 'IP', render: (row) => row.ipAddress ?? '—', hideBelow: 'md' },
    {
      key: 'userAgent',
      header: 'Device',
      render: (row) => describeUserAgent(row.userAgent),
      hideBelow: 'lg',
    },
    {
      key: 'failureReason',
      header: 'Reason',
      render: (row) => row.failureReason ?? '—',
      hideBelow: 'lg',
    },
  ];

  if (query.isError) {
    return (
      <>
        <PageHeader title="Security" />
        <ErrorState
          title="Unable to load security events."
          error={query.error}
          onRetry={query.refetch}
        />
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Security" description="Authentication and account security events." />
      <Suspicious />
      <FilterBar
        fields={FIELDS}
        values={filters}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY)}
      />
      <DataTable
        caption="Security events"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        loading={query.isPending}
        stale={query.isPlaceholderData}
        empty={<EmptyState icon={TriangleAlert} title="No events match." />}
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
