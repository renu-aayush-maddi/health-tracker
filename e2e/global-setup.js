import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { request } from '@playwright/test';
import { E2E } from './playwright.config.js';

export const DEMO = { email: 'demo@example.com', password: 'demo-password-123' };
export const DEMO_STATE = new URL('./.auth/demo.json', import.meta.url).pathname;
export const ADMIN = { email: 'admin@example.com', password: 'admin-password-123' };
export const ADMIN_STATE = new URL('./.auth/admin.json', import.meta.url).pathname;
const BASE = E2E.appUrl;

/** Reseeds the demo account and stores a signed-in session for tests to reuse. */
export default async function globalSetup() {
  execSync('npm run seed', {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: E2E.databaseUrl },
  });
  mkdirSync(new URL('./.auth', import.meta.url).pathname, { recursive: true });
  const api = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
  const res = await api.post('/api/auth/login', { data: DEMO });
  if (!res.ok()) throw new Error(`Demo login failed: ${res.status()}`);
  await api.storageState({ path: DEMO_STATE });
  await api.dispose();

  const adminApi = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
  const adminRes = await adminApi.post('/api/auth/login', { data: ADMIN });
  if (!adminRes.ok()) throw new Error(`Admin login failed: ${adminRes.status()}`);
  await adminApi.storageState({ path: ADMIN_STATE });
  await adminApi.dispose();
}
