-- migrate:up
ALTER TABLE db_connections ADD COLUMN semantic_context TEXT;

-- migrate:down
ALTER TABLE db_connections DROP COLUMN semantic_context;
