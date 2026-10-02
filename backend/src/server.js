import { createApp } from './app.js';
import { config } from './config/env.js';
import { pool } from './db/pool.js';
import { deleteExpiredSessionsAndTokens } from './modules/auth/session.repository.js';
import { deleteStaleUnverifiedUsers } from './modules/auth/verification.repository.js';

const app = createApp();

if (config.fileStorage === 'memory') {
  console.warn(
    '⚠ FILE_STORAGE=memory: uploaded files live in memory and are lost when the API restarts.',
  );
} else if (!config.attachmentsEnabled) {
  console.warn('File attachments are disabled: set CLOUDINARY_URL to enable them.');
}

const server = app.listen(config.PORT, () => {
  console.log(`API listening on port ${config.PORT} (${config.NODE_ENV})`);
});

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UNVERIFIED_ACCOUNT_DAYS = 7;
const runCleanup = () =>
  Promise.all([
    deleteExpiredSessionsAndTokens(),
    deleteStaleUnverifiedUsers(UNVERIFIED_ACCOUNT_DAYS),
  ]).catch((err) => console.error('Session cleanup failed:', err.message));
runCleanup();
setInterval(runCleanup, CLEANUP_INTERVAL_MS).unref();

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
