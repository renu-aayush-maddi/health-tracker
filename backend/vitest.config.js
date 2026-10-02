import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile('../.env');
} catch {
  // No .env file (e.g. CI): variables come from the environment.
}
process.env.NODE_ENV = 'test';
// Tests decide for themselves when rate limits apply (see ENABLE_RATE_LIMITS in auth.test.js).
process.env.DISABLE_RATE_LIMITS = 'false';
// Fixed test-only backup key and a small retention, so the backup job can be tested quickly.
process.env.BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.BACKUP_RETENTION = '2';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/globalSetup.js',
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
