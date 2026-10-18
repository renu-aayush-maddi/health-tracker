import { HttpError } from '../utils/httpErrors.js';
import { findActiveBlock } from '../modules/admin/ipBlocklist.repository.js';
import { recordSecurityEvent } from '../modules/admin/audit.service.js';

/**
 * Rejects authentication attempts from blocked addresses. Applied to the account-facing auth
 * endpoints only, so an administrator cannot lock the whole API out by mistake.
 *
 * `req.ip` honours the configured TRUST_PROXY hop count, so a forged X-Forwarded-For from an
 * untrusted client is ignored rather than being taken as the client address.
 */
export async function rejectBlockedIp(req, res, next) {
  try {
    const block = await findActiveBlock(req.ip);
    if (!block) return next();
    await recordSecurityEvent(req, {
      email: typeof req.body?.email === 'string' ? req.body.email : null,
      type: 'LOGIN_BLOCKED_IP',
      failureReason: block.reason ?? 'IP blocked',
    });
    return next(
      new HttpError(403, 'IP_BLOCKED', 'Requests from your network are not allowed right now.'),
    );
  } catch (err) {
    return next(err);
  }
}
