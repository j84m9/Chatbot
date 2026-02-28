-- migrate:up
ALTER TABLE chat_sessions ADD COLUMN title TEXT;

-- migrate:down
ALTER TABLE chat_sessions DROP COLUMN title;