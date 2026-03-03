# Chatbot Project

## Overview
A full-stack AI chatbot built with Next.js 16, Supabase, and the Vercel AI SDK v5. Supports multiple AI providers (Ollama, Anthropic, Google, OpenAI) via a Bring Your Own Key (BYOK) system. Dark/light theme, collapsible sidebar, chat history, user profiles. Includes a Data Explorer for natural language querying of MSSQL and SQLite databases. Integrates with an external AI Agent Store for browsing, installing, and using agents as named system prompts.

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
- **Export**: `jspdf` for client-side PDF generation

## Project Structure
```
app/
  page.tsx              — Main chat UI (sidebar, messages, input with toolbar, settings panel)
  layout.tsx            — Root layout (Geist fonts, dark class on <html>)
  globals.css           — Tailwind imports, dark variant, custom animations (radar pulse, lightning)
  login/
    page.tsx            — Login/signup form
    actions.ts          — Server actions: login() and signup()
  data-explorer/
    page.tsx            — Data Explorer UI (split pane, sidebar, query chat, results)
    report/page.tsx     — Standalone pop-out report window (BI report style)
  api/
    chat/route.ts       — POST: streams AI response, saves user+assistant messages (+ token usage), resolves agent prompts
    upload/route.ts     — POST: file upload to Supabase Storage (10MB limit, type validation)
    fork/route.ts       — POST: fork a conversation from any message point (copies agent_id)
    sessions/route.ts   — GET: list sessions (with agent_id), PATCH: rename/update system prompt/agent, DELETE: remove session + messages
    agents/route.ts     — GET/POST/DELETE: installed agents CRUD (upsert on install)
    agent-store/
      browse/route.ts   — GET: proxy to external agent store API with isInstalled flag
    search/route.ts     — GET: full-text search across chat messages
    messages/route.ts   — GET: fetch messages for a session (rebuilds AI SDK format)
    settings/route.ts   — GET/POST: user provider/model/API key settings (encrypt/decrypt)
    models/route.ts     — GET: static model catalog + provider names
    data-explorer/
      query/route.ts    — POST: natural language → SQL → execute → multi-chart suggestion (+ chart/SQL refinement, insights)
      query-stream/route.ts — POST: SSE streaming version of query (progressive SQL → results → charts)
      saved-queries/route.ts — GET/POST/DELETE: saved/pinned queries per connection
      connections/route.ts — CRUD for database connections (MSSQL + SQLite)
      connections/test/route.ts — POST: test a database connection
      schema/route.ts   — GET: fetch and cache database schema
      sessions/route.ts — GET/DELETE: data explorer session management
      messages/route.ts — GET: fetch messages for a data explorer session
  components/
    data-explorer/
      ResultsPanel.tsx  — SQL/Table/Chart/Insights tabs, CSV export, pop-out, refinement buttons
      QueryChat.tsx     — Chat interface for natural language queries (floating input, refinement mode)
      ConnectionManager.tsx — Modal for adding/editing database connections
      PlotlyChart.tsx   — Plotly chart wrapper (8 chart types, color grouping, orientation)
      ChartGallery.tsx  — Multi-chart gallery with per-chart refine buttons
      InsightsPanel.tsx — AI-generated data insights with regenerate
      DataExplorerSidebar.tsx — Sidebar with connections, schema browser, saved queries, sessions (AI titles), settings
      SchemaBrowser.tsx — Collapsible tree view of database tables/columns with click-to-insert
    SearchModal.tsx      — Full-text chat search modal with keyboard navigation
    SystemPromptEditor.tsx — System prompt customization modal with presets (+ agent read-only mode)
    AgentBrowser.tsx     — Browse/install agents modal (Store + Installed tabs)
    MarkdownRenderer.tsx — Markdown rendering for chat messages
    CodeBlock.tsx       — Syntax-highlighted code blocks (Shiki)
    ChatPlot.tsx        — Inline chart rendering in chat messages
    VoiceInputButton.tsx — Browser Speech API voice input (mic button, pulses red when recording)
    ExportMenu.tsx      — Chat export dropdown (text + PDF)
    FileUploadButton.tsx — Paperclip file upload button (images, PDFs, text, CSV)
    FilePreview.tsx     — File/image preview in message bubbles (click-to-expand images)
hooks/
  useKeyboardShortcuts.ts — Global keyboard shortcut hook (Cmd+K, Cmd+N, Cmd+/, Escape)
utils/
  chat-export.ts        — Client-side text + PDF export (jsPDF)
  token-costs.ts        — Token cost estimation per model (cost per 1M tokens)
  ai/provider.ts        — getModel() factory, MODEL_CATALOG (with vision flag), PROVIDER_NAMES
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
  speech-recognition.d.ts — Web Speech API type augmentation
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
- `id` UUID PK, `created_at` TIMESTAMPTZ, `title` TEXT, `system_prompt` TEXT nullable, `user_id` UUID (FK to auth.users)
- `agent_id` UUID nullable (FK to installed_agents, ON DELETE SET NULL)
- `forked_from_session_id` UUID nullable (FK to chat_sessions, ON DELETE SET NULL)
- `forked_at_message_id` UUID nullable (FK to chat_messages, ON DELETE SET NULL)
- `system_prompt`: custom system prompt for the session (null = use default)
- `agent_id`: links session to an installed agent (null = no agent)
- Prompt resolution order: custom `system_prompt` > agent's `system_prompt` > `DEFAULT_SYSTEM_PROMPT`
- RLS enabled: users can only access their own sessions

### `chat_messages`
- `id` UUID PK, `session_id` UUID (FK), `role` TEXT, `content` JSONB (parts array), `created_at`
- `token_usage` JSONB nullable — `{ promptTokens, completionTokens, totalTokens, model }`
- RLS enabled: access gated via session ownership (join-based policy)

### `profiles`
- `user_id` UUID PK (FK to auth.users), `username` TEXT UNIQUE, `first_name`, `last_name`, `dob` DATE nullable, `phone` TEXT nullable
- RLS enabled: users can only SELECT/UPDATE their own row (WITH CHECK on UPDATE)

### `user_settings`
- `user_id` UUID PK (FK to auth.users), `selected_provider` TEXT default 'ollama', `selected_model` TEXT default 'llama3.2:1b', `openai_api_key` TEXT (encrypted), `anthropic_api_key` TEXT (encrypted), `google_api_key` TEXT (encrypted), `updated_at` TIMESTAMPTZ
- RLS enabled: users can only SELECT/INSERT/UPDATE their own row
- API keys encrypted at rest via pgcrypto (`encrypt_text`/`decrypt_text` functions)

### `installed_agents`
- `id` UUID PK, `user_id` UUID (FK to auth.users, CASCADE), `store_agent_id` UUID NOT NULL
- `name` TEXT NOT NULL, `description` TEXT, `system_prompt` TEXT NOT NULL
- `job_category` TEXT, `logo_url` TEXT, `downloads` INTEGER
- `tools` JSONB (default `[]`), `skills` JSONB (default `[]`) — stored but not executed in MVP
- `parent_agent_id` UUID, `store_created_by` UUID — external store references
- `installed_at` TIMESTAMPTZ, `updated_at` TIMESTAMPTZ
- `UNIQUE(user_id, store_agent_id)` — prevents duplicate installs, enables upsert
- RLS enabled: full CRUD gated on `auth.uid() = user_id`

### `db_connections`
- `id` UUID PK, `user_id` UUID (FK), `name`, `server`, `port`, `database_name`, `username`, `password_encrypted` (encrypted via pgcrypto), `domain`, `auth_type`, `encrypt`, `trust_server_certificate`, `db_type` TEXT (default 'mssql'), `file_path` TEXT (for SQLite), timestamps
- RLS enabled
- `db_type` column: 'mssql' or 'sqlite'
- `file_path`: absolute path to SQLite file (used when `db_type` = 'sqlite')

### `saved_queries`
- `id` UUID PK, `user_id` UUID (FK), `connection_id` UUID (FK to db_connections), `name` TEXT, `question` TEXT, `sql_query` TEXT, `explanation` TEXT, `chart_configs` JSONB, `source_message_id` UUID (FK to data_explorer_messages, SET NULL), `created_at` TIMESTAMPTZ
- RLS enabled: full CRUD gated on `auth.uid() = user_id`

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
- If decryption fails or returns null, key is treated as absent (returns `null` to frontend)
- Same encryption pattern used for MSSQL connection passwords in Data Explorer

### AI Provider Resolution
- User settings are stored in `user_settings` table (provider, model, encrypted API keys)
- `chat/route.ts` and `data-explorer/query/route.ts` fetch settings, decrypt keys, call `getModel()` to instantiate the right provider
- Frontend never sends API keys per-request; they're read and decrypted server-side
- API keys are masked on GET (`...xxxx`), POST ignores masked values
- Provider order: Ollama, Anthropic, Google, OpenAI (reflected in `MODEL_CATALOG` and `PROVIDER_NAMES`)

### Data Explorer Architecture
- **Consistent layout with Chat**: Header is an in-flow `<header>` element (not absolute), both pages share the same header height (`px-6 py-4`), floating input pattern, and indigo color scheme
- **Split pane layout**: QueryChat (left) + ResultsPanel (right), draggable divider. Panes sit inside a `flex-1 flex min-h-0` row below the header
- **Floating input**: QueryChat uses absolute-positioned input at bottom with gradient overlay (matching chat page pattern), `darkMode` prop controls gradient colors
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
- **Radar pulse easter egg**: Clicking the database icon emits expanding indigo radar rings from the icon that fade as they reach the window boundary

### Chat Search
- `SearchModal.tsx` opens via `Cmd+K` or search icon in sidebar
- Debounced search (300ms) hits `/api/search?q=keyword`
- Server joins `chat_messages` + `chat_sessions`, filters by `ILIKE` on JSONB content cast to text
- Results grouped by session with match snippets, keyboard navigation (arrows + Enter + Escape)

### System Prompt Customization
- `SystemPromptEditor.tsx` modal with textarea + preset chips (Concise, Detailed, Code-focused, Creative)
- Stored per session in `chat_sessions.system_prompt` column
- `chat/route.ts` fetches `system_prompt` from session, falls back to agent prompt, then `DEFAULT_SYSTEM_PROMPT`
- PATCH `/api/sessions` accepts `system_prompt` (null clears custom prompt) and `agent_id`
- When an agent is active, SystemPromptEditor shows read-only mode with agent info and "Detach Agent" button

### AI Agent Store Integration
- **Hybrid local-first approach**: Users browse an external store, install agents locally, use them as named system prompts
- **External store API**: Proxied via `/api/agent-store/browse`, requires `AGENT_STORE_API_URL` env var (HuggingFace Space)
- **Local storage**: Installed agents stored in `installed_agents` table with full metadata snapshot
- **MVP scope**: Agents are named system prompts with metadata — `tools`/`skills` JSONB stored but not executed
- **Install flow**: Browse store tab → click Install → upsert into `installed_agents` (deduped by `user_id + store_agent_id`)
- **Usage flow**: Select agent from header dropdown or Installed tab → sets `agent_id` on session → `chat/route.ts` resolves prompt
- **Prompt priority**: Custom system prompt > agent system prompt > default prompt
- **Detach**: Copies agent's prompt to custom `system_prompt`, clears `agent_id` — allows editing the prompt independently
- **Uninstall**: `ON DELETE SET NULL` on `chat_sessions.agent_id` ensures sessions survive agent removal
- **Header UI**: Emerald/teal agent badge (when active) + agent dropdown button for quick-switching
- **AgentBrowser modal**: Two tabs (Store / Installed), search + category filters, install/uninstall/use actions
- **Fork support**: Forked sessions inherit `agent_id` from source session

### Keyboard Shortcuts
- `useKeyboardShortcuts` hook in `app/hooks/useKeyboardShortcuts.ts`
- Skips firing when user is typing (except Escape)
- Chat: `Cmd+K` (search), `Cmd+N` (new chat), `Cmd+/` (sidebar), `Escape` (close modals)
- Data Explorer: `Cmd+N` (new query), `Cmd+/` (sidebar), `Escape` (cancel refinement)

### Saved Queries
- Standalone table `saved_queries` tied to connection (not session)
- CRUD via `/api/data-explorer/saved-queries`
- Save button in ResultsPanel tab bar (inline name input)
- Sidebar "Saved Queries" collapsible section with play (re-run) + delete buttons

### Schema Browser
- `SchemaBrowser.tsx` fetches from existing `/api/data-explorer/schema` endpoint
- Collapsible tree: table → columns with type badges, PK (key icon), FK (link icon)
- Click column → inserts `"table"."column"` into query input via lifted state

### Streaming SQL Generation
- SSE via `/api/data-explorer/query-stream` using `ReadableStream`
- Stages: `status` → `sql` → `results` → `explanation` + `charts` (parallel) → `complete`
- Frontend parses events, updates exchange progressively
- Spinner + status text replaces bouncing dots during loading
- Original `/api/data-explorer/query` kept for non-streaming callers (refinement, insights)

### Voice Input
- `VoiceInputButton.tsx` uses browser's built-in Web Speech API (`SpeechRecognition || webkitSpeechRecognition`)
- Returns `null` if browser doesn't support it (graceful degradation)
- Mic icon pulses red when recording, continuous mode, stops on toggle
- Transcript appended to input value

### Chat Export
- Client-side generation following the CSV export pattern in Data Explorer
- `utils/chat-export.ts`: pure functions `exportChatAsText()` and `exportChatAsPdf()`
- Text export: role-labeled conversation with separator lines
- PDF export: styled jsPDF document with colored role labels, word-wrapped text, auto page breaks
- `ExportMenu.tsx`: dropdown in chat header, shown when messages exist

### File Upload
- `app/api/upload/route.ts`: FormData upload to Supabase Storage bucket `chat-files`
- Validates: max 10MB, allowed types (image/png, jpeg, gif, webp, pdf, text/plain, csv)
- `FileUploadButton.tsx`: paperclip icon, native file picker, multiple files
- `FilePreview.tsx`: images render as thumbnails (click-to-expand lightbox), non-images as icon + filename + download link
- Drag-and-drop overlay on chat container when vision model is selected
- Pending files strip below input with remove buttons + upload spinner
- `FileUploadButton` hidden when model doesn't support vision
- Vision flag in `MODEL_CATALOG`: true for GPT-4o, Claude Sonnet/Haiku, all Gemini; false for o3-mini, Ollama

### Chat Forking
- Fork from any message: creates new session "Fork of {title}" with messages up to that point
- `app/api/fork/route.ts`: copies messages, sets `forked_from_session_id` and `forked_at_message_id`
- Fork button appears in message hover actions (share icon) next to copy/edit

### Token/Cost Estimation
- `utils/token-costs.ts`: cost lookup per model (per 1M tokens for input/output)
- `chat/route.ts` saves `token_usage` JSONB on assistant messages via `result.usage`
- Messages API returns `token_usage` when available
- UI shows "~1,234 tokens · ~$0.002" on hover below assistant messages

### Chat Input Bar
- Two-row layout inside one rounded container:
  - **Top**: Full-width textarea for message input
  - **Bottom toolbar**: File upload (left), model selector with dropdown (left), voice input (right), send button (right)
- Model selector dropdown opens upward showing all providers grouped with their models
- Ollama models always selectable (local, no API key needed)
- Other provider models greyed out with `opacity-40` if no API key is saved
- Provider order in dropdown: Ollama, Anthropic, Google, OpenAI
- Active model highlighted in indigo

### API Key Saved Indicator
- Purple checkmark with "Saved" text (indigo-400) shown next to API Key label in settings
- No masked key value displayed — just a clean "Saved" confirmation

### Frontend Architecture (page.tsx)
- Single-page app with all state in `page.tsx`
- `useChat` hook with `DefaultChatTransport` for streaming
- Click-outside detection uses `mousedown` events with ref-based containment (not `stopPropagation`) to play nice with native `<select>` elements
- Sidebar uses CSS transitions (not conditional rendering) to avoid glitchy collapse/expand
- Dark mode toggle persists to `localStorage`, toggles `.dark` class on `<html>`

### Consistent Design Language
- Both Chat and Data Explorer pages share: indigo/purple color scheme, emerald status dot, in-flow `<header>` with `px-6 py-4`, floating absolute-positioned input with gradient overlay, `max-w-3xl` content centering, `mt-28` empty state, `text-3xl` headings, flex-wrap suggestion chips
- Data Explorer icon button and radar pulse use indigo (not orange) to match chat's lightning bolt

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, used in browser + server auth client
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — private, used in admin client for DB writes
- `DB_CONNECTIONS_ENCRYPTION_KEY` — symmetric key for encrypting API keys and DB passwords at rest
- `DATABASE_URL` — Postgres connection string used by dbmate for migrations
- `AGENT_STORE_API_URL` — server-only, base URL of HuggingFace Space API for agent store (e.g. `https://your-space.hf.space`)

