import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { cleanFilename } from '../src/modules/attachments/attachment.service.js';
import { fileStorage } from '../src/services/fileStorage.js';
import { ORIGIN, createClient, registerUser, resetDatabase, server } from './helpers.js';

beforeEach(async () => {
  await resetDatabase();
  fileStorage.files.clear();
});
afterAll(() => pool.end());

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 1)]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(512, 0)]);

async function createEvent(client) {
  const res = await client
    .post('/api/health-events')
    .send({ title: 'Fever', healthIssue: 'Fever', startDate: '2026-10-01', status: 'ongoing' });
  return res.body;
}

const upload = (client, eventId, buffer, filename, contentType = 'application/octet-stream') =>
  client
    .post(`/api/health-events/${eventId}/attachments`)
    .attach('file', buffer, { filename, contentType });

describe('uploading attachments', () => {
  it('stores a photo and a PDF, returning metadata only', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);

    const photo = await upload(client, event.id, JPEG, 'blood-test रिपोर्ट.jpg', 'image/jpeg');
    expect(photo.status).toBe(201);
    expect(photo.body).toMatchObject({
      filename: 'blood-test रिपोर्ट.jpg',
      contentType: 'image/jpeg',
      size: JPEG.length,
      previewable: true,
    });
    expect(Object.keys(photo.body).sort()).toEqual([
      'contentType',
      'createdAt',
      'filename',
      'id',
      'previewable',
      'size',
      'tags',
    ]);

    const pdf = await upload(client, event.id, PDF, 'prescription.pdf');
    expect(pdf.body).toMatchObject({ contentType: 'application/pdf', previewable: false });
    expect(fileStorage.files.size).toBe(2);

    // Storage keys are random: the (possibly sensitive) file name never goes to storage.
    const { rows } = await pool.query(
      'SELECT storage_key, storage_resource_type FROM attachments ORDER BY created_at',
    );
    expect(rows.map((r) => r.storage_resource_type)).toEqual(['image', 'raw']);
    rows.forEach((r) => expect(r.storage_key).not.toMatch(/blood|prescription/));

    const detail = await client.get(`/api/health-events/${event.id}`);
    expect(detail.body.attachments.map((a) => a.filename)).toEqual([
      'blood-test रिपोर्ट.jpg',
      'prescription.pdf',
    ]);
    const list = await client.get('/api/health-events');
    expect(list.body.items[0].attachmentCount).toBe(2);
  });

  it('identifies files by content, not by name or declared type', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);

    const spoofed = await upload(client, event.id, EXE, 'report.pdf', 'application/pdf');
    expect(spoofed.status).toBe(400);
    expect(spoofed.body.error.fields.file).toMatch(/isn’t supported/);

    const text = await upload(
      client,
      event.id,
      Buffer.from('just some notes in a text file'),
      'notes.txt',
    );
    expect(text.status).toBe(400);

    const renamed = await upload(client, event.id, PDF, 'photo.jpg', 'image/jpeg');
    expect(renamed.body.contentType).toBe('application/pdf');
    expect(fileStorage.files.size).toBe(1);
  });

  it('strips directories and control characters from file names', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);
    const res = await upload(client, event.id, PDF, '../../etc/result.pdf');
    expect(res.body.filename).toBe('result.pdf');

    // Malformed multipart headers (raw control characters) are rejected outright…
    expect((await upload(client, event.id, PDF, 're\u0007sult.pdf')).status).toBe(400);
    // …and the cleaner handles anything else that slips through.
    expect(cleanFilename('C:\\Users\\me\\scan\u0000.pdf')).toBe('scan.pdf');
    expect(cleanFilename('   ')).toBe('file');
    expect(cleanFilename(`${'a'.repeat(300)}.pdf`)).toHaveLength(255);
  });

  it('enforces the size limit, the per-event limit and requires a file', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);

    const big = Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)]);
    const tooBig = await upload(client, event.id, big, 'huge.jpg');
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe('FILE_TOO_LARGE');

    const none = await client.post(`/api/health-events/${event.id}/attachments`).field('note', 'x');
    expect(none.status).toBe(400);

    for (let i = 0; i < 20; i += 1) {
      expect((await upload(client, event.id, PDF, `page-${i}.pdf`)).status).toBe(201);
    }
    const extra = await upload(client, event.id, PDF, 'one-too-many.pdf');
    expect(extra.status).toBe(400);
    expect(extra.body.error.fields.file).toMatch(/at most 20 files/);
  });

  it('only accepts multipart bodies on the upload route, and still requires our Origin', async () => {
    const { client, cookie } = await registerUser();
    const event = await createEvent(client);

    const noOrigin = await request(server)
      .post(`/api/health-events/${event.id}/attachments`)
      .set('Cookie', cookie)
      .attach('file', PDF, 'x.pdf');
    expect(noOrigin.status).toBe(403);

    const multipartElsewhere = await request(server)
      .post('/api/health-events')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .field('title', 'Sneaky')
      .attach('file', PDF, 'x.pdf');
    expect(multipartElsewhere.status).toBe(403);
  });
});

