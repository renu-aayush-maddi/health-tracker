# Health Tracker

A private health diary. Each person keeps their own record of health events: what happened, when it started and ended, how severe it was, the symptoms, and the medicines taken. They can review it later as a list or on a calendar.

> Health Tracker only stores what you enter. It does not diagnose conditions, recommend treatments, or judge whether a medicine is appropriate.

**Stack:** React 19 + Vite + React Router (frontend) · Node 24 + Express 5 (API) · PostgreSQL (Supabase in production) · deployed on Render.
The full design (schema, API, auth, security model) is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Features

- Accounts with email + password, **verified by a 6-digit code emailed at signup**. Sessions live in an HttpOnly cookie and are stored server-side.
- Change password, forgot/reset password by email, and delete account with all its data.
- Health events: preset or custom issue, title, dates (or _ongoing_), severity, symptoms, notes, and any number of medicines (dosage, frequency, dates, notes).
- Dashboard: totals, ongoing issues with a one-tap "Mark resolved", and recent events.
- History: search (titles, issues, notes, symptoms, medicine names), filters (issue, status, severity, date range), sorting and pagination.
- Calendar: month view with multi-day bars, a per-day agenda, and keyboard navigation. Phones get a compact layout.
- Optional medical-record files on any event: photos (JPG, PNG, WebP, HEIC) and PDFs up to 10 MB, stored privately in Cloudinary.
- **Excel backups:** every user can download their own data as Excel (Settings → Your data), and a nightly job stores an encrypted Excel backup of all text data.
- Tags on records (suggested ones like _Prescription_ or _Lab report_, or your own), and a **Records** tab in History to browse every document across events by tag or name.
- Settings: name, theme (system/light/dark), date format, first day of the week.
- Responsive from 320 px to 1920 px+. Passes axe WCAG 2.2 AA checks in light and dark mode.

## Project structure

```
backend/      Express API: src/modules/<feature>/ (routes → controller → service → repository)
frontend/     React app: pages/, components/, hooks/, services/, context/, styles/
shared/       Zod validation schemas + constants used by both the API and the forms
database/     SQL migrations (run in order) and the migration history
e2e/          Playwright: workflows, responsive layout at 9 widths, accessibility (axe)
docs/         Architecture and security design
render.yaml   Render Blueprint (static site + web service)
```

## Local development

**Prerequisites:** Node 24+, PostgreSQL 16+ (e.g. `brew install node@24 postgresql@16`).

```bash
npm install
cp .env.example .env                     # defaults work for a local Postgres
createdb health_tracker_dev
createdb health_tracker_test
npm run migrate                          # apply database/migrations
npm run seed                             # optional: demo@example.com / demo-password-123
npm run dev                              # API on :4000, app on http://localhost:5173
```

The Vite dev server proxies `/api` to the API. This mirrors production, where the static site proxies `/api` to the web service, so the browser always talks to a single origin.

In development, password-reset emails are printed to the API's console (`MAIL_PROVIDER=console`). For file uploads, set `CLOUDINARY_URL` in `.env`, or use `FILE_STORAGE=memory` for a quick local trial (files vanish when the API restarts).

### Scripts (run from the repo root)

| Command                            | What it does                                                               |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                      | API (auto-restarts) + Vite dev server                                      |
| `npm test`                         | Shared, backend and frontend tests                                         |
| `npm run test:e2e`                 | Playwright suite (starts the dev servers if needed, reseeds the demo user) |
| `npm run lint` / `npm run format`  | ESLint / Prettier                                                          |
| `npm run migrate` / `npm run seed` | Apply migrations / load demo data (seeding refuses to run in production)   |
| `npm run build`                    | Production build of the frontend                                           |

## Testing

