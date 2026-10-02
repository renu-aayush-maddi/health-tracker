import { expect, test } from '@playwright/test';
import { DEMO_STATE } from '../global-setup.js';
import { expectSoundLayout, waitForContent, WIDTHS } from './helpers.js';

const SCREENSHOTS = new URL('../screenshots/', import.meta.url).pathname;

test.describe('signed-out pages', () => {
  for (const width of WIDTHS) {
    test(`login and register at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ['/login', '/register', '/forgot-password']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectSoundLayout(page);
      }
      await page.screenshot({ path: `${SCREENSHOTS}register-${width}.png`, fullPage: true });
    });
  }
});

test.describe('app pages', () => {
  test.use({ storageState: DEMO_STATE });

  let detailPath;
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ storageState: DEMO_STATE });
    await page.goto('/history');
    detailPath = await page
      .getByRole('link', { name: 'Fever after travel', exact: true })
      .getAttribute('href');
    await page.close();
  });

  for (const width of WIDTHS) {
    test(`every page at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      const pages = {
        dashboard: '/',
        history: '/history',
        detail: detailPath,
        calendar: '/calendar',
        add: '/events/new',
        edit: `/events/${detailPath.split('/').pop()}/edit`,
        settings: '/settings',
      };

      for (const [name, path] of Object.entries(pages)) {
        await page.goto(path);
        await waitForContent(page);
        // Navigation is always available: bottom bar on phones, sidebar/rail from tablets up.
        const nav = page.getByRole('navigation', { name: 'Main' });
        await expect(nav.filter({ visible: true })).toHaveCount(1);
        await expectSoundLayout(page);
        await page.screenshot({ path: `${SCREENSHOTS}${name}-${width}.png`, fullPage: true });
      }
    });
  }

  test('history filters panel works on a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/history');
    await expect(page.getByLabel('Status')).toBeHidden();
    await page.getByRole('button', { name: /Filters/ }).click();
    await page.getByLabel('Status').selectOption('ongoing');
    await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Head cold', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Fever after travel', exact: true })).toHaveCount(
      0,
    );
    await expectSoundLayout(page);
  });
});
