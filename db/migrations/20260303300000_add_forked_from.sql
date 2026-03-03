-- migrate:up
ALTER TABLE chat_sessions ADD COLUMN forked_from_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL;
ALTER TABLE chat_sessions ADD COLUMN forked_at_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL;

-- migrate:down
ALTER TABLE chat_sessions DROP COLUMN IF EXISTS forked_at_message_id;
ALTER TABLE chat_sessions DROP COLUMN IF EXISTS forked_from_session_id;
