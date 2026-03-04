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
- **Dashboard**: `react-grid-layout` for drag-and-resize pinned chart dashboard
- **Local DB**: `better-sqlite3` for read-only SQLite querying in Data Explorer
- **Export**: `jspdf` for client-side PDF generation

## Project Structure
```
app/
  page.tsx              — Main chat UI (sidebar, messages, input with toolbar, settings panel)
  layout.tsx            — Root layout (Geist fonts, dark class on <html>)
  globals.css           — Tailwind imports, dark variant, custom animations (radar pulse, lightning, dot-wave, send-glow)
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
    models/route.ts     — GET: dynamic Ollama model discovery + static catalog for other providers
    data-explorer/
      query/route.ts    — POST: natural language → SQL → execute → multi-chart suggestion (+ chart/SQL refinement, insights)
      query-stream/route.ts — POST: SSE streaming version of query (progressive SQL → results → charts), agent domain context injection
      pinned-charts/route.ts — GET/POST/PATCH/DELETE: pinned chart dashboard CRUD with layout persistence
      saved-queries/route.ts — GET/POST/DELETE: saved/pinned queries per connection
      connections/route.ts — CRUD for database connections (MSSQL + SQLite)
      connections/test/route.ts — POST: test a database connection
      schema/route.ts   — GET: fetch and cache database schema
      sessions/route.ts — GET/PATCH/DELETE: data explorer session management (includes agent_id)
      messages/route.ts — GET/PATCH: fetch messages, update chart_configs (annotations)
  components/
    data-explorer/
      ResultsPanel.tsx  — SQL/Table/Chart/Insights tabs, CSV+PDF export, pop-out, refinement buttons
      QueryChat.tsx     — Chat interface for natural language queries (floating input, refinement mode)
      ConnectionManager.tsx — Modal for adding/editing database connections
      PlotlyChart.tsx   — Plotly chart wrapper (13 chart types, color grouping, orientation, annotations, forwardRef for PDF)
      ChartGallery.tsx  — Carousel gallery with prev/next navigation, dot indicators, pin/annotate/refine buttons
      Dashboard.tsx     — Pinned chart dashboard with react-grid-layout drag-and-resize grid
      ChartTypeSwitcher.tsx — Horizontal strip of chart type icon buttons for local type switching
      KPICards.tsx       — Auto-detected summary metric cards with smart formatting and staggered entrance
      DataTable.tsx     — Enhanced table with sorting, number formatting, conditional coloring, text truncation
      InsightsPanel.tsx — AI-generated data insights with regenerate
      DataExplorerSidebar.tsx — Sidebar with connections, schema browser, saved queries, sessions (AI titles), settings
      SchemaBrowser.tsx — Collapsible tree view of database tables/columns with click-to-insert
    SearchModal.tsx      — Full-text chat search modal with keyboard navigation
    SystemPromptEditor.tsx — System prompt customization modal with presets (+ agent read-only mode)
    AgentBrowser.tsx     — Browse/install agents modal (Store + Installed tabs)
    MarkdownRenderer.tsx — Markdown rendering for chat messages
    CodeBlock.tsx       — Syntax-highlighted code blocks (Shiki, module-level cache for flicker-free streaming)
    ChatPlot.tsx        — Inline chart rendering in chat messages
    VoiceInputButton.tsx — Browser Speech API voice input (mic button, pulses indigo when recording)
    ExportMenu.tsx      — Chat export dropdown (text + PDF)
    FileUploadButton.tsx — Paperclip file upload button (images, PDFs, text, CSV)
    FilePreview.tsx     — File/image preview in message bubbles (click-to-expand images)
hooks/
  useKeyboardShortcuts.ts — Global keyboard shortcut hook (Cmd+K, Cmd+N, Cmd+/, Escape)
utils/
  chat-export.ts        — Client-side text + PDF export (jsPDF)
  data-explorer-export.ts — Data Explorer PDF report export (jsPDF, landscape A4)
  token-costs.ts        — Token cost estimation per model (cost per 1M tokens)
  ai/provider.ts        — getModel() factory, MODEL_CATALOG (with vision flag), PROVIDER_NAMES
  ai/data-explorer-prompts.ts — Prompt templates for SQL generation, chart suggestion, and agent domain context wrapping
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
- `user_id` UUID PK (FK to auth.users), `selected_provider` TEXT default 'ollama', `selected_model` TEXT default 'llama3.2:3b', `openai_api_key` TEXT (encrypted), `anthropic_api_key` TEXT (encrypted), `google_api_key` TEXT (encrypted), `updated_at` TIMESTAMPTZ
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
- `id` UUID PK, `user_id` UUID (FK), `connection_id` UUID (FK), `title` TEXT, `ai_title` TEXT nullable, `agent_id` UUID nullable (FK to installed_agents, ON DELETE SET NULL), `created_at` TIMESTAMPTZ
- `ai_title`: AI-generated descriptive title (auto-updated after 1st and 3rd query)
- `agent_id`: links session to an installed agent for domain-specific SQL generation (null = no agent)
- RLS enabled

### `pinned_charts`
- `id` UUID PK, `user_id` UUID (FK to auth.users, CASCADE), `connection_id` UUID (FK to db_connections, CASCADE), `source_message_id` UUID nullable (FK to data_explorer_messages, SET NULL)
- `title` TEXT NOT NULL, `chart_config` JSONB NOT NULL, `results_snapshot` JSONB NOT NULL (frozen `{ rows, columns, types }`)
- `display_order` INTEGER NOT NULL DEFAULT 0, `layout` JSONB nullable (`{ x, y, w, h }` for grid position)
- `created_at` TIMESTAMPTZ
- Charts are frozen snapshots — data does not update when underlying tables change
- RLS enabled: all operations gated on `auth.uid() = user_id`

### `data_explorer_messages`
- `id` UUID PK, `session_id` UUID (FK), `question`, `sql_query`, `explanation`, `results` JSONB, `chart_config` JSONB, `chart_configs` JSONB, `error`, `execution_time_ms`, `row_count`, `message_type` TEXT (default 'query'), `parent_message_id` UUID (FK self-ref), `insights` TEXT nullable, `created_at`
- `chart_configs`: array of chart configs (coexists with single `chart_config` for backward compat)
- `message_type`: 'query' | 'chart_refinement' | 'sql_refinement' | 'insight'
- `parent_message_id`: links refinement messages to their parent
- `insights`: AI-generated data insights text, persisted when generated and reloaded with session
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
- **Pop-out report window**: Dashboard layout (no tabs) — KPI cards → charts (grid) → data table → insights → SQL (collapsible). Header with print + CSV export buttons. Includes insights in sessionStorage data transfer
- **Close button**: Dismisses results panel by deselecting the exchange index
- **CSV export**: Client-side CSV generation from table data with proper escaping, available on Table tab
- **SQLite support**: Read-only queries via `better-sqlite3`, SQL validation blocks writes, auto LIMIT injection (max 1000 rows)
- **Exchange model**: Each query creates an `Exchange` object with `{ id, question, sql, explanation, results, chartConfig, chartConfigs, error, isLoading, messageType, parentMessageId, insights }`
- **Multi-chart support**: AI suggests 1-3 charts per query. ChartGallery renders them in a carousel with prev/next arrows and dot indicators. Backward compat: wraps single `chartConfig` in array if `chartConfigs` is null
- **Chart types**: bar, line, scatter, pie, histogram, heatmap, grouped_bar, stacked_bar, area, box, funnel, waterfall, gauge. Supports `colorColumn` for grouping, `orientation` for horizontal bars, `yAxisType` for log scale
- **Chart type switcher**: `ChartTypeSwitcher.tsx` renders icon buttons above each chart to switch types locally (no API call). Disabled types greyed out based on data shape (gauge disabled for multi-row, pie for >8 categories, etc.)
- **KPI summary cards**: `KPICards.tsx` auto-detects summary metrics from query results. Single-row results → each numeric column becomes a KPI card. Multi-row → derives total/avg/max for prioritized numeric columns. Smart formatting: `$` for currency columns, `%` for rate columns, K/M abbreviation. Staggered entrance animation
- **Chart gallery carousel**: Single chart visible at a time with left/right navigation arrows and dot indicators. Title displayed in external header row alongside Pin/Annotate/Refine action buttons. `hideTitle` prop on PlotlyChart prevents title collision with Plotly modebar
- **Enhanced data table**: `DataTable.tsx` with column sorting (click header → asc/desc/clear), number formatting (`toLocaleString()`, `$` prefix for currency), conditional formatting (indigo gradient intensity based on value position), long text truncation with expand/collapse, row metadata display
- **PDF export**: `utils/data-explorer-export.ts` using jsPDF. Landscape A4 with title, KPI values, chart images, table (first 50 rows), SQL, insights. "Download PDF" button in ResultsPanel tab bar
- **Conversation context**: Last 5 messages injected into SQL generation prompt for follow-up queries ("group that by department"). Context capped at 4000 chars, truncates oldest first
- **AI session titles**: Auto-generated after 1st and 3rd query, shown in sidebar
- **FK-enhanced DDL**: Foreign keys fetched via `PRAGMA foreign_key_list` (SQLite) and `sys.foreign_keys` (MSSQL), included in schema prompt text
- **Chart refinement**: User clicks "Refine" on a chart → types instruction → backend returns updated chartConfigs → original exchange updates in place (no new SQL execution)
- **SQL refinement**: User clicks "Refine SQL" → types instruction → creates new exchange with modified SQL + new results
- **Data insights**: AI-generated bullet points about query results, available on the Insights tab. Generated on demand, persisted to `data_explorer_messages.insights` column and reloaded with session. Morphing orb loader during generation. Prominent indigo regenerate button
- **Schema sanitization**: `sanitizeIdentifier()` in both connection utils strips characters that could be prompt injection (`[^\w\s._-]`) from table/column names before use in prompts
- **Improved SQL validation**: String literals stripped before blocked keyword checking to eliminate false positives (e.g. `WHERE status = 'DELETED'` no longer triggers `DELETE` block)
- **Sample data in prompts**: 3 sample rows per table (capped at 15 tables) fetched and appended to schema text for more accurate SQL generation
- **Categorized errors**: `categorizeError()` classifies errors into timeout, permission, syntax, schema, blocked, unknown — each with user-friendly message + actionable suggestion
- **20-color palette**: PlotlyChart expanded from 10 → 20 perceptually distinct colors (indigo, violet, pink, rose, orange, yellow, green, teal, cyan, blue + lighter variants)
- **Chart axis formatting**: Auto-detect dates → `tickformat: '%b %Y'`, currency columns → `tickprefix: '$'`, animated chart transitions (`transition: { duration: 500 }`)
- **Print styles**: `@media print` rules in globals.css: `.no-print` hides interactive elements, force light colors, page breaks between sections
- **Chart annotations**: `ChartAnnotation` interface (`{ id, x, y, text }`), added to `ChartConfig` as `annotations?` and `showAnnotations?`. PlotlyChart renders as Plotly native annotations with indigo arrows and themed labels. Annotation mode: click "Annotate" → click data point → enter text → saved to DB via PATCH. Eye icon toggles visibility. Annotations persist across sessions and render in pop-out report and PDF export
- **Pinned chart dashboard**: Pin charts from carousel to a persistent dashboard. `Dashboard.tsx` uses `react-grid-layout` (WidthProvider + Responsive, dynamic import) for drag-and-resize. Cards have drag handle header + title + unpin on hover. 12-column grid, 80px row height, breakpoints at 996/768/480px. Layout positions persisted to `pinned_charts.layout` JSONB (debounced 500ms). Dashboard view toggled from header with badge showing pin count
- **Data Explorer agent integration**: Agents provide domain context for SQL generation. `wrapWithDomainContext()` in `data-explorer-prompts.ts` prepends agent's system_prompt as `## Domain Context` before SQL instructions. Agent dropdown in Data Explorer header (teal badge). Agent persisted per-session via `data_explorer_sessions.agent_id`. Restored on session load
- **Morphing orb loading**: SQL generation and insights loading use morphing orb animation (`animate-orb`) instead of spinner — consistent with chat "Thinking" state
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
- Morphing orb animation + status text during loading (matches chat "Thinking" style)
- Original `/api/data-explorer/query` kept for non-streaming callers (refinement, insights)
- Both routes accept `agentId` for domain context injection via `wrapWithDomainContext()`