| Suite                      | Tool                                                             | Covers                                                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/tests`            | Vitest + Supertest against a real Postgres (`TEST_DATABASE_URL`) | Auth (register, login, logout, sessions, password change/reset, rate limiting, CSRF), event and medicine CRUD, validation, search/filter/sort, calendar, dashboard, account deletion, and **user isolation**: user B gets 404 for every operation on user A's records, and nothing changes |
| `frontend/src/**/*.test.*` | Vitest + Testing Library                                         | Event form validation, calendar layout algorithm, API client error handling, date formatting                                                                                                                                                                                               |
| `shared/src/**/*.test.js`  | Vitest                                                           | Validation rules (dates, status/end-date, passwords)                                                                                                                                                                                                                                       |
| `e2e/tests`                | Playwright + axe                                                 | Core workflow, cross-user access through the UI, auth redirects, unsaved-changes guard, layout at 320–1920 px, WCAG 2.2 AA in both themes, keyboard use                                                                                                                                    |

The backend tests **drop and recreate** the test database's schema. They refuse to run unless the database name contains `test` and the host isn't Supabase.

The end-to-end suite starts its **own** servers (API on :4100, app on :5174) against a separate `health_tracker_e2e` database, with the console mailer, in-memory file storage and rate limits off. It never sends real email, touches Cloudinary or changes your dev data, whatever your `.env` says. Verification codes are read from `.mail-outbox/` (git-ignored), where the console mailer saves dev emails.

CI (`.github/workflows/ci.yml`) runs lint, all unit/integration tests against a Postgres service container, and the production build on every push and pull request.

## Deployment (Render + Supabase)

### 1. Supabase (database only)

1. Create a project in the region closest to your Render region.
2. **Project Settings → Data API:** turn the Data API **off**. The app doesn't use it, and the migrations also enable row-level security with no policies, so it would expose nothing anyway.
3. **Connect → Session pooler:** copy the connection string (IPv4; Render can't reach Supabase's IPv6-only direct host). This is `DATABASE_URL`.
4. **Database → SSL:** download the CA certificate. Its PEM text is `DATABASE_SSL_CA` (newlines may be written as `\n`).

### 2. Render

1. Push this repository to GitHub, then in Render choose **New → Blueprint** and select the repo. `render.yaml` creates:
   - `health-tracker-api`, a Node web service that runs migrations on start, with health check `/api/health`
   - `health-tracker`, the static site, which rewrites `/api/*` to the API and everything else to `index.html`
2. Fill in the secret env vars on the API service: `DATABASE_URL`, `DATABASE_SSL_CA`, `APP_ORIGIN` (the **static site's** URL, e.g. `https://health-tracker.onrender.com` — the API rejects requests from any other origin), `MAIL_FROM` and `MAIL_API_KEY` (see **Email** below), and `CLOUDINARY_URL` for file uploads.
3. If Render gives the API a different hostname than `health-tracker-api.onrender.com`, update the rewrite destination in `render.yaml`.

### 3. Verify after the first deploy

- [ ] Register and log in on the static site URL. The session cookie (`__Host-ht_session`) must be set on that site, which proves the rewrite forwards `Set-Cookie` and `Origin`. If it doesn't, the fallback is a custom domain with `app.` and `api.` subdomains (see docs/ARCHITECTURE.md §A).
- [ ] Check the API logs for warnings from `express-rate-limit` about `X-Forwarded-For`, and adjust `TRUST_PROXY` (number of proxy hops) until `req.ip` is the real client IP. If this is wrong, all users share one rate-limit bucket.
- [ ] Request a password reset and confirm the email arrives with a working link.
- [ ] Attach a photo and a PDF to an event, open both, download one (check the file name), delete one, and confirm in the Cloudinary Media Library that files are under `health-tracker/production/` with type _authenticated_ and that the deleted file is gone.

**Free-tier notes:** Render's free web services sleep after ~15 minutes idle. The first request can take ~50 s, and the app shows a "waking up" state. Supabase pauses free projects after a week without activity and doesn't take backups. For real personal data, consider a paid tier or scheduled `pg_dump` backups.

## Email

Verification codes and password-reset links are sent by the API. **Choose the transport with `MAIL_PROVIDER`:**

| Value              | Transport                                               | Use for                                       |
| ------------------ | ------------------------------------------------------- | --------------------------------------------- |
| `console`          | none — logs the email, and writes it to `.mail-outbox/` | local development                             |
| `brevo` / `resend` | HTTPS API (port 443), needs `MAIL_API_KEY`              | **production, and any host that blocks SMTP** |
| `smtp`             | SMTP via `SMTP_URL`                                     | local use, or a host that allows SMTP ports   |

**Render's free instances block outbound SMTP ports 25, 465 and 587** ([changelog](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)), so SMTP cannot deliver there at all — connections hang until they time out. Use `brevo` or `resend`, or move to a paid instance.

**Setting up Brevo** (free tier ~300 emails/day, and a plain Gmail address can be used as the sender):

1. Create an account, then **Senders & Domains → Senders → Add a sender** and verify the address you want mail to come from.
2. **SMTP & API → API keys → Generate a new API key.**
3. On the Render API service set `MAIL_PROVIDER=brevo`, `MAIL_API_KEY=<the key>`, `MAIL_FROM="Health Tracker <your-verified@address>"`.

Resend works the same way with `MAIL_PROVIDER=resend`, but needs a **domain** you own for real recipients; its shared `onboarding@resend.dev` sender only delivers to your own account address.

At startup the API logs which provider is active and whether the key was accepted (`Brevo API key accepted`), and each send logs how long the provider took. If a send fails, "Resend code" returns a visible error rather than claiming the email is on its way.

## Backups

Supabase is the primary store. Two Excel copies of the **text** data exist alongside it (uploaded files themselves aren't included, only their names and tags):

1. **Per-user download:** _Settings → Your data → Download my data (Excel)_. Sheets: About, Health events, Medicines, Files. Contains only that user's data.
2. **Nightly server backup** (`.github/workflows/backup.yml`, 02:00 IST, plus a manual "Run workflow" button): every user's data → Excel → **AES-256-GCM encrypted** → stored privately in Cloudinary under `health-tracker/backups/production/`. The newest `BACKUP_RETENTION` (default 14) are kept. Password hashes, sessions and tokens are never included.

**Setup**

1. Create a key: `openssl rand -base64 32`. **Store it somewhere safe outside the server** (e.g. a password manager); without it the backups can't be decrypted.
2. In GitHub → Settings → Secrets and variables → Actions, add: `DATABASE_URL`, `DATABASE_SSL_CA`, `APP_ORIGIN`, `CLOUDINARY_URL`, `BACKUP_ENCRYPTION_KEY`.
3. Run the workflow once from the Actions tab and check that it succeeds.

**Restoring a readable copy** (on your machine, with `BACKUP_ENCRYPTION_KEY` and `CLOUDINARY_URL` in `.env`):

```bash
npm run backup:list                          # what's stored
npm run backup:fetch                         # latest → ./backups/<name>.xlsx (git-ignored)
npm run backup:fetch -- <key-from-list>      # a specific one
npm run backup:decrypt -- file.xlsx.enc      # a file you downloaded yourself
```

The Excel file is a readable copy for safekeeping; there's no import back into the app.

Notes: GitHub pauses scheduled workflows in repositories with no activity for 60 days; re-enable it from the Actions tab if that happens. The nightly run also counts as database activity, which keeps a free Supabase project from pausing.

## Security in brief

- Passwords are hashed with Argon2id. Sessions are random 256-bit tokens; only their SHA-256 hash is stored. Cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, and use the `__Host-` prefix.
- The user ID comes only from the session, never from the request. Every SQL statement on health data filters by that user. Another user's record returns 404, the same as a missing one. A composite foreign key makes it impossible for a medicine to belong to a different user than its event.
- CSRF: Origin check + JSON-only bodies + SameSite cookies. Rate limits on all auth endpoints. Zod validation on every input, backed by database CHECK constraints.
- No health data in browser URLs, query strings are left out of the logs, Postgres error details are kept out of the logs, and API responses are `Cache-Control: no-store`.

Details and the threat model are in [docs/ARCHITECTURE.md §G](docs/ARCHITECTURE.md).

## Adding a feature (e.g. vaccinations, measurements)

1. Add a migration `database/migrations/000N_<name>.sql`: a table with `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`, plus `ALTER TABLE … ENABLE ROW LEVEL SECURITY`.
2. Add Zod schemas in `shared/src/schemas/` and export them from `shared/src/index.js`.
3. Add `backend/src/modules/<feature>/` with a repository whose functions all take `userId` first and filter on it, then mount the router in `backend/src/app.js` behind `requireAuth`.
4. Add isolation tests next to `backend/tests/healthEvents.test.js` (user B must get 404).
5. Add a service in `frontend/src/services/`, hooks in `frontend/src/hooks/`, and a lazy route in `frontend/src/App.jsx`.
