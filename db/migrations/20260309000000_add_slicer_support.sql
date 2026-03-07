-- migrate:up
ALTER TABLE pinned_charts
  ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'chart',
  ADD COLUMN IF NOT EXISTS slicer_config JSONB;

-- migrate:down
ALTER TABLE pinned_charts
  DROP COLUMN IF EXISTS item_type,
  DROP COLUMN IF EXISTS slicer_config;
