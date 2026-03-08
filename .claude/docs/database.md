# Database Schema

## `chat_sessions`
- `id` UUID PK, `created_at` TIMESTAMPTZ, `title` TEXT, `system_prompt` TEXT nullable, `user_id` UUID (FK to auth.users)
- `agent_id` UUID nullable (FK to installed_agents, ON DELETE SET NULL)
- `forked_from_session_id` UUID nullable (FK to chat_sessions, ON DELETE SET NULL)
- `forked_at_message_id` UUID nullable (FK to chat_messages, ON DELETE SET NULL)
- `system_prompt`: custom system prompt for the session (null = use default)
- `agent_id`: links session to an installed agent (null = no agent)
- Prompt resolution order: custom `system_prompt` > agent's `system_prompt` > `DEFAULT_SYSTEM_PROMPT`
- RLS enabled: users can only access their own sessions

## `chat_messages`
- `id` UUID PK, `session_id` UUID (FK), `role` TEXT, `content` JSONB (parts array), `created_at`
- `token_usage` JSONB nullable — `{ promptTokens, completionTokens, totalTokens, model }`
- RLS enabled: access gated via session ownership (join-based policy)

## `profiles`
- `user_id` UUID PK (FK to auth.users), `username` TEXT UNIQUE, `first_name`, `last_name`, `dob` DATE nullable, `phone` TEXT nullable
- RLS enabled: users can only SELECT/UPDATE their own row (WITH CHECK on UPDATE)

## `user_settings`
- `user_id` UUID PK (FK to auth.users), `selected_provider` TEXT default 'ollama', `selected_model` TEXT default 'llama3.2:3b', `openai_api_key` TEXT (encrypted), `anthropic_api_key` TEXT (encrypted), `google_api_key` TEXT (encrypted), `updated_at` TIMESTAMPTZ
- RLS enabled: users can only SELECT/INSERT/UPDATE their own row
- API keys encrypted at rest via pgcrypto (`encrypt_text`/`decrypt_text` functions)

## `installed_agents`
- `id` UUID PK, `user_id` UUID (FK to auth.users, CASCADE), `store_agent_id` UUID NOT NULL
- `name` TEXT NOT NULL, `description` TEXT, `system_prompt` TEXT NOT NULL
- `job_category` TEXT, `logo_url` TEXT, `downloads` INTEGER
- `tools` JSONB (default `[]`), `skills` JSONB (default `[]`) — stored but not executed in MVP
- `parent_agent_id` UUID, `store_created_by` UUID — external store references
- `installed_at` TIMESTAMPTZ, `updated_at` TIMESTAMPTZ
- `UNIQUE(user_id, store_agent_id)` — prevents duplicate installs, enables upsert
- RLS enabled: full CRUD gated on `auth.uid() = user_id`

## `db_connections`
- `id` UUID PK, `user_id` UUID (FK), `name`, `server`, `port`, `database_name`, `username`, `password_encrypted` (encrypted via pgcrypto), `domain`, `auth_type`, `encrypt`, `trust_server_certificate`, `db_type` TEXT (default 'mssql'), `file_path` TEXT (for SQLite), timestamps
- RLS enabled
- `db_type` column: 'mssql' or 'sqlite'
- `file_path`: absolute path to SQLite file (used when `db_type` = 'sqlite')

## `saved_queries`
- `id` UUID PK, `user_id` UUID (FK), `connection_id` UUID (FK to db_connections), `name` TEXT, `question` TEXT, `sql_query` TEXT, `explanation` TEXT, `chart_configs` JSONB, `source_message_id` UUID (FK to data_explorer_messages, SET NULL), `created_at` TIMESTAMPTZ
- RLS enabled: full CRUD gated on `auth.uid() = user_id`

## `data_explorer_sessions`
- `id` UUID PK, `user_id` UUID (FK), `connection_id` UUID (FK), `title` TEXT, `ai_title` TEXT nullable, `agent_id` UUID nullable (FK to installed_agents, ON DELETE SET NULL), `created_at` TIMESTAMPTZ
- `ai_title`: AI-generated descriptive title (auto-updated after 1st and 3rd query)
- `agent_id`: links session to an installed agent for domain-specific SQL generation (null = no agent)
- RLS enabled

