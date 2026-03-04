-- migrate:up
ALTER TABLE data_explorer_messages ADD COLUMN IF NOT EXISTS insights TEXT;

-- migrate:down
ALTER TABLE data_explorer_messages DROP COLUMN IF EXISTS insights;
