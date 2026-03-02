# Chatbot Project

## Overview
A full-stack AI chatbot built with Next.js 16, Supabase, and the Vercel AI SDK v5. Supports multiple AI providers (Ollama, OpenAI, Anthropic, Google) via a Bring Your Own Key (BYOK) system. Dark/light theme, collapsible sidebar, chat history, user profiles. Includes a Data Explorer for natural language querying of MSSQL and SQLite databases.

## Tech Stack
- **Framework**: Next.js 16 (App Router) with React 19, TypeScript, Tailwind CSS v4
- **AI**: Vercel AI SDK v5 (`ai`, `@ai-sdk/react`) with `useChat` hook + `DefaultChatTransport`
- **Providers**: `ai-sdk-ollama`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Auth**: Supabase Auth via `@supabase/ssr` (cookie-based, middleware-enforced)
- **Migrations**: SQL files in `db/migrations/`, managed with dbmate
- **Rendering**: `react-markdown` + `remark-gfm` for markdown, `shiki` for syntax highlighting
- **Charts**: `react-plotly.js` for data visualization in Data Explorer
- **Local DB**: `better-sqlite3` for read-only SQLite querying in Data Explorer

## Project Structure
```
app/
  page.tsx              — Main chat UI (sidebar, messages, input, settings panel)
  layout.tsx            — Root layout (Geist fonts, dark class on <html>)
  globals.css           — Tailwind imports, dark variant, custom animations
  login/
    page.tsx            — Login/signup form
    actions.ts          — Server actions: login() and signup()
  data-explorer/
    page.tsx            — Data Explorer UI (split pane, sidebar, query chat, results)
    report/page.tsx     — Standalone pop-out report window (BI report style)
  api/
    chat/route.ts       — POST: streams AI response, saves user+assistant messages
    sessions/route.ts   — GET: list sessions, DELETE: remove session + messages
    messages/route.ts   — GET: fetch messages for a session (rebuilds AI SDK format)
    settings/route.ts   — GET/POST: user provider/model/API key settings (encrypt/decrypt)
    models/route.ts     — GET: static model catalog + provider names
    data-explorer/
      query/route.ts    — POST: natural language → SQL → execute → multi-chart suggestion (+ chart/SQL refinement, insights)
      connections/route.ts — CRUD for database connections (MSSQL + SQLite)
      connections/test/route.ts — POST: test a database connection
      schema/route.ts   — GET: fetch and cache database schema
      sessions/route.ts — GET/DELETE: data explorer session management
      messages/route.ts — GET: fetch messages for a data explorer session
  components/
    data-explorer/
      ResultsPanel.tsx  — SQL/Table/Chart/Insights tabs, CSV export, pop-out, refinement buttons
      QueryChat.tsx     — Chat interface for natural language queries (+ refinement mode)
      ConnectionManager.tsx — Modal for adding/editing database connections
      PlotlyChart.tsx   — Plotly chart wrapper (8 chart types, color grouping, orientation)
      ChartGallery.tsx  — Multi-chart gallery with per-chart refine buttons
      InsightsPanel.tsx — AI-generated data insights with regenerate
      DataExplorerSidebar.tsx — Sidebar with connections, sessions (AI titles), settings
    MarkdownRenderer.tsx — Markdown rendering for chat messages
    CodeBlock.tsx       — Syntax-highlighted code blocks (Shiki)
    ChatPlot.tsx        — Inline chart rendering in chat messages
utils/
  ai/provider.ts        — getModel() factory, MODEL_CATALOG, PROVIDER_NAMES
  ai/data-explorer-prompts.ts — Prompt templates for SQL generation and chart suggestion
  supabase/
    server.ts           — Server-side Supabase client (cookie-based)
    client.ts           — Browser-side Supabase client
  mssql/connection.ts   — MSSQL connection, query execution, schema fetching
  sqlite/connection.ts  — SQLite read-only connection, query execution, schema fetching
data/
  demo.db              — Pre-seeded SQLite demo database (11 tables, realistic sample data)
scripts/
  seed-demo-db.ts      — Script to regenerate demo.db (`npx tsx scripts/seed-demo-db.ts`)
types/
  plotly.d.ts          — Plotly type declarations
  react-plotly.d.ts    — React-Plotly type declarations
middleware.ts          — Auth guard: redirects unauthenticated users to /login
db/migrations/         — SQL migration files (dbmate format)
```

## Setup After Clone
1. `npm install`
2. Copy `.env` with Supabase credentials and `DB_CONNECTIONS_ENCRYPTION_KEY`
3. `dbmate up` — runs all migrations (including SQLite support columns on `db_connections`)
4. `npm run dev`
5. The `data/demo.db` is included in the repo — no seeding needed. To regenerate: `npx tsx scripts/seed-demo-db.ts`

## Database Schema

### `chat_sessions`
- `id` UUID PK, `created_at` TIMESTAMPTZ, `title` TEXT, `user_id` UUID (FK to auth.users)
- RLS enabled: users can only access their own sessions

