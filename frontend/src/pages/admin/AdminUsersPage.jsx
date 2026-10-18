import { useState } from 'react';
import { Link } from 'react-router';
import { Users } from 'lucide-react';
import { ACCOUNT_STATUSES, ROLES, ROLE_LABELS, STATUS_LABELS } from '@health-tracker/shared';
import DataTable from '../../components/admin/DataTable.jsx';
import FilterBar from '../../components/admin/FilterBar.jsx';
import Pagination from '../../components/admin/Pagination.jsx';
import { AccountStatusBadge, RoleBadge } from '../../components/admin/StatusBadges.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { useAdminUsers } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { formatDay, formatRelative } from '../../utils/adminFormat.js';
import styles from '../../components/admin/Admin.module.css';

const EMPTY = { q: '', role: '', status: '', from: '', to: '', sort: 'created_desc', page: 1 };

const FIELDS = [
  { name: 'q', type: 'search', placeholder: 'Search name or email…' },
  {
    name: 'role',
    type: 'select',
    label: 'Role',
    allLabel: 'All roles',
    options: ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
  },
  {
    name: 'status',
    type: 'select',
    label: 'Status',
    allLabel: 'All statuses',
    options: ACCOUNT_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
  },
  { name: 'from', type: 'date', label: 'Joined from' },
  { name: 'to', type: 'date', label: 'Joined to' },
];

export default function AdminUsersPage() {
  usePageTitle('Admin · Users');
  const [filters, setFilters] = useState(EMPTY);
  const search = useDebouncedValue(filters.q.trim(), 300);
  const query = useAdminUsers({ ...filters, q: search });

  const columns = [
    {
      key: 'name',
      header: 'Account',
      render: (row) => (
        <Link to={`/admin/users/${row.id}`}>
          {row.name}
          <span className={styles.statHint} style={{ display: 'block' }}>
            {row.email}
          </span>
        </Link>
      ),
    },
    { key: 'role', header: 'Role', render: (row) => <RoleBadge role={row.role} /> },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <AccountStatusBadge status={row.status} />,
    },
    {
      key: 'createdAt',
      header: 'Joined',
      render: (row) => formatDay(row.createdAt),
      hideBelow: 'md',
    },
    {
      key: 'lastActivityAt',
      header: 'Last activity',
      render: (row) => formatRelative(row.lastActivityAt),
      hideBelow: 'md',
    },
    {
      key: 'healthEventCount',
      header: 'Records',
      align: 'right',
      render: (row) => row.healthEventCount,
    },
    {
      key: 'medicineCount',
      header: 'Medicines',
      align: 'right',
      render: (row) => row.medicineCount,
      hideBelow: 'lg',
    },
    {
      key: 'sessionCount',
      header: 'Sessions',
      align: 'right',
      render: (row) => row.sessionCount,
      hideBelow: 'lg',
    },
    { key: 'lastIp', header: 'Last IP', render: (row) => row.lastIp ?? '—', hideBelow: 'lg' },
  ];

  if (query.isError) {
    return (
      <>
        <PageHeader title="Users" />
        <ErrorState title="Unable to load accounts." error={query.error} onRetry={query.refetch} />
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Users"
        description="Account metadata only. Record counts are shown; their contents are not."
      />
      <FilterBar
        fields={FIELDS}
        values={filters}
        onChange={setFilters}
        onClear={() => setFilters({ ...EMPTY, q: filters.q })}
        searchLabel="Search accounts"
      />
      <DataTable
        caption="User accounts"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        loading={query.isPending}
        stale={query.isPlaceholderData}
        empty={
          <EmptyState
            icon={Users}
            title="No accounts match."
            description="Try a different search or clear the filters."
          />
        }
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
