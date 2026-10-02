import { withTransaction } from '../../db/pool.js';
import { badRequest, notFound } from '../../utils/httpErrors.js';
import * as attachmentRepo from '../attachments/attachment.repository.js';
import { removeStoredFiles } from '../attachments/attachment.service.js';
import * as medicineRepo from '../medicines/medicine.repository.js';
import * as eventRepo from './healthEvent.repository.js';
import { toCalendarEvent, toEvent, toEventSummary } from './healthEvent.serializer.js';

const eventNotFound = () => notFound('Health event not found.');

export async function listEvents(userId, filters) {
  const { rows, total } = await eventRepo.listEvents(userId, filters);
  return { items: rows.map(toEventSummary), page: filters.page, pageSize: filters.pageSize, total };
}

export async function getEvent(userId, eventId) {
  const event = await eventRepo.findEvent(userId, eventId);
  if (!event) throw eventNotFound();
  const [medicines, attachments] = await Promise.all([
    medicineRepo.listMedicines(userId, eventId),
    attachmentRepo.listAttachments(userId, eventId),
  ]);
  return toEvent(event, medicines, attachments);
}

export async function createEvent(userId, data) {
  return withTransaction(async (client) => {
    const event = await eventRepo.insertEvent(userId, data, client);
    const medicines = [];
    for (const [index, medicine] of data.medicines.entries()) {
      medicines.push(await medicineRepo.insertMedicine(userId, event.id, medicine, index, client));
    }
    return toEvent(event, medicines);
  });
}

/**
 * Replaces every field of the event and syncs its medicines: listed medicines with an id are
 * updated, ones without an id are created, and any not listed are deleted. All or nothing.
 */
export async function updateEvent(userId, eventId, data) {
  return withTransaction(async (client) => {
    const event = await eventRepo.updateEvent(userId, eventId, data, client);
    if (!event) throw eventNotFound();

    const existingIds = new Set(await medicineRepo.listMedicineIds(userId, eventId, client));
    const keepIds = [];
    data.medicines.forEach((medicine, index) => {
      if (!medicine.id) return;
      if (!existingIds.has(medicine.id)) {
        throw badRequest(undefined, {
          [`medicines.${index}.id`]: 'This medicine does not belong to this event.',
        });
      }
      keepIds.push(medicine.id);
    });

    await medicineRepo.deleteMedicinesExcept(userId, eventId, keepIds, client);
    for (const [index, medicine] of data.medicines.entries()) {
      if (medicine.id) {
        await medicineRepo.updateMedicine(userId, eventId, medicine.id, medicine, index, client);
      } else {
        await medicineRepo.insertMedicine(userId, eventId, medicine, index, client);
      }
    }

    return toEvent(
      event,
      await medicineRepo.listMedicines(userId, eventId, client),
      await attachmentRepo.listAttachments(userId, eventId, client),
    );
  });
}

export async function updateEventStatus(userId, eventId, { status, endDate }) {
  const current = await eventRepo.findEvent(userId, eventId);
  if (!current) throw eventNotFound();
  if (endDate && endDate < current.start_date) {
    throw badRequest(undefined, { endDate: 'End date cannot be earlier than start date.' });
  }
  const event = await eventRepo.updateEventStatus(userId, eventId, { status, endDate });
  if (!event) throw eventNotFound();
  return toEvent(
    event,
    await medicineRepo.listMedicines(userId, eventId),
    await attachmentRepo.listAttachments(userId, eventId),
  );
}

export async function deleteEvent(userId, eventId) {
  const files = await attachmentRepo.listStoredFiles(userId, { eventId });
  if (!(await eventRepo.deleteEvent(userId, eventId))) throw eventNotFound();
  await removeStoredFiles(files);
}

export async function listCalendarEvents(userId, range) {
  return (await eventRepo.listCalendarEvents(userId, range)).map(toCalendarEvent);
}

export function listIssues(userId) {
  return eventRepo.listIssues(userId);
}
