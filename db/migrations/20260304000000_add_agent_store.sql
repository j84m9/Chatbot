-- migrate:up

-- Installed agents table: local copies of agents from the store
CREATE TABLE IF NOT EXISTS installed_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_agent_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  job_category TEXT,
  logo_url TEXT,
  downloads INTEGER DEFAULT 0,
  tools JSONB DEFAULT '[]',
  skills JSONB DEFAULT '[]',
  parent_agent_id UUID,
  store_created_by UUID,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, store_agent_id)
);

-- RLS policies for installed_agents
ALTER TABLE installed_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own installed agents"
  ON installed_agents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can install agents"
  ON installed_agents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own installed agents"
  ON installed_agents FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can uninstall their own agents"
  ON installed_agents FOR DELETE
  USING (auth.uid() = user_id);

-- Add agent_id to chat_sessions
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES installed_agents(id) ON DELETE SET NULL;

-- migrate:down

ALTER TABLE chat_sessions DROP COLUMN IF EXISTS agent_id;
DROP TABLE IF EXISTS installed_agents;
