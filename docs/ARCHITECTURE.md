# Personal Health Tracker — Architecture & Design

Status: **Implemented** (all 14 phases) · Date: 2026-10-02

This is a private health diary. Each user records health events (an issue, its dates, symptoms, medicines and notes) and can review them later as a list or on a calendar. The app only stores what the user enters. It does not diagnose, recommend treatments or judge whether a medicine is appropriate.

---

## 0. Requirements analysis & open technical decisions

### What the spec fixes

- React + Vite + React Router on the frontend, using plain CSS (no Tailwind).
- Node + Express backend, PostgreSQL database.
- Multiple users with strict per-user data isolation, enforced by the server.
- Deployment: **GitHub → Render Static Site (frontend) + Render Web Service (API) → Supabase PostgreSQL.**

### Decisions the spec leaves open, and what I recommend

| #   | Decision                       | Recommendation                                                                                                           | Why                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Session vs JWT                 | **Server-side sessions** stored in Postgres. The browser holds an opaque random token in an `HttpOnly` cookie.           | Logout really ends the session. A password change can revoke every other session. Nothing sensitive lives in JS-readable storage. No signing secret can leak.                                                                                                                                                                                                         |
| 2   | Cross-origin cookies on Render | **Proxy `/api/*` through the static site using a Render rewrite rule.** Browser, frontend and API then share one origin. | `*.onrender.com` is on the Public Suffix List, so `app.onrender.com` and `api.onrender.com` count as _different sites_. Cookies between them would be third-party cookies, which Safari and Chrome increasingly block. With the rewrite, the cookie is first-party and can be `SameSite=Lax`. Fallback: a custom domain with `app.example.com` and `api.example.com`. |
| 3   | Supabase usage                 | **Use only the Postgres database.** Do not use Supabase Auth or the Supabase JS client.                                  | The spec asks for our own Express auth. One auth system is simpler to reason about.                                                                                                                                                                                                                                                                                   |
| 4   | Supabase Data API exposure     | **Enable RLS on every table with no policies, and turn off the Data API** in project settings.                           | Supabase automatically exposes `public` tables over REST to anyone holding the public anon key. RLS with no policies denies those roles. Our backend connects as the table owner, so RLS doesn't block it.                                                                                                                                                            |
| 5   | DB access layer                | `pg` (node-postgres) with hand-written SQL in **repository modules**, plus a tiny SQL migration runner.                  | The schema is small. Plain SQL keeps it obvious that every query is scoped by `user_id`. No ORM needed.                                                                                                                                                                                                                                                               |
| 6   | Validation                     | **Zod** schemas in a `shared/` workspace, used by both the backend (authoritative) and the frontend forms.               | One source of truth for the rules, enums and the list of health issues.                                                                                                                                                                                                                                                                                               |
| 7   | Password hashing               | **Argon2id** (OWASP parameters: 19 MiB memory, t=2, p=1).                                                                | Current OWASP first choice. Prebuilt binaries work on Render.                                                                                                                                                                                                                                                                                                         |
| 8   | Login identifier               | **Email only.**                                                                                                          | Password reset needs an email address anyway, and a separate username adds a second identity without much benefit.                                                                                                                                                                                                                                                    |
| 9   | Password reset delivery        | One-time token emailed via **SMTP (nodemailer)**. In development it logs to the console.                                 | Works with any provider; the mailer is pluggable.                                                                                                                                                                                                                                                                                                                     |
| 10  | Server state on the frontend   | **TanStack Query**                                                                                                       | Handles loading and error states, caching, and refetching after create/update/delete. It's the one data dependency I think is worth adding, because it removes a lot of hand-written state code.                                                                                                                                                                      |
| 11  | Calendar                       | **A custom month grid** built with `date-fns`. No calendar library.                                                      | Full control over the responsive layout and multi-day bars. FullCalendar-style libraries are heavy and hard to adapt for mobile.                                                                                                                                                                                                                                      |
| 12  | Add/Edit UI                    | **A dedicated route page**, not a modal.                                                                                 | A long form with a list of medicines fits poorly in a modal on a phone. A route also gives a working Back button.                                                                                                                                                                                                                                                     |
| 13  | IDs                            | UUID v4 (`gen_random_uuid()`)                                                                                            | IDs can't be guessed or enumerated. Ownership is still checked on every request.                                                                                                                                                                                                                                                                                      |
| 14  | Dates                          | Postgres `DATE`, sent over the API as `YYYY-MM-DD` strings.                                                              | Avoids time-zone shifts. `pg` will be configured to return `DATE` as a string, not a JS `Date`.                                                                                                                                                                                                                                                                       |
| 15  | Icons / fonts                  | `lucide-react` (tree-shaken) and a system font stack.                                                                    | No third-party font requests, which helps privacy.                                                                                                                                                                                                                                                                                                                    |

### Resolved questions

1. **Local tooling:** Node 24 LTS and PostgreSQL 16 installed with Homebrew. Tests run against a local database, never Supabase.
2. **Email provider:** SMTP through nodemailer (any provider: Brevo, Gmail app password, etc.). In development, emails are printed to the console.

---

## A. Architecture

```
                             GitHub (monorepo)
                                    │  push → auto-deploy (render.yaml Blueprint)
                 ┌──────────────────┴──────────────────┐
                 ▼                                     ▼
   Render Static Site                      Render Web Service
   React + Vite build (frontend/dist)      Node 24 + Express 5 (backend/)
   https://health-tracker.onrender.com     https://health-tracker-api.onrender.com
                 │                                     │
   Browser ──────┤  /*      → index.html (SPA rewrite) │
                 │  /api/*  → rewrite (proxy) ─────────►  /api/*
                 │                                     │  pg pool (TLS)
                                                       ▼
                                          Supabase PostgreSQL
                                          (Supavisor session pooler, IPv4)
```

**Request path:** the browser only ever talks to `https://health-tracker.onrender.com`. Calls to `/api/...` are proxied to the API service by Render's rewrite rule. So the session cookie is first-party, there's no CORS in production, and CSRF protection comes from `SameSite=Lax` plus an Origin check.

**Backend layering** (inside each feature module):

```
route → middleware (auth, validate) → controller (HTTP in/out) → service (business rules) → repository (SQL, always scoped by userId)
```

**Deployment notes**

- `render.yaml` defines both services, the rewrite rules, environment variables and the health check (`/api/health`).
- Render's free tier has no pre-deploy hook, so migrations run as part of the API start command: `npm run migrate && npm start`.
- Render's free web services sleep after 15 minutes idle, so the first request can take about 50 seconds. If a request is slow, the frontend shows "Waking up the server…".
- Supabase connection: use the **session-mode pooler** URL. The direct connection is IPv6-only, and Render can't reach IPv6. TLS is on with Supabase's CA certificate. The pool is kept small (max 5).
- Supabase pauses free projects after about a week with no activity, and free projects don't get backups. Worth knowing before storing real data.

