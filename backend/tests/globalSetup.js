import pg from 'pg';

/** Refuses to touch anything that doesn't look like a disposable local test database. */
function assertSafeTestDatabase(url) {
  if (!url) throw new Error('TEST_DATABASE_URL must be set to run backend tests.');
  const { hostname, pathname } = new URL(url);
  if (hostname.includes('supabase') || !pathname.includes('test')) {
    throw new Error(
      `Refusing to run destructive tests against ${hostname}${pathname}. Use a local *_test database.`,
    );
  }
}

export async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  assertSafeTestDatabase(url);

  // Start every run from an empty schema, then apply all migrations.
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();

  const { migrate } = await import('../src/db/migrate.js');
  const { pool } = await import('../src/db/pool.js');
  await migrate({ log: () => {} });
  await pool.end();
}