### `chat_messages`
- `id` UUID PK, `session_id` UUID (FK), `role` TEXT, `content` JSONB (parts array), `created_at`
- RLS enabled: access gated via session ownership (join-based policy)

### `profiles`
- `user_id` UUID PK (FK to auth.users), `username` TEXT UNIQUE, `first_name`, `last_name`, `dob` DATE nullable, `phone` TEXT nullable
- RLS enabled: users can only SELECT/UPDATE their own row (WITH CHECK on UPDATE)

### `user_settings`
- `user_id` UUID PK (FK to auth.users), `selected_provider` TEXT default 'ollama', `selected_model` TEXT default 'llama3.2:1b', `openai_api_key` TEXT (encrypted), `anthropic_api_key` TEXT (encrypted), `google_api_key` TEXT (encrypted), `updated_at` TIMESTAMPTZ
- RLS enabled: users can only SELECT/INSERT/UPDATE their own row
- API keys encrypted at rest via pgcrypto (`encrypt_text`/`decrypt_text` functions)

### `db_connections`
- `id` UUID PK, `user_id` UUID (FK), `name`, `server`, `port`, `database_name`, `username`, `password_encrypted` (encrypted via pgcrypto), `domain`, `auth_type`, `encrypt`, `trust_server_certificate`, `db_type` TEXT (default 'mssql'), `file_path` TEXT (for SQLite), timestamps
- RLS enabled
- `db_type` column: 'mssql' or 'sqlite'
- `file_path`: absolute path to SQLite file (used when `db_type` = 'sqlite')

### `data_explorer_sessions`
- `id` UUID PK, `user_id` UUID (FK), `connection_id` UUID (FK), `title` TEXT, `ai_title` TEXT nullable, `created_at` TIMESTAMPTZ
- `ai_title`: AI-generated descriptive title (auto-updated after 1st and 3rd query)
- RLS enabled

### `data_explorer_messages`
- `id` UUID PK, `session_id` UUID (FK), `question`, `sql_query`, `explanation`, `results` JSONB, `chart_config` JSONB, `chart_configs` JSONB, `error`, `execution_time_ms`, `row_count`, `message_type` TEXT (default 'query'), `parent_message_id` UUID (FK self-ref), `created_at`
- `chart_configs`: array of chart configs (coexists with single `chart_config` for backward compat)
- `message_type`: 'query' | 'chart_refinement' | 'sql_refinement' | 'insight'
- `parent_message_id`: links refinement messages to their parent
- RLS enabled (messages gated via session ownership)

## Key Patterns

### Auth Pattern
All API routes use a two-client pattern:
1. `createAuthClient()` (from `@supabase/ssr`) to verify the user's cookie
2. `createAdminClient()` (from `@supabase/supabase-js` with service role key) to bypass RLS for database writes

### API Key Encryption
- API keys are encrypted before storing using pgcrypto's `pgp_sym_encrypt` via `encrypt_text()` RPC
- Decrypted on read via `decrypt_text()` RPC using `DB_CONNECTIONS_ENCRYPTION_KEY` env var
- Backward-compatible: if decryption fails (plain text value), falls back gracefully and re-encrypts on next save
- Same encryption pattern used for MSSQL connection passwords in Data Explorer

### AI Provider Resolution
- User settings are stored in `user_settings` table (provider, model, encrypted API keys)
- `chat/route.ts` and `data-explorer/query/route.ts` fetch settings, decrypt keys, call `getModel()` to instantiate the right provider
- Frontend never sends API keys per-request; they're read and decrypted server-side
- API keys are masked on GET (`...xxxx`), POST ignores masked values

### Data Explorer Architecture
- **Split pane layout**: QueryChat (left) + ResultsPanel (right), draggable divider
- **Dynamic results panel**: Results pane only renders when an exchange has content (loading, sql, results, or error). QueryChat fills full width otherwise, with a `transition-[width] duration-300` animation
- **Pop-out report window**: Expand button stores exchange data in `sessionStorage` and opens `/data-explorer/report` via `window.open()` in a new browser window (BI report style). The report page reads from `sessionStorage`, renders tabs with full Plotly interactivity
- **Close button**: Dismisses results panel by deselecting the exchange index
- **CSV export**: Client-side CSV generation from table data with proper escaping, available on Table tab
- **SQLite support**: Read-only queries via `better-sqlite3`, SQL validation blocks writes, auto LIMIT injection (max 1000 rows)
- **Exchange model**: Each query creates an `Exchange` object with `{ id, question, sql, explanation, results, chartConfig, chartConfigs, error, isLoading, messageType, parentMessageId, insights }`
- **Multi-chart support**: AI suggests 1-3 charts per query. ChartGallery renders them in a scrollable gallery. Backward compat: wraps single `chartConfig` in array if `chartConfigs` is null
- **Chart types**: bar, line, scatter, pie, histogram, heatmap, grouped_bar, stacked_bar. Supports `colorColumn` for grouping, `orientation` for horizontal bars, `yAxisType` for log scale
- **Conversation context**: Last 5 messages injected into SQL generation prompt for follow-up queries ("group that by department")
- **AI session titles**: Auto-generated after 1st and 3rd query, shown in sidebar
- **FK-enhanced DDL**: Foreign keys fetched via `PRAGMA foreign_key_list` (SQLite) and `sys.foreign_keys` (MSSQL), included in schema prompt text
- **Chart refinement**: User clicks "Refine" on a chart → types instruction → backend returns updated chartConfigs → original exchange updates in place (no new SQL execution)
- **SQL refinement**: User clicks "Refine SQL" → types instruction → creates new exchange with modified SQL + new results
- **Data insights**: AI-generated bullet points about query results, available on the Insights tab. Generated on demand, cached in exchange

