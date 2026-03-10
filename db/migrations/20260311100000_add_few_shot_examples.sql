-- migrate:up
ALTER TABLE db_connections ADD COLUMN few_shot_examples TEXT;

-- migrate:down
ALTER TABLE db_connections DROP COLUMN few_shot_examples;
