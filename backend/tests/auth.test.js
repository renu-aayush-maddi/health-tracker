import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db/pool.js';
import { mailer } from '../src/utils/mailer.js';
import {
  DEFAULT_PASSWORD,
  ORIGIN,
  server,
  createClient,
  registerUser,
  resetDatabase,
  sessionCookie,
} from './helpers.js';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

describe('registration', () => {
  it('creates an account, starts a session and never returns the password hash', async () => {
    const client = createClient();
    const res = await client.post('/api/auth/register').send({
      name: '  Asha  ',
      email: 'Asha@Example.com',
      password: DEFAULT_PASSWORD,
      confirmPassword: DEFAULT_PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Asha', email: 'asha@example.com' });
    expect(res.body.user.preferences).toMatchObject({ theme: 'system' });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const session = await client.get('/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe('asha@example.com');
  });

  it('stores passwords as Argon2id hashes, never plain text', async () => {
    const { email } = await registerUser();
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0].password_hash).not.toContain(DEFAULT_PASSWORD);
  });

  it('rejects a duplicate email regardless of case', async () => {
    await registerUser({ email: 'dup@example.com' });
    const res = await createClient().post('/api/auth/register').send({
      name: 'Dup',
      email: 'DUP@example.com',
      password: DEFAULT_PASSWORD,
      confirmPassword: DEFAULT_PASSWORD,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it.each([
    [{ email: 'not-an-email' }, 'email'],
    [{ password: 'short', confirmPassword: 'short' }, 'password'],
    [{ password: 'password123', confirmPassword: 'password123' }, 'password'],
    [{ confirmPassword: 'something-else-entirely' }, 'confirmPassword'],
    [{ name: '   ' }, 'name'],
  ])('rejects invalid input %o', async (override, field) => {
    const res = await createClient()
      .post('/api/auth/register')
      .send({
        name: 'Valid Name',
        email: 'valid@example.com',
        password: DEFAULT_PASSWORD,
        confirmPassword: DEFAULT_PASSWORD,
        ...override,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toHaveProperty(field);
  });
});

describe('login and logout', () => {
  it('logs in with valid credentials (email is case-insensitive)', async () => {
    const { email, password } = await registerUser();
    const client = createClient();
    const res = await client.post('/api/auth/login').send({ email: email.toUpperCase(), password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect((await client.get('/api/auth/session')).status).toBe(200);
  });

  it('returns the same generic error for a wrong password and an unknown email', async () => {
    const { email } = await registerUser();
    const wrongPassword = await createClient()
      .post('/api/auth/login')
      .send({ email, password: 'not-the-password' });
    const unknownEmail = await createClient()
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'not-the-password' });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
      expect(sessionCookie(res)).toBeUndefined();
    }
  });

  it('logout invalidates the session on the server, not just the cookie', async () => {
    const { client, cookie: stolenCookie } = await registerUser();
    expect(
      (await request(server).get('/api/auth/session').set('Cookie', stolenCookie)).status,
    ).toBe(200);

    expect((await client.post('/api/auth/logout')).status).toBe(204);
    expect((await client.get('/api/auth/session')).status).toBe(401);

    // Replaying the old cookie must not work either.
    const replay = await request(server).get('/api/auth/session').set('Cookie', stolenCookie);
    expect(replay.status).toBe(401);
  });

  it('revokes the previous session on this browser when logging in again', async () => {
    const { client, email, password, cookie: oldCookie } = await registerUser();
    expect((await client.post('/api/auth/login').send({ email, password })).status).toBe(200);
    expect((await request(server).get('/api/auth/session').set('Cookie', oldCookie)).status).toBe(
      401,
    );
    expect((await client.get('/api/auth/session')).status).toBe(200);
  });

  it('rejects requests with no session or a forged session cookie', async () => {
    expect((await request(server).get('/api/auth/session')).status).toBe(401);
    const forged = await request(server)
      .get('/api/auth/session')
      .set('Cookie', 'ht_session=forged-token-value');
    expect(forged.status).toBe(401);
    expect(forged.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('expires sessions past their expiry time', async () => {
    const { client, user } = await registerUser();
    await pool.query(
      "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1",
      [user.id],
    );
    expect((await client.get('/api/auth/session')).status).toBe(401);
  });
});

describe('change password', () => {
  it('requires the correct current password', async () => {
    const { client } = await registerUser();
    const res = await client.post('/api/auth/change-password').send({
      currentPassword: 'wrong-current-password',
      newPassword: 'a-brand-new-passphrase',
      confirmPassword: 'a-brand-new-passphrase',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('currentPassword');
    // A wrong current password must not log the user out.
    expect((await client.get('/api/auth/session')).status).toBe(200);
  });

  it('changes the password, keeps this device signed in and signs out every other session', async () => {
    const { client, email, password } = await registerUser();
    const otherDevice = createClient();
    await otherDevice.post('/api/auth/login').send({ email, password });

    const newPassword = 'a-brand-new-passphrase';
    const res = await client
      .post('/api/auth/change-password')
      .send({ currentPassword: password, newPassword, confirmPassword: newPassword });

    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toBeDefined(); // session token rotated
    expect((await client.get('/api/auth/session')).status).toBe(200);
    expect((await otherDevice.get('/api/auth/session')).status).toBe(401);

    expect((await createClient().post('/api/auth/login').send({ email, password })).status).toBe(
      401,
    );
    expect(
      (await createClient().post('/api/auth/login').send({ email, password: newPassword })).status,
    ).toBe(200);
  });

  it('requires authentication', async () => {
    const res = await createClient().post('/api/auth/change-password').send({
      currentPassword: 'x',
      newPassword: 'a-brand-new-passphrase',
      confirmPassword: 'a-brand-new-passphrase',
    });
    expect(res.status).toBe(401);
  });
});

describe('password reset', () => {
  const GENERIC_MESSAGE =
    'If an account exists for that email, we sent a link to reset your password.';

  function captureMail() {
    return vi.spyOn(mailer, 'send').mockResolvedValue();
  }

  async function requestResetToken(email) {
    const send = captureMail();
    const res = await createClient().post('/api/auth/forgot-password').send({ email });
    expect(res.status).toBe(202);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const { text } = send.mock.calls[0][0];
    return text.match(/#token=([\w-]+)/)[1];
  }

  it('responds identically for unknown emails and sends nothing', async () => {
    const send = captureMail();
    const res = await createClient()
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost@example.com' });
    expect(res.status).toBe(202);
    expect(res.body.message).toBe(GENERIC_MESSAGE);
    await new Promise((r) => setTimeout(r, 50));
    expect(send).not.toHaveBeenCalled();
  });

  it('emails a single-use link that resets the password and signs out all sessions', async () => {
    const { client, email } = await registerUser();
    const token = await requestResetToken(email);

    const { rows } = await pool.query('SELECT token_hash FROM password_reset_tokens');
    expect(rows[0].token_hash).not.toBe(token); // only the hash is stored

    const newPassword = 'reset-passphrase-123';
    const reset = await createClient()
      .post('/api/auth/reset-password')
      .send({ token, newPassword, confirmPassword: newPassword });
    expect(reset.status).toBe(204);

    expect((await client.get('/api/auth/session')).status).toBe(401);
    expect(
      (await createClient().post('/api/auth/login').send({ email, password: newPassword })).status,
    ).toBe(200);

    const reuse = await createClient().post('/api/auth/reset-password').send({
      token,
      newPassword: 'another-passphrase-9',
      confirmPassword: 'another-passphrase-9',
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('rejects expired reset tokens', async () => {
    const { email } = await registerUser();
    const token = await requestResetToken(email);
    await pool.query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'");
    const res = await createClient().post('/api/auth/reset-password').send({
      token,
      newPassword: 'reset-passphrase-123',
      confirmPassword: 'reset-passphrase-123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });
});

describe('request protections', () => {
  const body = { email: 'a@example.com', password: 'whatever-password' };

  it('rejects state-changing requests without our Origin header (CSRF)', async () => {
    expect((await request(server).post('/api/auth/login').send(body)).status).toBe(403);
    expect(
      (
        await request(server)
          .post('/api/auth/login')
          .set('Origin', 'https://evil.example')
          .send(body)
      ).status,
    ).toBe(403);
  });

  it('rejects non-JSON bodies, which cross-site HTML forms could send', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(body));
    expect(res.status).toBe(403);
  });

  it('marks API responses as non-cacheable', async () => {
    const res = await request(server).get('/api/health');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('rate limits repeated failed logins', async () => {
    process.env.ENABLE_RATE_LIMITS = '1';
    try {
      const client = createClient();
      const attempt = { email: 'ratelimit@example.com', password: 'wrong-password' };
      const statuses = [];
      for (let i = 0; i < 11; i += 1) {
        statuses.push((await client.post('/api/auth/login').send(attempt)).status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      delete process.env.ENABLE_RATE_LIMITS;
    }
  });
});
