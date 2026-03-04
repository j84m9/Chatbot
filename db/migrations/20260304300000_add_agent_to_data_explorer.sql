-- migrate:up
ALTER TABLE data_explorer_sessions
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES installed_agents(id) ON DELETE SET NULL;

-- migrate:down
ALTER TABLE data_explorer_sessions DROP COLUMN IF EXISTS agent_id;
