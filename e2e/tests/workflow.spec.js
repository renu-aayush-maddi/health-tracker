import { expect, test } from '@playwright/test';

const PASSWORD = 'correct-horse-battery';

async function register(page, name) {
  const email = `${name.toLowerCase()}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;
  await page.goto('/register');
  await page.getByRole('heading', { name: 'Create your account' }).waitFor();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD);
  await page.getByRole('textbox', { name: 'Confirm password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(name) })).toBeVisible();
  return email;
}

test('primary workflow: add an event, find it, see it on the calendar, edit it, delete it', async ({
  page,
}) => {
  await register(page, 'Asha');
  await expect(page.getByText('No health events yet.')).toBeVisible();

  // Add
  await page.getByRole('link', { name: 'Add health event' }).click();
  await page.getByRole('radio', { name: 'Fever' }).check();
  await page.getByLabel('Started').fill(new Date().toLocaleDateString('en-CA'));
  await page.getByRole('radio', { name: 'Moderate' }).check();
  const symptoms = page.getByRole('textbox', { name: 'Symptoms' });
  await symptoms.fill('Body pain');
  await symptoms.press('Enter');
  await page.getByRole('button', { name: 'Add medicine' }).click();
  await page.getByLabel('Medicine name').fill('Paracetamol');
  await page.getByLabel('Dosage').fill('500 mg');
  await page.getByLabel('Frequency').fill('Twice a day');
  await page.getByRole('button', { name: 'Save event' }).click();

  await expect(page.getByText('Health event added successfully.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Fever' })).toBeVisible();
  await expect(page.getByText('500 mg · Twice a day')).toBeVisible();

  // Find it in history by medicine name
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'History' })
    .click();
  await page.getByRole('searchbox', { name: 'Search health events' }).fill('paracet');
  await expect(page.getByRole('link', { name: 'Fever', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search health events' }).fill('ibuprofen');
  await expect(page.getByText('No events match your search.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();

  // Calendar shows it today
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Calendar' })
    .click();
  await expect(page.getByRole('link', { name: 'Fever' }).first()).toBeVisible();

  // Edit: mark resolved via the form and rename
  await page.getByRole('link', { name: 'Fever' }).first().click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Title').fill('Evening fever');
  await page.getByRole('switch', { name: 'Still ongoing' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Health event updated successfully.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Evening fever' })).toBeVisible();
  await expect(page.getByText('Status: Resolved')).toBeVisible();

  // Delete requires confirmation; Cancel keeps it
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(
    page.getByText('This will permanently delete this health record and its associated medicines.'),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Evening fever' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Health event deleted successfully.')).toBeVisible();
  await expect(page.getByText('No health events yet.')).toBeVisible();
});

test("a user cannot open another user's event, even with its URL", async ({ browser }) => {
  const alice = await browser.newPage();
  await register(alice, 'Alice');
  await alice.goto('/events/new');
  await alice.getByRole('radio', { name: 'Migraine' }).check();
  await alice.getByLabel('Title').fill('Private migraine');
  await alice.getByRole('button', { name: 'Save event' }).click();
  await expect(alice.getByRole('heading', { level: 1, name: 'Private migraine' })).toBeVisible();
  const eventUrl = alice.url();

  const bob = await browser.newPage(); // separate context: separate cookies
  await register(bob, 'Bob');
  await bob.goto(eventUrl);
  await expect(bob.getByText('Health event not found')).toBeVisible();
  await expect(bob.getByText('Private migraine')).toHaveCount(0);
  await bob.goto(`${eventUrl.replace('/history/', '/events/')}/edit`);
  await expect(bob.getByText('Health event not found')).toBeVisible();
  await bob.goto('/history');
  await expect(bob.getByText('No health events yet.')).toBeVisible();
});

test('protected pages redirect to login, then back after signing in', async ({ page }) => {
  const email = await register(page, 'Ravi');
  await page
    .getByRole('button', { name: 'Account settings for Ravi' })
    .or(page.getByRole('link', { name: 'Settings' }).first())
    .first()
    .click();
  await page.getByRole('button', { name: 'Log out' }).first().click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
});

test('an expired session sends the user back to login with an explanation', async ({
  page,
  context,
}) => {
  await register(page, 'Lena');
  await context.clearCookies(); // simulates the session ending (expiry, logout elsewhere)
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'History' })
    .click();
  await expect(page.getByText('Your session has ended. Please log in again.')).toBeVisible();
});

test('leaving the form with unsaved changes asks for confirmation', async ({ page }) => {
  await register(page, 'Omar');
  await page.goto('/events/new');
  await page.getByRole('radio', { name: 'Cough' }).check();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Dashboard' })
    .click();
  const discard = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Cough');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Dashboard' })
    .click();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Omar/ })).toBeVisible();
});
