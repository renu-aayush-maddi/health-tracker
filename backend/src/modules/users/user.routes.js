import { Router } from 'express';
import { deleteAccountSchema, updateProfileSchema } from '@health-tracker/shared';
import { apiLimiter, exportLimiter, passwordChangeLimiter } from '../../middleware/rateLimiters.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireVerified } from '../../middleware/requireVerified.js';
import { validate } from '../../middleware/validate.js';
import { badRequest } from '../../utils/httpErrors.js';
import { verifyPassword } from '../../utils/passwords.js';
import { listStoredFiles } from '../attachments/attachment.repository.js';
import { removeStoredFiles } from '../attachments/attachment.service.js';
import { clearSessionCookie } from '../auth/session.service.js';
import { fetchUserExport } from '../export/export.repository.js';
import { buildWorkbook } from '../export/workbook.js';
import * as users from './user.repository.js';
import { toPublicUser } from './user.serializer.js';

export const usersRouter = Router();

usersRouter.use(requireAuth, apiLimiter);

usersRouter.get('/me', (req, res) => {
  res.json({ user: toPublicUser(req.auth.user) });
});

/** "Download my data": an Excel copy of this user's own records (text and file details only). */
usersRouter.get('/me/export', requireVerified, exportLimiter, async (req, res) => {
  const generatedAt = new Date();
  const workbook = await buildWorkbook(await fetchUserExport(req.auth.userId), {
    scope: 'user',
    generatedAt,
  });
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="health-tracker-${generatedAt.toISOString().slice(0, 10)}.xlsx"`,
    'Cache-Control': 'private, no-store',
  });
  res.send(workbook);
});

usersRouter.patch('/me', validate({ body: updateProfileSchema }), async (req, res) => {
  const user = await users.updateUserProfile(req.auth.userId, req.valid.body);
  res.json({ user: toPublicUser(user) });
});

/** Permanently deletes the account; sessions, events, medicines and files go with it. */
usersRouter.delete(
  '/me',
  passwordChangeLimiter,
  validate({ body: deleteAccountSchema }),
  async (req, res) => {
    const user = await users.findUserWithHashById(req.auth.userId);
    if (!(await verifyPassword(user.password_hash, req.valid.body.password))) {
      throw badRequest('Password is incorrect.', { password: 'Password is incorrect.' });
    }
    const files = await listStoredFiles(req.auth.userId);
    await users.deleteUser(req.auth.userId);
    await removeStoredFiles(files); // uploaded medical records go too
    clearSessionCookie(res);
    res.status(204).end();
  },
);
