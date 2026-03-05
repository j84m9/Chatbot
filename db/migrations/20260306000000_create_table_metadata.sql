-- migrate:up
CREATE TABLE table_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES db_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_schema TEXT NOT NULL DEFAULT 'dbo',
  table_name TEXT NOT NULL,
  auto_description TEXT,
  user_description TEXT,
  tags TEXT[] DEFAULT '{}',
  category TEXT,
  relationship_summary TEXT,
  estimated_row_count BIGINT,
  auto_cataloged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connection_id, table_schema, table_name)
);

-- Index for fast lookup by connection
CREATE INDEX idx_table_metadata_connection ON table_metadata(connection_id);

-- Full-text search index on descriptions
CREATE INDEX idx_table_metadata_search ON table_metadata
  USING gin(to_tsvector('english', coalesce(auto_description, '') || ' ' || coalesce(user_description, '') || ' ' || table_name));

-- RLS policies
ALTER TABLE table_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own table metadata"
  ON table_metadata FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own table metadata"
  ON table_metadata FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own table metadata"
  ON table_metadata FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own table metadata"
  ON table_metadata FOR DELETE
  USING (auth.uid() = user_id);

-- migrate:down
DROP TABLE IF EXISTS table_metadata;