**Monorepo layout**

```
health-tracker/
├── frontend/                 React + Vite app
├── backend/                  Express API
├── shared/                   Zod schemas, enums, health-issue list (npm workspace)
├── database/
│   ├── migrations/           0001_init.sql, 0002_... (plain SQL, run in order)
│   └── seeds/                dev-only demo data
├── e2e/                      Playwright responsive + smoke tests
├── docs/ARCHITECTURE.md
├── render.yaml               Render Blueprint (static site + web service)
├── .github/workflows/ci.yml  lint + tests against a Postgres service container
├── package.json              npm workspaces root
├── .env.example
└── README.md
```

---

## B. Database schema

All tables live in `public` with **RLS enabled and no policies** (see decision 4). Every timestamp is `timestamptz`, and a trigger maintains `updated_at`.

### `users`

| Column                  | Type         | Constraints                                             |
| ----------------------- | ------------ | ------------------------------------------------------- |
| id                      | uuid         | **PK**, default `gen_random_uuid()`                     |
| name                    | varchar(100) | not null                                                |
| email                   | varchar(254) | not null, **unique**, `CHECK (email = lower(email))`    |
| password_hash           | text         | not null (Argon2id encoded string)                      |
| preferences             | jsonb        | not null, default `'{}'` (theme, dateFormat, weekStart) |
| password_changed_at     | timestamptz  |                                                         |
| created_at / updated_at | timestamptz  | not null, default `now()`                               |

### `sessions`

| Column       | Type         | Constraints                                            |
| ------------ | ------------ | ------------------------------------------------------ |
| id           | uuid         | **PK**                                                 |
| user_id      | uuid         | not null, **FK → users.id ON DELETE CASCADE**          |
| token_hash   | char(64)     | not null, **unique** (SHA-256 hex of the cookie token) |
| user_agent   | varchar(255) |                                                        |
| created_at   | timestamptz  | not null                                               |
| last_used_at | timestamptz  | not null                                               |
| expires_at   | timestamptz  | not null                                               |

Indexes: `(user_id)`, `(expires_at)` for cleanup.

### `password_reset_tokens`

| Column     | Type        | Constraints                                   |
| ---------- | ----------- | --------------------------------------------- |
| id         | uuid        | **PK**                                        |
| user_id    | uuid        | not null, **FK → users.id ON DELETE CASCADE** |
| token_hash | char(64)    | not null, **unique**                          |
| expires_at | timestamptz | not null (30 minutes)                         |
| used_at    | timestamptz | null until used                               |
| created_at | timestamptz | not null                                      |

### `health_events`

| Column                  | Type         | Constraints                                              |
| ----------------------- | ------------ | -------------------------------------------------------- |
| id                      | uuid         | **PK**                                                   |
| user_id                 | uuid         | not null, **FK → users.id ON DELETE CASCADE**            |
| title                   | varchar(150) | not null                                                 |
| health_issue            | varchar(100) | not null (a preset like "Fever" or custom text)          |
| description             | text         | max 2000 characters (checked by the app)                 |
| start_date              | date         | not null                                                 |
| end_date                | date         | null means ongoing                                       |
| status                  | text         | not null, `CHECK (status IN ('ongoing','resolved'))`     |
| severity                | text         | null, `CHECK (severity IN ('mild','moderate','severe'))` |
| symptoms                | text[]       | not null, default `'{}'`                                 |
| notes                   | text         | max 5000 characters (checked by the app)                 |
| created_at / updated_at | timestamptz  | not null                                                 |

Constraints:

- `CHECK (end_date IS NULL OR end_date >= start_date)`
- `CHECK ((status = 'ongoing' AND end_date IS NULL) OR (status = 'resolved' AND end_date IS NOT NULL))`. In the form, a single "Still ongoing" toggle sets both fields.
- `UNIQUE (id, user_id)` is the target of the composite FK from `medicines`.

Indexes: `(user_id, start_date DESC)`, `(user_id, status)`, `(user_id, health_issue)`.

### `medicines`

| Column                  | Type          | Constraints                                                                |
| ----------------------- | ------------- | -------------------------------------------------------------------------- |
| id                      | uuid          | **PK**                                                                     |
| health_event_id         | uuid          | not null                                                                   |
| user_id                 | uuid          | not null                                                                   |
| name                    | varchar(120)  | not null                                                                   |
| dosage                  | varchar(60)   | e.g. "500 mg"                                                              |
| frequency               | varchar(60)   | e.g. "Twice a day"                                                         |
| start_date              | date          |                                                                            |
| end_date                | date          | `CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)` |
| notes                   | varchar(1000) |                                                                            |
| sort_order              | smallint      | not null, default 0 (keeps the order the user entered)                     |
| created_at / updated_at | timestamptz   | not null                                                                   |

- **Composite FK `(health_event_id, user_id) → health_events(id, user_id) ON DELETE CASCADE`.** The database itself guarantees a medicine always belongs to the same user as its event. This lets every medicine query also filter on `user_id`, as defense in depth.
- Indexes: `(health_event_id)`, `(user_id, lower(name))` for medicine-name autocomplete.

### Relationships

```
users 1──N sessions
users 1──N password_reset_tokens
users 1──N health_events 1──N medicines   (medicines.user_id = health_events.user_id, enforced by FK)
```

### Extensibility

Future modules (doctor visits, measurements, vaccinations and so on) follow the same pattern: a table with `user_id NOT NULL FK → users`, optionally linked to `health_events`, plus a repository whose functions all take `userId`. Nothing existing has to change.

---

## C. API design

Base path `/api`. Every request and response body is JSON. All dates are `YYYY-MM-DD`. All routes need a valid session except those marked 🔓.

### Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please fix the highlighted fields.",
    "fields": { "endDate": "End date cannot be earlier than start date." }
  }
}
```

| HTTP | code                  | When                                                                                                                                                                          |
| ---- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`    | Body or query fails the Zod schema                                                                                                                                            |
| 400  | `INVALID_RESET_TOKEN` | Reset link unknown, used or expired                                                                                                                                           |
| 401  | `UNAUTHENTICATED`     | No session or expired session                                                                                                                                                 |
| 401  | `INVALID_CREDENTIALS` | Login with a wrong email/password (one generic message for both). A wrong _current_ password on change-password is a 400 field error instead, so it doesn't log the user out. |
| 403  | `FORBIDDEN`           | Origin/CSRF check failed                                                                                                                                                      |
| 404  | `NOT_FOUND`           | The record doesn't exist **or belongs to another user** (same response for both, so existence isn't revealed)                                                                 |
| 409  | `EMAIL_TAKEN`         | Registration with an email that already exists                                                                                                                                |
| 429  | `RATE_LIMITED`        | Too many attempts                                                                                                                                                             |
| 500  | `INTERNAL_ERROR`      | Generic message only; details go to server logs, never to the client                                                                                                          |

