import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN_STATE, DEMO_STATE } from '../global-setup.js';
import { expectSoundLayout, registerAndVerify, settle, waitForContent } from './helpers.js';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

test.describe('the admin area is closed to ordinary users', () => {
  test.use({ storageState: DEMO_STATE });

  test('the demo account sees no admin entry point and cannot open /admin', async ({ page }) => {
    await page.goto('/settings');
    await waitForContent(page);
    await expect(page.getByRole('heading', { name: 'Administration' })).toHaveCount(0);

    await page.goto('/admin');
    // Bounced back to the app, not shown an admin screen.
    await expect(
      page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Platform overview' })).toHaveCount(0);

    // ...and the API refuses regardless of what the browser renders.
    const direct = await page.request.get('/api/admin/users');
    expect(direct.status()).toBe(403);
  });
});

test.describe('super admin', () => {
  test.use({ storageState: ADMIN_STATE });

  test('dashboard shows aggregate figures and charts, with no medical content', async ({
    page,
  }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Platform overview' })).toBeVisible();

    await expect(page.getByText('Total users')).toBeVisible();
    await expect(page.getByRole('img', { name: 'New registrations' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Sign-ins: successful vs failed' })).toBeVisible();

    // The two-series chart identifies its series by label, never by colour alone.
    const loginChart = page
      .getByRole('figure')
      .filter({ hasText: 'Sign-ins: successful vs failed' });
    await expect(loginChart.getByText('Successful', { exact: true }).first()).toBeVisible();
    await expect(loginChart.getByText('Failed', { exact: true }).first()).toBeVisible();

    // Seeded demo data includes "Fever after travel" and "Paracetamol" — neither may appear here.
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/Fever|Paracetamol|Headache/);

    await settle(page);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('users list shows record counts but never record contents', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
    await expect(page.getByRole('link', { name: /demo@example\.com/ })).toBeVisible();

    const table = await page.getByRole('table').innerText();
    expect(table).not.toMatch(/Fever|Paracetamol/);

    await page.getByRole('searchbox', { name: 'Search accounts' }).fill('demo@');
    await expect(page.getByRole('link', { name: /demo@example\.com/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /admin@example\.com/ })).toHaveCount(0);
  });

  test('blocking an account from the UI revokes access and is audited', async ({
    page,
    browser,
  }) => {
    // A throwaway account so the shared demo user is left usable. The context must be explicitly
    // signed out: browser.newPage() inherits this describe block's admin storageState.
    const victimContext = await browser.newContext({ storageState: undefined });
    const victimPage = await victimContext.newPage();
    const victimEmail = await registerAndVerify(victimPage, 'Blocked Target');

    await page.goto('/admin/users');
    await page.getByRole('searchbox', { name: 'Search accounts' }).fill(victimEmail);
    await page.getByRole('link', { name: new RegExp(victimEmail) }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Blocked Target' })).toBeVisible();

    await page.getByLabel('Set status').selectOption('blocked');
    await page.getByRole('button', { name: 'Apply status' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Prevent sign-in')).toBeVisible();
    // A reason is required — confirming without one is refused.
    await dialog.getByRole('button', { name: 'Set Blocked' }).click();
    await expect(dialog.getByText('Give a reason for this change.')).toBeVisible();

    await dialog.getByLabel('Reason').fill('Suspicious account activity');
    await dialog.getByRole('button', { name: 'Set Blocked' }).click();
    await expect(page.getByText('Account is now blocked.')).toBeVisible();
    await expect(page.getByText('Suspicious account activity')).toBeVisible();

    // The victim is locked out immediately.
    await victimPage.goto('/history');
    await expect(victimPage.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await victimContext.close();

    // And the action is in the append-only audit log.
    await page.goto('/admin/audit-logs');
    await expect(page.getByRole('cell', { name: 'User status changed' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: victimEmail }).first()).toBeVisible();
  });

  test('opening a health record warns first, then records the access', async ({ page }) => {
    await page.goto('/admin/health-records');
    await expect(page.getByRole('heading', { level: 1, name: 'Health records' })).toBeVisible();

    // The index is metadata only.
    const table = await page.getByRole('table').innerText();
    expect(table).toContain('Fever');
    expect(table).not.toMatch(/Paracetamol|Temperature spiked/);

    // Other specs add their own records, so target the demo account's Fever event precisely.
    await page.getByRole('searchbox', { name: 'Search health records' }).fill('Fever');
    const row = page
      .getByRole('row')
      .filter({ hasText: 'demo@example.com' })
      .filter({ hasText: 'Fever' });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Open' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/about to read another person/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Open record' }).click();

    // Only now is medical content shown.
    await expect(dialog.getByText('Paracetamol')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.goto('/admin/audit-logs');
    await expect(page.getByRole('cell', { name: 'Health record viewed' }).first()).toBeVisible();

    // The privacy report surfaces that access.
    await page.goto('/admin/reports');
    await expect(page.getByText('Sensitive accesses')).toBeVisible();
    const privacyCard = page
      .getByRole('region')
      .filter({ hasText: 'Privacy — access to medical content' })
      .or(page.locator('section').filter({ hasText: 'Privacy — access to medical content' }))
      .first();
    await expect(privacyCard.getByText('admin@example.com').first()).toBeVisible();
    await expect(privacyCard.getByText('Health record viewed').first()).toBeVisible();
  });

  test('audit log explains that it cannot be edited', async ({ page }) => {
    await page.goto('/admin/audit-logs');
    await expect(page.getByText(/cannot be edited or deleted by anyone/)).toBeVisible();
  });

  test('sessions page never exposes a token', async ({ page }) => {
    await page.goto('/admin/sessions');
    await expect(page.getByRole('heading', { level: 1, name: 'Sessions' })).toBeVisible();
    await expect(page.getByText(/Session tokens are never shown/)).toBeVisible();
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/[a-f0-9]{40,}/i); // no hash-looking strings
  });

  test('system health reveals no secrets', async ({ page }) => {
    await page.goto('/admin/system');
    await expect(page.getByRole('heading', { level: 1, name: 'System health' })).toBeVisible();
    const body = await page.locator('main').innerText();
    expect(body.toLowerCase()).not.toMatch(
      /postgres:\/\/|cloudinary:\/\/|api[_ ]key|password|secret/,
    );
  });

  test('every admin page is accessible and fits a laptop screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const path of [
      '/admin',
      '/admin/users',
      '/admin/security',
      '/admin/audit-logs',
      '/admin/sessions',
      '/admin/ip-addresses',
      '/admin/admins',
      '/admin/system',
      '/admin/reports',
      '/admin/medicines',
    ]) {
      await page.goto(path);
      await waitForContent(page);
      await expectSoundLayout(page);
      await settle(page);
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(violations.map((v) => `${path} — ${v.id}: ${v.help}`)).toEqual([]);
    }
  });
});
