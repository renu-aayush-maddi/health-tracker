import { query } from '../../db/pool.js';
import { config } from '../../config/env.js';

const startedAt = Date.now();

/**
 * Operational status only. Deliberately reports *whether* things are configured, never the
 * values: no connection strings, keys, secrets or environment variables leave this endpoint.
 */
export async function getSystemHealth() {
  const database = await checkDatabase();
  const [events, errors] = await Promise.all([
    query(
      `SELECT count(*)::int AS total FROM security_events WHERE created_at > now() - interval '24 hours'`,
    ),
    query(
      `SELECT count(*)::int AS total FROM security_events
        WHERE success = false AND created_at > now() - interval '24 hours'`,
    ),
  ]);

  return {
    api: {
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      environment: config.NODE_ENV,
    },
    database,
    integrations: {
      email: { provider: config.MAIL_PROVIDER, configured: config.MAIL_PROVIDER !== 'console' },
      fileStorage: { provider: config.fileStorage, configured: config.attachmentsEnabled },
      backups: {
        configured: Boolean(config.BACKUP_ENCRYPTION_KEY),
        retention: config.BACKUP_RETENTION,
      },
    },
    activity: { securityEvents24h: events.rows[0].total, failedEvents24h: errors.rows[0].total },
  };
}

async function checkDatabase() {
  const started = performance.now();
  try {
    const { rows } = await query(
      `SELECT (SELECT count(*)::int FROM schema_migrations) AS migrations,
              (SELECT max(version) FROM schema_migrations) AS latest`,
    );
    return {
      status: 'ok',
      latencyMs: Math.round(performance.now() - started),
      migrations: rows[0].migrations,
      latestMigration: rows[0].latest,
    };
  } catch {
    // The message could contain connection details, so it is not forwarded.
    return { status: 'error', latencyMs: Math.round(performance.now() - started) };
  }
}
