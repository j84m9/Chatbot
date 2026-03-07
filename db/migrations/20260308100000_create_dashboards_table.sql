-- migrate:up
CREATE TABLE dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Dashboard',
  global_filters JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, connection_id)
);

ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dashboards"
  ON dashboards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dashboards"
  ON dashboards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dashboards"
  ON dashboards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own dashboards"
  ON dashboards FOR DELETE
  USING (auth.uid() = user_id);

-- migrate:down
DROP TABLE IF EXISTS dashboards;
