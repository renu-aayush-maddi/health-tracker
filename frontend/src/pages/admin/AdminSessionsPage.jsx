import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarClock, LogOut } from 'lucide-react';
import DataTable from '../../components/admin/DataTable.jsx';
import Pagination from '../../components/admin/Pagination.jsx';
import { RoleBadge } from '../../components/admin/StatusBadges.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAdminMe, useAdminMutations, useAdminSessions } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { describeUserAgent, formatRelative, formatTimestamp } from '../../utils/adminFormat.js';
import styles from '../../components/admin/Admin.module.css';

export default function AdminSessionsPage() {
  usePageTitle('Admin · Sessions');
  const [params] = useSearchParams();
  const me = useAdminMe();
  const toast = useToast();
  const mutations = useAdminMutations();
  const [page, setPage] = useState(1);
  const [toRevoke, setToRevoke] = useState(null);

  // An account id may arrive from the user detail page; it is an opaque UUID, not health data.
  const userId = params.get('userId') ?? '';
  const query = useAdminSessions({ userId, page });

  const columns = [
    { key: 'userEmail', header: 'Account', render: (row) => row.userEmail },
    { key: 'userRole', header: 'Role', render: (row) => <RoleBadge role={row.userRole} /> },
    {
      key: 'createdAt',
      header: 'Started',
      render: (row) => formatTimestamp(row.createdAt),
      hideBelow: 'md',
    },
    { key: 'lastUsedAt', header: 'Last used', render: (row) => formatRelative(row.lastUsedAt) },
    { key: 'ipAddress', header: 'IP', render: (row) => row.ipAddress ?? '—', hideBelow: 'md' },
    {
      key: 'userAgent',
      header: 'Device',
      render: (row) => describeUserAgent(row.userAgent),
      hideBelow: 'lg',
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) =>
        me.can('sessions.revoke') ? (
          <Button variant="ghost" size="sm" icon={LogOut} onClick={() => setToRevoke(row)}>
            Revoke
          </Button>
        ) : null,
    },
  ];

  if (query.isError) {
    return (
      <>
        <PageHeader title="Sessions" />
        <ErrorState title="Unable to load sessions." error={query.error} onRetry={query.refetch} />
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Sessions"
        description={userId ? 'Active sessions for one account.' : 'All active sessions.'}
      />
      <Alert tone="info">Session tokens are never shown here, or stored in a readable form.</Alert>
      <DataTable
        caption="Active sessions"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        loading={query.isPending}
        stale={query.isPlaceholderData}
        empty={<EmptyState icon={CalendarClock} title="No active sessions." />}
      />
      {query.data && (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onChange={setPage}
        />
      )}

      <ConfirmDialog
        open={Boolean(toRevoke)}
        title="Revoke this session?"
        description={
          toRevoke
            ? `${toRevoke.userEmail} will be signed out on ${describeUserAgent(toRevoke.userAgent)}.`
            : ''
        }
        confirmLabel="Revoke"
        loading={mutations.revokeSession.isPending}
        onCancel={() => setToRevoke(null)}
        onConfirm={async () => {
          try {
            await mutations.revokeSession.mutateAsync(toRevoke.id);
            toast.success('Session revoked.');
            setToRevoke(null);
          } catch (err) {
            toast.error(err.message);
          }
        }}
      />
    </div>
  );
}
