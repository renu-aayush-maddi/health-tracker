// Creates the first SUPER_ADMIN, or promotes an existing account.
//
//   npm run create-admin
//   npm run create-admin -- --email you@example.com --role super_admin
//
// Nothing is hardcoded: the password is typed at the prompt (hidden) or supplied via the
// ADMIN_PASSWORD environment variable for non-interactive use. Passwords go through the same
// Argon2id hashing as normal sign-up and are never logged.
import readline from 'node:readline';
import {
  ADMIN_ROLES,
  ROLE_LABELS,
  emailField,
  newPasswordField,
  requiredText,
} from '@health-tracker/shared';
import { pool, query, withTransaction } from '../db/pool.js';
import { hashPassword } from '../utils/passwords.js';

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!match) continue;
    if (match[2] !== undefined) {
      flags[match[1]] = match[2];
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
      flags[match[1]] = argv[++i]; // --email value
    } else {
      flags[match[1]] = true; // boolean flag, e.g. --non-interactive
    }
  }
  return flags;
}

function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  let muted = false;
  // Suppress echo while a password is being typed.
  rl._writeToOutput = (chunk) => {
    if (!muted) rl.output.write(chunk);
  };
  return {
    ask: (text) => new Promise((resolve) => rl.question(text, (value) => resolve(value.trim()))),
    askSecret: (text) =>
      new Promise((resolve) => {
        rl.output.write(text);
        muted = true;
        rl.question('', (value) => {
          muted = false;
          rl.output.write('\n');
          resolve(value);
        });
      }),
    close: () => rl.close(),
  };
}

const parseOrExit = (schema, value, label) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    console.error(`${label}: ${result.error.issues[0].message}`);
    process.exit(1);
  }
  return result.data;
};

async function run() {
  const flags = parseFlags(process.argv.slice(2));
  const interactive = Boolean(process.stdin.isTTY) && flags['non-interactive'] === undefined;
  const prompt = interactive ? createPrompt() : null;

  const role = flags.role ?? 'super_admin';
  if (!ADMIN_ROLES.includes(role)) {
    console.error(`--role must be one of: ${ADMIN_ROLES.join(', ')}`);
    process.exit(1);
  }

  const email = parseOrExit(
    emailField,
    flags.email ?? (prompt ? await prompt.ask('Email: ') : ''),
    'Email',
  );

  const { rows } = await query('SELECT id, name, email, role, status FROM users WHERE email = $1', [
    email,
  ]);
  const existing = rows[0];

  if (existing) {
    console.log(
      `Found ${existing.name} <${existing.email}> — currently ${ROLE_LABELS[existing.role]}, ${existing.status}.`,
    );
    if (existing.role === role) {
      console.log('Already has that role. Nothing to do.');
      return;
    }
    if (prompt) {
      const confirm = await prompt.ask(`Promote to ${ROLE_LABELS[role]}? [y/N] `);
      if (confirm.toLowerCase() !== 'y') {
        console.log('Cancelled.');
        return;
      }
    }
    await withTransaction(async (client) => {
      await client.query('UPDATE users SET role = $2 WHERE id = $1', [existing.id, role]);
      await client.query(
        `INSERT INTO audit_logs (actor_email, actor_role, action, resource_type, resource_id,
                                 target_user_id, target_email, metadata)
         VALUES ('cli', 'system', 'USER_ROLE_CHANGED', 'user', $1, $1, $2, $3)`,
        [existing.id, existing.email, { from: existing.role, to: role, via: 'create-admin CLI' }],
      );
    });
    console.log(`${existing.email} is now ${ROLE_LABELS[role]}.`);
    return;
  }

  const name = parseOrExit(
    requiredText('Name', 100),
    flags.name ?? (prompt ? await prompt.ask('Name: ') : ''),
    'Name',
  );
  const password = parseOrExit(
    newPasswordField,
    process.env.ADMIN_PASSWORD ?? (prompt ? await prompt.askSecret('Password (hidden): ') : ''),
    'Password',
  );

  const passwordHash = await hashPassword(password);
  await withTransaction(async (client) => {
    const created = await client.query(
      `INSERT INTO users (name, email, password_hash, role, email_verified_at)
       VALUES ($1, $2, $3, $4, now()) RETURNING id`,
      [name, email, passwordHash, role],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_email, actor_role, action, resource_type, resource_id,
                               target_user_id, target_email, metadata)
       VALUES ('cli', 'system', 'ADMIN_CREATED', 'user', $1, $1, $2, $3)`,
      [created.rows[0].id, email, { role, via: 'create-admin CLI' }],
    );
  });
  console.log(
    `Created ${ROLE_LABELS[role]} ${email}. The email is marked verified; sign in normally.`,
  );
}

run()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err.message);
    await pool.end();
    process.exit(1);
  });
