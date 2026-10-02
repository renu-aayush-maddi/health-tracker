import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DEMO_STATE } from '../global-setup.js';
import { waitForContent } from './helpers.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoViolations(page, context) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = violations.map(
    (v) =>
      `${context}: [${v.impact}] ${v.id} — ${v.help}\n    ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join('\n    ')}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

for (const colorScheme of ['light', 'dark']) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test('signed-out pages have no WCAG violations', async ({ page }) => {
      for (const path of ['/login', '/register', '/forgot-password']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectNoViolations(page, `${colorScheme} ${path}`);
      }
      // Form validation state too
      await page.goto('/register');
      await page.getByRole('button', { name: 'Create account' }).click();
      await expectNoViolations(page, `${colorScheme} register errors`);
    });

    test.describe('app', () => {
      test.use({ storageState: DEMO_STATE });

      for (const width of [375, 1280]) {
        test(`app pages have no WCAG violations at ${width}px`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto('/history');
          const detail = await page
            .getByRole('link', { name: 'Fever after travel', exact: true })
            .getAttribute('href');

          for (const path of ['/', '/history', detail, '/calendar', '/events/new', '/settings']) {
            await page.goto(path);
            await waitForContent(page);
            await expectNoViolations(page, `${colorScheme} ${width}px ${path}`);
          }

          // Open states: validation errors and a modal dialog
          await page.goto('/events/new');
          await page.getByRole('button', { name: 'Save event' }).click();
          await expectNoViolations(page, `${colorScheme} ${width}px add-event errors`);
          await page.goto(detail);
          await page.getByRole('button', { name: 'Delete', exact: true }).click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          // Let the open animation finish so contrast is measured at full opacity.
          await dialog.evaluate((el) =>
            Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
          );
          await expectNoViolations(page, `${colorScheme} ${width}px delete dialog`);
        });
      }
    });
  });
}

test.describe('keyboard', () => {
  test.use({ storageState: DEMO_STATE });

  test('skip link, visible focus and dialog focus management', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await waitForContent(page);

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();

    // Delete dialog: focus starts on Cancel, Escape closes it and returns focus to the trigger.
    await page.goto('/history');
    await page.getByRole('link', { name: 'Fever after travel', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Fever after travel' })).toBeVisible();
    const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
    await deleteButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Delete health event?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(deleteButton).toBeFocused();
  });

  test('the add-event form can be completed with the keyboard alone', async ({ page }) => {
    await page.goto('/events/new');
    await page.getByRole('radio', { name: 'Fever' }).focus();
    await page.keyboard.press('ArrowRight'); // radios: arrow keys move the selection
    await expect(page.getByRole('radio', { name: 'Cold' })).toBeChecked();
    await expect(page.getByLabel('Title')).toHaveValue('Cold');
    await page.getByRole('switch', { name: 'Still ongoing' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Ended')).toBeVisible();
  });
});
