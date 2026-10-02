-- 0003_attachment_tags: user-defined labels on attachments (e.g. "Prescription", "Lab report")
-- to make records easier to find across events.

ALTER TABLE attachments
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 10);

CREATE INDEX attachments_tags_idx ON attachments USING gin (tags);
