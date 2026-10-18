import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, KeyRound, LogOut, ShieldBan, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import {
  ACCOUNT_STATUSES,
  ROLES,
  ROLE_LABELS,
  STATUS_LABELS,
  humanizeEvent,
} from '@health-tracker/shared';
import ReasonDialog from '../../components/admin/ReasonDialog.jsx';
import ReauthDialog from '../../components/admin/ReauthDialog.jsx';
import { AccountStatusBadge, RoleBadge } from '../../components/admin/StatusBadges.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import SelectField from '../../components/ui/SelectField.jsx';
import Skeleton, { SkeletonStack } from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAdminMe, useAdminMutations, useAdminUser } from '../../hooks/useAdmin.js';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { formatRelative, formatTimestamp } from '../../utils/adminFormat.js';
import styles from '../../components/admin/Admin.module.css';

export default function AdminUserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useAdminMe();
  const query = useAdminUser(userId);
  const mutations = useAdminMutations();

  const [dialog, setDialog] = useState(null); // 'status' | 'role' | 'delete' | 'logout'
  const [nextStatus, setNextStatus] = useState('blocked');
  const [nextRole, setNextRole] = useState('admin');
  const [reauthFor, setReauthFor] = useState(null);

  usePageTitle(query.data ? `Admin · ${query.data.email}` : 'Admin · Account');

  const back = (
    <Button variant="ghost" size="sm" icon={ArrowLeft} to="/admin/users">
      Back to users
    </Button>
  );

  if (query.isPending) {
    return (
      <>
        {back}
        <SkeletonStack label="Loading account…">
          <Skeleton height={200} radius="var(--radius-lg)" />
        </SkeletonStack>
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        {back}
        <ErrorState
          title="Unable to load this account."
          error={query.error}
          onRetry={query.refetch}
        />
      </>
    );
  }

  const user = query.data;
  const self = me.data?.user?.id === user.id;

  /** Runs an action, and if the API asks for re-authentication, prompts and retries it. */
  const run = async (action, fn, successMessage) => {
    try {
      await fn();
      toast.success(successMessage);
      setDialog(null);
      return true;
    } catch (err) {
      if (err.code === 'REAUTH_REQUIRED') {
        setReauthFor({ action, retry: fn, successMessage });
        return false;
      }
      throw err;
    }
  };

  const onReauthConfirmed = async () => {
    const pending = reauthFor;
    setReauthFor(null);
    if (!pending) return;
    try {
      await pending.retry();
      toast.success(pending.successMessage);
      setDialog(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className={styles.page}>
      {back}

      <div className={styles.sectionRow}>
        <div>
          <h1>{user.name}</h1>
          <p className={styles.muted}>{user.email}</p>
        </div>
        <div className={styles.rowActions}>
          <RoleBadge role={user.role} />
          <AccountStatusBadge status={user.status} />
        </div>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.page}>
          <Card title="Account">
            <dl className={styles.definition}>
              <dt>User ID</dt>
              <dd className={styles.mono}>{user.id}</dd>
              <dt>Created</dt>
              <dd>{formatTimestamp(user.createdAt)}</dd>
              <dt>Last login</dt>
              <dd>
                {formatTimestamp(user.lastLoginAt)} ({formatRelative(user.lastLoginAt)})
              </dd>
              <dt>Last activity</dt>
              <dd>{formatRelative(user.lastActivityAt)}</dd>
              <dt>Email verified</dt>
              <dd>{user.emailVerified ? 'Yes' : 'No'}</dd>
              <dt>Password changed</dt>
              <dd>{formatTimestamp(user.passwordChangedAt)}</dd>
              {user.statusReason && (
                <>
                  <dt>Status reason</dt>
                  <dd>
                    {user.statusReason}
                    {user.statusChangedByEmail && ` — by ${user.statusChangedByEmail}`}
                  </dd>
                </>
              )}
            </dl>
          </Card>

          <Card title="Data held">
            <dl className={styles.definition}>
              <dt>Health events</dt>
              <dd>{user.healthEventCount}</dd>
              <dt>Medicines</dt>
              <dd>{user.medicineCount}</dd>
              <dt>Files</dt>
              <dd>{user.attachmentCount}</dd>
            </dl>
            <p className={styles.statHint}>
              Counts only. Opening medical content needs the health-record permission and is
              recorded.
            </p>
          </Card>

          <Card title="Activity">
            {user.activity.length === 0 ? (
              <p className={styles.muted}>No recorded activity yet.</p>
            ) : (
              <ul className={styles.timeline} tabIndex={0} aria-label="Account activity">
                {user.activity.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className={styles.timelineItem}>
                    <span className={styles.timelineTime}>{formatTimestamp(entry.at)}</span>
                    <span>
                      {humanizeEvent(entry.event)}
                      {entry.actorEmail && (
                        <span className={styles.muted}> by {entry.actorEmail}</span>
                      )}
                      {entry.ipAddress && (
                        <span className={styles.muted}> · {entry.ipAddress}</span>
                      )}
                      {entry.detail && <span className={styles.muted}> · {entry.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.statHint}>
              Event names only — the contents of health records never appear here.
            </p>
          </Card>
        </div>

        <div className={styles.page}>
          <Card title="Security">
            <dl className={styles.definition}>
              <dt>Last IP</dt>
              <dd className={styles.mono}>{user.lastIp ?? '—'}</dd>
              <dt>Failed logins (24h)</dt>
              <dd>{user.security.failedLoginsLast24h}</dd>
              <dt>Active sessions</dt>
              <dd>
                {user.sessionCount} <Link to={`/admin/sessions?userId=${user.id}`}>view</Link>
              </dd>
            </dl>
            {user.security.knownIps.length > 0 && (
              <>
                <p className={styles.statHint}>Known addresses</p>
                <ul className={styles.permissionList}>
                  {user.security.knownIps.map((ip) => (
                    <li key={ip.ipAddress} className={styles.permissionChip}>
                      {ip.ipAddress}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          {user.grants.length > 0 && (
            <Card title="Granted permissions">
              <ul className={styles.permissionList}>
                {user.grants.map((grant) => (
                  <li
                    key={grant.permission}
                    className={`${styles.permissionChip} ${grant.active ? '' : styles.sensitiveChip}`}
                  >
                    {grant.permission}
                    {!grant.active && ' (expired)'}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Actions">
            {self ? (
              <p className={styles.muted}>
                This is your own account — administrative actions on yourself are not permitted.
              </p>
            ) : (
              <div className={styles.page}>
                {me.can('users.block') && (
                  <div>
                    <SelectField
                      label="Set status"
                      options={ACCOUNT_STATUSES.filter((s) => s !== user.status).map((s) => ({
                        value: s,
                        label: STATUS_LABELS[s],
                      }))}
                      value={nextStatus}
                      onChange={(event) => setNextStatus(event.target.value)}
                    />
                    <Button
                      variant="secondary"
                      icon={nextStatus === 'active' ? ShieldCheck : ShieldBan}
                      onClick={() => setDialog('status')}
                    >
                      Apply status
                    </Button>
                  </div>
                )}

                {me.can('admins.manage') && (
                  <div>
                    <SelectField
                      label="Set role"
                      options={ROLES.filter((r) => r !== user.role).map((r) => ({
                        value: r,
                        label: ROLE_LABELS[r],
                      }))}
                      value={nextRole}
                      onChange={(event) => setNextRole(event.target.value)}
                    />
                    <Button variant="secondary" icon={UserCog} onClick={() => setDialog('role')}>
                      Change role
                    </Button>
                  </div>
                )}

                {me.can('sessions.revoke') && (
                  <Button variant="secondary" icon={LogOut} onClick={() => setDialog('logout')}>
                    Sign out everywhere
                  </Button>
                )}

                {me.can('users.update') && (
                  <Button
                    variant="secondary"
                    icon={KeyRound}
                    onClick={() =>
                      run(
                        'send a password reset',
                        () => mutations.triggerPasswordReset.mutateAsync(user.id),
                        'Password reset email sent.',
                      ).catch((err) => toast.error(err.message))
                    }
                  >
                    Send password reset
                  </Button>
                )}

                {me.can('users.delete') && (
                  <Button variant="danger" icon={Trash2} onClick={() => setDialog('delete')}>
                    Delete account…
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ReasonDialog
        open={dialog === 'status'}
        title={`Set status to ${STATUS_LABELS[nextStatus]}?`}
        description={user.email}
        consequences={
          nextStatus === 'active'
            ? ['Restore sign-in and API access']
            : [
                'Prevent sign-in',
                'Revoke every active session',
                'Deny API access',
                'Keep all health data',
              ]
        }
        confirmLabel={`Set ${STATUS_LABELS[nextStatus]}`}
        tone={nextStatus === 'active' ? 'primary' : 'danger'}
        reasonRequired={nextStatus !== 'active'}
        loading={mutations.changeStatus.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={({ reason }) =>
          run(
            'change this account’s status',
            () =>
              mutations.changeStatus.mutateAsync({
                userId: user.id,
                body: { status: nextStatus, reason },
              }),
            `Account is now ${STATUS_LABELS[nextStatus].toLowerCase()}.`,
          )
        }
      />

      <ReasonDialog
        open={dialog === 'role'}
        title={`Change role to ${ROLE_LABELS[nextRole]}?`}
        description={user.email}
        consequences={[`Grants the default permissions of ${ROLE_LABELS[nextRole]}`]}
        confirmLabel="Change role"
        tone="primary"
        reasonRequired={false}
        loading={mutations.changeRole.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={({ reason }) =>
          run(
            'change this account’s role',
            () =>
              mutations.changeRole.mutateAsync({
                userId: user.id,
                body: { role: nextRole, reason },
              }),
            `Role changed to ${ROLE_LABELS[nextRole]}.`,
          )
        }
      />

      <ReasonDialog
        open={dialog === 'delete'}
        title="Delete this account permanently?"
        description={`${user.email} — ${user.healthEventCount} health event(s), ${user.medicineCount} medicine(s), ${user.attachmentCount} file(s).`}
        consequences={[
          'Permanently delete the account and all of its health data',
          'Delete uploaded files from storage',
          'Keep the audit trail of this deletion',
        ]}
        confirmLabel="Delete account"
        confirmText={user.email}
        loading={mutations.deleteUser.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={async ({ reason, confirmText }) => {
          const done = await run(
            'delete this account',
            () =>
              mutations.deleteUser.mutateAsync({
                userId: user.id,
                body: { confirmEmail: confirmText, reason },
              }),
            'Account deleted.',
          );
          if (done) navigate('/admin/users', { replace: true });
        }}
      />

      <ConfirmDialog
        open={dialog === 'logout'}
        title="Sign this account out everywhere?"
        description="All active sessions are revoked. The account itself is unchanged and they can sign in again."
        confirmLabel="Sign out everywhere"
        tone="primary"
        loading={mutations.forceLogout.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          run(
            'revoke sessions',
            () => mutations.forceLogout.mutateAsync(user.id),
            'All sessions revoked.',
          ).catch((err) => toast.error(err.message))
        }
      />

      <ReauthDialog
        open={Boolean(reauthFor)}
        action={reauthFor?.action}
        onCancel={() => setReauthFor(null)}
        onConfirmed={onReauthConfirmed}
      />
    </div>
  );
}
