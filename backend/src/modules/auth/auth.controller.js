import { toPublicUser } from '../users/user.serializer.js';
import * as authService from './auth.service.js';
import * as verification from './verification.service.js';
import { endSession, revokeCurrentSession, startSession } from './session.service.js';
import { recordSecurityEvent } from '../admin/audit.service.js';

/** Everything the session and security log need about the calling device. */
const clientInfo = (req) => ({ userAgent: req.get('user-agent'), ipAddress: req.ip });

export async function register(req, res) {
  const user = await authService.registerUser(req.valid.body);
  await verification.issueCode(user); // emails the 6-digit code
  await revokeCurrentSession(req); // don't leave a previous session on this browser alive
  await startSession(res, { userId: user.id, ...clientInfo(req) });
  await recordSecurityEvent(req, {
    userId: user.id,
    email: user.email,
    type: 'REGISTERED',
    success: true,
  });
  res.status(201).json({ user: toPublicUser(user) });
}

export async function login(req, res) {
  const { email } = req.valid.body;
  let user;
  try {
    user = await authService.authenticate(req.valid.body);
  } catch (err) {
    await recordSecurityEvent(req, {
      email,
      type: err.code === 'ACCOUNT_NOT_ACTIVE' ? 'LOGIN_BLOCKED_ACCOUNT' : 'LOGIN_FAILED',
      failureReason: err.code ?? 'UNKNOWN',
    });
    throw err;
  }

  if (!user.email_verified_at) await verification.ensureActiveCode(user);
  await revokeCurrentSession(req);
  await startSession(res, { userId: user.id, ...clientInfo(req) });
  await recordSecurityEvent(req, {
    userId: user.id,
    email: user.email,
    type: 'LOGIN_SUCCESS',
    success: true,
    metadata: { role: user.role },
  });
  res.json({ user: toPublicUser(user) });
}

export async function logout(req, res) {
  await endSession(req, res);
  await recordSecurityEvent(req, { type: 'LOGOUT', success: true });
  res.status(204).end();
}

export function getSession(req, res) {
  res.json({ user: toPublicUser(req.auth.user) });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.valid.body;
  await authService.changePassword(
    { userId: req.auth.userId, currentPassword, newPassword, ...clientInfo(req) },
    res,
  );
  await recordSecurityEvent(req, {
    userId: req.auth.userId,
    email: req.auth.user.email,
    type: 'PASSWORD_CHANGED',
    success: true,
  });
  res.status(204).end();
}

export async function forgotPassword(req, res) {
  await authService.requestPasswordReset(req.valid.body);
  await recordSecurityEvent(req, {
    email: req.valid.body.email,
    type: 'PASSWORD_RESET_REQUESTED',
    success: true,
  });
  res.status(202).json({
    message: 'If an account exists for that email, we sent a link to reset your password.',
  });
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.valid.body);
  await recordSecurityEvent(req, { type: 'PASSWORD_RESET_COMPLETED', success: true });
  res.status(204).end();
}

export async function verifyEmail(req, res) {
  if (req.auth.user.email_verified_at) return res.json({ user: toPublicUser(req.auth.user) });
  let user;
  try {
    user = await verification.verifyCode(req.auth.user, req.valid.body.code);
  } catch (err) {
    await recordSecurityEvent(req, {
      userId: req.auth.userId,
      email: req.auth.user.email,
      type: 'EMAIL_VERIFICATION_FAILED',
      failureReason: err.code ?? 'INVALID_CODE',
    });
    throw err;
  }
  await recordSecurityEvent(req, {
    userId: user.id,
    email: user.email,
    type: 'EMAIL_VERIFIED',
    success: true,
  });
  res.json({ user: toPublicUser(user) });
}

export async function resendVerification(req, res) {
  if (!req.auth.user.email_verified_at) await verification.resendCode(req.auth.user);
  res.status(202).json({ message: 'A new code is on its way.' });
}
