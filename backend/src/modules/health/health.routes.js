import { Router } from 'express';

export const healthRouter = Router();

// Used by Render's health check. Deliberately reveals nothing about the DB or versions.
healthRouter.get('/', (req, res) => {
  res.json({ status: 'ok' });
});
