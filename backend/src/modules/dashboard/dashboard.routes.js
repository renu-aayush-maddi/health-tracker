import { Router } from 'express';
import { apiLimiter } from '../../middleware/rateLimiters.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { getDashboard } from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', requireAuth, apiLimiter, async (req, res) => {
  res.json(await getDashboard(req.auth.userId));
});
