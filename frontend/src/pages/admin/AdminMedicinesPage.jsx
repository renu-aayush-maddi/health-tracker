import { useState } from 'react';
import { Lock, Pill } from 'lucide-react';
import DataTable from '../../components/admin/DataTable.jsx';
import FilterBar from '../../components/admin/FilterBar.jsx';
import Pagination from '../../components/admin/Pagination.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { useAdminMedicines } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { formatDay } from '../../utils/adminFormat.js';
import styles from '../../components/admin/Admin.module.css';

const EMPTY = { q: '', page: 1 };
const FIELDS = [{ name: 'q', type: 'search', placeholder: 'Search by medicine or account email…' }];

export default function AdminMedicinesPage() {
  usePageTitle('Admin · Medicines');
  const [filters, setFilters] = useState(EMPTY);
  const search = useDebouncedValue(filters.q.trim(), 300);
  const query = useAdminMedicines({ ...filters, q: search });

  const columns = [
    { key: 'userEmail', header: 'Account', render: (row) => row.userEmail },
    { key: 'name', header: 'Medicine', render: (row) => row.name },
    { key: 'dosage', header: 'Dosage', render: (row) => row.dosage ?? '—' },
    {
      key: 'frequency',
      header: 'Frequency',
      render: (row) => row.frequency ?? '—',
      hideBelow: 'md',
    },
    {
      key: 'startDate',
      header: 'From',
      render: (row) => formatDay(row.startDate),
      hideBelow: 'lg',
    },
    { key: 'endDate', header: 'To', render: (row) => formatDay(row.endDate), hideBelow: 'lg' },
    {
      key: 'createdAt',
      header: 'Recorded',
      render: (row) => formatDay(row.createdAt),
      hideBelow: 'md',
    },
  ];

  if (query.isError) {
    return (
      <>
        <PageHeader title="Medicines" />
        <ErrorState
          title="Unable to load medicine records."
          error={query.error}
          onRetry={query.refetch}
        />
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Medicines" description="Medicine records across accounts." />
      <Card>
        <div className={styles.privacyBanner}>
          <Lock size={18} aria-hidden="true" className={styles.privacyIcon} />
          <span>
            Medicine names are medical information. Viewing this page is recorded in the audit log.
          </span>
        </div>
      </Card>
      <FilterBar
        fields={FIELDS}
        values={filters}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY)}
        searchLabel="Search medicines"
      />
      <DataTable
        caption="Medicine records"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        loading={query.isPending}
        stale={query.isPlaceholderData}
        empty={<EmptyState icon={Pill} title="No medicine records match." />}
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
