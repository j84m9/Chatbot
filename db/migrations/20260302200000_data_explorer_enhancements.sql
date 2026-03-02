-- migrate:up

-- Add multi-chart support and refinement tracking to messages
ALTER TABLE data_explorer_messages ADD COLUMN chart_configs JSONB;
ALTER TABLE data_explorer_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'query';
ALTER TABLE data_explorer_messages ADD COLUMN parent_message_id UUID REFERENCES data_explorer_messages(id);

-- AI-generated session titles
ALTER TABLE data_explorer_sessions ADD COLUMN ai_title TEXT;

-- Allow updates on sessions (for AI title)
CREATE POLICY "Users can update their own data explorer sessions"
  ON data_explorer_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- migrate:down

ALTER TABLE data_explorer_messages DROP COLUMN IF EXISTS chart_configs;
ALTER TABLE data_explorer_messages DROP COLUMN IF EXISTS message_type;
ALTER TABLE data_explorer_messages DROP COLUMN IF EXISTS parent_message_id;
ALTER TABLE data_explorer_sessions DROP COLUMN IF EXISTS ai_title;
DROP POLICY IF EXISTS "Users can update their own data explorer sessions" ON data_explorer_sessions;
