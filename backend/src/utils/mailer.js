import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

// Development only: console emails are also saved here so they can be read by tools and the
// end-to-end tests (codes, reset links). Git-ignored. Never used in production.
const DEV_OUTBOX_DIR = path.resolve(process.cwd(), '..', '.mail-outbox');

let transport;

/**
 * A pooled SMTP connection with short timeouts. Nodemailer's defaults (2 min to connect,
 * 10 min on an idle socket) let a stalled connection hold an email for many minutes before it
 * even leaves the server. Here a stuck attempt fails within seconds and is retried once.
 */
function getTransport() {
  transport ??= nodemailer.createTransport(config.SMTP_URL, {
    pool: true,
    maxConnections: 2,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

const MAX_SEND_ATTEMPTS = 2;

async function sendViaSmtp(message) {
  for (let attempt = 1; ; attempt += 1) {
    const started = performance.now();
    try {
      const info = await getTransport().sendMail(message);
      // Log timing and the server's reply, never the recipient or content.
      console.log(
        `Email accepted by SMTP in ${Math.round(performance.now() - started)}ms ` +
          `(attempt ${attempt}, ${String(info.response).slice(0, 40)})`,
      );
      return info;
    } catch (err) {
      console.error(
        `SMTP send attempt ${attempt} failed after ${Math.round(performance.now() - started)}ms: ${err.code ?? ''} ${err.message}`,
      );
      if (attempt >= MAX_SEND_ATTEMPTS) throw err;
      // Drop a possibly broken pooled connection before retrying.
      transport.close();
      transport = undefined;
    }
  }
}

// `send` is a property (not a bare function) so tests can intercept outgoing mail.
// In the test environment messages are collected in `mailer.outbox` instead of being sent.
export const mailer = {
  outbox: [],
  async send({ to, subject, text, html }) {
    if (config.isTest) {
      mailer.outbox.push({ to, subject, text, html });
      return;
    }
    if (config.MAIL_PROVIDER === 'console') {
      console.log(
        `\n----- Email (console mailer) -----\nTo: ${to}\nSubject: ${subject}\n\n${text}\n----------------------------------\n`,
      );
      if (!config.isProduction) {
        await mkdir(DEV_OUTBOX_DIR, { recursive: true });
        const file = `${Date.now()}-${to.replace(/[^\w.@-]/g, '_')}.json`;
        await writeFile(
          path.join(DEV_OUTBOX_DIR, file),
          JSON.stringify({ to, subject, text, sentAt: new Date() }),
        );
      }
      return;
    }
    await sendViaSmtp({ from: config.MAIL_FROM, to, subject, text, html });
  },
};

const escapeHtml = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export function sendPasswordResetEmail({ to, name, resetUrl, expiresInMinutes }) {
  const text = [
    `Hi ${name},`,
    '',
    'We received a request to reset your Health Tracker password.',
    `Open this link to choose a new password (valid for ${expiresInMinutes} minutes):`,
    resetUrl,
    '',
    "If you didn't request this, you can ignore this email. Your password won't change.",
  ].join('\n');

  const html = `<p>Hi ${escapeHtml(name)},</p>
<p>We received a request to reset your Health Tracker password.</p>
<p><a href="${escapeHtml(resetUrl)}">Choose a new password</a> (link valid for ${expiresInMinutes} minutes).</p>
<p>If you didn't request this, you can ignore this email. Your password won't change.</p>`;

  return mailer.send({ to, subject: 'Reset your Health Tracker password', text, html });
}

export function sendVerificationCodeEmail({ to, name, code, expiresInMinutes }) {
  const text = [
    `Hi ${name},`,
    '',
    `Your Health Tracker verification code is: ${code}`,
    '',
    `Enter it within ${expiresInMinutes} minutes to finish creating your account.`,
    "If you didn't create an account, you can ignore this email.",
  ].join('\n');

  const html = `<p>Hi ${escapeHtml(name)},</p>
<p>Your Health Tracker verification code is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${code}</p>
<p>Enter it within ${expiresInMinutes} minutes to finish creating your account.</p>
<p>If you didn't create an account, you can ignore this email.</p>`;

  return mailer.send({
    to,
    subject: `${code} is your Health Tracker verification code`,
    text,
    html,
  });
}

/** Opens and checks the SMTP connection at startup: warms the pool and surfaces bad config early. */
export async function verifyMailer() {
  if (config.MAIL_PROVIDER !== 'smtp' || config.isTest) return;
  const started = performance.now();
  try {
    await getTransport().verify();
    console.log(`SMTP ready (${Math.round(performance.now() - started)}ms)`);
  } catch (err) {
    console.error(
      `SMTP check failed: ${err.code ?? ''} ${err.message} — emails will not be delivered until this is fixed.`,
    );
  }
}
