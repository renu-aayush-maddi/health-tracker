import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool } from '../src/db/pool.js';
import { createClient, registerUser, resetDatabase, server } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => pool.end());

const fever = (overrides = {}) => ({
  title: 'Fever after travel',
  healthIssue: 'Fever',
  description: 'High temperature in the evenings.',
  startDate: '2026-10-01',
  endDate: '2026-10-03',
  status: 'resolved',
  severity: 'moderate',
  symptoms: ['Body pain', 'Headache', 'High temperature'],
  notes: 'Rested at home.',
  medicines: [
    {
      name: 'Paracetamol',
      dosage: '500 mg',
      frequency: 'Twice a day',
      startDate: '2026-10-01',
      endDate: '2026-10-03',
      notes: 'Taken after food',
    },
  ],
  ...overrides,
});

async function createEvent(client, overrides) {
  const res = await client.post('/api/health-events').send(fever(overrides));
  expect(res.status).toBe(201);
  return res.body;
}

describe('creating and reading health events', () => {
  it('creates an event with its medicines and returns the full record', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);

    expect(event).toMatchObject({
      title: 'Fever after travel',
      healthIssue: 'Fever',
      startDate: '2026-10-01',
      endDate: '2026-10-03',
      status: 'resolved',
      severity: 'moderate',
      symptoms: ['Body pain', 'Headache', 'High temperature'],
    });
    expect(event.medicines).toHaveLength(1);
    expect(event.medicines[0]).toMatchObject({
      name: 'Paracetamol',
      dosage: '500 mg',
      frequency: 'Twice a day',
    });
    expect(event).not.toHaveProperty('userId');
    expect(event).not.toHaveProperty('user_id');

    const fetched = await client.get(`/api/health-events/${event.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(event);
  });

  it('accepts an ongoing event with no end date and a custom health issue', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client, {
      healthIssue: 'Pollen rash',
      title: 'Rash on arms',
      status: 'ongoing',
      endDate: null,
      severity: '',
      medicines: [],
    });
    expect(event).toMatchObject({
      healthIssue: 'Pollen rash',
      status: 'ongoing',
      endDate: null,
      severity: null,
    });
  });

  it('normalizes input: trims text, drops duplicate symptoms, turns blanks into null', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client, {
      title: '  Fever  ',
      description: '   ',
      symptoms: ['Headache', 'headache', ' Chills '],
      medicines: [{ name: ' Ibuprofen ', dosage: '', frequency: null }],
    });
    expect(event.title).toBe('Fever');
    expect(event.description).toBeNull();
    expect(event.symptoms).toEqual(['Headache', 'Chills']);
    expect(event.medicines[0]).toMatchObject({ name: 'Ibuprofen', dosage: null, frequency: null });
  });

  it.each([
    [{ endDate: '2026-09-30' }, 'endDate', 'End date cannot be earlier than start date.'],
    [
      { status: 'resolved', endDate: null },
      'endDate',
      'Add an end date, or mark the issue as ongoing.',
    ],
    [{ status: 'ongoing' }, 'endDate', "An ongoing issue can't have an end date."],
    [{ startDate: '2026-02-30' }, 'startDate', 'Start date must be a valid date.'],
    [{ startDate: 'yesterday' }, 'startDate', 'Start date must be a valid date.'],
    [{ title: '' }, 'title', 'Title is required.'],
    [{ healthIssue: undefined }, 'healthIssue', 'Health issue is required.'],
    [{ status: 'cured' }, 'status', 'Choose a status.'],
    [{ severity: 'extreme' }, 'severity', 'Choose a valid severity.'],
    [{ title: 'x'.repeat(151) }, 'title', 'Title must be 150 characters or fewer.'],
    [{ medicines: [{ name: '' }] }, 'medicines.0.name', 'Medicine name is required.'],
    [
      { medicines: [{ name: 'Paracetamol', startDate: '2026-10-03', endDate: '2026-10-01' }] },
      'medicines.0.endDate',
      'End date cannot be earlier than start date.',
    ],
  ])('rejects invalid data %o', async (override, field, message) => {
    const { client } = await registerUser();
    const res = await client.post('/api/health-events').send(fever(override));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields[field]).toBe(message);
  });

  it('returns 404 for unknown and malformed event IDs', async () => {
    const { client } = await registerUser();
    expect(
      (await client.get('/api/health-events/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404);
    expect((await client.get('/api/health-events/not-a-uuid')).status).toBe(404);
  });

  it('requires authentication for every health event endpoint', async () => {
    const anon = createClient();
    const id = '00000000-0000-4000-8000-000000000000';
    const requests = [
      () => anon.get('/api/health-events'),
      () => anon.post('/api/health-events').send(fever()),
      () => anon.get(`/api/health-events/${id}`),
      () => anon.put(`/api/health-events/${id}`).send(fever()),
      () => anon.patch(`/api/health-events/${id}`).send({ status: 'ongoing' }),
      () => anon.delete(`/api/health-events/${id}`),
      () => anon.get('/api/health-events/calendar?from=2026-10-01&to=2026-10-31'),
      () => anon.get('/api/health-events/issues'),
      () => anon.get(`/api/health-events/${id}/medicines`),
      () => anon.get('/api/medicines/names'),
    ];
    const responses = [];
    for (const send of requests) responses.push(await send());
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
});

describe('updating and deleting health events', () => {
  it('updates every field and syncs medicines (update, add, remove)', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client, {
      medicines: [{ name: 'Paracetamol', dosage: '500 mg' }, { name: 'Cough syrup' }],
    });
    const [paracetamol] = event.medicines;

    const res = await client.put(`/api/health-events/${event.id}`).send({
      title: 'Flu',
      healthIssue: 'Flu',
      description: null,
      startDate: '2026-09-29',
      endDate: null,
      status: 'ongoing',
      severity: 'severe',
      symptoms: ['Chills'],
      notes: 'Still recovering.',
      medicines: [
        {
          id: paracetamol.id,
          name: 'Paracetamol',
          dosage: '650 mg',
          frequency: 'Three times a day',
        },
        { name: 'ORS', dosage: '1 sachet' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Flu',
      startDate: '2026-09-29',
      endDate: null,
      status: 'ongoing',
      severity: 'severe',
      symptoms: ['Chills'],
      notes: 'Still recovering.',
    });
    expect(res.body.medicines.map((m) => m.name)).toEqual(['Paracetamol', 'ORS']);
    expect(res.body.medicines[0]).toMatchObject({ id: paracetamol.id, dosage: '650 mg' });

    const { rows } = await pool.query('SELECT name FROM medicines WHERE health_event_id = $1', [
      event.id,
    ]);
    expect(rows.map((r) => r.name).sort()).toEqual(['ORS', 'Paracetamol']);
  });

  it('rolls back the whole update if a medicine is invalid for this event', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);
    const res = await client.put(`/api/health-events/${event.id}`).send(
      fever({
        title: 'Changed title',
        medicines: [{ id: '00000000-0000-4000-8000-000000000000', name: 'Ghost medicine' }],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('medicines.0.id');

    const after = await client.get(`/api/health-events/${event.id}`);
    expect(after.body.title).toBe('Fever after travel');
    expect(after.body.medicines.map((m) => m.name)).toEqual(['Paracetamol']);
  });

  it('marks an ongoing event resolved with PATCH', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client, { status: 'ongoing', endDate: null });

    const tooEarly = await client
      .patch(`/api/health-events/${event.id}`)
      .send({ status: 'resolved', endDate: '2026-09-01' });
    expect(tooEarly.status).toBe(400);
    expect(tooEarly.body.error.fields.endDate).toBe('End date cannot be earlier than start date.');

    const res = await client
      .patch(`/api/health-events/${event.id}`)
      .send({ status: 'resolved', endDate: '2026-10-04' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'resolved',
      endDate: '2026-10-04',
      title: event.title,
    });
    expect(res.body.medicines).toHaveLength(1);
  });

  it('deletes an event together with its medicines', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);

    expect((await client.delete(`/api/health-events/${event.id}`)).status).toBe(204);
    expect((await client.get(`/api/health-events/${event.id}`)).status).toBe(404);
    expect((await client.delete(`/api/health-events/${event.id}`)).status).toBe(404);

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM medicines');
    expect(rows[0].n).toBe(0);
  });
});

describe('medicine endpoints', () => {
  it('adds, lists, updates and removes medicines on an event', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client, { medicines: [] });
    const base = `/api/health-events/${event.id}/medicines`;

    const added = await client
      .post(base)
      .send({ name: 'Cetirizine', dosage: '10 mg', frequency: 'Once at night' });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ name: 'Cetirizine', dosage: '10 mg' });
    const second = await client.post(base).send({ name: 'Nasal spray' });

    const listed = await client.get(base);
    expect(listed.body.items.map((m) => m.name)).toEqual(['Cetirizine', 'Nasal spray']);

    const updated = await client
      .put(`${base}/${added.body.id}`)
      .send({ name: 'Cetirizine', dosage: '5 mg' });
    expect(updated.status).toBe(200);
    expect(updated.body.dosage).toBe('5 mg');

    const invalid = await client.put(`${base}/${added.body.id}`).send({ name: '' });
    expect(invalid.status).toBe(400);

    expect((await client.delete(`${base}/${second.body.id}`)).status).toBe(204);
    expect((await client.delete(`${base}/${second.body.id}`)).status).toBe(404);
    expect((await client.get(base)).body.items.map((m) => m.name)).toEqual(['Cetirizine']);
  });

  it('suggests medicine names from this user only', async () => {
    const a = await registerUser();
    const b = await registerUser();
    await createEvent(a.client, { medicines: [{ name: 'Paracetamol' }, { name: 'Pantoprazole' }] });
    await createEvent(b.client, { medicines: [{ name: 'Pregabalin' }] });

    const res = await a.client.get('/api/medicines/names?q=pa');
    expect(res.body.items).toEqual(['Pantoprazole', 'Paracetamol']);
    expect((await a.client.get('/api/medicines/names?q=preg')).body.items).toEqual([]);
  });
});

describe('listing, searching and filtering', () => {
  async function seed(client) {
    await createEvent(client, {
      title: 'Evening fever',
      healthIssue: 'Fever',
      startDate: '2026-10-01',
      endDate: '2026-10-03',
      severity: 'moderate',
      medicines: [{ name: 'Paracetamol', dosage: '500 mg' }],
    });
    await createEvent(client, {
      title: 'Head cold',
      healthIssue: 'Cold',
      startDate: '2026-09-25',
      endDate: '2026-09-28',
      severity: 'mild',
      notes: 'Steam inhalation helped (100% better).',
      medicines: [],
    });
    await createEvent(client, {
      title: 'Lingering cough',
      healthIssue: 'Cough',
      startDate: '2026-09-28',
      endDate: null,
      status: 'ongoing',
      severity: null,
      symptoms: ['Dry throat'],
      medicines: [{ name: 'Cough syrup' }],
    });
    await createEvent(client, {
      title: 'Migraine',
      healthIssue: 'Migraine',
      startDate: '2026-08-10',
      endDate: '2026-08-10',
      severity: 'severe',
      medicines: [],
    });
  }

  const titles = (res) => res.body.items.map((e) => e.title);

  it('lists newest first with medicine counts and previews, and paginates', async () => {
    const { client } = await registerUser();
    await seed(client);

    const res = await client.get('/api/health-events');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(titles(res)).toEqual(['Evening fever', 'Lingering cough', 'Head cold', 'Migraine']);
    expect(res.body.items[0]).toMatchObject({
      medicineCount: 1,
      medicines: [{ name: 'Paracetamol', dosage: '500 mg' }],
    });
    expect(res.body.items[0]).not.toHaveProperty('notes');

    const page2 = await client.get('/api/health-events?pageSize=3&page=2');
    expect(page2.body).toMatchObject({ page: 2, pageSize: 3, total: 4 });
    expect(titles(page2)).toEqual(['Migraine']);
  });

  it.each([
    ['q=paracetamol', ['Evening fever']], // medicine name
    ['q=COLD', ['Head cold']], // title / issue, case-insensitive
    ['q=steam', ['Head cold']], // notes
    ['q=dry%20throat', ['Lingering cough']], // symptoms
    ['q=100%25', ['Head cold']], // literal % is not a wildcard
    ['q=_', []], // literal _ is not a wildcard
    ['status=ongoing', ['Lingering cough']],
    ['severity=severe', ['Migraine']],
    ['healthIssue=fever', ['Evening fever']],
    ['from=2026-09-29&to=2026-10-31', ['Evening fever', 'Lingering cough']], // overlap incl. ongoing
    ['from=2026-09-01&to=2026-09-26', ['Head cold']],
    ['sort=start_asc', ['Migraine', 'Head cold', 'Lingering cough', 'Evening fever']],
    ['sort=end_desc', ['Lingering cough', 'Evening fever', 'Head cold', 'Migraine']],
    ['status=resolved&severity=mild&q=cold', ['Head cold']],
  ])('filters with %s', async (qs, expected) => {
    const { client } = await registerUser();
    await seed(client);
    const res = await client.get(`/api/health-events?${qs}`);
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(expected);
  });

  it('rejects invalid filters', async () => {
    const { client } = await registerUser();
    expect((await client.get('/api/health-events?status=maybe')).status).toBe(400);
    expect((await client.get('/api/health-events?from=2026-10-10&to=2026-10-01')).status).toBe(400);
    expect((await client.get('/api/health-events?pageSize=500')).status).toBe(400);
  });

  it('returns calendar events overlapping a range, and validates the range', async () => {
    const { client } = await registerUser();
    await seed(client);
    const res = await client.get('/api/health-events/calendar?from=2026-09-28&to=2026-11-08');
    expect(res.status).toBe(200);
    expect(res.body.items.map((e) => e.title)).toEqual([
      'Head cold',
      'Lingering cough',
      'Evening fever',
    ]);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      ['endDate', 'healthIssue', 'id', 'severity', 'startDate', 'status', 'title'].sort(),
    );

    expect(
      (await client.get('/api/health-events/calendar?from=2026-01-01&to=2026-12-31')).status,
    ).toBe(400);
    expect((await client.get('/api/health-events/calendar')).status).toBe(400);
  });

  it('lists the health issues the user has recorded', async () => {
    const { client } = await registerUser();
    await seed(client);
    await createEvent(client, { healthIssue: 'Fever', title: 'Another fever' });
    const res = await client.get('/api/health-events/issues');
    expect(res.body.items[0]).toEqual({ name: 'Fever', count: 2 });
    expect(res.body.items).toHaveLength(4);
  });
});

/**
 * CRITICAL: user isolation. User B must not be able to read, change or delete anything that
 * belongs to user A, even when B knows the exact IDs, and must not learn that the IDs exist.
 */
describe('data isolation between users', () => {
  async function twoUsers() {
    const alice = await registerUser({ name: 'Alice' });
    const bob = await registerUser({ name: 'Bob' });
    const aliceEvent = await createEvent(alice.client);
    const aliceMedicine = aliceEvent.medicines[0];
    return { alice, bob, aliceEvent, aliceMedicine };
  }

  async function snapshot() {
    const events = await pool.query('SELECT * FROM health_events ORDER BY id');
    const medicines = await pool.query('SELECT * FROM medicines ORDER BY id');
    return JSON.stringify([events.rows, medicines.rows]);
  }

  it("returns 404 (not 403) for every operation on another user's event, and changes nothing", async () => {
    const { bob, aliceEvent, aliceMedicine } = await twoUsers();
    const before = await snapshot();
    const eventUrl = `/api/health-events/${aliceEvent.id}`;

    const attempts = [
      bob.client.get(eventUrl),
      bob.client.put(eventUrl).send(fever({ title: 'Hijacked' })),
      bob.client.patch(eventUrl).send({ status: 'ongoing', endDate: null }),
      bob.client.delete(eventUrl),
      bob.client.get(`${eventUrl}/medicines`),
      bob.client.post(`${eventUrl}/medicines`).send({ name: 'Injected' }),
      bob.client.put(`${eventUrl}/medicines/${aliceMedicine.id}`).send({ name: 'Hijacked' }),
      bob.client.delete(`${eventUrl}/medicines/${aliceMedicine.id}`),
    ];

    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('Paracetamol');
      expect(JSON.stringify(res.body)).not.toContain('Fever after travel');
    }
    expect(await snapshot()).toBe(before);
  });

  it("cannot reach another user's medicine through their own event", async () => {
    const { bob, aliceMedicine } = await twoUsers();
    const bobEvent = await createEvent(bob.client, { medicines: [] });
    const before = await snapshot();
    const url = `/api/health-events/${bobEvent.id}/medicines/${aliceMedicine.id}`;

    expect((await bob.client.put(url).send({ name: 'Hijacked' })).status).toBe(404);
    expect((await bob.client.delete(url)).status).toBe(404);

    // Nor by claiming it inside an event update.
    const sync = await bob.client
      .put(`/api/health-events/${bobEvent.id}`)
      .send(fever({ medicines: [{ id: aliceMedicine.id, name: 'Hijacked' }] }));
    expect(sync.status).toBe(400);
    expect(await snapshot()).toBe(before);
  });

  it("never includes another user's data in lists, search, calendar, issues or medicine names", async () => {
    const { bob } = await twoUsers();

    const list = await bob.client.get('/api/health-events?q=fever');
    expect(list.body).toMatchObject({ items: [], total: 0 });
    expect((await bob.client.get('/api/health-events')).body.total).toBe(0);
    expect(
      (await bob.client.get('/api/health-events/calendar?from=2026-09-01&to=2026-10-31')).body
        .items,
    ).toEqual([]);
    expect((await bob.client.get('/api/health-events/issues')).body.items).toEqual([]);
    expect((await bob.client.get('/api/medicines/names')).body.items).toEqual([]);
  });

  it('ignores a userId smuggled into the request body', async () => {
    const { alice, bob } = await twoUsers();
    const res = await bob.client
      .post('/api/health-events')
      .send({ ...fever({ title: 'Bob event' }), userId: alice.user.id });
    expect(res.status).toBe(201);

    const { rows } = await pool.query('SELECT user_id FROM health_events WHERE id = $1', [
      res.body.id,
    ]);
    expect(rows[0].user_id).toBe(bob.user.id);
    expect((await alice.client.get('/api/health-events?q=Bob')).body.total).toBe(0);
  });

  it('stops working with a stolen session once that user logs out', async () => {
    const { alice, aliceEvent } = await twoUsers();
    expect(
      (await request(server).get(`/api/health-events/${aliceEvent.id}`).set('Cookie', alice.cookie))
        .status,
    ).toBe(200);
    await alice.client.post('/api/auth/logout');
    expect(
      (await request(server).get(`/api/health-events/${aliceEvent.id}`).set('Cookie', alice.cookie))
        .status,
    ).toBe(401);
  });
});
