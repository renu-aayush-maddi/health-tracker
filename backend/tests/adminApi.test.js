// Phase 3: the admin API surface — authorization matrix, privilege-escalation attempts,
// health-data gating, audit trails and the self-protection invariants.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import {
  auditRows,
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

const PASSWORD = 'correct-horse-battery';

async function seedEvent(client, overrides = {}) {
  const res = await client.post('/api/health-events').send({
    title: 'Evening fever',
    healthIssue: 'Fever',
    description: 'Felt feverish after dinner.',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    status: 'resolved',
    severity: 'moderate',
    symptoms: ['Chills'],
    notes: 'Private note',
    medicines: [{ name: 'Paracetamol', dosage: '500 mg' }],
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body;
}

/** Password re-entry, which unlocks the high-risk endpoints for a short window. */
const reauth = (client, password = PASSWORD) => client.post('/api/admin/reauth').send({ password });

describe('admin area access', () => {
  const PROBES = [
    ['get', '/api/admin/me'],
    ['get', '/api/admin/dashboard'],
    ['get', '/api/admin/users'],
    ['get', '/api/admin/sessions'],
    ['get', '/api/admin/security'],
    ['get', '/api/admin/audit-logs'],
    ['get', '/api/admin/ip-addresses'],
    ['get', '/api/admin/system/health'],
    ['get', '/api/admin/reports'],
    ['get', '/api/admin/health-records'],
    ['get', '/api/admin/medicines'],
    ['get', '/api/admin/admins'],
  ];

  it('refuses every admin endpoint to an ordinary user', async () => {
    const { client } = await registerUser();
    for (const [method, path] of PROBES) {
      const res = await client[method](path);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('refuses every admin endpoint to an anonymous caller', async () => {
    const anon = createClient();
    for (const [method, path] of PROBES) {
      expect((await anon[method](path)).status, path).toBe(401);
    }
  });

  it('reports the caller’s own effective permissions', async () => {
    const { client } = await registerAdmin('read_only_admin');
    const res = await client.get('/api/admin/me');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('read_only_admin');
    expect(res.body.permissions).toContain('users.read');
    expect(res.body.permissions).not.toContain('users.block');
    expect(res.body.permissions).not.toContain('health_records.read');
  });
});

describe('read-only admin', () => {
  it('can read platform data', async () => {
    const { client } = await registerAdmin('read_only_admin');
    for (const path of [
      '/api/admin/dashboard',
      '/api/admin/users',
      '/api/admin/sessions',
      '/api/admin/security',
      '/api/admin/audit-logs',
      '/api/admin/ip-addresses',
      '/api/admin/system/health',
      '/api/admin/reports',
    ]) {
      expect((await client.get(path)).status, path).toBe(200);
    }
  });

  it('cannot change anything', async () => {
    const { client } = await registerAdmin('read_only_admin');
    const victim = await registerUser();

    const attempts = [
      await client
        .post(`/api/admin/users/${victim.user.id}/status`)
        .send({ status: 'blocked', reason: 'x' }),
      await client.patch(`/api/admin/users/${victim.user.id}`).send({ name: 'Renamed' }),
      await client.post(`/api/admin/users/${victim.user.id}/force-logout`),
      await client.post('/api/admin/ip-addresses/block').send({ ip: '203.0.113.9', reason: 'x' }),
      await client.post(`/api/admin/users/${victim.user.id}/role`).send({ role: 'admin' }),
      await client
        .delete(`/api/admin/users/${victim.user.id}`)
        .send({ confirmEmail: victim.email }),
    ];
    for (const res of attempts) {
      expect(res.status).toBe(403);
      expect(['FORBIDDEN', 'REAUTH_REQUIRED']).toContain(res.body.error.code);
    }

    const { rows } = await pool.query('SELECT status, name, role FROM users WHERE id = $1', [
      victim.user.id,
    ]);
    expect(rows[0]).toMatchObject({ status: 'active', role: 'user' });
  });
});

describe('health data is separately gated', () => {
  it('denies medical content to an admin without the permission, and grants it once given', async () => {
    const owner = await registerUser();
    const event = await seedEvent(owner.client);
    const { client, user } = await registerAdmin('admin');

    expect((await client.get('/api/admin/health-records')).status).toBe(403);
    expect((await client.get(`/api/admin/health-records/${event.id}`)).status).toBe(403);
    expect((await client.get('/api/admin/medicines')).status).toBe(403);

    await grantPermission(user.id, 'health_records.read');
    const list = await client.get('/api/admin/health-records');
    expect(list.status).toBe(200);
    // The index is metadata only — no notes, descriptions or symptoms.
    expect(JSON.stringify(list.body)).not.toMatch(/Private note|Felt feverish|Chills/);
    expect(list.body.items[0]).toMatchObject({ healthIssue: 'Fever', userEmail: owner.email });

    expect((await client.get('/api/admin/medicines')).status).toBe(403); // separate permission
  });

  it('gives a super admin medical content by default, and audits every read', async () => {
    const owner = await registerUser();
    const event = await seedEvent(owner.client);
    const { client } = await registerAdmin('super_admin');

    const detail = await client.get(`/api/admin/health-records/${event.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.notes).toBe('Private note');
    expect(detail.body.medicines[0].name).toBe('Paracetamol');

    const audits = await auditRows('HEALTH_RECORD_VIEWED');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      resource_id: event.id,
      target_email: owner.email,
      actor_role: 'super_admin',
    });
    expect(audits[0].ip_address).toBeTruthy();

    await client.get('/api/admin/medicines');
    expect(await auditRows('MEDICINE_RECORD_VIEWED')).toHaveLength(1);
  });

  it('keeps bulk export ungranted even for a super admin', async () => {
    const { client } = await registerAdmin('super_admin');
    const res = await client.get('/api/admin/me');
    expect(res.body.permissions).not.toContain('health_data.export');
  });
});

describe('account actions', () => {
  it('blocks an account: login refused, sessions revoked, API denied, audit written', async () => {
    const victim = await registerUser();
    await seedEvent(victim.client); // the account has real data that must survive
    const { client, email: adminEmail } = await registerAdmin('admin');

    const res = await client
      .post(`/api/admin/users/${victim.user.id}/status`)
      .send({ status: 'blocked', reason: 'Suspicious account activity' });
    expect(res.status).toBe(200);

    // Sessions are destroyed immediately rather than left to expire.
    const sessions = await pool.query(
      'SELECT count(*)::int AS n FROM sessions WHERE user_id = $1',
      [victim.user.id],
    );
    expect(sessions.rows[0].n).toBe(0);

    // API access is gone. The old cookie now resolves to no session, so this is a 401; a session
    // that somehow survived would be rejected with 403 ACCOUNT_NOT_ACTIVE (see adminFoundations).
    expect((await victim.client.get('/api/health-events')).status).toBe(401);

    // Signing in again is refused, with the reason.
    const login = await createClient()
      .post('/api/auth/login')
      .send({ email: victim.email, password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.message).toContain('Suspicious account activity');

    // Audited, with who and why.
    const audits = await auditRows('USER_STATUS_CHANGED');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor_email: adminEmail, target_email: victim.email });
    expect(audits[0].metadata).toMatchObject({
      to: 'blocked',
      reason: 'Suspicious account activity',
    });

    // Blocking is not deletion: the health data is untouched.
    const kept = await pool.query(
      `SELECT (SELECT count(*)::int FROM health_events WHERE user_id = $1) AS events,
              (SELECT count(*)::int FROM medicines WHERE user_id = $1) AS medicines`,
      [victim.user.id],
    );
    expect(kept.rows[0]).toEqual({ events: 1, medicines: 1 });
  });

  it('requires a reason before restricting an account', async () => {
    const victim = await registerUser();
    const { client } = await registerAdmin('admin');
    const res = await client
      .post(`/api/admin/users/${victim.user.id}/status`)
      .send({ status: 'blocked' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.reason).toBe('Give a reason for this change.');
  });

  it('force-logout revokes sessions without touching the account', async () => {
    const victim = await registerUser();
    const { client } = await registerAdmin('admin');

    expect((await client.post(`/api/admin/users/${victim.user.id}/force-logout`)).status).toBe(200);
    expect((await victim.client.get('/api/health-events')).status).toBe(401);
    expect(
      (
        await createClient()
          .post('/api/auth/login')
          .send({ email: victim.email, password: PASSWORD })
      ).status,
    ).toBe(200);
    expect(await auditRows('ALL_SESSIONS_REVOKED')).toHaveLength(1);
  });

  it('triggers a password reset email without revealing or setting the password', async () => {
    const victim = await registerUser();
    const { client } = await registerAdmin('admin');

    const res = await client.post(`/api/admin/users/${victim.user.id}/password-reset`);
    expect(res.status).toBe(202);
    expect(JSON.stringify(res.body)).not.toMatch(/token|password=/i);
    expect(await auditRows('PASSWORD_RESET_TRIGGERED')).toHaveLength(1);
  });

  it('records who looked at an account', async () => {
    const victim = await registerUser();
    const { client } = await registerAdmin('read_only_admin');
    const res = await client.get(`/api/admin/users/${victim.user.id}`);
    expect(res.status).toBe(200);
    // Detail is metadata: counts and dates, never health content.
    expect(res.body).toMatchObject({ email: victim.email, healthEventCount: 0 });
    expect(await auditRows('USER_VIEWED')).toHaveLength(1);
  });
});

describe('privilege escalation is not possible', () => {
  it('ignores a role or status supplied in a normal profile update', async () => {
    const { client, user } = await registerUser();
    await client
      .patch('/api/users/me')
      .send({ name: 'New', role: 'super_admin', status: 'active' });
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [user.id]);
    expect(rows[0].role).toBe('user');
  });

  it('refuses role changes to an admin without admins.manage', async () => {
    const victim = await registerUser();
    const { client } = await registerAdmin('admin');
    const res = await client
      .post(`/api/admin/users/${victim.user.id}/role`)
      .send({ role: 'super_admin' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('requires re-authentication before a super admin can change a role', async () => {
    const victim = await registerUser();
    const { client } = await registerAdmin('super_admin');

    const blocked = await client
      .post(`/api/admin/users/${victim.user.id}/role`)
      .send({ role: 'admin' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('REAUTH_REQUIRED');

    expect((await reauth(client, 'wrong-password-entirely')).status).toBe(400);
    expect((await reauth(client)).status).toBe(204);

    const allowed = await client
      .post(`/api/admin/users/${victim.user.id}/role`)
      .send({ role: 'admin' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.user.role).toBe('admin');

    const audits = await auditRows('USER_ROLE_CHANGED');
    expect(audits[0].metadata).toMatchObject({ from: 'user', to: 'admin' });
    expect(await securityRows('REAUTH_FAILED')).toHaveLength(1);
  });

  it('will not let an administrator change their own role or block themselves', async () => {
    const { client, user } = await registerAdmin('super_admin');
    await reauth(client);

    const role = await client.post(`/api/admin/users/${user.id}/role`).send({ role: 'user' });
    expect(role.status).toBe(409);
    expect(role.body.error.message).toMatch(/your own account/);

    const status = await client
      .post(`/api/admin/users/${user.id}/status`)
      .send({ status: 'blocked', reason: 'oops' });
    expect(status.status).toBe(409);
  });

  it('protects the last remaining super admin', async () => {
    const superAdmin = await registerAdmin('super_admin');
    // An ordinary admin granted admins.manage is the only party who could demote the last
    // super admin, so that is who exercises the guard.
    const manager = await registerAdmin('admin');
    await grantPermission(manager.user.id, 'admins.manage');
    await reauth(manager.client);

    const demote = await manager.client
      .post(`/api/admin/users/${superAdmin.user.id}/role`)
      .send({ role: 'user' });
    expect(demote.status).toBe(409);
    expect(demote.body.error.message).toMatch(/only active super admin/);

    const block = await manager.client
      .post(`/api/admin/users/${superAdmin.user.id}/status`)
      .send({ status: 'blocked', reason: 'test' });
    expect(block.status).toBe(409);

    const { rows } = await pool.query('SELECT role, status FROM users WHERE id = $1', [
      superAdmin.user.id,
    ]);
    expect(rows[0]).toEqual({ role: 'super_admin', status: 'active' });
  });

  it('denies admin APIs to a blocked administrator', async () => {
    const { client, user } = await registerAdmin('super_admin');
    await setStatus(user.id, 'blocked', 'compromised');
    const res = await client.get('/api/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
  });
});

describe('permission grants', () => {
  it('lets a super admin grant and revoke a permission, with an audit trail', async () => {
    const { client } = await registerAdmin('super_admin');
    const target = await registerAdmin('admin');
    await reauth(client);

    const granted = await client
      .post(`/api/admin/admins/${target.user.id}/permissions`)
      .send({ permission: 'health_records.read', reason: 'Support case #12' });
    expect(granted.status).toBe(201);
    expect((await target.client.get('/api/admin/health-records')).status).toBe(200);

    const revoked = await client.delete(
      `/api/admin/admins/${target.user.id}/permissions/health_records.read`,
    );
    expect(revoked.status).toBe(204);
    expect((await target.client.get('/api/admin/health-records')).status).toBe(403);

    expect(await auditRows('ADMIN_PERMISSION_GRANTED')).toHaveLength(1);
    expect(await auditRows('ADMIN_PERMISSION_REVOKED')).toHaveLength(1);
  });

  it('refuses to grant permissions to a non-admin account', async () => {
    const { client } = await registerAdmin('super_admin');
    const ordinary = await registerUser();
    await reauth(client);
    const res = await client
      .post(`/api/admin/admins/${ordinary.user.id}/permissions`)
      .send({ permission: 'health_records.read' });
    expect(res.status).toBe(400);
  });

  it('lists every administrator, not just the first page of accounts', async () => {
    const { client } = await registerAdmin('super_admin');
    // Enough ordinary accounts to push an admin past any fixed page size.
    const admins = [];
    for (let i = 0; i < 3; i += 1) admins.push(await registerAdmin('read_only_admin'));

    const res = await client.get('/api/admin/admins');
    expect(res.status).toBe(200);
    const emails = res.body.items.map((row) => row.email);
    for (const admin of admins) expect(emails).toContain(admin.email);
    expect(res.body.items.every((row) => row.role !== 'user')).toBe(true);
  });

  it('rejects an unknown permission name', async () => {
    const { client } = await registerAdmin('super_admin');
    const target = await registerAdmin('admin');
    await reauth(client);
    const res = await client
      .post(`/api/admin/admins/${target.user.id}/permissions`)
      .send({ permission: 'everything.always' });
    expect(res.status).toBe(400);
  });
});

describe('account deletion', () => {
  it('deletes the account and its data, keeps the audit trail, and needs the typed email', async () => {
    const victim = await registerUser();
    await seedEvent(victim.client);
    const { client } = await registerAdmin('super_admin');
    await reauth(client);

    const wrong = await client
      .delete(`/api/admin/users/${victim.user.id}`)
      .send({ confirmEmail: 'someone-else@example.com' });
    expect(wrong.status).toBe(400);

    const res = await client
      .delete(`/api/admin/users/${victim.user.id}`)
      .send({ confirmEmail: victim.email, reason: 'User request' });
    expect(res.status).toBe(204);

    const counts = await pool.query(
      `SELECT (SELECT count(*)::int FROM users WHERE id = $1) AS users,
              (SELECT count(*)::int FROM health_events WHERE user_id = $1) AS events`,
      [victim.user.id],
    );
    expect(counts.rows[0]).toEqual({ users: 0, events: 0 });

    const audits = await auditRows('USER_DELETED');
    expect(audits).toHaveLength(1);
    expect(audits[0].target_email).toBe(victim.email); // survives the deletion
    expect(audits[0].metadata).toMatchObject({ reason: 'User request', healthEvents: 1 });
  });

  it('is unavailable to an ordinary admin', async () => {
    const victim = await registerUser();
    const { client } = await registerAdmin('admin');
    const res = await client
      .delete(`/api/admin/users/${victim.user.id}`)
      .send({ confirmEmail: victim.email });
    expect(res.status).toBe(403);
  });
});

describe('sessions, IPs and monitoring', () => {
  it('lists sessions without ever exposing a token', async () => {
    await registerUser();
    const { client } = await registerAdmin('admin');
    const res = await client.get('/api/admin/sessions');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0]).toHaveProperty(
      'ipAddress' in res.body.items[0] ? 'ipAddress' : 'ip_address',
    );
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/token_hash|token/i);
  });

  it('revokes a single session', async () => {
    const victim = await registerUser();
    const { client } = await registerAdmin('admin');
    const { rows } = await pool.query('SELECT id FROM sessions WHERE user_id = $1', [
      victim.user.id,
    ]);

    expect((await client.post(`/api/admin/sessions/${rows[0].id}/revoke`)).status).toBe(204);
    expect((await victim.client.get('/api/health-events')).status).toBe(401);
    expect(await auditRows('SESSION_REVOKED')).toHaveLength(1);
  });

  it('blocks and unblocks an IP address, auditing both', async () => {
    const { client } = await registerAdmin('admin');

    const blocked = await client
      .post('/api/admin/ip-addresses/block')
      .send({ ip: '203.0.113.42', reason: 'Credential stuffing' });
    expect(blocked.status).toBe(200);
    const { rows } = await pool.query(
      'SELECT reason FROM ip_blocklist WHERE ip_address = $1::inet',
      ['203.0.113.42'],
    );
    expect(rows[0].reason).toBe('Credential stuffing');

    expect(
      (await client.post('/api/admin/ip-addresses/unblock').send({ ip: '203.0.113.42' })).status,
    ).toBe(204);
    expect(await auditRows('IP_BLOCKED')).toHaveLength(1);
    expect(await auditRows('IP_UNBLOCKED')).toHaveLength(1);
  });

  it('surfaces repeated failed logins as suspicious activity', async () => {
    const { email } = await registerUser();
    for (let i = 0; i < 6; i += 1) {
      await createClient().post('/api/auth/login').send({ email, password: 'wrong-password-x' });
    }
    const { client } = await registerAdmin('admin');
    const res = await client.get('/api/admin/security-events/suspicious');
    expect(res.status).toBe(200);
    expect(res.body.repeatedFailuresByAccount[0]).toMatchObject({ email_attempted: email });
    expect(res.body.repeatedFailuresByAccount[0].failures).toBeGreaterThanOrEqual(6);
  });

  it('aggregates IP activity without exposing session tokens', async () => {
    await registerUser();
    const { client } = await registerAdmin('admin');
    const res = await client.get('/api/admin/ip-addresses');
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toHaveProperty('successfulLogins');
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });
});

describe('dashboard, system and reports', () => {
  it('returns aggregate figures and zero-filled trend series', async () => {
    await registerUser();
    const { client } = await registerAdmin('admin');
    const res = await client.get('/api/admin/dashboard?days=7');
    expect(res.status).toBe(200);
    expect(res.body.users.total).toBeGreaterThanOrEqual(2);
    expect(res.body.trends.registrations).toHaveLength(7);
    expect(res.body.trends.registrations.at(-1)).toHaveProperty('count');
    // Aggregates only: no medical content anywhere in the payload.
    expect(JSON.stringify(res.body)).not.toMatch(/Fever|Paracetamol/);
  });

  it('never exposes secrets through system health', async () => {
    const { client } = await registerAdmin('admin');
    const res = await client.get('/api/admin/system/health');
    expect(res.status).toBe(200);
    expect(res.body.database.status).toBe('ok');
    const serialized = JSON.stringify(res.body);
    for (const secret of [
      'postgres://',
      'password',
      'SMTP_URL',
      'cloudinary://',
      'api_key',
      'secret',
    ]) {
      expect(serialized.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it('reports who accessed medical content', async () => {
    const owner = await registerUser();
    const event = await seedEvent(owner.client);
    const { client, email } = await registerAdmin('super_admin');
    await client.get(`/api/admin/health-records/${event.id}`);

    const res = await client.get('/api/admin/reports?days=30');
    expect(res.status).toBe(200);
    expect(res.body.privacy.sensitive_accesses).toBeGreaterThanOrEqual(1);
    expect(res.body.privacy.byAdministrator[0]).toMatchObject({
      actor_email: email,
      action: 'HEALTH_RECORD_VIEWED',
    });
    expect(res.body.privacy.administrators).toBeGreaterThanOrEqual(1);
  });
});
