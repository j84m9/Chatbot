-- migrate:up
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_provider TEXT NOT NULL DEFAULT 'ollama',
  selected_model TEXT NOT NULL DEFAULT 'llama3.2:1b',
  openai_api_key TEXT,
  anthropic_api_key TEXT,
  google_api_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- migrate:down
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can read own settings" ON user_settings;
ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
DROP TABLE user_settings;
