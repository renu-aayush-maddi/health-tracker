import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { createClient, registerUser, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => pool.end());

describe('account settings', () => {
  it('returns the signed-in user with default preferences', async () => {
    const { client, email } = await registerUser({ name: 'Mira' });
    const res = await client.get('/api/users/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: 'Mira',
      email,
      preferences: { theme: 'system', dateFormat: 'dd MMM yyyy', weekStart: 'monday' },
    });
  });

  it('updates the name and merges preferences', async () => {
    const { client } = await registerUser();
    await client.patch('/api/users/me').send({ preferences: { theme: 'dark' } });
    const res = await client
      .patch('/api/users/me')
      .send({ name: ' Mira K ', preferences: { weekStart: 'sunday' } });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: 'Mira K',
      preferences: { theme: 'dark', weekStart: 'sunday', dateFormat: 'dd MMM yyyy' },
    });
  });

  it.each([
    [{ preferences: { theme: 'neon' } }, 'preferences.theme'],
    [{ preferences: { dateFormat: '<script>' } }, 'preferences.dateFormat'],
    [{ name: '' }, 'name'],
    [{}, '_form'],
  ])('rejects invalid updates %o', async (body, field) => {
    const { client } = await registerUser();
    const res = await client.patch('/api/users/me').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty(field);
  });

  it('ignores attempts to change email or password through the profile endpoint', async () => {
    const { client, email } = await registerUser();
    const res = await client.patch('/api/users/me').send({
      name: 'New',
      email: 'attacker@example.com',
      password_hash: 'x',
      id: '00000000-0000-4000-8000-000000000000',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
  });

  it('deletes the account and all its data only with the correct password', async () => {
    const { client, user, password } = await registerUser();
    const other = await registerUser();
    await client.post('/api/health-events').send({
      title: 'Cold',
      healthIssue: 'Cold',
      startDate: '2026-10-01',
      status: 'ongoing',
      medicines: [{ name: 'Syrup' }],
    });
    await other.client
      .post('/api/health-events')
      .send({ title: 'Other', healthIssue: 'Flu', startDate: '2026-10-01', status: 'ongoing' });

    const wrong = await client.delete('/api/users/me').send({ password: 'wrong-password' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.fields.password).toBe('Password is incorrect.');

    expect((await client.delete('/api/users/me').send({ password })).status).toBe(204);
    expect((await client.get('/api/auth/session')).status).toBe(401);

    const counts = await pool.query(
      `SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS users,
              (SELECT count(*) FROM health_events WHERE user_id = $1)::int AS events,
              (SELECT count(*) FROM medicines WHERE user_id = $1)::int AS medicines,
              (SELECT count(*) FROM sessions WHERE user_id = $1)::int AS sessions,
              (SELECT count(*) FROM health_events)::int AS all_events`,
      [user.id],
    );
    expect(counts.rows[0]).toEqual({
      users: 0,
      events: 0,
      medicines: 0,
      sessions: 0,
      all_events: 1,
    });
  });

  it('requires authentication', async () => {
    const anon = createClient();
    expect((await anon.get('/api/users/me')).status).toBe(401);
    expect((await anon.patch('/api/users/me').send({ name: 'x' })).status).toBe(401);
    expect((await anon.delete('/api/users/me').send({ password: 'x' })).status).toBe(401);
  });
});