### Frontend Architecture (page.tsx ~690 lines)
- Single-page app with all state in `page.tsx`
- `useChat` hook with `DefaultChatTransport` for streaming
- Click-outside detection uses `mousedown` events with ref-based containment (not `stopPropagation`) to play nice with native `<select>` elements
- Sidebar uses CSS transitions (not conditional rendering) to avoid glitchy collapse/expand
- Dark mode toggle persists to `localStorage`, toggles `.dark` class on `<html>`

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, used in browser + server auth client
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — private, used in admin client for DB writes
- `DB_CONNECTIONS_ENCRYPTION_KEY` — symmetric key for encrypting API keys and DB passwords at rest
- `DATABASE_URL` — Postgres connection string used by dbmate for migrations

## Implemented Features
- [x] User auth (login/signup with email or username)
- [x] Chat streaming with Ollama (local default)
- [x] BYOK: OpenAI, Anthropic, Google provider support
- [x] Provider/model selection in settings dropdown
- [x] API key save with masked display
- [x] API keys encrypted at rest (pgcrypto)
- [x] Chat history sidebar with session list
- [x] Delete chat sessions
- [x] Collapsible sidebar (CSS transitions, icons visible when collapsed)
- [x] Edit & resend user messages
- [x] Copy message to clipboard
- [x] Dark/light mode toggle
- [x] Markdown rendering for assistant messages (code blocks, bold, lists)
- [x] Code syntax highlighting (Shiki)
- [x] Lightning animation easter egg
- [x] Suggestion chips on empty state
- [x] Custom thin scrollbar styling
- [x] Polished UI: gradient bubbles, frosted header, ambient glow
- [x] Data Explorer: natural language → SQL against MSSQL and SQLite databases
- [x] SQLite support with demo database included in repo
- [x] Auto-generated multi-charts (Plotly) for Data Explorer results (1-3 charts per query)
- [x] 8 chart types: bar, line, scatter, pie, histogram, heatmap, grouped_bar, stacked_bar
- [x] Chart refinement: modify charts via natural language without re-running SQL
- [x] SQL refinement: modify SQL via natural language, creates new exchange with updated results
- [x] Data insights: AI-generated bullet points about query results (on-demand)
- [x] Conversation context: follow-up queries understand previous questions/results
- [x] AI-generated session titles in Data Explorer sidebar
- [x] FK-enhanced DDL in schema prompts for better multi-table JOINs
- [x] MSSQL connection management with encrypted passwords
- [x] Row Level Security on all user data tables
- [x] Per-request admin client in messages route (serverless-safe)
- [x] Dynamic results panel (hidden when no results, smooth width transition)
- [x] Close button to dismiss results panel
- [x] Pop-out report window (opens results in new browser window, BI report style)
- [x] CSV export for Data Explorer table results
- [x] Data Explorer message history persistence and reload

## Demo Database (`data/demo.db`)
Pre-seeded SQLite database with 11 tables of realistic sample data:
- `departments` (10) — budget, headcount
- `employees` (150) — across departments, salaries, titles
- `salary_history` — historical salary changes
- `performance_reviews` — quarterly reviews 2020–2025
- `products` (50) — tech products, pricing, inventory
- `product_reviews` (~800) — customer reviews
- `customers` (200) — US regions, signup dates
- `orders` (2000) — seasonal/growth patterns 2023–2026
- `order_items` — line items with discounts
- `website_traffic` — daily metrics 2024–2025 by page/source
- `support_tickets` (600) — resolution times

## Known Issues
None currently tracked.

## Future Improvements
- [ ] File/image upload support
- [ ] Chat search functionality
- [ ] Export chat as PDF/text
- [ ] System prompt customization per chat
- [ ] Rename chat sessions
- [ ] Responsive mobile layout
- [ ] Rate limiting on API routes
- [ ] Add error boundaries and loading states
- [ ] Keyboard shortcuts (Cmd+K for new chat, etc.)
- [ ] PostgreSQL support in Data Explorer
- [ ] MySQL support in Data Explorer
- [ ] Saved/pinned queries in Data Explorer
- [ ] Multi-chart dashboard view (pinned charts)
