import { Router } from 'express';
import {
  attachmentParamsSchema,
  updateAttachmentSchema,
  attachmentContentQuerySchema,
  calendarQuerySchema,
  eventParamsSchema,
  eventStatusSchema,
  healthEventSchema,
  listEventsQuerySchema,
  medicineParamsSchema,
  medicineSchema,
} from '@health-tracker/shared';
import { apiLimiter, uploadLimiter } from '../../middleware/rateLimiters.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireVerified } from '../../middleware/requireVerified.js';
import { validate } from '../../middleware/validate.js';
import * as attachments from '../attachments/attachment.controller.js';
import { parseUpload } from '../attachments/attachment.upload.js';
import * as medicines from '../medicines/medicine.controller.js';
import * as events from './healthEvent.controller.js';

export const healthEventsRouter = Router();

healthEventsRouter.use(requireAuth, requireVerified, apiLimiter);

healthEventsRouter.get('/', validate({ query: listEventsQuerySchema }), events.list);
healthEventsRouter.post('/', validate({ body: healthEventSchema }), events.create);
healthEventsRouter.get('/calendar', validate({ query: calendarQuerySchema }), events.calendar);
healthEventsRouter.get('/issues', events.issues);

const byEvent = validate({ params: eventParamsSchema });
healthEventsRouter.get('/:eventId', byEvent, events.getOne);
healthEventsRouter.put(
  '/:eventId',
  validate({ params: eventParamsSchema, body: healthEventSchema }),
  events.update,
);
healthEventsRouter.patch(
  '/:eventId',
  validate({ params: eventParamsSchema, body: eventStatusSchema }),
  events.updateStatus,
);
healthEventsRouter.delete('/:eventId', byEvent, events.remove);

// Medicines belong to an event; the event's ownership is verified on every call.
healthEventsRouter.get('/:eventId/medicines', byEvent, medicines.list);
healthEventsRouter.post(
  '/:eventId/medicines',
  validate({ params: eventParamsSchema, body: medicineSchema }),
  medicines.create,
);
healthEventsRouter.put(
  '/:eventId/medicines/:medicineId',
  validate({ params: medicineParamsSchema, body: medicineSchema }),
  medicines.update,
);
healthEventsRouter.delete(
  '/:eventId/medicines/:medicineId',
  validate({ params: medicineParamsSchema }),
  medicines.remove,
);

// Optional medical-record files. Ownership of the event (and file) is verified on every call.
healthEventsRouter.get('/:eventId/attachments', byEvent, attachments.list);
healthEventsRouter.post(
  '/:eventId/attachments',
  byEvent,
  uploadLimiter,
  parseUpload,
  attachments.upload,
);
healthEventsRouter.get(
  '/:eventId/attachments/:attachmentId/content',
  validate({ params: attachmentParamsSchema, query: attachmentContentQuerySchema }),
  attachments.content,
);
healthEventsRouter.patch(
  '/:eventId/attachments/:attachmentId',
  validate({ params: attachmentParamsSchema, body: updateAttachmentSchema }),
  attachments.updateTags,
);
healthEventsRouter.delete(
  '/:eventId/attachments/:attachmentId',
  validate({ params: attachmentParamsSchema }),
  attachments.remove,
);