describe('viewing and deleting attachments', () => {
  it('streams the file to its owner, inline or as a download with its original name', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);
    const file = (await upload(client, event.id, PDF, 'blood test रिपोर्ट.pdf')).body;
    const base = `/api/health-events/${event.id}/attachments/${file.id}/content`;

    const view = await client
      .get(base)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(view.status).toBe(200);
    expect(view.headers['content-type']).toBe('application/pdf');
    expect(view.headers['content-disposition']).toMatch(
      /^inline; filename="blood test _+\.pdf"; filename\*=UTF-8''blood%20test%20/,
    );
    expect(view.headers['cache-control']).toBe('private, no-store');
    expect(view.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(view.body, PDF)).toBe(0);

    const download = await client.get(`${base}?download=true`);
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
  });

  it('tells the UI whether uploads are available', async () => {
    const { client } = await registerUser();
    expect((await client.get('/api/features')).body).toEqual({ attachments: true });
    expect((await createClient().get('/api/features')).status).toBe(401);
  });

  it('deletes a file from storage and the database', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);
    const file = (await upload(client, event.id, JPEG, 'xray.jpg')).body;

    expect(
      (await client.delete(`/api/health-events/${event.id}/attachments/${file.id}`)).status,
    ).toBe(204);
    expect(fileStorage.files.size).toBe(0);
    expect((await client.get(`/api/health-events/${event.id}/attachments`)).body).toEqual({
      items: [],
    });
    expect(
      (await client.delete(`/api/health-events/${event.id}/attachments/${file.id}`)).status,
    ).toBe(404);
  });

  it('removes stored files when their event is deleted', async () => {
    const { client } = await registerUser();
    const keep = await createEvent(client);
    const drop = await createEvent(client);
    await upload(client, keep.id, PDF, 'keep.pdf');
    await upload(client, drop.id, PDF, 'drop-1.pdf');
    await upload(client, drop.id, JPEG, 'drop-2.jpg');

    await client.delete(`/api/health-events/${drop.id}`);
    expect(fileStorage.files.size).toBe(1);
    const { rows } = await pool.query('SELECT original_filename FROM attachments');
    expect(rows.map((r) => r.original_filename)).toEqual(['keep.pdf']);
  });

  it('removes every stored file when the account is deleted', async () => {
    const { client, password } = await registerUser();
    const other = await registerUser();
    await upload(client, (await createEvent(client)).id, PDF, 'mine.pdf');
    await upload(other.client, (await createEvent(other.client)).id, PDF, 'theirs.pdf');

    expect((await client.delete('/api/users/me').send({ password })).status).toBe(204);
    expect(fileStorage.files.size).toBe(1);
  });
});

