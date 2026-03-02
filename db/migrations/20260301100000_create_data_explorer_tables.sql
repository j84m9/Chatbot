-- migrate:up

-- Enable pgcrypto for password encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function to encrypt text
CREATE OR REPLACE FUNCTION encrypt_text(plain_text TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(pgp_sym_encrypt(plain_text, encryption_key), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to decrypt text
CREATE OR REPLACE FUNCTION decrypt_text(encrypted_text TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(decode(encrypted_text, 'base64'), encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Database connections table
CREATE TABLE db_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  server TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 1433,
  database_name TEXT NOT NULL,
  username TEXT,
  password_encrypted TEXT,
  domain TEXT,
  auth_type TEXT NOT NULL DEFAULT 'sql' CHECK (auth_type IN ('sql', 'windows')),
  encrypt BOOLEAN NOT NULL DEFAULT true,
  trust_server_certificate BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE db_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own connections"
  ON db_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own connections"
  ON db_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connections"
  ON db_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connections"
  ON db_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Data explorer sessions table
CREATE TABLE data_explorer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES db_connections(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'New Query',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE data_explorer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own data explorer sessions"
  ON data_explorer_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own data explorer sessions"
  ON data_explorer_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own data explorer sessions"
  ON data_explorer_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Data explorer messages table
CREATE TABLE data_explorer_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES data_explorer_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  sql_query TEXT,
  explanation TEXT,
  results JSONB,
  chart_config JSONB,
  error TEXT,
  execution_time_ms INTEGER,
  row_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE data_explorer_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own data explorer messages"
  ON data_explorer_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM data_explorer_sessions s
      WHERE s.id = data_explorer_messages.session_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own data explorer messages"
  ON data_explorer_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM data_explorer_sessions s
      WHERE s.id = data_explorer_messages.session_id
      AND s.user_id = auth.uid()
    )
  );

-- migrate:down

DROP TABLE IF EXISTS data_explorer_messages;
DROP TABLE IF EXISTS data_explorer_sessions;
DROP TABLE IF EXISTS db_connections;
DROP FUNCTION IF EXISTS decrypt_text(TEXT, TEXT);
DROP FUNCTION IF EXISTS encrypt_text(TEXT, TEXT);
