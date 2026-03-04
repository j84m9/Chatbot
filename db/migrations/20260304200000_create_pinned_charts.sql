-- migrate:up
CREATE TABLE pinned_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES data_explorer_messages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  chart_config JSONB NOT NULL,
  results_snapshot JSONB NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pinned_charts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pinned charts"
  ON pinned_charts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pinned charts"
  ON pinned_charts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pinned charts"
  ON pinned_charts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pinned charts"
  ON pinned_charts FOR DELETE
  USING (auth.uid() = user_id);

-- migrate:down
DROP TABLE IF EXISTS pinned_charts;