describe('tags', () => {
  const uploadTagged = (client, eventId, buffer, filename, tags) =>
    client
      .post(`/api/health-events/${eventId}/attachments`)
      .field('tags', JSON.stringify(tags))
      .attach('file', buffer, filename);

  it('saves tags on upload, normalized and de-duplicated', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);
    const res = await uploadTagged(client, event.id, PDF, 'rx.pdf', [
      ' Prescription ',
      'prescription',
      'Dr Rao',
    ]);
    expect(res.status).toBe(201);
    expect(res.body.tags).toEqual(['Prescription', 'Dr Rao']);
  });

  it.each([
    ['not json', 'Tags must be a list.'],
    [JSON.stringify(['x'.repeat(31)]), 'Tag must be 30 characters or fewer.'],
    [JSON.stringify(Array.from({ length: 11 }, (_, i) => `t${i}`)), 'Add at most 10 tags.'],
  ])('rejects invalid tags %#', async (raw, message) => {
    const { client } = await registerUser();
    const event = await createEvent(client);
    const res = await client
      .post(`/api/health-events/${event.id}/attachments`)
      .field('tags', raw)
      .attach('file', PDF, 'x.pdf');
    expect(res.status).toBe(400);
    expect(Object.values(res.body.error.fields)).toContain(message);
    expect(fileStorage.files.size).toBe(0); // nothing stored when the request is invalid
  });

  it('updates tags on an existing file', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);
    const file = (await upload(client, event.id, JPEG, 'scan.jpg')).body;
    expect(file.tags).toEqual([]);

    const url = `/api/health-events/${event.id}/attachments/${file.id}`;
    const res = await client.patch(url).send({ tags: ['X-ray', 'Chest'] });
    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual(['X-ray', 'Chest']);
    expect((await client.get(`/api/health-events/${event.id}`)).body.attachments[0].tags).toEqual([
      'X-ray',
      'Chest',
    ]);
    expect((await client.patch(url).send({ tags: 'X-ray' })).status).toBe(400);
  });

  it('lists records across events, filtered by tag or search, with their event', async () => {
    const { client } = await registerUser();
    const fever = await createEvent(client);
    const cold = (
      await client.post('/api/health-events').send({
        title: 'Head cold',
        healthIssue: 'Cold',
        startDate: '2026-09-20',
        status: 'ongoing',
      })
    ).body;
    await uploadTagged(client, fever.id, PDF, 'rx-fever.pdf', ['Prescription']);
    await uploadTagged(client, cold.id, PDF, 'rx-cold.pdf', ['prescription', 'Pharmacy']);
    await uploadTagged(client, cold.id, JPEG, 'cbc.jpg', ['Lab report']);

    const all = await client.get('/api/attachments');
    expect(all.body.total).toBe(3);
    expect(all.body.items[0]).toMatchObject({
      filename: 'cbc.jpg',
      event: { id: cold.id, title: 'Head cold' },
    });

    const prescriptions = await client.get('/api/attachments?tag=PRESCRIPTION');
    expect(prescriptions.body.items.map((i) => i.filename).sort()).toEqual([
      'rx-cold.pdf',
      'rx-fever.pdf',
    ]);

    expect((await client.get('/api/attachments?q=cbc')).body.items.map((i) => i.filename)).toEqual([
      'cbc.jpg',
    ]);
    expect((await client.get('/api/attachments?q=pharm')).body.total).toBe(1);
    expect((await client.get('/api/attachments?pageSize=2&page=2')).body.items).toHaveLength(1);

    const tags = await client.get('/api/attachments/tags');
    expect(tags.body.items).toEqual([
      { name: 'Prescription', count: 2 },
      { name: 'Lab report', count: 1 },
      { name: 'Pharmacy', count: 1 },
    ]);
  });

  it('lets History search find events by document name or tag', async () => {
    const { client } = await registerUser();
    const event = await createEvent(client);
    await uploadTagged(client, event.id, PDF, 'thyroid-panel.pdf', ['Lab report']);
    expect((await client.get('/api/health-events?q=thyroid')).body.total).toBe(1);
    expect((await client.get('/api/health-events?q=lab%20report')).body.total).toBe(1);
    expect((await client.get('/api/health-events?q=insurance')).body.total).toBe(0);
  });
});

describe('attachment isolation between users', () => {
  it("returns 404 for every operation on another user's files and changes nothing", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const aliceEvent = await createEvent(alice.client);
    const bobEvent = await createEvent(bob.client);
    const aliceFile = (await upload(alice.client, aliceEvent.id, PDF, 'alice-biopsy.pdf')).body;
    const before = JSON.stringify((await pool.query('SELECT * FROM attachments ORDER BY id')).rows);

    const base = `/api/health-events/${aliceEvent.id}/attachments`;
    const attempts = [
      await bob.client.get(base),
      await upload(bob.client, aliceEvent.id, PDF, 'injected.pdf'),
      await bob.client.get(`${base}/${aliceFile.id}/content`),
      await bob.client.delete(`${base}/${aliceFile.id}`),
      await bob.client.patch(`${base}/${aliceFile.id}`).send({ tags: ['hijacked'] }),
      // Alice's file through Bob's own event:
      await bob.client.get(`/api/health-events/${bobEvent.id}/attachments/${aliceFile.id}/content`),
      await bob.client.delete(`/api/health-events/${bobEvent.id}/attachments/${aliceFile.id}`),
    ];
    for (const res of attempts) {
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('alice-biopsy');
    }
    expect(JSON.stringify((await pool.query('SELECT * FROM attachments ORDER BY id')).rows)).toBe(
      before,
    );
    expect(fileStorage.files.size).toBe(1);

    // Cross-event views never include Alice's files or tags.
    expect((await bob.client.get('/api/attachments')).body).toMatchObject({ items: [], total: 0 });
    expect((await bob.client.get('/api/attachments/tags')).body.items).toEqual([]);
  });

  it('requires authentication', async () => {
    const anon = createClient();
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await anon.get('/api/attachments')).status).toBe(401);
    expect((await anon.get('/api/attachments/tags')).status).toBe(401);
    expect((await anon.get(`/api/health-events/${id}/attachments`)).status).toBe(401);
    expect((await upload(anon, id, PDF, 'x.pdf')).status).toBe(401);
    expect((await anon.get(`/api/health-events/${id}/attachments/${id}/content`)).status).toBe(401);
  });
});
