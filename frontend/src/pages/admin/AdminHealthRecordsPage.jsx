import { useState } from 'react';
import { FolderLock, Lock } from 'lucide-react';
import DataTable from '../../components/admin/DataTable.jsx';
import FilterBar from '../../components/admin/FilterBar.jsx';
import Pagination from '../../components/admin/Pagination.jsx';
import { SeverityBadge, StatusBadge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { useAdminHealthRecords } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { adminService } from '../../services/adminService.js';
import { formatDay, formatTimestamp } from '../../utils/adminFormat.js';
import styles from '../../components/admin/Admin.module.css';

const EMPTY = { q: '', from: '', to: '', page: 1 };

const FIELDS = [
  { name: 'q', type: 'search', placeholder: 'Search by account email or health issue…' },
  { name: 'from', type: 'date', label: 'Started from' },
  { name: 'to', type: 'date', label: 'Started to' },
];

/** Opening a record is a deliberate, recorded act, so it is behind an explicit confirmation. */
function RecordDialog({ record, onClose }) {
  const [detail, setDetail] = useState(null);
  const [state, setState] = useState('warning'); // warning | loading | shown | error
  const [error, setError] = useState(null);

  const open = async () => {
    setState('loading');
    try {
      setDetail(await adminService.healthRecord(record.id));
      setState('shown');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  const close = () => {
    setDetail(null);
    setState('warning');
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={Boolean(record)}
      onClose={close}
      size="md"
      title={state === 'shown' ? detail.title : 'Open this health record?'}
      busy={state === 'loading'}
      footer={
        state === 'shown' ? (
          <Button onClick={close} data-autofocus>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} data-autofocus>
              Cancel
            </Button>
            <Button onClick={open} loading={state === 'loading'}>
              Open record
            </Button>
          </>
        )
      }
    >
      {state !== 'shown' ? (
        <div className={styles.privacyBanner}>
          <Lock size={18} aria-hidden="true" className={styles.privacyIcon} />
          <span>
            You are about to read another person&apos;s medical information. This is recorded in the
            audit log with your name, their account, this record and the time. Open it only if an
            administrative task genuinely requires it.
            {error && <strong> {error}</strong>}
          </span>
        </div>
      ) : (
        <div className={styles.page}>
          <p className={styles.muted}>
            {detail.userEmail} · {formatDay(detail.startDate)} →{' '}
            {detail.endDate ? formatDay(detail.endDate) : 'ongoing'}
          </p>
          <div className={styles.rowActions}>
            <StatusBadge status={detail.status} />
            <SeverityBadge severity={detail.severity} />
          </div>
          <dl className={styles.definition}>
            <dt>Health issue</dt>
            <dd>{detail.healthIssue}</dd>
            {detail.description && (
              <>
                <dt>Description</dt>
                <dd>{detail.description}</dd>
              </>
            )}
            {detail.symptoms.length > 0 && (
              <>
                <dt>Symptoms</dt>
                <dd>{detail.symptoms.join(', ')}</dd>
              </>
            )}
            {detail.notes && (
              <>
                <dt>Notes</dt>
                <dd>{detail.notes}</dd>
              </>
            )}
            <dt>Medicines</dt>
            <dd>
              {detail.medicines.length === 0
                ? 'None recorded'
                : detail.medicines
                    .map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(' · '))
                    .join('; ')}
            </dd>
            <dt>Files</dt>
            <dd>{detail.attachments.length} attached (not opened here)</dd>
          </dl>
        </div>
      )}
    </Dialog>
  );
}

export default function AdminHealthRecordsPage() {
  usePageTitle('Admin · Health records');
  const [filters, setFilters] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const search = useDebouncedValue(filters.q.trim(), 300);
  const query = useAdminHealthRecords({ ...filters, q: search });

  const columns = [
    { key: 'userEmail', header: 'Account', render: (row) => row.userEmail },
    { key: 'healthIssue', header: 'Health issue', render: (row) => row.healthIssue },
    { key: 'startDate', header: 'Started', render: (row) => formatDay(row.startDate) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'medicineCount',
      header: 'Medicines',
      align: 'right',
      render: (row) => row.medicineCount,
      hideBelow: 'md',
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (row) => formatTimestamp(row.updatedAt),
      hideBelow: 'lg',
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button variant="ghost" size="sm" icon={Lock} onClick={() => setSelected(row)}>
          Open
        </Button>
      ),
    },
  ];

  if (query.isError) {
    return (
      <>
        <PageHeader title="Health records" />
        <ErrorState
          title="Unable to load health records."
          error={query.error}
          onRetry={query.refetch}
        />
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Health records"
        description="Index of health events across accounts, for support and troubleshooting."
      />
      <Card>
        <div className={styles.privacyBanner}>
          <Lock size={18} aria-hidden="true" className={styles.privacyIcon} />
          <span>
            This list shows metadata only — the owner, the health issue, dates and counts. Opening a
            record reveals someone&apos;s medical information and is permanently recorded in the
            audit log.
          </span>
        </div>
      </Card>
      <FilterBar
        fields={FIELDS}
        values={filters}
        onChange={setFilters}
        onClear={() => setFilters({ ...EMPTY, q: filters.q })}
        searchLabel="Search health records"
      />
      <DataTable
        caption="Health records"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        loading={query.isPending}
        stale={query.isPlaceholderData}
        empty={<EmptyState icon={FolderLock} title="No records match." />}
      />
      {query.data && (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onChange={(page) => setFilters((f) => ({ ...f, page }))}
        />
      )}

      {selected && <RecordDialog record={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
