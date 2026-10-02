import { Router } from 'express';
import { config } from '../../config/env.js';
import { requireAuth } from '../../middleware/requireAuth.js';

/** Optional capabilities the UI should show or hide (e.g. uploads need storage configured). */
export const featuresRouter = Router();

featuresRouter.get('/', requireAuth, (req, res) => {
  res.json({ attachments: config.attachmentsEnabled });
});
