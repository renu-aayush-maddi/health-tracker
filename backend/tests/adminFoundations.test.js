// Phase 1–2: roles, permissions, account status enforcement, IP blocking and the two
// append-only logs. The admin API surface itself is covered in adminApi.test.js.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@health-tracker/shared';
import { pool } from '../src/db/pool.js';
import { resolvePermissions } from '../src/modules/admin/permission.service.js';
import {
  blockIp,
  createClient,
  grantPermission,
  registerAdmin,
  registerUser,
  resetDatabase,
  securityRows,
  setStatus,
} from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => pool.end());

describe('permission resolution', () => {
  it('gives ordinary users nothing and never queries for grants', async () => {
    const { user } = await registerUser();
    expect([...(await resolvePermissions({ ...user, role: 'user' }))]).toEqual([]);
  });

  it('applies the role defaults', async () => {
    const { user } = await registerUser();
    const forAdmin = await resolvePermissions({ ...user, role: 'admin' });
    expect(forAdmin.has('users.block')).toBe(true);
    expect(forAdmin.has('users.delete')).toBe(false);
    expect(forAdmin.has('admins.manage')).toBe(false);
  });

  it('adds explicit grants, and ignores expired ones', async () => {
    const { user } = await registerUser();
    await grantPermission(user.id, 'health_records.read');
    await grantPermission(user.id, 'health_data.export', {
      expiresAt: new Date(Date.now() - 1000),
    });

    const permissions = await resolvePermissions({ ...user, role: 'admin' });
    expect(permissions.has('health_records.read')).toBe(true);
    expect(permissions.has('health_data.export')).toBe(false);
  });

  it('keeps bulk health export out of every role by default', () => {
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      expect(permissions).not.toContain('health_data.export');
    }
    // Reading a single record is a super-admin default (see docs/ADMIN.md).
    expect(ROLE_PERMISSIONS.super_admin).toContain('health_records.read');
    expect(ROLE_PERMISSIONS.admin).not.toContain('health_records.read');
    expect(ROLE_PERMISSIONS.read_only_admin).not.toContain('users.update');
  });
});

describe('account status enforcement', () => {
  it.each(['blocked', 'disabled', 'suspended'])(
    'denies API access to a %s account',
    async (status) => {
      const { client, user } = await registerUser();
      expect((await client.get('/api/health-events')).status).toBe(200);

      await setStatus(user.id, status, 'Suspicious account activity');
      const res = await client.get('/api/health-events');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
      expect(res.body.error.message).toContain('Suspicious account activity');
    },
  );

  it('destroys the sessions of a blocked account on its next request', async () => {
    const { client, user } = await registerUser();
    const other = createClient();
    await other
      .post('/api/auth/login')
      .send({ email: user.email, password: 'correct-horse-battery' });

    await setStatus(user.id, 'blocked', 'abuse');
    await client.get('/api/auth/session');

    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM sessions WHERE user_id = $1',
      [user.id],
    );
    expect(rows[0].n).toBe(0);
  });

  it('refuses login for a blocked account and records why', async () => {
    const { user, email, password } = await registerUser();
    await setStatus(user.id, 'blocked', 'Terms violation');

    const res = await createClient().post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
    expect(res.body.error.message).toContain('Terms violation');

    const events = await securityRows('LOGIN_BLOCKED_ACCOUNT');
    expect(events).toHaveLength(1);
    expect(events[0].email_attempted).toBe(email);
    expect(events[0].success).toBe(false);
  });

  it('lets the account back in once it is active again', async () => {
    const { user, email, password } = await registerUser();
    await setStatus(user.id, 'blocked', 'mistake');
    await setStatus(user.id, 'active', null);
    expect((await createClient().post('/api/auth/login').send({ email, password })).status).toBe(
      200,
    );
  });
});

describe('security event recording', () => {
  it('records sign-up, successful and failed logins, and logout', async () => {
    const { client, email } = await registerUser();
    await createClient().post('/api/auth/login').send({ email, password: 'wrong-password-here' });
    await client.post('/api/auth/logout');

    const types = (await securityRows()).map((row) => row.event_type);
    expect(types).toContain('REGISTERED');
    expect(types).toContain('LOGIN_FAILED');
    expect(types).toContain('LOGOUT');

    const failed = (await securityRows('LOGIN_FAILED'))[0];
    expect(failed.email_attempted).toBe(email);
    expect(failed.success).toBe(false);
  });

  it('never stores passwords, hashes or tokens in the security log', async () => {
    const { client, password } = await registerUser();
    await client.post('/api/auth/logout');
    const serialized = JSON.stringify(await securityRows());
    expect(serialized).not.toContain(password);
    expect(serialized).not.toMatch(/argon2|\$2[aby]\$|token/i);
  });
});

describe('IP blocking', () => {
  // Supertest connects over loopback, so blocking it covers every auth endpoint.
  const LOOPBACK = '::ffff:127.0.0.1';

  it('rejects credential endpoints from a blocked address and logs the attempt', async () => {
    const { email, password } = await registerUser();
    await blockIp(LOOPBACK, 'Credential stuffing');

    const res = await createClient().post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('IP_BLOCKED');
    expect(res.body.error.message).not.toContain('Credential stuffing'); // reason stays internal

    const events = await securityRows('LOGIN_BLOCKED_IP');
    expect(events).toHaveLength(1);
    expect(events[0].failure_reason).toBe('Credential stuffing');
  });

  it.each([
    [
      '/api/auth/register',
      {
        name: 'A',
        email: 'a@example.com',
        password: 'x'.repeat(12),
        confirmPassword: 'x'.repeat(12),
      },
    ],
    ['/api/auth/forgot-password', { email: 'a@example.com' }],
  ])('also blocks %s', async (path, body) => {
    await blockIp(LOOPBACK);
    expect((await createClient().post(path).send(body)).status).toBe(403);
  });

  it('stops blocking once the entry expires', async () => {
    const { email, password } = await registerUser();
    await blockIp(LOOPBACK);
    await pool.query("UPDATE ip_blocklist SET expires_at = now() - interval '1 minute'");
    expect((await createClient().post('/api/auth/login').send({ email, password })).status).toBe(
      200,
    );
  });
});

describe('append-only logs', () => {
  it('rejects any attempt to rewrite or erase history', async () => {
    await registerUser(); // produces a REGISTERED security event
    await pool.query(
      `INSERT INTO audit_logs (actor_email, action) VALUES ('someone@example.com', 'USER_VIEWED')`,
    );

    await expect(pool.query("UPDATE audit_logs SET action = 'NOTHING'")).rejects.toThrow(
      /append-only/,
    );
    await expect(pool.query('DELETE FROM audit_logs')).rejects.toThrow(/append-only/);
    await expect(pool.query("UPDATE security_events SET event_type = 'NOTHING'")).rejects.toThrow(
      /append-only/,
    );
    await expect(pool.query('DELETE FROM security_events')).rejects.toThrow(/append-only/);
  });

  it('keeps audit history after the account it refers to is deleted', async () => {
    const { user, email } = await registerAdmin('admin');
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, actor_email, action, target_user_id, target_email)
       VALUES ($1, $2, 'USER_VIEWED', $1, $2)`,
      [user.id, email],
    );

    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

    const { rows } = await pool.query('SELECT actor_email, target_email FROM audit_logs');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ actor_email: email, target_email: email });
  });
});
