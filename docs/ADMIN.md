# Health Tracker — Admin & Administration System

Status: **Implemented** · Date: 2026-10-04

Extends the existing application (see [ARCHITECTURE.md](ARCHITECTURE.md)). Nothing in the current user-facing app changes behaviour; every addition is additive.

**Guiding principle:** this is a personal health diary, not a surveillance platform. Administration exists to run the platform — accounts, security, troubleshooting, auditing — and _not_ to browse people's medical history. The design makes reading health content the rare, explicitly-granted, always-audited exception rather than an admin perk.

---

## A. Roles and permissions

Roles are a convenient default; **permissions are what the backend actually checks**.

| Permission                                    | READ_ONLY_ADMIN | ADMIN | SUPER_ADMIN |
| --------------------------------------------- | :-------------: | :---: | :---------: |
| `users.read`                                  |       ✅        |  ✅   |     ✅      |
| `users.update`                                |        —        |  ✅   |     ✅      |
| `users.block`                                 |        —        |  ✅   |     ✅      |
| `users.delete`                                |        —        |   —   |    ✅ 🔐    |
| `sessions.read`                               |       ✅        |  ✅   |     ✅      |
| `sessions.revoke`                             |        —        |  ✅   |     ✅      |
| `security.read`                               |       ✅        |  ✅   |     ✅      |
| `audit_logs.read`                             |       ✅        |  ✅   |     ✅      |
| `ip_addresses.read`                           |       ✅        |  ✅   |     ✅      |
| `ip_addresses.block`                          |        —        |  ✅   |     ✅      |
| `system.read`                                 |       ✅        |  ✅   |     ✅      |
| `reports.read`                                |       ✅        |  ✅   |     ✅      |
| `admins.manage`                               |        —        |   —   |    ✅ 🔐    |
| `health_records.read` / `.update` / `.delete` |        —        |   —   |     ✅      |
| `medicines.read` / `.update` / `.delete`      |        —        |   —   |     ✅      |
| **`health_data.export`**                      |        —        |   —   |      —      |

🔐 = the _write_ routes using this permission additionally require a recent password re-entry (10-minute window). Reading never prompts for a password.

**Access to medical content.** By decision of the project owner, a SUPER_ADMIN can read health records and medicine records by default. ADMIN and READ_ONLY_ADMIN cannot — a SUPER_ADMIN must grant them `health_records.read` explicitly, optionally with an expiry date. Every such read is written to the audit log regardless of who performs it.

To make this stricter, remove the `health_records.*` and `medicines.*` entries from `super_admin` in `shared/src/admin.js`; nothing else needs to change.

**Bulk export (`health_data.export`) is in no role**, including SUPER_ADMIN. Reading one record is a support task; exporting everyone's medical history is a different kind of act, so it must be granted deliberately. (The endpoint itself is not implemented — see Known limitations.)

`USER` has no permissions and cannot reach `/api/admin/*` at all.

---

## B. Database changes (migration `0006_admin.sql`)

Additive only. No existing column or row is dropped or rewritten.

**`users`** — new columns:
`role` (`user|read_only_admin|admin|super_admin`, default `user`), `status` (`active|disabled|blocked|suspended`, default `active`), `status_reason`, `status_changed_at`, `status_changed_by` (FK users, ON DELETE SET NULL), `last_login_at`, `last_activity_at`, `last_ip` (inet).

**`sessions`** — new column `ip_address inet` (the table already stores `user_agent`).

**`admin_permissions`** — explicit grants beyond the role default.
`id, user_id FK, permission text, granted_by FK, granted_at, expires_at NULL, reason`. Unique on `(user_id, permission)`.

**`audit_logs`** — privileged/admin actions. Append-only.
`id, actor_user_id, actor_role, action, resource_type, resource_id, target_user_id, ip_address, user_agent, metadata jsonb, created_at`.
A `BEFORE UPDATE OR DELETE` trigger raises an exception, so even an admin with database access through the app cannot silently rewrite history. Indexes on `(created_at DESC)`, `(actor_user_id, created_at DESC)`, `(target_user_id, created_at DESC)`, `(action, created_at DESC)`.

**`security_events`** — authentication and account security events (login success/failure, password change/reset, lockout, blocked request). Append-only, same trigger.
`id, user_id NULL, email_attempted, event_type, ip_address, user_agent, success bool, failure_reason, metadata jsonb, created_at`. `email_attempted` is needed because a failed login may not match a user.

