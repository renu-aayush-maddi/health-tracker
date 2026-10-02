import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db/pool.js';
import { deleteStaleUnverifiedUsers } from '../src/modules/auth/verification.repository.js';
import { mailer } from '../src/utils/mailer.js';
import {
  createClient,
  latestVerificationCode,
  registerUser,
  resetDatabase,
  server,
} from './helpers.js';

beforeEach(resetDatabase);
afterAll(() => pool.end());

const unverifiedUser = (overrides) => registerUser({ verify: false, ...overrides });
const wrongCode = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

describe('email verification at signup', () => {
  it('emails a 6-digit code (stored only as a hash) and starts an unverified session', async () => {
    const { user, email } = await unverifiedUser();
    expect(user.emailVerified).toBe(false);

    const message = mailer.outbox.find((m) => m.to === email);
    expect(message.subject).toMatch(/^\d{6} is your Health Tracker verification code$/);
    const code = latestVerificationCode(email);
    expect(code).toMatch(/^\d{6}$/);

    const { rows } = await pool.query('SELECT code_hash FROM email_verification_codes');
    expect(rows).toHaveLength(1);
    expect(rows[0].code_hash).not.toContain(code);
  });

  it('blocks health data until the email is verified, but allows session, logout and deletion', async () => {
    const { client, password } = await unverifiedUser();
    for (const res of [
      await client.get('/api/health-events'),
      await client
        .post('/api/health-events')
        .send({ title: 'x', healthIssue: 'x', startDate: '2026-10-01', status: 'ongoing' }),
      await client.get('/api/dashboard'),
      await client.get('/api/attachments'),
      await client.get('/api/medicines/names'),
      await client.get('/api/users/me/export'),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    }
    expect((await client.get('/api/auth/session')).body.user.emailVerified).toBe(false);
    expect((await client.get('/api/users/me')).status).toBe(200);
    expect((await client.delete('/api/users/me').send({ password })).status).toBe(204);
  });

  it('verifies with the right code (spaces tolerated) and unlocks the account', async () => {
    const { client, email } = await unverifiedUser();
    const code = latestVerificationCode(email);
    const res = await client
      .post('/api/auth/verify-email')
      .send({ code: `${code.slice(0, 3)} ${code.slice(3)}` });
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);
    expect((await client.get('/api/health-events')).status).toBe(200);
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM email_verification_codes')).rows[0].n,
    ).toBe(0);
  });

  it('counts wrong codes and locks the code after 5 attempts', async () => {
    const { client, email } = await unverifiedUser();
    const code = latestVerificationCode(email);

    const first = await client.post('/api/auth/verify-email').send({ code: wrongCode(code) });
    expect(first.status).toBe(400);
    expect(first.body.error.fields.code).toBe("That code isn't right. 4 attempts left.");
    for (let i = 0; i < 4; i += 1)
      await client.post('/api/auth/verify-email').send({ code: wrongCode(code) });

    const locked = await client.post('/api/auth/verify-email').send({ code });
    expect(locked.status).toBe(400);
    expect(locked.body.error.fields.code).toBe('Too many incorrect attempts. Request a new code.');
  });

  it('rejects expired codes and malformed input', async () => {
    const { client, email } = await unverifiedUser();
    const code = latestVerificationCode(email);
    expect((await client.post('/api/auth/verify-email').send({ code: '12ab56' })).status).toBe(400);
    await pool.query(
      "UPDATE email_verification_codes SET expires_at = now() - interval '1 second'",
    );
    const res = await client.post('/api/auth/verify-email').send({ code });
    expect(res.body.error.fields.code).toBe('This code has expired. Request a new one.');
  });

  it('resends after a cooldown, and earlier codes keep working (late emails still count)', async () => {
    const { client, email } = await unverifiedUser();
    const first = latestVerificationCode(email);

    const tooSoon = await client.post('/api/auth/resend-verification');
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error.code).toBe('RESEND_TOO_SOON');

    await pool.query(
      "UPDATE email_verification_codes SET created_at = now() - interval '2 minutes'",
    );
    expect((await client.post('/api/auth/resend-verification')).status).toBe(202);
    expect(mailer.outbox.filter((m) => m.to === email)).toHaveLength(2);

    // The code from the FIRST email is accepted, even though a newer one was sent.
    const res = await client.post('/api/auth/verify-email').send({ code: first });
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);
  });

  it('keeps only the 3 newest codes, and expired ones never work', async () => {
    const { client, email, user } = await unverifiedUser();
    const sent = [latestVerificationCode(email)];
    for (let i = 0; i < 3; i += 1) {
      await pool.query(
        "UPDATE email_verification_codes SET created_at = created_at - interval '2 minutes'",
      );
      await client.post('/api/auth/resend-verification');
      sent.push(latestVerificationCode(email));
    }
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM email_verification_codes WHERE user_id = $1',
      [user.id],
    );
    expect(rows[0].n).toBe(3);

    const oldest = sent[0];
    if (!sent.slice(1).includes(oldest)) {
      const res = await client.post('/api/auth/verify-email').send({ code: oldest });
      expect(res.status).toBe(400); // dropped: only the newest three stay valid
    }

    await pool.query(
      "UPDATE email_verification_codes SET expires_at = now() - interval '1 second'",
    );
    const expired = await client.post('/api/auth/verify-email').send({ code: sent[3] });
    expect(expired.body.error.fields.code).toBe('This code has expired. Request a new one.');
  });

  it('sends a fresh code when an unverified user logs in with an expired code', async () => {
    const { email, password } = await unverifiedUser();
    await pool.query(
      "UPDATE email_verification_codes SET expires_at = now() - interval '1 minute'",
    );
    const before = mailer.outbox.length;
    const login = await createClient().post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.user.emailVerified).toBe(false);
    expect(mailer.outbox.length).toBe(before + 1);
  });

  it('a completed password reset also verifies the email (reclaiming a squatted address)', async () => {
    const { email } = await unverifiedUser();
    await createClient().post('/api/auth/forgot-password').send({ email });
    const resetMail = mailer.outbox.find((m) => m.to === email && /Reset your/.test(m.subject));
    const token = resetMail.text.match(/#token=([\w-]+)/)[1];
    const newPassword = 'reclaimed-passphrase-1';
    await createClient()
      .post('/api/auth/reset-password')
      .send({ token, newPassword, confirmPassword: newPassword });

    const login = await createClient()
      .post('/api/auth/login')
      .send({ email, password: newPassword });
    expect(login.body.user.emailVerified).toBe(true);
  });

  it('tells the user when the email could not be sent, instead of claiming it was', async () => {
    const { client } = await unverifiedUser();
    await pool.query(
      "UPDATE email_verification_codes SET created_at = now() - interval '2 minutes'",
    );
    const send = vi.spyOn(mailer, 'send').mockRejectedValue(new Error('Brevo returned 401'));

    const res = await client.post('/api/auth/resend-verification');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('EMAIL_SEND_FAILED');
    expect(res.body.error.message).not.toMatch(/Brevo|401/); // provider detail stays in the logs
    send.mockRestore();
  });

  it('requires a session to verify or resend', async () => {
    expect(
      (await request(server).post('/api/auth/verify-email').send({ code: '123456' })).status,
    ).toBe(403); // no Origin
    expect(
      (await createClient().post('/api/auth/verify-email').send({ code: '123456' })).status,
    ).toBe(401);
    expect((await createClient().post('/api/auth/resend-verification')).status).toBe(401);
  });

  it('removes unverified sign-ups after 7 days, never verified accounts', async () => {
    const stale = await unverifiedUser();
    const fresh = await unverifiedUser();
    const verified = await registerUser();
    await pool.query(
      "UPDATE users SET created_at = now() - interval '8 days' WHERE email = ANY($1)",
      [[stale.email, verified.email]],
    );
    await deleteStaleUnverifiedUsers(7);
    const { rows } = await pool.query('SELECT email FROM users ORDER BY email');
    expect(rows.map((r) => r.email).sort()).toEqual([fresh.email, verified.email].sort());
  });
});