## `dashboards`
- `id` UUID PK, `user_id` UUID (FK to auth.users, CASCADE), `connection_id` UUID (FK to db_connections, CASCADE)
- `title` TEXT NOT NULL DEFAULT 'Dashboard'
- `global_filters` JSONB DEFAULT '[]' — persisted global filter state
- `created_at`, `updated_at` TIMESTAMPTZ
- `UNIQUE(user_id, connection_id)` — one dashboard per user per connection
- RLS enabled: all operations gated on `auth.uid() = user_id`

## `pinned_charts`
- `id` UUID PK, `user_id` UUID (FK to auth.users, CASCADE), `connection_id` UUID (FK to db_connections, CASCADE), `source_message_id` UUID nullable (FK to data_explorer_messages, SET NULL)
- `title` TEXT NOT NULL, `chart_config` JSONB NOT NULL, `results_snapshot` JSONB NOT NULL (frozen `{ rows, columns, types }`)
- `display_order` INTEGER NOT NULL DEFAULT 0, `layout` JSONB nullable (`{ x, y, w, h }` for grid position)
- `source_sql` TEXT nullable — original SQL query for refresh/re-execution
- `source_question` TEXT nullable — original natural language question
- `auto_refresh_interval` INTEGER nullable — seconds between auto-refresh (0 = off)
- `last_refreshed_at` TIMESTAMPTZ nullable
- `item_type` TEXT nullable — 'chart' (default), 'slicer', 'insights'
- `slicer_config` JSONB nullable — slicer widget config (column, filter type)
- `dashboard_id` UUID nullable — FK to dashboards table for tab assignment
- `created_at` TIMESTAMPTZ
- Charts are snapshot-based with optional refresh via source SQL re-execution
- Chart configs can be refined via natural language or inline SQL editing
- RLS enabled: all operations gated on `auth.uid() = user_id`

## `data_explorer_messages`
- `id` UUID PK, `session_id` UUID (FK), `question`, `sql_query`, `explanation`, `results` JSONB, `chart_config` JSONB, `chart_configs` JSONB, `error`, `execution_time_ms`, `row_count`, `message_type` TEXT (default 'query'), `parent_message_id` UUID (FK self-ref), `insights` TEXT nullable, `created_at`
- `chart_configs`: array of chart configs (coexists with single `chart_config` for backward compat)
- `message_type`: 'query' | 'chart_refinement' | 'sql_refinement' | 'insight'
- `parent_message_id`: links refinement messages to their parent
- `insights`: AI-generated data insights text, persisted when generated and reloaded with session
- RLS enabled (messages gated via session ownership)

## `table_metadata`
- `id` UUID PK, `connection_id` UUID (FK to db_connections, CASCADE), `user_id` UUID (FK to auth.users, CASCADE)
- `table_schema` TEXT (default 'dbo'), `table_name` TEXT
- `auto_description` TEXT nullable — LLM-generated description
- `user_description` TEXT nullable — user override (takes priority over auto)
- `tags` TEXT[] (default `{}`), `category` TEXT nullable
- `relationship_summary` TEXT nullable — FK summary string
- `estimated_row_count` BIGINT nullable
- `auto_cataloged_at` TIMESTAMPTZ nullable — when auto-catalog was last run
- `UNIQUE(connection_id, table_schema, table_name)`
- Full-text search GIN index on descriptions + table name
- RLS enabled: all operations gated on `auth.uid() = user_id`
- Used by catalog mode (>30 tables) for lightweight table catalog, and by all DB sizes for description injection into prompts

## Demo Database (`data/demo.db`)
Pre-seeded SQLite database with 11 tables of realistic sample data:
- `departments` (10) — budget, headcount
- `employees` (150) — across departments, salaries, titles
- `salary_history` — historical salary changes
- `performance_reviews` — quarterly reviews 2020-2025
- `products` (50) — tech products, pricing, inventory
- `product_reviews` (~800) — customer reviews
- `customers` (200) — US regions, signup dates
- `orders` (2000) — seasonal/growth patterns 2023-2026
- `order_items` — line items with discounts
- `website_traffic` — daily metrics 2024-2025 by page/source
- `support_tickets` (600) — resolution times
