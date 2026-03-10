-- migrate:up
ALTER TABLE table_metadata ADD COLUMN column_profiles JSONB;
-- JSONB format: { "column_name": { null_rate, distinct_count, min, max, avg, sample_values?, date_range? } }

-- migrate:down
ALTER TABLE table_metadata DROP COLUMN column_profiles;
