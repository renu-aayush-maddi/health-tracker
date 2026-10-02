import { Router } from 'express';
import { medicineNamesQuerySchema } from '@health-tracker/shared';
import { apiLimiter } from '../../middleware/rateLimiters.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireVerified } from '../../middleware/requireVerified.js';
import { validate } from '../../middleware/validate.js';
import * as medicines from './medicine.controller.js';

export const medicinesRouter = Router();

medicinesRouter.use(requireAuth, requireVerified, apiLimiter);
medicinesRouter.get('/names', validate({ query: medicineNamesQuerySchema }), medicines.names);
