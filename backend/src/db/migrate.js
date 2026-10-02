// Minimal SQL migration runner. Applies database/migrations/NNNN_name.sql files in order,
// each in its own transaction, and records them in schema_migrations. Safe to run on every
// deploy: already-applied files are skipped, and an advisory lock prevents concurrent runs.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../database/migrations',
);
const LOCK_ID = 727274; // arbitrary constant shared by all runners of this app
const FILE_PATTERN = /^\d{4}_[\w-]+\.sql$/;

export async function migrate({ log = console.log } = {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
    `);

    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => FILE_PATTERN.test(f)).sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
      }
      log(`Applied ${file}`);
      count += 1;
    }
    log(count ? `${count} migration(s) applied.` : 'Database is up to date.');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

// Run directly: `npm run migrate`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err.message);
      await pool.end();
      process.exit(1);
    });
}
