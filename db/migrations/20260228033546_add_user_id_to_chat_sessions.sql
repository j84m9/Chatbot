-- migrate:up
ALTER TABLE chat_sessions 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- migrate:down
ALTER TABLE chat_sessions 
DROP COLUMN user_id;