### Voice Input
- `VoiceInputButton.tsx` uses browser's built-in Web Speech API (`SpeechRecognition || webkitSpeechRecognition`)
- Returns `null` if browser doesn't support it (graceful degradation)
- Mic icon pulses indigo when recording, continuous mode, stops on toggle
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

### Dynamic Ollama Model Discovery
- `/api/models` route fetches installed models from Ollama's `/api/tags` endpoint at `localhost:11434`
- Falls back to hardcoded `MODEL_CATALOG` if Ollama isn't running (3s timeout)
- Merges dynamic Ollama models with static catalog for other providers (Anthropic, Google, OpenAI)
- Only shows models actually installed locally, preventing confusion when selecting models

### Code Block Syntax Highlighting (Streaming)
- `CodeBlock.tsx` uses Shiki for async syntax highlighting with a module-level `highlightCache` (`Map<string, string>`)
- Cache survives component remounts caused by react-markdown rebuilding the tree on each streamed token
- Dark mode read synchronously from DOM (`document.documentElement.classList.contains('dark')`) — no `useState` lag that would cause cache key mismatches
- Displayed HTML derived directly from cache during render — no component state for the HTML means remounts never flash empty
- Debounce (150ms) only when code is actively changing (being streamed); immediate highlight on fresh mount with stable code
- `detectLanguage()` heuristic for unlabeled code blocks (Python, JS/TS, SQL, Bash, HTML, CSS, JSON, Rust, Go)

