import { STATUS_LABELS, isUsableStatus } from '@health-tracker/shared';
import { HttpError } from '../utils/httpErrors.js';
import { deleteUserSessions } from '../modules/auth/session.repository.js';
import { clearSessionCookie } from '../modules/auth/session.service.js';

/**
 * Enforces account status on every authenticated request. This is what actually makes blocking
 * work: a blocked or disabled account loses API access immediately, and any sessions it still
 * holds are destroyed on the spot rather than waiting for them to expire.
 */
export async function requireActiveAccount(req, res, next) {
  const { status, status_reason: reason } = req.auth?.user ?? {};
  if (isUsableStatus(status)) return next();

  await deleteUserSessions(req.auth.userId, {}).catch((err) =>
    console.error(`Failed to revoke sessions for a ${status} account: ${err.message}`),
  );
  clearSessionCookie(res);

  const label = (STATUS_LABELS[status] ?? status).toLowerCase();
  return next(
    new HttpError(
      403,
      'ACCOUNT_NOT_ACTIVE',
      reason
        ? `Your account is ${label}. Reason: ${reason}`
        : `Your account is ${label}. Please contact support.`,
    ),
  );
}
