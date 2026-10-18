import { expect, test } from '@playwright/test';
import { DEMO_STATE } from '../global-setup.js';

test.describe('signed in', () => {
  test.use({ storageState: DEMO_STATE });

  test('/index.html opens the dashboard instead of "Page not found"', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('heading', { level: 1, name: /Good (morning|afternoon|evening)/ }),
    ).toBeVisible();
    await expect(page.getByText('Page not found')).toHaveCount(0);
  });

  test('a genuinely unknown address still shows Page not found', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});

test('signed out, /index.html leads to the login screen', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});