### Frontend Architecture (page.tsx)
- Single-page app with all state in `page.tsx`
- `useChat` hook with `DefaultChatTransport` for streaming
- Click-outside detection uses `mousedown` events with ref-based containment (not `stopPropagation`) to play nice with native `<select>` elements
- Sidebar uses CSS transitions (not conditional rendering) to avoid glitchy collapse/expand
- Dark mode toggle persists to `localStorage`, toggles `.dark` class on `<html>`

### Consistent Design Language
- Both Chat and Data Explorer pages share: indigo/purple color scheme, emerald status dot, in-flow `<header>` with `px-6 py-4`, floating absolute-positioned input with gradient overlay, `max-w-3xl` content centering, `mt-28` empty state, `text-3xl` headings, flex-wrap suggestion chips
- Data Explorer icon button and radar pulse use indigo (not orange) to match chat's lightning bolt
- Sidebar active session: indigo tinted bg (`indigo-500/[0.08]`) + `border-l-2 border-indigo-500` accent (both pages)
- Sidebar inactive hover: `white/[0.04]` in dark mode for softer highlight
- Header badges (model + agent): `dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]` inner highlight
- Message action buttons (copy/edit/fork): `hover:scale-110 active:scale-95` micro-interactions
- Suggestion chips: `hover:scale-[1.02] active:scale-[0.98]` tactile feedback
- Send button: `send-glow` class (indigo box-shadow) when input has text
- Loading indicator: morphing orbs (`animate-orb`) with shape-shifting border-radius, vertical float, pulsing indigo glow, and color shift (indigo → violet → lavender). "Thinking" label with `animate-pulse`. Shimmer bar below
- Assistant message bubbles: faint indigo ambient glow in dark mode (`dark:shadow-[0_0_20px_-5px_rgba(99,102,241,0.06)]`)
- Login button: `hover:shadow-xl hover:shadow-indigo-500/25` lift effect

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
- [x] 13 chart types: bar, line, scatter, pie, histogram, heatmap, grouped_bar, stacked_bar, area, box, funnel, waterfall, gauge
- [x] Chart type switcher: local chart type switching via icon buttons (no API call)
- [x] KPI summary cards: auto-detected metrics with smart formatting ($, %, K/M), staggered animation
- [x] Enhanced data table: column sorting, number formatting, conditional coloring, text truncation
- [x] Chart gallery grid layout with list/grid toggle and chart entrance animations
- [x] PDF export for Data Explorer (landscape A4 with KPIs, charts, table, SQL, insights)
- [x] Dashboard report window (scrollable layout instead of tabs, with print support)
- [x] 20-color expanded chart palette with auto axis formatting (dates, currency, large numbers)
- [x] Schema metadata sanitization for prompt injection protection
- [x] Improved SQL validation: string literal stripping eliminates false positives
- [x] Sample data in prompts: 3 rows per table for more accurate SQL generation
- [x] Conversation context cap (4000 chars, truncates oldest first)
- [x] Categorized error responses with actionable suggestions
- [x] Print styles (@media print) for Data Explorer report
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
- [x] UI micro-interactions: scale transforms on buttons/chips, send button glow, smooth dot-wave loading, ambient message shadows, sidebar active accent border, badge inner highlights
- [x] Morphing orb loading animation (chat "Thinking" + Data Explorer "Generating insights")
- [x] Dynamic Ollama model discovery: models route fetches installed models from local Ollama API
- [x] Flicker-free code block highlighting during streaming (module-level cache, synchronous dark mode read)
- [x] Insights persistence: saved to database and reloaded with session (like charts)
- [x] Prominent insights regenerate button with refresh icon
- [x] Chart annotations: click-to-annotate data points with text labels, toggle visibility, persisted to DB
- [x] Multi-chart dashboard: pin charts from query results, drag-and-resize grid (react-grid-layout), layout persistence
- [x] Chart carousel: prev/next navigation with dot indicators, single chart view with external title/actions
- [x] Data Explorer agent integration: domain-specific agents inject context into SQL generation prompts
- [x] Agent dropdown in Data Explorer header with per-session persistence
- [x] Morphing orb loading animation for SQL generation (consistent with chat/insights)

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

