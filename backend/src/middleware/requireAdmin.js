import { ADMIN_ROLES } from '@health-tracker/shared';
import { HttpError } from '../utils/httpErrors.js';
import { REAUTH_WINDOW_MINUTES, resolvePermissions } from '../modules/admin/permission.service.js';

const forbidden = (message = 'You do not have access to this area.') =>
  new HttpError(403, 'FORBIDDEN', message);

/** Gate for /api/admin: the account must hold an administrative role. Use after requireAuth. */
export function requireAdmin(req, res, next) {
  if (!ADMIN_ROLES.includes(req.auth?.user?.role)) return next(forbidden());
  next();
}

/** Loads the effective permission set once per request and caches it on req.auth. */
async function permissionsFor(req) {
  req.auth.permissions ??= await resolvePermissions(req.auth.user);
  return req.auth.permissions;
}

/**
 * Authorizes one permission. This is the only thing that decides access — hiding a button in the
 * UI is presentation, not security.
 */
export function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const permissions = await permissionsFor(req);
      if (!permissions.has(permission)) {
        return next(forbidden(`This action requires the "${permission}" permission.`));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Demands a recent password re-entry. Applied to the handful of destructive or privilege-granting
 * routes — deliberately separate from `requirePermission`, so that merely *reading* a page never
 * asks for a password.
 */
export function requireRecentAuth(req, res, next) {
  if (hasRecentAuth(req)) return next();
  return next(new HttpError(403, 'REAUTH_REQUIRED', 'Please confirm your password to continue.'));
}

function hasRecentAuth(req) {
  const at = req.auth?.session?.reauth_at;
  return Boolean(at) && Date.now() - new Date(at).getTime() < REAUTH_WINDOW_MINUTES * 60_000;
}

export { hasRecentAuth, permissionsFor };