### Auth — `/api/auth`

| Method  | Path               | Body                                              | Result                                                          |
| ------- | ------------------ | ------------------------------------------------- | --------------------------------------------------------------- |
| POST 🔓 | `/register`        | `{name, email, password, confirmPassword}`        | 201 `{user}` + session cookie                                   |
| POST 🔓 | `/login`           | `{email, password}`                               | 200 `{user}` + session cookie; 401 "Invalid email or password." |
| POST    | `/logout`          | —                                                 | 204; deletes the session row and clears the cookie              |
| GET 🔓  | `/session`         | —                                                 | 200 `{user}` or 401. The SPA calls this on load.                |
| POST    | `/change-password` | `{currentPassword, newPassword, confirmPassword}` | 204; revokes every other session and rotates the current one    |
| POST 🔓 | `/forgot-password` | `{email}`                                         | **Always 202** with a generic message (no account enumeration)  |
| POST 🔓 | `/reset-password`  | `{token, newPassword, confirmPassword}`           | 204; marks the token used and revokes **all** sessions          |

### Users — `/api/users`

| Method | Path  | Body                    | Result                                                                          |
| ------ | ----- | ----------------------- | ------------------------------------------------------------------------------- |
| GET    | `/me` | —                       | `{id, name, email, preferences, createdAt}`                                     |
| PATCH  | `/me` | `{name?, preferences?}` | Updated user. Changing email is deferred, because it needs a verification flow. |
| DELETE | `/me` | `{password}`            | 204; deletes the account and **all** of its data (cascade)                      |

### Health events — `/api/health-events`

| Method | Path                  | Notes                                                                                                                                                                                                                                                                                                                        |
| ------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`                   | List with query params `q`, `healthIssue`, `status`, `severity`, `from`, `to`, `sort` (`start_desc` default, `start_asc`, `end_desc`, `end_asc`, `created_desc`), `page`, `pageSize` (≤ 50). Returns `{items, page, pageSize, total}`. Each item includes `medicineCount` and a short `medicines` preview (name and dosage). |
| POST   | `/`                   | Creates an event with a nested `medicines[]` array in one transaction. 201 with the full event.                                                                                                                                                                                                                              |
| GET    | `/:id`                | Full event with medicines.                                                                                                                                                                                                                                                                                                   |
| PUT    | `/:id`                | Replaces every field. `medicines[]` is synced in a transaction: rows with an `id` are updated, rows without one are inserted, missing rows are deleted.                                                                                                                                                                      |
| PATCH  | `/:id`                | Partial update, used for the "Mark resolved" quick action (`{status, endDate}`).                                                                                                                                                                                                                                             |
| DELETE | `/:id`                | 204; medicines are removed by cascade.                                                                                                                                                                                                                                                                                       |
| GET    | `/calendar?from=&to=` | Lightweight events that **overlap** the range (≤ 100 days): `id, title, healthIssue, startDate, endDate, status, severity`.                                                                                                                                                                                                  |
| GET    | `/issues`             | The distinct health issues this user has used, including custom ones, for the filter dropdown.                                                                                                                                                                                                                               |

Search covers `title`, `health_issue`, `description`, `notes`, `symptoms`, and medicine names (via an `EXISTS` subquery). The date filter uses overlap: `start_date <= :to AND (end_date IS NULL OR end_date >= :from)`.

### Medicines (nested under their event)

| Method | Path                                                | Notes                                                                        |
| ------ | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/api/health-events/:eventId/medicines`             |                                                                              |
| POST   | `/api/health-events/:eventId/medicines`             | 201                                                                          |
| PUT    | `/api/health-events/:eventId/medicines/:medicineId` |                                                                              |
| DELETE | `/api/health-events/:eventId/medicines/:medicineId` | 204                                                                          |
| GET    | `/api/medicines/names?q=`                           | Autocomplete from **this user's** past medicine names, which speeds up entry |

### Dashboard & ops

| Method | Path             | Notes                                                                                                                                                                     |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/dashboard` | `{totals: {total, ongoing, resolved}, ongoing: [≤5], recent: [≤5], mostCommonIssue: {name, count} \| null}` (last 12 months). Everything is filtered by the session user. |
| GET 🔓 | `/api/health`    | `{status: "ok"}` for the Render health check. Reveals no DB or version details.                                                                                           |

---

## D. Authentication & authorization design

### Sessions

1. **Login/register:** the server verifies the password with Argon2id. It then creates a 32-byte random token (`crypto.randomBytes`, base64url) and stores **only its SHA-256 hash** in `sessions`. The raw token goes in the cookie:
   `__Host-ht_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=…`
   In local dev over http the cookie is named `ht_session` and isn't `Secure`.
2. **Each request:** `requireAuth` middleware hashes the cookie token and looks up an unexpired session joined to its user. It sets `req.auth = { userId, sessionId }`. Without a valid session it returns 401.
3. **Expiry:** sessions expire after 7 days idle (`last_used_at` is refreshed at most once an hour) and 30 days at most regardless of activity. A periodic query deletes expired rows.
4. **Logout:** deletes the session row and clears the cookie. The token is dead immediately, which a JWT can't guarantee.
5. **Change password:** requires the current password. Afterwards the server deletes all _other_ sessions and rotates the current token.
6. **Password reset:** `forgot-password` always responds the same way. If the account exists, it stores a token hash (30 minutes, single use) and emails a link `https://app/reset-password#token=…`. The token sits in the URL **fragment**, so it never reaches server logs or Referer headers. A successful reset revokes every session.
7. **Timing:** login always runs one Argon2 verification, using a dummy hash when the email doesn't exist, so response time doesn't reveal which emails are registered.

### Passwords

- Argon2id. 10–128 characters, no composition rules, rejected if it's on a common-password list or equals the email. A strength hint shows in the UI.
- Passwords are never logged and never returned. Request logging redacts body fields.

### CSRF

- The cookie is `SameSite=Lax`, so cross-site POST/PUT/DELETE requests don't carry it.
- **Origin check:** state-changing requests must have an `Origin` header equal to `APP_ORIGIN`.
- Bodies must be `Content-Type: application/json`, which a plain HTML form can't send.

### Authorization rule

> **`userId` comes only from `req.auth.userId`.** It's never read from the body, query or URL. Zod strips unknown fields, so a `userId` in the body is silently ignored.

Every repository function takes `userId` as its first argument, and every SQL statement includes `WHERE user_id = $1`. Ownership is part of the query itself, not a separate check that someone could forget:

```sql
UPDATE health_events SET ... WHERE id = $2 AND user_id = $1 RETURNING *;   -- 0 rows → 404
```

### Rate limiting (`express-rate-limit`, in-memory store for a single instance)

