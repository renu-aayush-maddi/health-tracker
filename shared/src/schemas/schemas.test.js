import { describe, expect, it } from 'vitest';
import { registerSchema, changePasswordSchema } from './auth.js';
import { toFieldErrors } from './common.js';
import { calendarQuerySchema, healthEventSchema, listEventsQuerySchema } from './healthEvent.js';

const errorsOf = (schema, input) => {
  const result = schema.safeParse(input);
  return result.success ? {} : toFieldErrors(result.error);
};

const event = (overrides) => ({
  title: 'Fever',
  healthIssue: 'Fever',
  startDate: '2026-10-01',
  status: 'ongoing',
  ...overrides,
});

describe('healthEventSchema', () => {
  it('accepts a minimal ongoing event and fills defaults', () => {
    expect(healthEventSchema.parse(event())).toMatchObject({
      endDate: null,
      severity: null,
      symptoms: [],
      medicines: [],
      description: null,
    });
  });

  it('enforces the status / end date rules', () => {
    expect(errorsOf(healthEventSchema, event({ status: 'resolved' })).endDate).toBe(
      'Add an end date, or mark the issue as ongoing.',
    );
    expect(errorsOf(healthEventSchema, event({ endDate: '2026-10-02' })).endDate).toBe(
      "An ongoing issue can't have an end date.",
    );
    expect(
      errorsOf(healthEventSchema, event({ status: 'resolved', endDate: '2026-09-30' })).endDate,
    ).toBe('End date cannot be earlier than start date.');
  });

  it('rejects impossible dates, including non-leap-year February 29', () => {
    expect(errorsOf(healthEventSchema, event({ startDate: '2026-02-29' })).startDate).toBe(
      'Start date must be a valid date.',
    );
    expect(healthEventSchema.safeParse(event({ startDate: '2024-02-29' })).success).toBe(true);
  });

  it('strips unknown fields such as userId', () => {
    expect(healthEventSchema.parse(event({ userId: 'someone-else', id: 'x' }))).not.toHaveProperty(
      'userId',
    );
  });

  it('rejects duplicate medicine ids', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const errors = errorsOf(
      healthEventSchema,
      event({
        medicines: [
          { id, name: 'A' },
          { id, name: 'B' },
        ],
      }),
    );
    expect(errors.medicines).toBe('Each medicine can only appear once.');
  });
});

describe('query schemas', () => {
  it('defaults list paging and sort', () => {
    expect(listEventsQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
      sort: 'start_desc',
      q: null,
    });
  });

  it('limits the calendar range', () => {
    expect(calendarQuerySchema.safeParse({ from: '2026-09-28', to: '2026-11-08' }).success).toBe(
      true,
    );
    expect(errorsOf(calendarQuerySchema, { from: '2026-01-01', to: '2026-12-31' }).to).toMatch(
      /at most 100 days/,
    );
  });
});

describe('auth schemas', () => {
  it('normalizes email and checks password rules', () => {
    const ok = registerSchema.parse({
      name: ' Asha ',
      email: ' Asha@Example.COM ',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
    });
    expect(ok).toMatchObject({ name: 'Asha', email: 'asha@example.com' });

    const errors = errorsOf(registerSchema, {
      name: 'A',
      email: 'a@b.co',
      password: '1234567890',
      confirmPassword: 'x',
    });
    expect(errors.password).toBe('This password is too common. Choose another.');
    expect(errors.confirmPassword).toBe('Passwords do not match.');
  });

  it('requires a new password that differs from the current one', () => {
    const errors = errorsOf(changePasswordSchema, {
      currentPassword: 'same-password-123',
      newPassword: 'same-password-123',
      confirmPassword: 'same-password-123',
    });
    expect(errors.newPassword).toBe('New password must be different from your current password.');
  });
});
