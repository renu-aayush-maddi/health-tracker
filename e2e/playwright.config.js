import { defineConfig, devices } from '@playwright/test';

// Runs against the local dev servers (started automatically if not already running) and the
// local dev database, which global setup seeds with the demo account.
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: 60_000,
  fullyParallel: true,
  // The Vite dev server compiles modules on demand; a few workers keep it responsive.
  workers: 3,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  globalSetup: './global-setup.js',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    cwd: '..',
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