### SQL & Data Explorer
- [ ] PostgreSQL support in Data Explorer
- [ ] MySQL support in Data Explorer
- [ ] Query result comparison (diff two queries side by side)
- [ ] Scheduled/recurring queries with alerting
- [ ] SQL autocomplete in manual SQL editor (schema-aware)
- [ ] Query explain plan visualization (EXPLAIN output as tree/graph)
- [ ] Parameterized queries with user input variables
- [ ] Data Explorer collaboration (shared sessions/dashboards)
- [ ] Cross-database joins and federated queries
- [ ] Natural language data alerts ("notify me when sales drop below X")

### Interactive Plots & Visualization
- [ ] Natural language chart refinement with streaming feedback
- [ ] Interactive drill-down: click chart segment to filter and re-query
- [ ] Chart zoom/pan with data-level filtering (linked to SQL WHERE clauses)
- [ ] Dashboard auto-refresh with configurable intervals
- [ ] Live-updating pinned charts (re-execute source query on refresh)
- [ ] Dashboard filters: global date range / category selectors that filter all pinned charts
- [ ] Chart export as standalone interactive HTML (Plotly HTML export)
- [ ] Correlation matrix and regression line overlays
- [ ] Geographic/map chart type (choropleth for regional data)
- [ ] Sparkline mini-charts in data table cells

