-- migrate:up
ALTER TABLE data_explorer_messages ADD COLUMN IF NOT EXISTS agent_steps JSONB;

-- migrate:down
ALTER TABLE data_explorer_messages DROP COLUMN IF EXISTS agent_steps;
