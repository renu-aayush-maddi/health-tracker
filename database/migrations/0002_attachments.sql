-- 0002_attachments: optional medical-record files attached to a health event.
-- File bytes live in Cloudinary (private "authenticated" delivery); this table holds metadata.
-- storage_key is a random ID: the original filename, which can itself be sensitive, never
-- leaves our database.

CREATE TABLE attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  health_event_id   uuid NOT NULL,
  user_id           uuid NOT NULL,
  original_filename varchar(255) NOT NULL CHECK (char_length(btrim(original_filename)) > 0),
  content_type      text NOT NULL CHECK (
    content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')
  ),
  size_bytes        integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  storage_provider  text NOT NULL DEFAULT 'cloudinary',
  storage_key       text NOT NULL UNIQUE,
  storage_resource_type text NOT NULL CHECK (storage_resource_type IN ('image', 'raw')),
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Same ownership guarantee as medicines: an attachment always belongs to its event's owner.
  CONSTRAINT attachments_event_owner_fkey FOREIGN KEY (health_event_id, user_id)
    REFERENCES health_events (id, user_id) ON DELETE CASCADE
);

CREATE INDEX attachments_event_idx ON attachments (health_event_id, created_at);
CREATE INDEX attachments_user_idx ON attachments (user_id);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON attachments FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;
