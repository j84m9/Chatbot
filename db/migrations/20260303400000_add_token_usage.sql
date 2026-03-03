-- migrate:up
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS token_usage JSONB;

-- migrate:down
ALTER TABLE chat_messages DROP COLUMN IF EXISTS token_usage;
