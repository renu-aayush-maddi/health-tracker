import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against their OWN servers and database, never your dev servers:
// they can't send real email (console mailer), touch Cloudinary (in-memory files) or modify
// your dev data. Ports 4100 (API) and 5174 (app); database health_tracker_e2e.
export const E2E = {
  apiPort: 4100,
  appUrl: 'http://localhost:5174',
  databaseUrl: process.env.E2E_DATABASE_URL ?? 'postgres://localhost:5432/health_tracker_e2e',
};

const apiEnv = {
  NODE_ENV: 'development',
  PORT: String(E2E.apiPort),
  DATABASE_URL: E2E.databaseUrl,
  APP_ORIGIN: E2E.appUrl,
  MAIL_PROVIDER: 'console',
  SMTP_URL: '',
  FILE_STORAGE: 'memory',
  CLOUDINARY_URL: '',
  BACKUP_ENCRYPTION_KEY: '',
  DISABLE_RATE_LIMITS: 'true',
};

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
    baseURL: E2E.appUrl,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Explicit env vars win over ../.env (Node's --env-file never overrides existing values).
      command:
        'node e2e/scripts/prepare-db.mjs && npm run migrate -w backend && npm start -w backend',
      cwd: '..',
      env: apiEnv,
      url: `http://localhost:${E2E.apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w frontend -- --port 5174',
      cwd: '..',
      env: { API_PROXY_TARGET: `http://localhost:${E2E.apiPort}` },
      url: `${E2E.appUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
