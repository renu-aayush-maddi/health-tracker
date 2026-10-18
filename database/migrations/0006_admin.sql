-- 0006_admin: roles, account status, explicit admin permissions, and append-only
-- audit/security logs. Purely additive: no existing column or row is dropped or rewritten.

-- ---------------------------------------------------------------------------
-- users: role, account status and last-seen information
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'read_only_admin', 'admin', 'super_admin')),
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'blocked', 'suspended')),
  ADD COLUMN status_reason varchar(500),
  ADD COLUMN status_changed_at timestamptz,
  ADD COLUMN status_changed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN last_login_at timestamptz,
  ADD COLUMN last_activity_at timestamptz,
  ADD COLUMN last_ip inet;

CREATE INDEX users_role_idx ON users (role) WHERE role <> 'user';
CREATE INDEX users_status_idx ON users (status) WHERE status <> 'active';
CREATE INDEX users_created_at_idx ON users (created_at DESC);
CREATE INDEX users_last_activity_idx ON users (last_activity_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- sessions: client IP, and when the user last re-entered their password
-- (re-authentication for high-risk admin actions)
-- ---------------------------------------------------------------------------
ALTER TABLE sessions
  ADD COLUMN ip_address inet,
  ADD COLUMN reauth_at timestamptz;

-- ---------------------------------------------------------------------------
-- admin_permissions: explicit grants on top of the role's defaults.
-- This is how sensitive permissions (health data) reach a non-super-admin.
-- ---------------------------------------------------------------------------
CREATE TABLE admin_permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (char_length(permission) BETWEEN 3 AND 64),
  granted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  reason     varchar(500),

  CONSTRAINT admin_permissions_unique UNIQUE (user_id, permission)
);

CREATE INDEX admin_permissions_user_idx ON admin_permissions (user_id);

-- ---------------------------------------------------------------------------
-- Append-only guard shared by audit_logs and security_events.
-- TRUNCATE is deliberately still allowed so the test suite can reset the schema;
-- the application itself never issues one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deny_log_modification() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$;

-- ---------------------------------------------------------------------------
-- audit_logs: privileged actions.
-- The actor/target user columns are deliberately NOT foreign keys: an ON DELETE SET NULL would
-- be an UPDATE, which the append-only trigger (correctly) refuses, and deleting an account must
-- never rewrite history. The email snapshots keep rows meaningful after an account is gone.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  uuid,
  actor_email    varchar(254),
  actor_role     text,
  action         text NOT NULL,
  resource_type  text,
  resource_id    uuid,
  target_user_id uuid,
  target_email   varchar(254),
  ip_address     inet,
  user_agent     varchar(255),
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_logs_target_idx ON audit_logs (target_user_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION deny_log_modification();

-- ---------------------------------------------------------------------------
-- security_events: authentication and account security. `user_id` is likewise not a foreign key
-- (see audit_logs above), and email_attempted is kept because a failed login often matches no user.
-- ---------------------------------------------------------------------------
CREATE TABLE security_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  email_attempted varchar(254),
  event_type      text NOT NULL,
  ip_address      inet,
  user_agent      varchar(255),
  success         boolean NOT NULL DEFAULT false,
  failure_reason  text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX security_events_created_idx ON security_events (created_at DESC);
CREATE INDEX security_events_user_idx ON security_events (user_id, created_at DESC);
CREATE INDEX security_events_ip_idx ON security_events (ip_address, created_at DESC);
CREATE INDEX security_events_type_idx ON security_events (event_type, created_at DESC);
CREATE INDEX security_events_failed_idx ON security_events (created_at DESC) WHERE success = false;

CREATE TRIGGER security_events_append_only
  BEFORE UPDATE OR DELETE ON security_events
  FOR EACH STATEMENT EXECUTE FUNCTION deny_log_modification();

-- ---------------------------------------------------------------------------
-- ip_blocklist
-- ---------------------------------------------------------------------------
CREATE TABLE ip_blocklist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL UNIQUE,
  reason     varchar(500),
  blocked_by uuid REFERENCES users (id) ON DELETE SET NULL,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX ip_blocklist_expires_idx ON ip_blocklist (expires_at);

-- ---------------------------------------------------------------------------
-- Supabase hardening, matching the existing tables.
-- ---------------------------------------------------------------------------
ALTER TABLE admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_blocklist ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON admin_permissions, audit_logs, security_events, ip_blocklist FROM %I',
        role_name
      );
      EXECUTE format('REVOKE EXECUTE ON FUNCTION deny_log_modification() FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;
