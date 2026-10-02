import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectSoundLayout } from './helpers.js';

// A real 8×8 PNG and a minimal PDF.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n');

test.beforeEach(async ({ page }) => {
  const features = await page.request.get('/api/features');
  test.skip(
    features.status() === 401 ? false : !(await features.json()).attachments,
    'Uploads not configured',
  );
});

async function register(page) {
  await page.goto('/register');
  await page.getByRole('heading', { name: 'Create your account' }).waitFor();
  await page.getByLabel('Name').fill('Files Tester');
  await page
    .getByLabel('Email')
    .fill(`files-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('correct-horse-battery');
  await page.getByRole('textbox', { name: 'Confirm password' }).fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Files/ })).toBeVisible();
}

test('attach records while adding an event, then view, download and delete them', async ({
  page,
}) => {
  await register(page);
  await page.goto('/events/new');
  await page.getByRole('radio', { name: 'Fever' }).check();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not allowed') },
  ]);
  await expect(
    page.getByText('notes.txt: only photos (JPG, PNG, WebP, HEIC) and PDFs can be attached.'),
  ).toBeVisible();

  await fileInput.setInputFiles([
    { name: 'lab report.png', mimeType: 'image/png', buffer: PNG },
    { name: 'prescription.pdf', mimeType: 'application/pdf', buffer: PDF },
  ]);
  await expect(
    page.getByRole('list', { name: 'Files to upload' }).getByRole('listitem'),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Save event' }).click();

  // Uploads finish on the event page
  await expect(page.getByRole('heading', { level: 1, name: 'Fever' })).toBeVisible();
  await expect(page.getByText('2 files uploaded.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Records & files (2)' })).toBeVisible();

  // Image preview loads the actual image through the API
  await page.getByRole('button', { name: 'lab report.png', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'lab report.png' }).getByRole('img');
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((img) => img.naturalWidth)).toBe(8);
  await page.keyboard.press('Escape');

  // Download keeps the original file name
  const downloadHref = await page
    .getByRole('link', { name: 'Download prescription.pdf' })
    .getAttribute('href');
  const download = await page.request.get(downloadHref);
  expect(download.headers()['content-disposition']).toContain("filename*=UTF-8''prescription.pdf");
  expect(download.headers()['content-type']).toBe('application/pdf');

  // History shows the count
  await page.goto('/history');
  await expect(page.getByText('2 files')).toBeVisible();

  // Delete with confirmation
  await page.getByRole('link', { name: 'Fever', exact: true }).click();
  await page.getByRole('button', { name: 'Delete prescription.pdf' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this file?' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByText('File deleted.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Records & files (1)' })).toBeVisible();
});

test('the files card is accessible and fits a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await register(page);
  await page.goto('/events/new');
  await page.getByRole('radio', { name: 'Cold' }).check();
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: 'a-very-long-file-name-for-a-blood-test-report-from-the-clinic.png',
      mimeType: 'image/png',
      buffer: PNG,
    },
  ]);
  await page.getByRole('button', { name: 'Save event' }).click();
  await expect(page.getByText('File uploaded.')).toBeVisible();

  await expectSoundLayout(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('tag records, then find them by tag in History → Records', async ({ page }) => {
  await register(page);

  // Tag a file while adding an event
  await page.goto('/events/new');
  await page.getByRole('radio', { name: 'Flu' }).check();
  await page
    .locator('input[type="file"]')
    .setInputFiles([{ name: 'flu-prescription.pdf', mimeType: 'application/pdf', buffer: PDF }]);
  await page.getByRole('button', { name: 'Add tags to flu-prescription.pdf' }).click();
  await page.getByRole('button', { name: 'Add tag Prescription' }).click();
  const tagField = page.getByRole('textbox', { name: 'Tags for flu-prescription.pdf' });
  await tagField.fill('Dr Mehta');
  await tagField.press('Enter');
  await expect(page.getByRole('list', { name: 'Added tags' }).getByRole('listitem')).toHaveText([
    'Prescription',
    'Dr Mehta',
  ]);
  await page.getByRole('button', { name: 'Save event' }).click();
  await expect(page.getByText('File uploaded.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Tags' }).first()).toContainText('Prescription');

  // A second event with a lab report, tagged afterwards from the event page
  await page.goto('/events/new');
  await page.getByRole('radio', { name: 'Fever' }).check();
  await page
    .locator('input[type="file"]')
    .setInputFiles([{ name: 'cbc.png', mimeType: 'image/png', buffer: PNG }]);
  await page.getByRole('button', { name: 'Save event' }).click();
  await expect(page.getByText('File uploaded.')).toBeVisible();
  await page.getByRole('button', { name: 'Edit tags for cbc.png' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit tags' });
  await dialog.getByRole('button', { name: 'Add tag Lab report' }).click();
  await dialog.getByRole('button', { name: 'Save tags' }).click();
  await expect(page.getByText('Tags saved.')).toBeVisible();

  // Records tab: filter by tag, search, and jump to the event
  await page.goto('/history');
  await page.getByRole('tab', { name: 'Records' }).click();
  await expect(page.getByRole('tab', { name: 'Records' })).toHaveAttribute('aria-selected', 'true');
  const records = page.getByRole('tabpanel', { name: 'Records' });
  await expect(records.getByRole('button', { name: 'cbc.png', exact: true })).toBeVisible();
  await expect(
    records.getByRole('link', { name: 'flu-prescription.pdf (opens in a new tab)' }),
  ).toBeVisible();

  const tagFilter = page.getByRole('group', { name: 'Filter by tag' });
  await tagFilter.getByRole('button', { name: /^Prescription/ }).click();
  await expect(tagFilter.getByRole('button', { name: /^Prescription/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    records.getByRole('link', { name: 'flu-prescription.pdf (opens in a new tab)' }),
  ).toBeVisible();
  await expect(records.getByRole('button', { name: 'cbc.png', exact: true })).toHaveCount(0);

  await tagFilter.getByRole('button', { name: 'All' }).click();
  await page.getByRole('searchbox', { name: 'Search records' }).fill('mehta');
  await expect(
    records.getByRole('link', { name: 'flu-prescription.pdf (opens in a new tab)' }),
  ).toBeVisible();
  await expect(records.getByRole('button', { name: 'cbc.png', exact: true })).toHaveCount(0);

  await records.getByRole('link', { name: 'Flu', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Flu' })).toBeVisible();

  // Event search also finds documents by tag; the chosen tab is remembered
  await page.goto('/history');
  await expect(page.getByRole('tab', { name: 'Records' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Records' }).press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Events' })).toBeFocused();
  await page.getByRole('searchbox', { name: 'Search health events' }).fill('lab report');
  await expect(page.getByRole('link', { name: 'Fever', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Flu', exact: true })).toHaveCount(0);

  // Accessible and phone-friendly
  await page.getByRole('tab', { name: 'Records' }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  await expectSoundLayout(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
