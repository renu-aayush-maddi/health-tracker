-- 0001_init: users, sessions, password reset tokens, health events, medicines.
-- See docs/ARCHITECTURE.md §B for the rationale behind each constraint.

-- Keeps updated_at current on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                varchar(100) NOT NULL CHECK (char_length(btrim(name)) > 0),
  email               varchar(254) NOT NULL UNIQUE CHECK (email = lower(email) AND email LIKE '%_@_%'),
  password_hash       text NOT NULL,
  preferences         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(preferences) = 'object'),
  password_changed_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- sessions: the cookie holds a random token; only its SHA-256 hash is stored.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   char(64) NOT NULL UNIQUE,
  user_agent   varchar(255),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- password_reset_tokens: single use, short lived, stored hashed.
-- ---------------------------------------------------------------------------
CREATE TABLE password_reset_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);

-- ---------------------------------------------------------------------------
-- health_events
-- ---------------------------------------------------------------------------
CREATE TABLE health_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title        varchar(150) NOT NULL CHECK (char_length(btrim(title)) > 0),
  health_issue varchar(100) NOT NULL CHECK (char_length(btrim(health_issue)) > 0),
  description  text CHECK (char_length(description) <= 2000),
  start_date   date NOT NULL,
  end_date     date,
  status       text NOT NULL CHECK (status IN ('ongoing', 'resolved')),
  severity     text CHECK (severity IN ('mild', 'moderate', 'severe')),
  symptoms     text[] NOT NULL DEFAULT '{}' CHECK (cardinality(symptoms) <= 30),
  notes        text CHECK (char_length(notes) <= 5000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT health_events_dates_ordered CHECK (end_date IS NULL OR end_date >= start_date),
  -- "Ongoing" means no end date; "resolved" requires one.
  CONSTRAINT health_events_status_matches_end_date CHECK (
    (status = 'ongoing' AND end_date IS NULL) OR (status = 'resolved' AND end_date IS NOT NULL)
  ),
  -- Target of the composite FK from medicines, which pins a medicine to its event's owner.
  CONSTRAINT health_events_id_user_id_key UNIQUE (id, user_id)
);

CREATE INDEX health_events_user_start_idx ON health_events (user_id, start_date DESC);
CREATE INDEX health_events_user_status_idx ON health_events (user_id, status);
CREATE INDEX health_events_user_issue_idx ON health_events (user_id, health_issue);

CREATE TRIGGER health_events_set_updated_at BEFORE UPDATE ON health_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- medicines
-- ---------------------------------------------------------------------------
CREATE TABLE medicines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  health_event_id uuid NOT NULL,
  user_id         uuid NOT NULL,
  name            varchar(120) NOT NULL CHECK (char_length(btrim(name)) > 0),
  dosage          varchar(60),
  frequency       varchar(60),
  start_date      date,
  end_date        date,
  notes           varchar(1000),
  sort_order      smallint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT medicines_dates_ordered CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  ),
  -- A medicine can only ever belong to the same user as its health event.
  CONSTRAINT medicines_event_owner_fkey FOREIGN KEY (health_event_id, user_id)
    REFERENCES health_events (id, user_id) ON DELETE CASCADE
);

CREATE INDEX medicines_event_idx ON medicines (health_event_id, sort_order);
CREATE INDEX medicines_user_name_idx ON medicines (user_id, lower(name));

CREATE TRIGGER medicines_set_updated_at BEFORE UPDATE ON medicines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Supabase hardening: Supabase exposes the public schema over its Data API to the
-- `anon` and `authenticated` roles. Enabling RLS with no policies denies those roles
-- everything. The API connects as the table owner, which RLS does not restrict.
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON users, sessions, password_reset_tokens, health_events, medicines FROM %I',
        role_name
      );
      EXECUTE format('REVOKE EXECUTE ON FUNCTION set_updated_at() FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;