| Endpoint              | Limit                           |
| --------------------- | ------------------------------- |
| login                 | 10 per 15 min per IP+email      |
| register              | 5 per hour per IP               |
| forgot-password       | 5 per hour per IP and per email |
| change/reset password | 10 per hour per user/IP         |
| everything else       | 300 per 15 min per session      |

`trust proxy` will be set to match Render's proxy hops (checked during the first deploy) so limits key on the real client IP.

---

## E. Frontend structure

```
frontend/src/
├── main.jsx                    providers: QueryClient, Auth, Preferences, Toast, Router
├── App.jsx                     route table
├── layouts/
│   ├── AuthLayout.jsx          centered card for login/register/reset
│   └── AppLayout.jsx           Sidebar (≥1024) · Icon rail (768–1023) · TopBar + BottomNav (<768)
├── pages/
│   ├── LoginPage.jsx  RegisterPage.jsx  ForgotPasswordPage.jsx  ResetPasswordPage.jsx
│   ├── DashboardPage.jsx
│   ├── HistoryPage.jsx
│   ├── EventDetailPage.jsx
│   ├── EventFormPage.jsx       used for both new and edit
│   ├── CalendarPage.jsx
│   ├── SettingsPage.jsx
│   └── NotFoundPage.jsx
├── components/
│   ├── ui/                     Button, IconButton, TextField, SelectField, TextareaField, Toggle,
│   │                           FormField (label + hint + error), Card, Badge, StatusBadge,
│   │                           SeverityBadge, Modal, ConfirmDialog, Toast, Skeleton, EmptyState,
│   │                           Spinner, VisuallyHidden
│   ├── navigation/             Sidebar, TopBar, BottomNav, UserMenu
│   ├── events/                 EventForm, IssuePicker (chips + "Other"), SymptomInput (tag chips),
│   │                           MedicineFieldList (repeater), MedicineCard, EventCard, EventList,
│   │                           EventFilters, DateRangeText, DeleteEventDialog
│   ├── calendar/               CalendarToolbar, MonthGrid, WeekRow, EventBar, DayCell, DayAgenda
│   └── dashboard/              StatCard, OngoingList, RecentEvents
├── context/                    AuthContext, PreferencesContext (theme, date format), ToastContext
├── hooks/                      useAuth, useEvents, useEvent, useEventMutations, useCalendarEvents,
│                               useDashboard, useMedicineNames, useDebouncedValue, useMediaQuery,
│                               useDocumentTitle
├── services/                   apiClient.js (fetch wrapper: credentials, JSON, error normalization,
│                               401 → logout, network/timeout messages), authService, eventsService,
│                               medicinesService, usersService, dashboardService
├── utils/                      dates.js (format/parse per preference), calendarLayout.js (lane packing
│                               for multi-day bars), formErrors.js
└── styles/                     tokens.css (colors, spacing, radii, type scale, light/dark),
                                global.css, plus a co-located *.module.css per component
```

- **Routes:** `/login`, `/register`, `/forgot-password`, `/reset-password`, `/` (dashboard), `/history`, `/history/:id`, `/events/new`, `/events/:id/edit`, `/calendar`, `/settings`. A `<RequireAuth>` wrapper sends signed-out users to `/login` and returns them to the page they asked for after login.
- **Styling:** CSS Modules (built into Vite, no extra dependency) on top of global CSS custom-property tokens. Dark mode works by switching tokens.
- **No health data in the browser URL:** History filters live in component state and `sessionStorage`, not in the query string. URLs only ever contain random UUIDs.

---

## F. UI wireframes

Visual direction: calm and minimal. Warm off-white background, one teal-sage accent, generous whitespace, 8 px spacing grid, cards with soft borders instead of heavy shadows. Severity colors are muted (mild = sage, moderate = amber, severe = rose) and **always appear with a text label and icon**. Status uses an icon plus text: ● Ongoing / ✓ Resolved. Transitions are limited to subtle 150 ms fades and color changes, and are turned off under `prefers-reduced-motion`.

**Breakpoints:** `<480` small phone · `480–767` phone · `768–1023` tablet (icon rail) · `1024–1439` laptop (sidebar) · `≥1440` content max-width 1200 px, centered.

### Login / Register

```
┌──────────────────────────────┐
│        ♥ Health Tracker      │
│   Your private health diary  │
│ ┌──────────────────────────┐ │
│ │ Email     [____________] │ │
│ │ Password  [__________ 👁] │ │
│ │ [        Log in        ] │ │
│ │ Forgot password?         │ │
│ └──────────────────────────┘ │
│ New here? Create an account  │
└──────────────────────────────┘
```

Register has the same layout with Name, Email, Password (with strength hint) and Confirm Password. Errors show inline under each field, plus a summary for server errors.

### App shell

```
Desktop (≥1024)                              Mobile (<768)
┌────────────┬─────────────────────────┐     ┌─────────────────────┐
│ ♥ Health   │ Page title    [+ Add]   │     │ ♥ Health Tracker  👤 │  TopBar
│  Tracker   │                         │     ├─────────────────────┤
│            │                         │     │                     │
│ ▣ Dashboard│     main content        │     │    main content     │
│ ☰ History  │                         │     │                     │
│ ▦ Calendar │                         │     ├─────────────────────┤
│ ⚙ Settings │                         │     │ ▣   ☰   (+)   ▦   ⚙ │  BottomNav (56px,
│            │                         │     └─────────────────────┘  center = Add)
│ 👤 Aayush ▾ │                         │
└────────────┴─────────────────────────┘
```

### Dashboard

```
Good morning, Aayush
┌─────────┐ ┌─────────┐ ┌─────────┐          (3 across → stacks to 1 column below 480,
│ Total   │ │ Ongoing │ │Resolved │           3 small tiles in one row from 480 up)
│   18    │ │    2    │ │   16    │
└─────────┘ └─────────┘ └─────────┘
Ongoing now                                  Recent events            View all →
┌───────────────────────────────────┐        ┌──────────────────────────────────┐
│ Cold · since 28 Sep (5 days)      │        │ Fever      01 Oct → 03 Oct  ✓    │
│ ● Ongoing · Mild   [Mark resolved]│        │ Cold       25 Sep → 28 Sep  ✓    │
└───────────────────────────────────┘        │ Headache   20 Sep           ✓    │
Most common this year: Headache (4)          └──────────────────────────────────┘
```

Two columns on desktop, stacked on mobile. A brand-new user sees an empty state with a big "+ Add your first health event" button.

### Health History