**`ip_blocklist`** — `id, ip_address inet UNIQUE, reason, blocked_by FK, blocked_at, expires_at NULL`.

No new `user_sessions` table: the existing `sessions` table already serves that purpose.

RLS enabled with no policies on every new table, matching the existing Supabase hardening.

---

## C. Backend

**Middleware chain for `/api/admin/*`:**
`requireAuth` → `requireActiveAccount` → `requireAdmin` → `requirePermission('…')` → `requireRecentAuth` (high-risk only) → handler.

- `requireActiveAccount` — applied to **all** authenticated routes, not just admin: a user whose status is not `active` gets 403 and their sessions are revoked. This is what actually enforces blocking.
- `requirePermission(p)` resolves the effective permission set = role defaults ∪ unexpired explicit grants. Computed server-side per request from the session's user row. A `role` or `permission` value in a request body is never read.
- `requireRecentAuth` is applied to four write routes (role change, account deletion, permission grant and revoke). It checks `sessions.reauth_at` is within 10 minutes; otherwise 403 `REAUTH_REQUIRED`, and the UI prompts for the password and retries the action. It is deliberately separate from `requirePermission`, so that merely _reading_ a page never asks for a password.

**IP blocklist:** checked on `/api/auth/login`, `/register`, `/forgot-password`, `/reset-password`. Rejected requests write a `security_events` row. IPs come from `req.ip` with the existing `TRUST_PROXY` setting — arbitrary `X-Forwarded-For` is not trusted.

**Audit service:** `recordAudit({ actor, action, resourceType, resourceId, targetUserId, metadata })`, writing the actor's IP and user agent. Called inside the same transaction as the action where one exists, so an action cannot succeed without its audit row.

**Self-protection invariants** (enforced in the service layer, with tests):

- Nobody can change their own role or permissions.
- Nobody can block, disable, suspend or delete their own account.
- The last remaining `super_admin` cannot be demoted, blocked or deleted.
- Only `super_admin` can grant/revoke admin roles or permissions.

**New API surface** (all under `/api/admin`, all paginated server-side, all validated with Zod):
`GET /dashboard` · `GET /users` · `GET /users/:id` · `PATCH /users/:id` · `POST /users/:id/status` · `POST /users/:id/force-logout` · `POST /users/:id/password-reset` · `POST /users/:id/role` 🔐 · `DELETE /users/:id` 🔐 · `GET /users/:id/activity` · `GET /health-records` 🔒 · `GET /health-records/:id` 🔒 · `GET /medicines` 🔒 · `GET /security` · `GET /audit-logs` · `GET /sessions` · `POST /sessions/:id/revoke` · `GET /ip-addresses` · `POST /ip-addresses/block` · `POST /ip-addresses/unblock` · `GET /admins` · `POST /admins/:id/permissions` 🔐 · `GET /system/health` · `GET /reports/*`.
🔒 = requires an explicit health permission and writes an audit row on every single read.

---

## D. Frontend

`/admin/*`, lazy-loaded as a separate chunk so ordinary users never download it. Uses the existing design tokens, `Card`, `Button`, `Dialog`, `ConfirmDialog`, toasts, skeletons and empty/error states — no new UI framework.

Pages: Dashboard · Users · User detail · Health Records 🔒 · Medicines 🔒 · Security · Audit Logs · Sessions · IP Addresses · Admins · System · Reports.

Sidebar entries are filtered by the viewer's permissions, but that is cosmetic only — the backend is the authority. Charts are hand-written inline SVG (registrations, activity, logins, daily active users; 7/30/90-day and custom ranges), aggregate-only, never naming a medical condition.

Desktop-first, still usable on tablet; the admin area is not optimised for phones.

---

## E. Privacy controls

1. Health permissions are default-denied for every role, grantable only per-admin by a SUPER_ADMIN, optionally expiring.
2. Admin screens show **metadata** — record counts, last-updated dates, event type names — not medical content.
3. Opening any detailed health record shows an interstitial privacy warning and writes `HEALTH_RECORD_VIEWED` with the actor, target user, record id, time and IP before the content is returned.
4. The user activity timeline uses event names (`HEALTH_EVENT_CREATED`), never titles, symptoms or medicines.
5. Dashboard charts and reports are aggregate counts only.
6. Health-data export is **off by default**, behind its own permission, re-authentication and a `HEALTH_DATA_EXPORTED` audit row.
7. A Privacy report lists which admins accessed sensitive data and when — so the watchers are watchable.
8. Audit and security logs never contain passwords, hashes, session tokens, codes or API keys.

