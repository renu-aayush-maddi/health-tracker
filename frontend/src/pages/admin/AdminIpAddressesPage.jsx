import { useState } from 'react';
import { Ban, Globe, ShieldCheck } from 'lucide-react';
import DataTable from '../../components/admin/DataTable.jsx';
import FilterBar from '../../components/admin/FilterBar.jsx';
import Pagination from '../../components/admin/Pagination.jsx';
import ReasonDialog from '../../components/admin/ReasonDialog.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAdminIps, useAdminMe, useAdminMutations } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { formatRelative } from '../../utils/adminFormat.js';
import styles from '../../components/admin/Admin.module.css';

const EMPTY = { q: '', onlyBlocked: '', page: 1 };

const FIELDS = [
  { name: 'q', type: 'search', placeholder: 'Search addresses…' },
  {
    name: 'onlyBlocked',
    type: 'select',
    label: 'Blocked',
    allLabel: 'All addresses',
    options: [{ value: 'true', label: 'Blocked only' }],
  },
];

export default function AdminIpAddressesPage() {
  usePageTitle('Admin · IP addresses');
  const me = useAdminMe();
  const toast = useToast();
  const mutations = useAdminMutations();
  const [filters, setFilters] = useState(EMPTY);
  const [toBlock, setToBlock] = useState(null);
  const [toUnblock, setToUnblock] = useState(null);
  const query = useAdminIps(filters);

  const columns = [
    {
      key: 'ipAddress',
      header: 'Address',
      render: (row) => <span className={styles.mono}>{row.ipAddress}</span>,
    },
    {
      key: 'blocked',
      header: 'Status',
      render: (row) =>
        row.blocked ? (
          <span className={`${styles.permissionChip} ${styles.sensitiveChip}`}>Blocked</span>
        ) : (
          <span className={styles.muted}>Allowed</span>
        ),
    },
    { key: 'userCount', header: 'Accounts', align: 'right', render: (row) => row.userCount },
    {
      key: 'successfulLogins',
      header: 'Logins',
      align: 'right',
      render: (row) => row.successfulLogins,
      hideBelow: 'md',
    },
    {
      key: 'failedEvents',
      header: 'Failures',
      align: 'right',
      render: (row) => row.failedEvents,
      hideBelow: 'md',
    },
    {
      key: 'lastSeen',
      header: 'Last seen',
      render: (row) => formatRelative(row.lastSeen),
      hideBelow: 'lg',
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) =>
        me.can('ip_addresses.block') ? (
          row.blocked ? (
            <Button variant="ghost" size="sm" icon={ShieldCheck} onClick={() => setToUnblock(row)}>
              Unblock
            </Button>
          ) : (
            <Button variant="ghost" size="sm" icon={Ban} onClick={() => setToBlock(row)}>
              Block
            </Button>
          )
        ) : null,
    },
  ];

  if (query.isError) {
    return (
      <>
        <PageHeader title="IP addresses" />
        <ErrorState
          title="Unable to load IP activity."
          error={query.error}
          onRetry={query.refetch}
        />
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="IP addresses"
        description="Aggregated from authentication events. Blocking stops sign-in, sign-up and password reset from that address."
      />
      <Alert tone="info">
        Addresses are read using the configured proxy depth, so a forged forwarding header is not
        trusted. Blocking an address you share with real users would lock them out too.
      </Alert>
      <FilterBar
        fields={FIELDS}
        values={filters}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY)}
        searchLabel="Search IP addresses"
      />
      <DataTable
        caption="IP address activity"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.ipAddress}
        loading={query.isPending}
        stale={query.isPlaceholderData}
        empty={<EmptyState icon={Globe} title="No addresses recorded yet." />}
      />
      {query.data && (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onChange={(page) => setFilters((f) => ({ ...f, page }))}
        />
      )}

      <ReasonDialog
        open={Boolean(toBlock)}
        title={`Block ${toBlock?.ipAddress ?? ''}?`}
        consequences={['Refuse sign-in, sign-up and password reset from this address']}
        confirmLabel="Block address"
        loading={mutations.blockIp.isPending}
        onCancel={() => setToBlock(null)}
        onConfirm={async ({ reason }) => {
          await mutations.blockIp.mutateAsync({ ip: toBlock.ipAddress, reason });
          toast.success('Address blocked.');
        }}
      />

      <ConfirmDialog
        open={Boolean(toUnblock)}
        title={`Unblock ${toUnblock?.ipAddress ?? ''}?`}
        description="Requests from this address will be allowed again."
        confirmLabel="Unblock"
        tone="primary"
        loading={mutations.unblockIp.isPending}
        onCancel={() => setToUnblock(null)}
        onConfirm={async () => {
          try {
            await mutations.unblockIp.mutateAsync(toUnblock.ipAddress);
            toast.success('Address unblocked.');
            setToUnblock(null);
          } catch (err) {
            toast.error(err.message);
          }
        }}
      />
    </div>
  );
}
