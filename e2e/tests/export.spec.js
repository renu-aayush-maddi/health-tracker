import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { DEMO_STATE } from '../global-setup.js';

test.use({ storageState: DEMO_STATE });

test('downloads an Excel copy of my data from Settings', async ({ page }) => {
  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data (Excel)' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^health-tracker-\d{4}-\d{2}-\d{2}\.xlsx$/);
  await expect(page.getByText(/^Downloaded health-tracker-/)).toBeVisible();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  expect(workbook.worksheets.map((w) => w.name)).toEqual([
    'About',
    'Health events',
    'Medicines',
    'Files',
  ]);

  const titles = workbook.getWorksheet('Health events').getColumn(1).values.slice(2);
  expect(titles.length).toBeGreaterThan(0);
  const header = workbook.getWorksheet('Health events').getRow(1).values.slice(1);
  expect(header.slice(0, 4)).toEqual(['Event ID', 'Title', 'Health issue', 'Start date']);
  const allTitles = workbook.getWorksheet('Health events').getColumn(2).values.slice(2);
  expect(allTitles).toContain('Fever after travel');
  expect(workbook.getWorksheet('Medicines').getColumn(3).values).toContain('Paracetamol');
});
