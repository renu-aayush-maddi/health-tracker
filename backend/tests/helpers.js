import http from 'node:http';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { config } from '../src/config/env.js';
import { mailer } from '../src/utils/mailer.js';

export const app = createApp();

// One long-lived server per test file. Letting supertest start a server per request
// recycles ports quickly and occasionally makes keep-alive sockets hit the wrong one.
export const server = http.createServer(app).listen(0);
server.unref();
export const ORIGIN = config.APP_ORIGIN;
export const DEFAULT_PASSWORD = 'correct-horse-battery';

export async function resetDatabase() {
  await pool.query('TRUNCATE users, audit_logs, security_events, ip_blocklist CASCADE');
  mailer.outbox.length = 0;
}

/**
 * A cookie-keeping HTTP client that behaves like our browser frontend:
 * every request carries the app's Origin header.
 */
export function createClient() {
  const agent = request.agent(server);
  const withOrigin = (method) => (url) => agent[method](url).set('Origin', ORIGIN);
  return {
    agent,
    get: withOrigin('get'),
    post: withOrigin('post'),
    put: withOrigin('put'),
    patch: withOrigin('patch'),
    delete: withOrigin('delete'),
  };
}

let counter = 0;

/** Registers a fresh user and returns { client, user, email, password, cookie } with the client logged in. */
export async function registerUser(overrides = {}) {
  counter += 1;
  const client = createClient();
  const email = overrides.email ?? `user${counter}-${Date.now()}@example.com`;
  const password = overrides.password ?? DEFAULT_PASSWORD;
  const res = await client.post('/api/auth/register').send({
    name: overrides.name ?? `User ${counter}`,
    email,
    password,
    confirmPassword: password,
  });
  if (res.status !== 201)
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = sessionCookie(res).split(';')[0]; // "name=value", usable in a Cookie header

  // Most tests need a fully usable account, so verify the email unless asked not to.
  if (overrides.verify === false) return { client, user: res.body.user, email, password, cookie };
  const verified = await client
    .post('/api/auth/verify-email')
    .send({ code: latestVerificationCode(email) });
  if (verified.status !== 200)
    throw new Error(`verify failed: ${verified.status} ${JSON.stringify(verified.body)}`);
  return { client, user: verified.body.user, email, password, cookie };
}

export function sessionCookie(res) {
  return (res.headers['set-cookie'] ?? []).find((c) =>
    c.startsWith(`${config.sessionCookieName}=`),
  );
}

/** The most recent verification code emailed to `email` (from the test outbox). */
export function latestVerificationCode(email) {
  const message = [...mailer.outbox]
    .reverse()
    .find((m) => m.to === email && /verification code/.test(m.subject));
  return message?.text.match(/verification code is: (\d{6})/)?.[1];
}

/** Registers a verified account and gives it an administrative role. */
export async function registerAdmin(role = 'admin', overrides = {}) {
  const account = await registerUser(overrides);
  await pool.query('UPDATE users SET role = $2 WHERE id = $1', [account.user.id, role]);
  return { ...account, role };
}

export async function setStatus(userId, status, reason = null) {
  await pool.query(
    'UPDATE users SET status = $2, status_reason = $3, status_changed_at = now() WHERE id = $1',
    [userId, status, reason],
  );
}

/** Adds an explicit permission grant, optionally already expired. */
export async function grantPermission(userId, permission, { expiresAt = null } = {}) {
  await pool.query(
    `INSERT INTO admin_permissions (user_id, permission, expires_at) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, permission) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [userId, permission, expiresAt],
  );
}

export async function blockIp(ip, reason = 'test') {
  await pool.query(
    `INSERT INTO ip_blocklist (ip_address, reason) VALUES ($1::inet, $2)
     ON CONFLICT (ip_address) DO UPDATE SET reason = EXCLUDED.reason, expires_at = NULL`,
    [ip, reason],
  );
}

export const auditRows = async (action) =>
  (
    await pool.query(
      `SELECT * FROM audit_logs ${action ? 'WHERE action = $1' : ''} ORDER BY created_at`,
      action ? [action] : [],
    )
  ).rows;

export const securityRows = async (type) =>
  (
    await pool.query(
      `SELECT * FROM security_events ${type ? 'WHERE event_type = $1' : ''} ORDER BY created_at`,
      type ? [type] : [],
    )
  ).rows;
