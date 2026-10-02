import { withTransaction } from '../../db/pool.js';
import { notFound } from '../../utils/httpErrors.js';
import * as eventRepo from '../healthEvents/healthEvent.repository.js';
import { toMedicine } from '../healthEvents/healthEvent.serializer.js';
import * as medicineRepo from './medicine.repository.js';

const eventNotFound = () => notFound('Health event not found.');
const medicineNotFound = () => notFound('Medicine not found.');

async function assertEventOwned(userId, eventId, db) {
  if (!(await eventRepo.findEvent(userId, eventId, db))) throw eventNotFound();
}

export async function listMedicines(userId, eventId) {
  await assertEventOwned(userId, eventId);
  return (await medicineRepo.listMedicines(userId, eventId)).map(toMedicine);
}

export async function addMedicine(userId, eventId, medicine) {
  return withTransaction(async (client) => {
    await assertEventOwned(userId, eventId, client);
    const order = await medicineRepo.nextSortOrder(userId, eventId, client);
    const row = await medicineRepo.insertMedicine(userId, eventId, medicine, order, client);
    await eventRepo.touchEvent(userId, eventId, client);
    return toMedicine(row);
  });
}

export async function updateMedicine(userId, eventId, medicineId, medicine) {
  return withTransaction(async (client) => {
    const row = await medicineRepo.updateMedicine(
      userId,
      eventId,
      medicineId,
      medicine,
      null,
      client,
    );
    if (!row) throw medicineNotFound();
    await eventRepo.touchEvent(userId, eventId, client);
    return toMedicine(row);
  });
}

export async function deleteMedicine(userId, eventId, medicineId) {
  return withTransaction(async (client) => {
    if (!(await medicineRepo.deleteMedicine(userId, eventId, medicineId, client)))
      throw medicineNotFound();
    await eventRepo.touchEvent(userId, eventId, client);
  });
}

export function listMedicineNames(userId, search) {
  return medicineRepo.listMedicineNames(userId, search);
}
