// Creates the isolated end-to-end database if it doesn't exist yet. Migrations run afterwards.
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL);
const name = url.pathname.slice(1);
if (!/_e2e$/.test(name))
  throw new Error(`Refusing to prepare "${name}": the e2e database name must end in _e2e.`);

const admin = new pg.Client({
  connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString(),
});
await admin.connect();
const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
if (!rowCount) await admin.query(`CREATE DATABASE "${name}"`);
await admin.end();
