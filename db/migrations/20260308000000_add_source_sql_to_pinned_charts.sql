-- migrate:up
ALTER TABLE pinned_charts
  ADD COLUMN IF NOT EXISTS source_sql TEXT,
  ADD COLUMN IF NOT EXISTS source_question TEXT;

-- migrate:down
ALTER TABLE pinned_charts
  DROP COLUMN IF EXISTS source_sql,
  DROP COLUMN IF EXISTS source_question;