## Implemented Features
- [x] User auth (login/signup with email or username)
- [x] Chat streaming with Ollama (local default)
- [x] BYOK: OpenAI, Anthropic, Google provider support
- [x] Provider/model selection in settings dropdown
- [x] Quick model switcher in chat input toolbar (grouped dropdown with API key gating)
- [x] API key save with purple checkmark indicator
- [x] API keys encrypted at rest (pgcrypto)
- [x] Chat history sidebar with session list
- [x] Delete chat sessions
- [x] Collapsible sidebar (CSS transitions, icons visible when collapsed)
- [x] Edit & resend user messages
- [x] Copy message to clipboard
- [x] Dark/light mode toggle
- [x] Markdown rendering for assistant messages (code blocks, bold, lists)
- [x] Code syntax highlighting (Shiki)
- [x] Lightning animation easter egg (chat)
- [x] Radar pulse animation easter egg (Data Explorer)
- [x] Suggestion chips on empty state
- [x] Custom thin scrollbar styling
- [x] Polished UI: gradient bubbles, frosted header, ambient glow, consistent indigo color scheme
- [x] Consistent layout between Chat and Data Explorer (header, input, empty state alignment)
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
- [x] Keyboard shortcuts: Cmd+K (search), Cmd+N (new chat/query), Cmd+/ (toggle sidebar), Escape
- [x] Rename chat sessions (double-click or 3-dot menu)
- [x] Chat search: full-text search across all messages (Cmd+K modal)
- [x] System prompt customization per chat session (with presets)
- [x] Saved/pinned queries in Data Explorer (per connection)
- [x] Schema browser in Data Explorer sidebar (collapsible tree, click-to-insert columns)
- [x] Query history search in Data Explorer sidebar
- [x] Streaming SQL generation with progressive status updates (SSE)
- [x] Voice input via Web Speech API (mic button, graceful degradation)
- [x] Chat export as Text (.txt) and PDF (jsPDF)
- [x] File/image upload to Supabase Storage with drag-and-drop
- [x] Vision capability guard: file upload only shown for vision-capable models
- [x] File preview in messages (image thumbnails with lightbox, document icons)
- [x] Chat forking from any message (creates new session with history up to that point)
- [x] Token usage tracking and cost estimation per assistant message
- [x] Two-row chat input with integrated toolbar (file upload, model selector, voice, send)
- [x] AI Agent Store: browse, install, and use agents as named system prompts
- [x] Agent browser modal with Store (search, category filters) and Installed tabs
- [x] Agent quick-switch dropdown in chat header
- [x] Agent prompt resolution chain (custom > agent > default)
- [x] Agent detach: copy agent prompt to custom system prompt for editing
- [x] Forked sessions inherit agent assignment

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
- [ ] Responsive mobile layout
- [ ] Rate limiting on API routes
- [ ] Add error boundaries and loading states
- [ ] PostgreSQL support in Data Explorer
- [ ] MySQL support in Data Explorer
- [ ] Multi-chart dashboard view (pinned charts)
- [ ] Conversation memory / context window management
- [ ] Streaming responses in Data Explorer (progressive chart rendering)
- [ ] Drag-and-drop file upload in Data Explorer
- [ ] Export Data Explorer results as PDF report
- [ ] User preferences sync across devices
- [ ] Admin dashboard for usage analytics
- [ ] Agent tools/skills execution (beyond MVP named-prompt approach)
- [ ] Agent version sync — detect when store agent has been updated, prompt user to reinstall
- [ ] Agent marketplace ratings/reviews
- [ ] Custom local-only agents (create agents without the store)
- [ ] Agent-specific conversation starters / suggestion chips
- [ ] Data Explorer agent integration (SQL-specialized agents)
