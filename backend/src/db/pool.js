import pg from 'pg';
import { config } from '../config/env.js';

// Return DATE columns as 'YYYY-MM-DD' strings instead of JS Dates, avoiding time-zone shifts.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value) => value);

function sslOptions() {
  if (config.DATABASE_SSL_CA) {
    return { ca: config.DATABASE_SSL_CA.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  }
  return config.isProduction ? { rejectUnauthorized: true } : false;
}

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  ssl: sslOptions(),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('Unexpected idle database client error:', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Runs `work(client)` inside a transaction, rolling back on any thrown error. */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
