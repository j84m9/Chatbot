-- migrate:up

-- Remove unique constraint so multiple dashboards per connection are allowed
ALTER TABLE dashboards DROP CONSTRAINT IF EXISTS dashboards_user_id_connection_id_key;

ALTER TABLE dashboards
  ADD COLUMN IF NOT EXISTS tab_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT true;

ALTER TABLE pinned_charts
  ADD COLUMN IF NOT EXISTS dashboard_id UUID REFERENCES dashboards(id) ON DELETE CASCADE;

-- migrate:down
ALTER TABLE pinned_charts DROP COLUMN IF EXISTS dashboard_id;

ALTER TABLE dashboards
  DROP COLUMN IF EXISTS tab_order,
  DROP COLUMN IF EXISTS is_default;

-- Re-add the unique constraint
ALTER TABLE dashboards ADD CONSTRAINT dashboards_user_id_connection_id_key UNIQUE (user_id, connection_id);
