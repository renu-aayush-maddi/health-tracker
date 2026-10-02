import { toPublicUser } from '../users/user.serializer.js';
import * as authService from './auth.service.js';
import { endSession, revokeCurrentSession, startSession } from './session.service.js';

export async function register(req, res) {
  const user = await authService.registerUser(req.valid.body);
  await revokeCurrentSession(req); // don't leave a previous session on this browser alive
  await startSession(res, { userId: user.id, userAgent: req.get('user-agent') });
  res.status(201).json({ user: toPublicUser(user) });
}

export async function login(req, res) {
  const user = await authService.authenticate(req.valid.body);
  await revokeCurrentSession(req);
  await startSession(res, { userId: user.id, userAgent: req.get('user-agent') });
  res.json({ user: toPublicUser(user) });
}

export async function logout(req, res) {
  await endSession(req, res);
  res.status(204).end();
}

export function getSession(req, res) {
  res.json({ user: toPublicUser(req.auth.user) });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.valid.body;
  await authService.changePassword(
    { userId: req.auth.userId, currentPassword, newPassword, userAgent: req.get('user-agent') },
    res,
  );
  res.status(204).end();
}

export async function forgotPassword(req, res) {
  await authService.requestPasswordReset(req.valid.body);
  res.status(202).json({
    message: 'If an account exists for that email, we sent a link to reset your password.',
  });
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.valid.body);
  res.status(204).end();
}