---

## F. First SUPER_ADMIN

`npm run create-admin` — an interactive CLI that creates or promotes an account, hashing with the existing Argon2id implementation. No credentials in source, no hardcoded defaults, refuses to run without a TTY unless given explicit flags.

---

## G. Testing

Authorization matrix (USER / READ_ONLY_ADMIN / ADMIN / SUPER_ADMIN against every endpoint), privilege-escalation attempts, health-permission denial, blocking end-to-end (login refused, sessions revoked, API denied, audit written), IP blocking, audit-row creation for every sensitive action, append-only enforcement, self-protection invariants, plus the full existing suite as regression.

---

## H. Phases

1. Migration, permission model, middleware, audit + security event services, `create-admin` CLI
2. Account status enforcement, login/security event recording, IP tracking and blocking
3. Admin APIs: dashboard, users, sessions, security, audit, IPs, admins, system, reports
4. Health-record and medicine admin APIs (permission-gated, audited)
5. Admin frontend: layout, pages, charts
6. Security review, full test pass, documentation

---

## Implementation notes

Decisions made or corrected while building:

- **The append-only logs have no foreign keys to `users`.** An `ON DELETE SET NULL` is an `UPDATE`, which the append-only trigger (correctly) refuses — so deleting an account would have failed. The actor/target columns are plain `uuid` with an email snapshot alongside, which also means the audit trail survives the deletion it describes. Covered by a test.
- **`TRUNCATE` is still permitted** on the two log tables so the test suite can reset the schema; the application never issues one. `UPDATE` and `DELETE` are blocked at the database level.
- **Account status is enforced inside `requireAuth`**, not per-router, so no route can forget it. A restricted account's sessions are destroyed on its next request.
- **Blocking revokes sessions**, so a blocked user's next request is a 401 (dead cookie) rather than a 403; the 403 path covers a session that somehow outlives the status change.
- **Administrators are listed by filtering on role in SQL.** An earlier version fetched one page of users and filtered in JavaScript, which would have hidden any admin outside that page.
- **Re-authentication is per route, not per permission.** Deriving it from the permission meant that merely opening the admin-management page demanded a password.
- **Charts** are hand-written inline SVG with a hover crosshair, a legend and a visually hidden data table. The two-series palette was validated for colour-vision separation and contrast against each mode's own surface; light and dark use separately chosen steps rather than a flip.
- **Scrollable tables are focusable** (`tabindex="0"`, `role="region"`) so they can be scrolled with the keyboard — found by the automated accessibility pass.

### Verification status

| Check                                                                                | Result                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Backend tests (authorization matrix, privacy gating, blocking, audit, invariants)    | 177 passing                                                                     |
| Frontend unit tests                                                                  | 24 passing                                                                      |
| Shared schema tests                                                                  | 9 passing                                                                       |
| Playwright, including 9 admin tests (access control, blocking, privacy warning, axe) | 46 passing                                                                      |
| Route audit: every admin route carries a permission guard                            | passing — only `/me` and `/reauth` have none, and both act solely on the caller |
| `npm audit`                                                                          | 0 vulnerabilities                                                               |

### Known limitations

- **No admin data export.** `health_data.export` exists as a permission and `HEALTH_DATA_EXPORTED` as an audit action, but no export endpoint is implemented. Users can still export their own data from Settings.
- **The admin area is read-only with respect to medical content.** `health_records.update` / `.delete` and `medicines.update` / `.delete` exist as permissions but have no endpoints. Deleting an account deletes its data.
- **An administrator cannot change someone's email** — that needs a verification flow — so only `name` is editable.
- **Suspicious-activity detection is deliberately simple**: repeated failures by address and by account, and accounts seen from several addresses. No behavioural profiling.
- **IP addresses are retained indefinitely** in `security_events`. Add a periodic delete if you want a retention window.
- **The admin area is desktop-first.** Usable on a tablet; not optimised for phones.
- **Blocked Users and Activity** from the suggested sidebar are not separate pages: blocked accounts are the Users page filtered by status, and activity is split between Security (authentication) and Audit Logs (administrative actions).
