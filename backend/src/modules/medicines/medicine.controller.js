import * as service from './medicine.service.js';

export async function list(req, res) {
  res.json({ items: await service.listMedicines(req.auth.userId, req.valid.params.eventId) });
}

export async function create(req, res) {
  res
    .status(201)
    .json(await service.addMedicine(req.auth.userId, req.valid.params.eventId, req.valid.body));
}

export async function update(req, res) {
  const { eventId, medicineId } = req.valid.params;
  res.json(await service.updateMedicine(req.auth.userId, eventId, medicineId, req.valid.body));
}

export async function remove(req, res) {
  const { eventId, medicineId } = req.valid.params;
  await service.deleteMedicine(req.auth.userId, eventId, medicineId);
  res.status(204).end();
}

export async function names(req, res) {
  res.json({ items: await service.listMedicineNames(req.auth.userId, req.valid.query.q) });
}
