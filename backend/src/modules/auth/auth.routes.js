import { Router } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@health-tracker/shared';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validate } from '../../middleware/validate.js';
import {
  forgotPasswordEmailLimiter,
  forgotPasswordIpLimiter,
  loginLimiter,
  passwordChangeLimiter,
  registerLimiter,
} from '../../middleware/rateLimiters.js';
import * as controller from './auth.controller.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  registerLimiter,
  validate({ body: registerSchema }),
  controller.register,
);
authRouter.post('/login', loginLimiter, validate({ body: loginSchema }), controller.login);
authRouter.post('/logout', controller.logout);
authRouter.get('/session', requireAuth, controller.getSession);
authRouter.post(
  '/change-password',
  requireAuth,
  passwordChangeLimiter,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);
authRouter.post(
  '/forgot-password',
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  validate({ body: forgotPasswordSchema }),
  controller.forgotPassword,
);
authRouter.post(
  '/reset-password',
  passwordChangeLimiter,
  validate({ body: resetPasswordSchema }),
  controller.resetPassword,
);
