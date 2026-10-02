import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { noStore, requireSameOrigin } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthEventsRouter } from './modules/healthEvents/healthEvent.routes.js';
import { medicinesRouter } from './modules/medicines/medicine.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { usersRouter } from './modules/users/user.routes.js';
import { featuresRouter } from './modules/attachments/attachment.features.js';
import { attachmentsRouter } from './modules/attachments/attachment.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Number of proxy hops in front of the API (Render), so req.ip is the real client for rate limits.
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    helmet({
      // The API only serves JSON, so it gets the strictest possible policy.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  if (!config.isTest) app.use(requestLogger);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(noStore);
  api.use(requireSameOrigin);
  api.use('/health', healthRouter);
  api.use('/auth', authRouter);
  api.use('/health-events', healthEventsRouter);
  api.use('/medicines', medicinesRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/users', usersRouter);
  api.use('/features', featuresRouter);
  api.use('/attachments', attachmentsRouter);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
