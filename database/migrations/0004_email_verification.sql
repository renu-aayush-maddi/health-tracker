-- 0004_email_verification: one-time codes emailed at signup to prove the address.

ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

-- Accounts that existed before verification was introduced are treated as verified.
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

-- At most one active code per user; a new code replaces the old one.
CREATE TABLE email_verification_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  code_hash  char(64) NOT NULL,          -- SHA-256 of "<user_id>:<code>", never the code itself
  expires_at timestamptz NOT NULL,
  attempts   smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_verification_codes_expires_idx ON email_verification_codes (expires_at);
CREATE INDEX users_unverified_idx ON users (created_at) WHERE email_verified_at IS NULL;

ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON email_verification_codes FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;