```
Health History                                   [+ Add event]
[🔍 Search events, medicines, notes…        ]  [Filters ▾] [Sort: Newest ▾]
 Issue [All ▾]  Status [All ▾]  Severity [All ▾]  From [__] To [__]  Clear
────────────────────────────────────────────────────────────────
┌──────────────────────────────────────────────────────────────┐
│ FEVER                                         ✓ Resolved     │
│ Fever after travel                            ▲ Moderate     │
│ 01 Oct 2026 → 03 Oct 2026 · 3 days                           │
│ Body pain, mild headache…                                    │
│ 💊 Paracetamol 500 mg · +1 more                [View] [⋯]    │
└──────────────────────────────────────────────────────────────┘
               Showing 1–20 of 46   [Load more]
```

Cards rather than a table, so nothing scrolls sideways. On mobile, the filters open in a bottom sheet behind a "Filters (2)" button. Search is debounced at 300 ms. The `⋯` menu holds Edit and Delete. There's a separate empty state for "No events match your filters" with a Clear filters button.

### Event details

```
← Back                                        [Edit] [Delete]
Fever after travel
FEVER · 01 Oct 2026 → 03 Oct 2026 (3 days)
✓ Resolved   ▲ Moderate
Description …
Symptoms   (Body pain) (Headache) (High temperature)
Medicines
┌─────────────────────────────┐ ┌─────────────────────────────┐
│ Paracetamol                 │ │ ORS                         │
│ 500 mg · Twice a day        │ │ 1 sachet · After each meal  │
│ 01 Oct → 03 Oct             │ │                             │
│ Taken after food            │ │                             │
└─────────────────────────────┘ └─────────────────────────────┘
[+ Add medicine]
Notes …
Created 01 Oct · Updated 03 Oct
```

### Add / Edit event (aim: under a minute)

```
← Cancel          Add health event          [Save]
What's going on?
 (Fever)(Cold)(Cough)(Headache)(Migraine)(Stomach pain)(Back pain)
 (Allergy)(Infection)(Sore throat)(Flu)(Food poisoning)(Other…)
Title            [Fever                ]   ← auto-filled from the issue, editable
Started          [02/10/2026]              ← defaults to today
[✓] Still ongoing                          ← unchecked → shows "Ended [__]"
Severity         ( Mild ) ( Moderate ) ( Severe )   (optional)
Symptoms         [body pain ⏎] (Body pain ✕)
▸ Medicines (0)                            ← expands
   ┌ Medicine 1 ─────────────────────── ✕ ┐
   │ Name [Paracetamol ▾ autocomplete]    │
   │ Dosage [500 mg]  Frequency [Twice…]  │
   │ From [__] To [__]                    │
   │ Notes [Taken after food]             │
   └──────────────────────────────────────┘
   [+ Add medicine]
▸ Description & notes                      ← expands
                                [Cancel] [Save event]
```

Two columns where it makes sense at ≥768, a single column below that. On mobile the Save button stays pinned to the bottom. Fields are checked when you leave them and again on submit, and focus moves to the first invalid field. Leaving with unsaved changes asks for confirmation.

### Calendar

```
Desktop                                         Mobile (<640)
[‹] [Today] [›]   October 2026                  [‹]  October 2026  [›]  [Today]
Mon  Tue  Wed  Thu  Fri  Sat  Sun               M  T  W  T  F  S  S
           1    2    3    4                              1  2  3  4
         ┌Fever ───────┐                                 ━━━━━━
  ┌Cold (cont.) ──────────────▶                          ··
 5    6    7    8    9   10   11                5  6  7  8  9 10 11
 ...                       +2 more                ─────────────────────
                                                  Thu 1 Oct
                                                  ● Fever · Moderate  ›
                                                  ● Cold (ongoing)    ›
```

- On desktop, multi-day events are bars laid out in lanes for each week row. A bar continues across weeks with "cont." / ▶ markers, and ongoing events run up to today. A day with too many events shows "+N more", which opens a popover.
- On mobile, each day shows thin bars or dots. Tapping a day opens an agenda list for that day below the grid, and tapping an event opens its details.
- Keyboard: the grid is an ARIA grid. Arrow keys move between days, Enter opens the day, PageUp/PageDown change month.
- Week view is optional and can come later. Month view comes first.

### Settings

```
Settings
┌ Account ───────────────────────┐  ┌ Password ──────────────────────┐
│ Name   [Aayush         ] [Save]│  │ Current password  [________]   │
│ Email  aayush@…  (read-only)   │  │ New password      [________]   │
└────────────────────────────────┘  │ Confirm           [________]   │
┌ Preferences ───────────────────┐  │            [Change password]   │
│ Theme       (System|Light|Dark)│  └────────────────────────────────┘
│ Date format (02 Oct 2026 ▾)    │  ┌ Danger zone ───────────────────┐
│ Week starts (Monday ▾)         │  │ [Log out]  [Delete account…]   │
└────────────────────────────────┘  └────────────────────────────────┘
This app stores what you record. It does not provide medical advice.
```

---

## G. Security model: how one user can't reach another user's data

1. **Identity comes from the server.** `req.auth.userId` is derived only from a valid session cookie whose hashed token is looked up in the DB. Client-supplied `userId` values are never read.
2. **Ownership is part of the query.** Every read, update and delete of a health event includes `AND user_id = $1`. A request for someone else's ID matches 0 rows and gets **404**, the same as a non-existent ID, so even the record's existence stays hidden.
3. **Child records are covered too.** Medicine routes check ownership through the parent: `WHERE m.id = $3 AND m.health_event_id = $2 AND m.user_id = $1`. The composite FK `(health_event_id, user_id)` makes it **impossible at the DB level** for a medicine to belong to a different user than its event. When `PUT` syncs medicines, a submitted medicine `id` that isn't in this event is rejected.
4. **Aggregates are scoped.** Dashboard and stats queries are written with `WHERE user_id = $1`. There are no global aggregate endpoints.
5. **Supabase's side door is closed.** RLS is on for every table with no policies, so the anon and authenticated roles get nothing, and the Data API is turned off. The DB password and connection string live only in Render env vars.
6. **Automated isolation tests** create users A and B and confirm that B gets **404** for every operation on A's event and medicines (GET, PUT, PATCH, DELETE), that the rows are **unchanged** afterwards, that B's list, calendar, issues, medicine-name and dashboard results contain none of A's data, and that a body with `userId: A` creates a record owned by B. These run in CI on every push.

### Other security controls

