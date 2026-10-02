import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

// Development only: console emails are also saved here so they can be read by tools and the
// end-to-end tests (codes, reset links). Git-ignored. Never used in production.
const DEV_OUTBOX_DIR = path.resolve(process.cwd(), '..', '.mail-outbox');

const MAX_SEND_ATTEMPTS = 2;
const HTTP_TIMEOUT_MS = 15_000;

const escapeHtml = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** `Health Tracker <no-reply@example.com>` → `{ name, email }`. */
export function parseAddress(value) {
  const match = /^\s*"?(.*?)"?\s*<([^>]+)>\s*$/.exec(value);
  return match ? { name: match[1] || undefined, email: match[2].trim() } : { email: value.trim() };
}

/**
 * Email providers that work over HTTPS (port 443). Many hosts — including Render's free
 * instances — block outbound SMTP ports (25/465/587) at the firewall, so an SMTP send there
 * hangs until it times out. These APIs are unaffected by that.
 */
const HTTP_PROVIDERS = {
  brevo: {
    label: 'Brevo',
    endpoint: 'https://api.brevo.com/v3/smtp/email',
    verifyEndpoint: 'https://api.brevo.com/v3/account',
    headers: (apiKey) => ({ 'api-key': apiKey, accept: 'application/json' }),
    body: ({ from, to, subject, text, html }) => ({
      sender: parseAddress(from),
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
    messageId: (data) => data?.messageId,
  },
  resend: {
    label: 'Resend',
    endpoint: 'https://api.resend.com/emails',
    headers: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
    body: ({ from, to, subject, text, html }) => ({ from, to: [to], subject, text, html }),
    messageId: (data) => data?.id,
  },
};

/** 4xx means the request itself is wrong (bad key, unverified sender): retrying cannot help. */
const isRetryable = (status) => !status || status === 429 || status >= 500;

/** Exported so tests can exercise each provider without changing the frozen config. */
export async function sendViaHttpApi(
  message,
  providerName = config.MAIL_PROVIDER,
  apiKey = config.MAIL_API_KEY,
) {
  const provider = HTTP_PROVIDERS[providerName];
  for (let attempt = 1; ; attempt += 1) {
    const started = performance.now();
    let status;
    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: { ...provider.headers(apiKey), 'content-type': 'application/json' },
        body: JSON.stringify(provider.body(message)),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      status = response.status;
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        // The provider's message says what is wrong (e.g. sender not verified); it carries no
        // recipient or health data.
        throw new Error(
          `${provider.label} returned ${status}: ${JSON.stringify(data)?.slice(0, 200)}`,
        );
      }
      console.log(
        `Email accepted by ${provider.label} in ${Math.round(performance.now() - started)}ms ` +
          `(attempt ${attempt}, id ${provider.messageId(data) ?? 'unknown'})`,
      );
      return data;
    } catch (err) {
      console.error(
        `${provider.label} send attempt ${attempt} failed after ${Math.round(performance.now() - started)}ms: ${err.message}`,
      );
      if (attempt >= MAX_SEND_ATTEMPTS || !isRetryable(status)) throw err;
    }
  }
}

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
      if (err.code === 'ETIMEDOUT' || err.code === 'ENETUNREACH' || err.code === 'ECONNREFUSED') {
        console.error(
          'Hint: the SMTP port looks blocked or unreachable from this host. Render blocks ports ' +
            '25/465/587 on free instances — use MAIL_PROVIDER=brevo or resend (HTTPS) instead.',
        );
      }
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

    // Brevo requires HTML content; fall back to the plain text when a caller sends none.
    const message = {
      from: config.MAIL_FROM,
      to,
      subject,
      text,
      html: html ?? `<pre>${escapeHtml(text)}</pre>`,
    };
    if (HTTP_PROVIDERS[config.MAIL_PROVIDER]) return sendViaHttpApi(message);
    return sendViaSmtp(message);
  },
};

/** Checks the mail configuration at startup so a bad key or blocked port shows up immediately. */
export async function verifyMailer() {
  if (config.isTest) return;
  const provider = HTTP_PROVIDERS[config.MAIL_PROVIDER];
  const started = performance.now();

  if (config.MAIL_PROVIDER === 'console') {
    console.log('Mailer: console — emails are logged, not delivered.');
    return;
  }

  if (provider) {
    console.log(
      `Mailer: ${provider.label} over HTTPS, from ${parseAddress(config.MAIL_FROM).email}`,
    );
    if (!provider.verifyEndpoint) return;
    try {
      const response = await fetch(provider.verifyEndpoint, {
        headers: provider.headers(config.MAIL_API_KEY),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`key check returned ${response.status}`);
      console.log(
        `${provider.label} API key accepted (${Math.round(performance.now() - started)}ms)`,
      );
    } catch (err) {
      console.error(
        `${provider.label} check failed: ${err.message} — emails will not be delivered.`,
      );
    }
    return;
  }

  console.log(`Mailer: SMTP via ${new URL(config.SMTP_URL).hostname}`);
  try {
    await getTransport().verify();
    console.log(`SMTP ready (${Math.round(performance.now() - started)}ms)`);
  } catch (err) {
    console.error(
      `SMTP check failed: ${err.code ?? ''} ${err.message} — emails will not be delivered until this is fixed.`,
    );
  }
}

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
