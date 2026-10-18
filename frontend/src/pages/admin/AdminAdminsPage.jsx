import { useState } from 'react';
import { Link } from 'react-router';
import { ShieldPlus, Trash2 } from 'lucide-react';
import {
  HEALTH_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_LABELS,
} from '@health-tracker/shared';
import ReauthDialog from '../../components/admin/ReauthDialog.jsx';
import { AccountStatusBadge, RoleBadge } from '../../components/admin/StatusBadges.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import SelectField from '../../components/ui/SelectField.jsx';
import Skeleton, { SkeletonStack } from '../../components/ui/Skeleton.jsx';
import TextareaField from '../../components/ui/TextareaField.jsx';
import TextField from '../../components/ui/TextField.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAdminAdmins, useAdminMutations } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { formatDay } from '../../utils/adminFormat.js';
import styles from '../../components/admin/Admin.module.css';

export default function AdminAdminsPage() {
  usePageTitle('Admin · Administrators');
  const toast = useToast();
  const query = useAdminAdmins();
  const mutations = useAdminMutations();

  const [granting, setGranting] = useState(null);
  const [permission, setPermission] = useState(PERMISSIONS[0]);
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [reauthFor, setReauthFor] = useState(null);

  const runOrReauth = async (action, fn, successMessage) => {
    try {
      await fn();
      toast.success(successMessage);
      return true;
    } catch (err) {
      if (err.code === 'REAUTH_REQUIRED') {
        setReauthFor({ action, retry: fn, successMessage });
        return false;
      }
      setError(Object.values(err.fields ?? {})[0] ?? err.message);
      return false;
    }
  };

  if (query.isPending) {
    return (
      <SkeletonStack label="Loading administrators…">
        <Skeleton height={200} radius="var(--radius-lg)" />
      </SkeletonStack>
    );
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title="Admin management" />
        <ErrorState
          title="Unable to load administrators."
          error={query.error}
          onRetry={query.refetch}
        />
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Admin management"
        description="Administrative accounts and the permissions explicitly granted to them."
      />
      <Alert tone="info">
        Roles carry default permissions. Anything beyond them — in particular access to medical
        content — must be granted here, and can be given an expiry date. Granting and revoking both
        require your password and are written to the audit log.
      </Alert>

      {query.data.items.map((admin) => (
        <Card
          key={admin.id}
          title={admin.name}
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={ShieldPlus}
              onClick={() => {
                setGranting(admin);
                setError(null);
              }}
            >
              Grant permission
            </Button>
          }
        >
          <div className={styles.sectionRow}>
            <p className={styles.muted}>
              <Link to={`/admin/users/${admin.id}`}>{admin.email}</Link>
            </p>
            <div className={styles.rowActions}>
              <RoleBadge role={admin.role} />
              <AccountStatusBadge status={admin.status} />
            </div>
          </div>

          <p className={styles.statHint}>Role defaults: {ROLE_LABELS[admin.role]}</p>

          {admin.grants.length > 0 ? (
            <>
              <p className={styles.statHint}>Explicit grants</p>
              <ul className={styles.permissionList}>
                {admin.grants.map((grant) => (
                  <li
                    key={grant.permission}
                    className={`${styles.permissionChip} ${
                      HEALTH_PERMISSIONS.includes(grant.permission) ? styles.sensitiveChip : ''
                    }`}
                  >
                    {grant.permission}
                    {grant.expiresAt && ` · until ${formatDay(grant.expiresAt)}`}
                    {!grant.active && ' · expired'}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      iconOnly
                      onClick={() => setRevoking({ admin, permission: grant.permission })}
                    >
                      {`Revoke ${grant.permission} from ${admin.email}`}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.muted}>No extra permissions granted.</p>
          )}
        </Card>
      ))}

      <Dialog
        open={Boolean(granting)}
        onClose={() => setGranting(null)}
        size="md"
        title="Grant a permission"
        description={granting?.email}
        busy={mutations.grantPermission.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setGranting(null)}>
              Cancel
            </Button>
            <Button type="submit" form="grant-form" loading={mutations.grantPermission.isPending}>
              Grant
            </Button>
          </>
        }
      >
        <form
          id="grant-form"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            const done = await runOrReauth(
              'grant this permission',
              () =>
                mutations.grantPermission.mutateAsync({
                  userId: granting.id,
                  body: { permission, expiresAt: expiresAt || null, reason: reason || null },
                }),
              'Permission granted.',
            );
            if (done) {
              setGranting(null);
              setReason('');
              setExpiresAt('');
            }
          }}
        >
          {error && <Alert>{error}</Alert>}
          {HEALTH_PERMISSIONS.includes(permission) && (
            <Alert tone="info">
              This grants access to other people&apos;s medical information. Prefer a short expiry.
            </Alert>
          )}
          <SelectField
            label="Permission"
            options={PERMISSIONS.map((p) => ({
              value: p,
              label: `${p} — ${PERMISSION_DESCRIPTIONS[p]}`,
            }))}
            value={permission}
            onChange={(event) => setPermission(event.target.value)}
          />
          <TextField
            label="Expires on (optional)"
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            hint="Leave empty for a permanent grant."
          />
          <TextareaField
            label="Reason"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            hint="Recorded in the audit log."
          />
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(revoking)}
        title="Revoke this permission?"
        description={revoking ? `${revoking.permission} from ${revoking.admin.email}` : ''}
        confirmLabel="Revoke"
        loading={mutations.revokePermission.isPending}
        onCancel={() => setRevoking(null)}
        onConfirm={async () => {
          const done = await runOrReauth(
            'revoke this permission',
            () =>
              mutations.revokePermission.mutateAsync({
                userId: revoking.admin.id,
                permission: revoking.permission,
              }),
            'Permission revoked.',
          );
          if (done) setRevoking(null);
        }}
      />

      <ReauthDialog
        open={Boolean(reauthFor)}
        action={reauthFor?.action}
        onCancel={() => setReauthFor(null)}
        onConfirmed={async () => {
          const pending = reauthFor;
          setReauthFor(null);
          try {
            await pending.retry();
            toast.success(pending.successMessage);
            setGranting(null);
            setRevoking(null);
          } catch (err) {
            toast.error(err.message);
          }
        }}
      />
    </div>
  );
}
