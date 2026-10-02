import * as service from './healthEvent.service.js';

// The user is always req.auth.userId (from the session). Nothing from the request body,
// query or URL is ever used as a user identifier.

export async function list(req, res) {
  res.json(await service.listEvents(req.auth.userId, req.valid.query));
}

export async function calendar(req, res) {
  res.json({ items: await service.listCalendarEvents(req.auth.userId, req.valid.query) });
}

export async function issues(req, res) {
  res.json({ items: await service.listIssues(req.auth.userId) });
}

export async function getOne(req, res) {
  res.json(await service.getEvent(req.auth.userId, req.valid.params.eventId));
}

export async function create(req, res) {
  res.status(201).json(await service.createEvent(req.auth.userId, req.valid.body));
}

export async function update(req, res) {
  res.json(await service.updateEvent(req.auth.userId, req.valid.params.eventId, req.valid.body));
}

export async function updateStatus(req, res) {
  res.json(
    await service.updateEventStatus(req.auth.userId, req.valid.params.eventId, req.valid.body),
  );
}

export async function remove(req, res) {
  await service.deleteEvent(req.auth.userId, req.valid.params.eventId);
  res.status(204).end();
}
