-- migrate:up
ALTER TABLE pinned_charts
  ADD COLUMN IF NOT EXISTS auto_refresh_interval INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ DEFAULT now();

-- migrate:down
ALTER TABLE pinned_charts
  DROP COLUMN IF EXISTS auto_refresh_interval,
  DROP COLUMN IF EXISTS last_refreshed_at;
