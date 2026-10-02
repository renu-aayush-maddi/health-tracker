import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { request } from '@playwright/test';

export const DEMO = { email: 'demo@example.com', password: 'demo-password-123' };
export const DEMO_STATE = new URL('./.auth/demo.json', import.meta.url).pathname;
const BASE = 'http://localhost:5173';

/** Reseeds the demo account and stores a signed-in session for tests to reuse. */
export default async function globalSetup() {
  execSync('npm run seed', { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  mkdirSync(new URL('./.auth', import.meta.url).pathname, { recursive: true });
  const api = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
  const res = await api.post('/api/auth/login', { data: DEMO });
  if (!res.ok()) throw new Error(`Demo login failed: ${res.status()}`);
  await api.storageState({ path: DEMO_STATE });
  await api.dispose();
}
