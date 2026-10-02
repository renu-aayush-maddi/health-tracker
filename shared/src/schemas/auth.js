import { email, object, string } from 'zod';
import { LIMITS } from '../constants.js';
import { requiredText } from './common.js';
import { COMMON_PASSWORDS } from './commonPasswords.js';

export const emailField = string({ error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required.')
  .max(LIMITS.emailMax, 'Email is too long.')
  .pipe(email({ error: 'Enter a valid email address.' }));

/** Password rules for new passwords (registration, change, reset). */
export const newPasswordField = string({ error: 'Password is required.' })
  .min(LIMITS.passwordMin, `Password must be at least ${LIMITS.passwordMin} characters.`)
  .max(LIMITS.passwordMax, `Password must be ${LIMITS.passwordMax} characters or fewer.`)
  .refine(
    (pw) => !COMMON_PASSWORDS.has(pw.toLowerCase()),
    'This password is too common. Choose another.',
  )
  .refine((pw) => new Set(pw).size > 2, 'Password is too simple. Choose another.');

/** Existing passwords are only checked for presence; policy may have changed since they were set. */
const existingPasswordField = (label) =>
  string({ error: `${label} is required.` })
    .min(1, `${label} is required.`)
    .max(LIMITS.passwordMax, `${label} is too long.`);

const confirmField = string({ error: 'Please confirm your password.' }).min(
  1,
  'Please confirm your password.',
);

const passwordsMatch = (passwordKey) => (data, ctx) => {
  if (data[passwordKey] !== data.confirmPassword) {
    ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match.' });
  }
};

export const registerSchema = object({
  name: requiredText('Name', LIMITS.nameMax),
  email: emailField,
  password: newPasswordField,
  confirmPassword: confirmField,
})
  .superRefine(passwordsMatch('password'))
  .superRefine((data, ctx) => {
    if (data.password.toLowerCase() === data.email) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Password cannot be your email.',
      });
    }
  });

export const loginSchema = object({
  email: emailField,
  password: existingPasswordField('Password'),
});

export const changePasswordSchema = object({
  currentPassword: existingPasswordField('Current password'),
  newPassword: newPasswordField,
  confirmPassword: confirmField,
})
  .superRefine(passwordsMatch('newPassword'))
  .superRefine((data, ctx) => {
    if (data.newPassword === data.currentPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'New password must be different from your current password.',
      });
    }
  });

export const forgotPasswordSchema = object({ email: emailField });

export const resetPasswordSchema = object({
  token: string({ error: 'Reset link is invalid.' }).min(20, 'Reset link is invalid.').max(200),
  newPassword: newPasswordField,
  confirmPassword: confirmField,
}).superRefine(passwordsMatch('newPassword'));
