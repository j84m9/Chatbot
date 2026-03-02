-- migrate:up
ALTER TABLE db_connections ADD COLUMN db_type TEXT NOT NULL DEFAULT 'mssql';
ALTER TABLE db_connections ADD COLUMN file_path TEXT;

-- migrate:down
ALTER TABLE db_connections DROP COLUMN db_type;
ALTER TABLE db_connections DROP COLUMN file_path;
