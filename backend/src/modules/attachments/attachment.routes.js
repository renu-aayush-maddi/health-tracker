import { Router } from 'express';
import { listAttachmentsQuerySchema } from '@health-tracker/shared';
import { apiLimiter } from '../../middleware/rateLimiters.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireVerified } from '../../middleware/requireVerified.js';
import { validate } from '../../middleware/validate.js';
import * as attachments from './attachment.controller.js';

/** Cross-event views of the user's own files ("Records"). Per-file actions live under /health-events. */
export const attachmentsRouter = Router();

attachmentsRouter.use(requireAuth, requireVerified, apiLimiter);
attachmentsRouter.get('/', validate({ query: listAttachmentsQuerySchema }), attachments.records);
attachmentsRouter.get('/tags', attachments.tags);
