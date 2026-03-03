-- migrate:up

-- Saved queries table (standalone, tied to connection not session)
CREATE TABLE saved_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  sql_query TEXT NOT NULL,
  explanation TEXT,
  chart_configs JSONB,
  source_message_id UUID REFERENCES data_explorer_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for saved_queries
ALTER TABLE saved_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved queries"
  ON saved_queries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved queries"
  ON saved_queries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved queries"
  ON saved_queries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved queries"
  ON saved_queries FOR DELETE
  USING (auth.uid() = user_id);

-- System prompt support on chat_sessions
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS system_prompt TEXT;

-- migrate:down

DROP TABLE IF EXISTS saved_queries;
ALTER TABLE chat_sessions DROP COLUMN IF EXISTS system_prompt;
