import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

let transport;

function getTransport() {
  transport ??= nodemailer.createTransport(config.SMTP_URL);
  return transport;
}

// `send` is a property (not a bare function) so tests can intercept outgoing mail.
export const mailer = {
  async send({ to, subject, text, html }) {
    if (config.MAIL_PROVIDER === 'console') {
      console.log(
        `\n----- Email (console mailer) -----\nTo: ${to}\nSubject: ${subject}\n\n${text}\n----------------------------------\n`,
      );
      return;
    }
    await getTransport().sendMail({ from: config.MAIL_FROM, to, subject, text, html });
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
