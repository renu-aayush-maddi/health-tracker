import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { createClient, registerUser, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => pool.end());

const today = new Date().toISOString().slice(0, 10);
const event = (overrides) => ({
  title: 'Event',
  healthIssue: 'Cold',
  startDate: today,
  endDate: today,
  status: 'resolved',
  ...overrides,
});

describe('dashboard', () => {
  it('summarizes only the signed-in user’s events', async () => {
    const alice = await registerUser();
    const bob = await registerUser();

    for (const body of [
      event({ title: 'Cold 1' }),
      event({ title: 'Cold 2' }),
      event({ title: 'Fever', healthIssue: 'Fever', status: 'ongoing', endDate: null }),
    ]) {
      await alice.client.post('/api/health-events').send(body);
    }
    for (let i = 0; i < 4; i += 1) {
      await bob.client
        .post('/api/health-events')
        .send(event({ title: `Bob headache ${i}`, healthIssue: 'Headache' }));
    }

    const res = await alice.client.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ total: 3, ongoing: 1, resolved: 2 });
    expect(res.body.ongoing.map((e) => e.title)).toEqual(['Fever']);
    expect(res.body.recent).toHaveLength(3);
    expect(res.body.mostCommonIssue).toEqual({ name: 'Cold', count: 2 });
    expect(JSON.stringify(res.body)).not.toContain('Bob');
  });

  it('handles a brand-new account with no events', async () => {
    const { client } = await registerUser();
    const res = await client.get('/api/dashboard');
    expect(res.body).toEqual({
      totals: { total: 0, ongoing: 0, resolved: 0 },
      ongoing: [],
      recent: [],
      mostCommonIssue: null,
    });
  });

  it('requires authentication', async () => {
    expect((await createClient().get('/api/dashboard')).status).toBe(401);
  });
});