- **Input validation:** Zod on every body and query string. Strings have length limits, dates are real calendar dates, enums are enforced, unknown keys are stripped. Postgres CHECK constraints back this up. Every query is parameterized.
- **HTTP hardening:** `helmet` (strict CSP for the API; a CSP via Render headers on the static site), `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, a 100 kB JSON body limit, and `x-powered-by` turned off.
- **XSS:** React escapes output by default. `dangerouslySetInnerHTML` is never used. The session cookie is HttpOnly, so scripts can't read it.
- **Errors:** a central error handler maps known errors to the format above and everything else to a generic 500. Stack traces only go to server logs.
- **Logging privacy:** the request logger records method, path (**without the query string**, because search terms can be health data), status and duration. It never logs bodies, cookies or auth headers.
- **Secrets:** only `.env.example` is committed. The env config is validated at startup and the server refuses to start if something required is missing. The frontend gets no secrets; its only setting is the API base path.
- **Caching:** API responses send `Cache-Control: no-store` so shared caches and the back/forward cache don't keep health data.
- **Logout everywhere:** password change and reset revoke sessions. Account deletion cascades through all data.

### Known risks and accepted trade-offs

- **Email enumeration at registration:** returning `EMAIL_TAKEN` reveals that an account exists. This is mitigated by rate limiting. Removing it entirely would need email verification at signup, which could be added later.
- **The in-memory rate-limit store** resets on restart and doesn't work across multiple instances. That's fine on one Render instance; a Postgres-backed store would be needed to scale out.
- **The Render rewrite proxy** has to pass `Set-Cookie` and `Origin` through correctly. This is checked in the Phase 1 deploy smoke test, with a custom domain as the fallback.
- **Free-tier limits:** Render cold starts, plus Supabase project pausing and no backups. For real personal data, consider Supabase Pro backups or a scheduled `pg_dump`.

---

## H. Implementation plan

| Phase                    | Deliverable                                                                                                                     | Done when                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1 · Setup                | Monorepo with workspaces, Vite app, Express app, ESLint and Prettier, `.env.example`, `render.yaml`, CI skeleton                | `npm run dev` serves the frontend and API via the Vite proxy; `/api/health` responds |
| 2 · Database             | Migration runner, `0001_init.sql` (all tables, constraints, indexes, RLS, triggers), dev seed                                   | Migrations apply cleanly to local Postgres and are idempotent                        |
| 3 · Auth                 | Register, login, logout, session, `requireAuth`, rate limits, Origin check; Login/Register pages, AuthContext, protected routes | Auth tests pass; a user can sign up, log in and out                                  |
| 4 · Event CRUD           | Repository, service and routes with validation; EventForm, detail page, delete dialog, toasts                                   | CRUD and **isolation** tests pass                                                    |
| 5 · Medicines            | Nested sync in PUT, medicine sub-routes, autocomplete; MedicineFieldList                                                        | Medicine tests pass, including cross-user tests                                      |
| 6 · Dashboard            | `/api/dashboard`; StatCards, ongoing list with "Mark resolved", recent events                                                   | Numbers are scoped and correct                                                       |
| 7 · History              | Search, filters, sort and pagination in the backend; filter UI and bottom sheet; empty and loading states                       | Filters combine correctly; tests pass                                                |
| 8 · Calendar             | `/calendar` endpoint; month grid, lane layout, mobile agenda, keyboard navigation                                               | Multi-day and ongoing events render correctly; layout util is unit-tested            |
| 9 · Settings             | Profile, preferences, change password, forgot/reset password with the mailer, delete account                                    | Password tests pass; reset works end-to-end in dev                                   |
| 10 · Responsive          | Check every page at 320 → 1920                                                                                                  | Playwright: no horizontal overflow at the 9 widths; screenshots reviewed             |
| 11 · Validation & errors | Go through every form and request for messages, network errors, cold-start messaging                                            | Every listed error case gives a friendly message                                     |
| 12 · Security review     | Walk through this document's security model against the code; `npm audit`; header check                                         | Checklist complete                                                                   |
| 13 · Testing             | Fill coverage gaps; CI runs backend, frontend and e2e                                                                           | CI green                                                                             |
| 14 · Polish & deploy     | Visual polish, dark mode, accessibility pass (axe), README, deploy to Render + Supabase                                         | Live app works end-to-end                                                            |

Responsive layout and accessibility are built in from Phase 3 onward. Phases 10–12 are focused verification passes, not the first time these get attention.

### Testing stack

- **Backend:** Vitest + Supertest against a real local Postgres test database. Migrations run once, tables are truncated between tests.
- **Frontend:** Vitest + React Testing Library for EventForm validation, the calendar layout util, and apiClient error handling.
- **E2E/responsive:** Playwright at 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px. It checks `scrollWidth <= innerWidth`, that navigation is visible, and that a create-event smoke flow works, and it saves screenshots.

### Environment variables

```
# backend
NODE_ENV=development
PORT=4000
DATABASE_URL=postgres://...            # Supabase session pooler URL in production
DATABASE_SSL_CA=                       # Supabase CA cert (PEM) in production
TEST_DATABASE_URL=postgres://localhost:5432/health_tracker_test
APP_ORIGIN=http://localhost:5173       # used for the Origin check and reset links
SESSION_IDLE_DAYS=7
SESSION_ABSOLUTE_DAYS=30
MAIL_PROVIDER=console                  # console | smtp
MAIL_FROM="Health Tracker <no-reply@example.com>"
SMTP_URL=smtps://user:pass@smtp.example.com:465
DISABLE_RATE_LIMITS=false              # local e2e only; the API refuses to start with it in production
# frontend
VITE_API_BASE_URL=/api
```

There's no `JWT_SECRET`, because sessions use opaque random tokens that are stored hashed.

---

## Implementation notes

Decisions made or refined while building, in addition to the design above:

- **Session state in the SPA** is a TanStack Query query (`['session']`). Signing in or out drops all other cached queries _and_ per-tab `sessionStorage` state, so one person's data never shows up in the next person's view on a shared device.
- **Logging in again** revokes the previous session on that browser before issuing a new one.
- **Server logs** record a sanitized error (`name`, `code`, `message`, `stack`). Postgres `detail` fields can contain row values, i.e. health data, so they're never logged.
- **Rate limits** can be turned off locally with `DISABLE_RATE_LIMITS=true` so the end-to-end suite can register many users. Config validation rejects it in production. Backend tests force limits on and test them explicitly.
- **Users API:** `GET/PATCH/DELETE /api/users/me` as specified. Profile updates can only change `name` and `preferences`; account deletion requires the password and cascades to all data.
- **Frontend bundle:** app pages are lazy-loaded routes (entry ≈ 171 kB gzipped, mostly React/React Router/TanStack Query/Zod; each page 1–5 kB). A single vendor chunk was measured and made the initial download larger, so it was dropped. Shared schemas use named Zod imports so other bundlers can also tree-shake Zod's locales.
- **Cold starts:** any request slower than 5 s shows a "Waking up the server…" notice.
- **Accessibility:** native `<dialog>` for modals, so focus trapping, Escape and the inert background come from the browser. Medicine groups in the form use `role="group"` + `aria-labelledby`, because a floated `<legend>` caused layout overflow in Chrome. `scroll-padding` keeps focused fields clear of the sticky bars (WCAG 2.2 _Focus Not Obscured_).
- **Render rewrite:** Render's docs confirm a static-site rewrite may target a full external URL, with `*` carrying the matched path. Whether `Set-Cookie`/`Origin` pass through the proxy isn't documented, so it's the first item on the post-deploy checklist in the README.

### Verification status

| Check                                                                              | Result                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Backend integration tests (incl. isolation suite)                                  | 82 passing                                             |
| Frontend unit tests                                                                | 24 passing                                             |
| Shared schema tests                                                                | 9 passing                                              |
| Playwright (workflows, 9 widths × all pages, axe WCAG 2.2 AA light/dark, keyboard) | 32 passing                                             |
| `npm audit`                                                                        | 0 vulnerabilities                                      |
| Deployed to Render + Supabase                                                      | Not yet (needs your accounts; see README → Deployment) |

---

## Addendum: medical-record attachments (optional)

Users can attach photos (JPEG, PNG, WebP, HEIC) and PDFs to a health event, for example prescriptions, lab reports or scans. Attaching files is always optional.

**Storage: Cloudinary, private.** Files are uploaded with `type: "authenticated"`, so no public URL exists. Each file's Cloudinary `public_id` is `<CLOUDINARY_FOLDER>/<env>/<random UUID>`. The original filename, which can itself be sensitive, is stored only in our database and never sent to Cloudinary (`use_filename: false`, no context or tags).

**Flow**

```
Browser ──multipart POST──► API: auth + ownership + size ≤10 MB + content sniffing ──► Cloudinary (authenticated)
Browser ◄──streamed bytes── API: auth + ownership ◄── short-lived signed download URL (server-side only)
```

- Uploads go through the API (multer, in memory, one file ≤ 10 MB per request), not straight from the browser. That way the server checks ownership, limits and the **real file type (magic bytes)** before anything is stored, and the Cloudinary credentials stay server-side.
- Viewing and downloading stream through `GET /api/health-events/:eventId/attachments/:id/content[?download=true]`. Cloudinary URLs never reach the browser; downloads keep their original names (RFC 6266 `filename*`); the site CSP stays `'self'`; responses are `private, no-store` + `nosniff`.
- The CSRF rule (JSON-only bodies) has exactly one exception: multipart on the upload route. That route is still protected by the Origin check and the SameSite cookie.

**Table `attachments`** (migration `0002`): `id`, `health_event_id` + `user_id` (composite FK → `health_events(id, user_id)` ON DELETE CASCADE, like medicines), `original_filename`, `content_type` (CHECK: the five types above), `size_bytes` (CHECK ≤ 10 MB), `storage_provider`, `storage_key` (unique), `storage_resource_type` (`image` | `raw`; PDFs are `raw` so they're delivered byte-for-byte), `created_at`. RLS is enabled.

**API**

| Method | Path                                                  | Notes                                                                                                                                                                            |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/features`                                       | `{ attachments: boolean }`, so the UI hides uploads when storage isn't configured                                                                                                |
| GET    | `/api/health-events/:eventId/attachments`             | Metadata list                                                                                                                                                                    |
| POST   | `/api/health-events/:eventId/attachments`             | multipart field `file`. 201 metadata · 400 unsupported type / missing file / >20 per event · 413 >10 MB · 502 storage error · 503 disabled. Rate limited to 60 per hour per user |
| GET    | `/api/health-events/:eventId/attachments/:id/content` | Streams the file; `?download=true` → attachment disposition                                                                                                                      |
| DELETE | `/api/health-events/:eventId/attachments/:id`         | Deletes from Cloudinary first, then the row (a storage failure → 502, nothing is lost track of)                                                                                  |
| —      | event detail / list                                   | `attachments[]` on detail; `attachmentCount` on list items                                                                                                                       |

