-- migrate:up
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content JSONB NOT NULL, -- Store the 'parts' array here
  created_at TIMESTAMPTZ DEFAULT now()
);

-- migrate:down
DROP TABLE chat_messages;
DROP TABLE chat_sessions;