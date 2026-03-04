-- migrate:up
ALTER TABLE pinned_charts
  ADD COLUMN IF NOT EXISTS layout JSONB;

-- migrate:down
ALTER TABLE pinned_charts DROP COLUMN IF EXISTS layout;