**Deletion.** Deleting an event or the whole account deletes its files from Cloudinary as well (best effort after the DB commit). Failures are logged with storage keys only (random IDs) so they can be cleaned up by hand.

**UI.** The Add/Edit form has an optional "Records & files" section. Chosen files upload after the event is saved, via an app-wide upload manager that keeps going across pages and shows progress on the event page. The event page has a "Records & files" card with pick or drag-and-drop, progress bars, per-file errors, an image preview dialog, download, and delete with confirmation. History cards show a file count.

**Config.** `CLOUDINARY_URL` (`cloudinary://key:secret@cloud`) enables the feature; without it uploads are off. `FILE_STORAGE=memory` is for tests and local trials only (refused in production).

**Tests.** 13 backend tests (types by content, spoofed extensions, size and count limits, filename sanitizing, multipart-only-on-upload, streaming headers, cleanup on event and account deletion, cross-user 404s with no changes) and 2 Playwright tests (full flow, plus layout and axe at 320 px). The Cloudinary adapter itself can't be exercised without real credentials. See the README checklist.

### Tags on records

To make documents easier to find, each file can have up to 10 tags (≤ 30 characters each; trimmed; duplicates ignoring case are dropped).

- **Storage:** `attachments.tags text[]` (migration `0003`, `CHECK cardinality ≤ 10`, GIN index). Tags are ours alone and never sent to Cloudinary.
- **Setting tags:** as an optional multipart field `tags` (a JSON array) on upload, or `PATCH /api/health-events/:eventId/attachments/:id` with `{ tags }`.
- **Finding records:**
  - `GET /api/attachments?tag=&q=&page=&pageSize=` lists all of the user's files across events, newest first, each with its event. The tag match ignores case; `q` searches file names, tags and event titles.
  - `GET /api/attachments/tags` returns the user's tags with counts. Spelling variants are grouped, and the capitalized form is shown.
  - The History event search also matches file names and tags.
- **UI:**
  - A reusable `TagInput` (chips, Enter or comma to add, one-tap suggestions: your own tags first, then _Prescription, Lab report, Scan, X-ray, Doctor’s note, Discharge summary, Bill, Insurance, Vaccination_).
  - Per-file tagging in the Add/Edit form, and an "Edit tags" dialog on the event page.
  - History now has WAI-ARIA tabs, **Events | Records**. Records shows tag filter chips with counts, search, and links to each file's event. The chosen tab and filters persist per browser tab (`sessionStorage`) and are cleared on sign-out.
- **Isolation:** all tag and records queries filter by `user_id`; tests confirm another user sees no records or tags, and can't edit tags.

---

## Addendum: Excel backups (export only)

Supabase remains the source of truth. Excel copies of the **text** data provide a readable backup; there's no import back into the app.

**Shared builder.** `backend/src/modules/export/workbook.js` (exceljs) produces sheets _About_, _Users_ (full backup only), _Health events_, _Medicines_ and _Files_ (file metadata and tags, never contents or storage keys). Strings are written as text cells, so user input like `=HYPERLINK(...)` can never become a formula. Data comes from `export.repository.js`, which has two deliberately separate functions: `fetchUserExport(userId)` (scoped) and `fetchFullBackup()` (all users, used only by the offline job, never reachable over HTTP). Neither selects password hashes, sessions or tokens.