### UI & Interface Polish
- [ ] Responsive mobile layout
- [ ] Add error boundaries and loading states
- [ ] Dashboard themes/templates (pre-built layouts for common analytics)
- [ ] Drag-and-drop file upload in Data Explorer
- [ ] Keyboard shortcuts for chart navigation (arrow keys in carousel)
- [ ] Chart color palette customization per dashboard
- [ ] Fullscreen mode for individual charts
- [ ] Dark/light mode per-component override
- [ ] Animated transitions between query/dashboard view modes
- [ ] Onboarding tour for first-time Data Explorer users

### Agentic Integration
- [ ] Agent tools/skills execution (beyond MVP named-prompt approach)
- [ ] Agent-generated SQL templates: agents suggest common queries for their domain
- [ ] Multi-agent pipeline: chain agents (e.g., SQL agent → analysis agent → report agent)
- [ ] Agent version sync — detect when store agent has been updated, prompt user to reinstall
- [ ] Agent marketplace ratings/reviews
- [ ] Custom local-only agents (create agents without the store)
- [ ] Agent-specific conversation starters / suggestion chips
- [ ] Agent memory: agents that remember past queries and user preferences
- [ ] Autonomous data exploration: agent proactively suggests queries based on schema
- [ ] Agent-driven anomaly detection: agents flag outliers and unusual patterns in results

### Platform & Infrastructure
- [ ] Rate limiting on API routes
- [ ] User preferences sync across devices
- [ ] Admin dashboard for usage analytics
- [ ] Export full session as interactive HTML report
- [ ] Conversation memory / context window management
- [ ] Webhook integrations (Slack/email notifications for query results)
- [ ] API access for programmatic querying (external clients)