**1. Per-user download.** `GET /api/users/me/export` → `.xlsx` attachment (`private, no-store`), rate limited to 10 per hour per user. In the UI: Settings → _Your data_. Tests confirm only the caller's rows appear.

**2. Nightly encrypted backup.** `npm run backup` (`backend/src/backup/runBackup.js`), scheduled by GitHub Actions (`.github/workflows/backup.yml`, 20:30 UTC, plus manual dispatch; secrets from GitHub encrypted secrets):

```
Supabase ──fetchFullBackup──► Excel ──AES-256-GCM (BACKUP_ENCRYPTION_KEY)──► Cloudinary raw/authenticated
                                                                             health-tracker/backups/<env>/…xlsx.enc
```

- File format: `HTBK1 | IV(12) | ciphertext | tag(16)`. GCM authenticates, so a wrong key or a tampered file fails loudly.
- Retention: newest `BACKUP_RETENTION` (default 14) kept; older ones deleted after each run.
- Logs contain counts only.
- Owner tools: `npm run backup:list`, `backup:fetch [key]` (download + decrypt to `./backups/`, git-ignored, file mode 600), `backup:decrypt <file>`.
- The key is held only by the owner (GitHub secret + their own safe copy); the running web app doesn't need it.

**Why GitHub Actions:** Render cron jobs are a paid feature; Actions schedules are free and keep the backup independent of the web service. Caveat: scheduled workflows pause after 60 days without repository activity.

**Dependency note:** exceljs pins an old `uuid`; a root `overrides` entry moves it to `uuid@^11.1.1` (patched for GHSA-w5hq-g745-h8pq). `npm audit` is clean.

---

## Addendum: email verification (OTP at signup)

**Flow.** `POST /auth/register` creates the account (`users.email_verified_at = NULL`), emails a **6-digit code**, and starts a session. Until verified, `requireVerified` makes every data route return **403 `EMAIL_NOT_VERIFIED`**: health events, medicines, dashboard, attachments, records and export. The session, logout, `GET /users/me`, account deletion and the verification endpoints remain available. The SPA routes unverified users to `/verify-email`, then back to the page they wanted.

| Endpoint                               | Notes                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/verify-email` `{code}` | Requires a session. Spaces and dashes in the code are tolerated. 200 `{user}` with `emailVerified: true` |
| `POST /api/auth/resend-verification`   | Requires a session. 60 s cooldown → 429 `RESEND_TOO_SOON`                                                |

**Code rules** (`verification.service.js`): `crypto.randomInt` 6 digits; stored as SHA-256(`user_id:code`) in `email_verification_codes`. **The 3 newest unexpired codes are all accepted** (migration `0005`), because emails can arrive late or out of order and an earlier email's code must not be rejected as "wrong"; expires after **10 min**; **5 wrong attempts** (counted on the newest code) require a new code; constant-time comparison. Verify and resend share a limit of 20 per hour per user. Logging in while unverified sends a fresh code if none is usable.

**Edge cases**

- _Existing accounts_ were marked verified by migration `0004`, so nobody is locked out.
- _Squatted addresses:_ if someone registers your email and never verifies it, "Forgot password" still works for you, and completing the reset proves inbox ownership, so it also sets `email_verified_at`.
- _Abandoned sign-ups:_ unverified accounts older than **7 days** are deleted by the periodic cleanup. They can't hold data, because data routes require verification.
- `EMAIL_TAKEN` at registration still reveals that an address is registered (unchanged trade-off, rate limited).

**Mail.** `MAIL_PROVIDER=smtp` in production. In development the console mailer also writes each email as JSON to `.mail-outbox/` (git-ignored; never in production). Under test, emails collect in `mailer.outbox`.

**Testing.** 10 backend tests (hashing, blocking, success, attempt limit, expiry, resend cooldown, login re-issue, reset-verifies, auth required, stale cleanup); all other backend tests sign up through the same flow via the test helper. E2E: verification screen (wrong code, resend countdown, locked app, redirect back, axe).

**E2E isolation (changed).** Playwright now boots its own API (:4100) and app (:5174) with explicit env overrides (console mailer, in-memory files, no rate limits) against `health_tracker_e2e` (created automatically). Before this, a developer's `.env` with real SMTP could send test emails.

### Email delivery (SMTP)

The SMTP transport is pooled, with short timeouts (10 s connect/greeting, 20 s socket) and **one automatic retry** on a fresh connection. Nodemailer's defaults (2 min connect, 10 min idle socket) could let a stalled connection hold a verification email for minutes. The connection is checked and warmed at startup ("SMTP ready" in the logs). Each send logs the time until the server accepted it and the server's reply, never the recipient or content. Once Gmail has accepted a message (`250 OK`), any further delay happens in delivery or spam filtering on the recipient's side.

Gmail SMTP suits personal use. For production volume and deliverability, a transactional email provider with SPF/DKIM on your own domain (e.g. Brevo, Resend, Postmark) is recommended; it only needs a different `SMTP_URL` and `MAIL_FROM`.

### Email transport (revised)

The mailer supports four transports behind one `mailer.send()`: `console` (dev), `brevo` and `resend` (HTTPS APIs on port 443), and `smtp`.

**Why HTTPS APIs are the production default.** Render blocks outbound SMTP ports 25/465/587 on free instances, at the firewall — the connection is dropped, not refused, so an SMTP attempt hangs until it times out. On that deployment the logs showed both halves of the failure: `connect ENETUNREACH 2404:6800:…:465` (no outbound IPv6 route, DNS returned AAAA first) and then `Connection timeout` on IPv4 (the port block). Neither is fixable from inside the app.

- **IPv4 preference:** `dns.setDefaultResultOrder('ipv4first')` at server startup, so no outbound connection tries an unreachable IPv6 address first.
- **HTTP providers:** one POST, 15 s timeout, retried once on a network error, 429 or 5xx; a 4xx (bad key, unverified sender) fails immediately, because retrying cannot help. The provider's error text is logged — it never contains recipient or health data — while the API returns a generic message.
- **Startup check:** `verifyMailer()` logs the active provider and validates the Brevo key against `GET /v3/account`, so a bad key is visible in the deploy log rather than at the first signup.
- **Failure is surfaced:** registration still doesn't wait on the mail provider, but `POST /auth/resend-verification` does and returns **502 `EMAIL_SEND_FAILED`** if delivery fails, instead of reporting success while nothing arrives.

**Origin rejections are now logged.** `requireSameOrigin` prints the received Origin and the configured `APP_ORIGIN` when it blocks a request, and the startup log prints `APP_ORIGIN`. A misconfigured value previously produced unexplained sub-millisecond 403s on `POST /auth/register` and `/auth/verify-email` with nothing in the logs.
