# Key Patterns

## Auth Pattern
All API routes use a two-client pattern:
1. `createAuthClient()` (from `@supabase/ssr`) to verify the user's cookie
2. `createAdminClient()` (from `@supabase/supabase-js` with service role key) to bypass RLS for database writes

## API Key Encryption
- API keys are encrypted before storing using pgcrypto's `pgp_sym_encrypt` via `encrypt_text()` RPC
- Decrypted on read via `decrypt_text()` RPC using `DB_CONNECTIONS_ENCRYPTION_KEY` env var
- If decryption fails or returns null, key is treated as absent (returns `null` to frontend)
- Same encryption pattern used for MSSQL connection passwords in Data Explorer

## AI Provider Resolution
- User settings are stored in `user_settings` table (provider, model, encrypted API keys)
- `chat/route.ts` and `data-explorer/query/route.ts` fetch settings, decrypt keys, call `getModel()` to instantiate the right provider
- Frontend never sends API keys per-request; they're read and decrypted server-side
- API keys are masked on GET (`...xxxx`), POST ignores masked values
- Provider order: Ollama, Anthropic, Google, OpenAI (reflected in `MODEL_CATALOG` and `PROVIDER_NAMES`)

## Data Explorer Architecture
- **Consistent layout with Chat**: Header is an in-flow `<header>` element (not absolute), both pages share the same header height (`px-6 py-4`), floating input pattern, and indigo color scheme
- **Split pane layout**: QueryChat (left) + ResultsPanel (right), draggable divider. Panes sit inside a `flex-1 flex min-h-0` row below the header
- **Floating input**: QueryChat uses absolute-positioned input at bottom with gradient overlay (matching chat page pattern), `darkMode` prop controls gradient colors
- **Dynamic results panel**: Results pane only renders when an exchange has content (loading, sql, results, or error). QueryChat fills full width otherwise, with a `transition-[width] duration-300` animation
- **Pop-out report window**: Dashboard layout (no tabs) — KPI cards -> charts (grid) -> data table -> insights -> SQL (collapsible). Header with print + CSV export buttons. Includes insights in sessionStorage data transfer
- **Close button**: Dismisses results panel by deselecting the exchange index
- **CSV export**: Client-side CSV generation from table data with proper escaping, available on Table tab
- **SQLite support**: Read-only queries via `better-sqlite3`, SQL validation blocks writes, auto LIMIT injection (max 1000 rows)
- **Exchange model**: Each query creates an `Exchange` object with `{ id, question, sql, explanation, results, chartConfig, chartConfigs, error, isLoading, messageType, parentMessageId, insights }`
- **Multi-chart support**: AI suggests 1-3 charts per query. ChartGallery renders them in a carousel with prev/next arrows and dot indicators. Backward compat: wraps single `chartConfig` in array if `chartConfigs` is null
- **Chart types**: bar, line, scatter, pie, histogram, heatmap, grouped_bar, stacked_bar, area, box, funnel, waterfall, gauge. Supports `colorColumn` for grouping, `orientation` for horizontal bars, `yAxisType` for log scale
- **Chart type switcher**: `ChartTypeSwitcher.tsx` renders icon buttons above each chart to switch types locally (no API call). Disabled types greyed out based on data shape
- **KPI summary cards**: `KPICards.tsx` auto-detects summary metrics from query results. Single-row -> each numeric column becomes a KPI card. Multi-row -> derives total/avg/max for prioritized numeric columns. Smart formatting: `$` for currency, `%` for rate, K/M abbreviation
- **Chart gallery carousel**: Single chart visible at a time with left/right navigation arrows and dot indicators. Title in external header row alongside Pin/Annotate/Refine buttons. `hideTitle` prop on PlotlyChart prevents title collision
- **Enhanced data table**: `DataTable.tsx` with column sorting, number formatting, conditional formatting (indigo gradient), long text truncation
- **PDF export**: `utils/data-explorer-export.ts` using jsPDF. Landscape A4 with title, KPI values, chart images, table (first 50 rows), SQL, insights
- **Conversation context**: Last 5 messages injected into SQL generation prompt for follow-up queries. Context capped at 4000 chars, truncates oldest first
- **AI session titles**: Auto-generated after 1st and 3rd query, shown in sidebar
- **FK-enhanced DDL**: Foreign keys fetched via `PRAGMA foreign_key_list` (SQLite) and `sys.foreign_keys` (MSSQL), included in schema prompt text
- **Chart refinement**: User clicks "Refine" on a chart -> types instruction -> backend returns updated chartConfigs -> original exchange updates in place (no new SQL execution)
- **SQL refinement**: User clicks "Refine SQL" -> types instruction -> creates new exchange with modified SQL + new results
- **Data insights**: AI-generated bullet points about query results, on the Insights tab. Generated on demand, persisted to DB, reloaded with session
- **Schema sanitization**: `sanitizeIdentifier()` strips characters that could be prompt injection (`[^\w\s._-]`) from table/column names
- **Improved SQL validation**: String literals stripped before blocked keyword checking to eliminate false positives
- **Sample data in prompts**: 3 sample rows per table (capped at 15 tables) for more accurate SQL generation
- **Categorized errors**: `categorizeError()` classifies errors into timeout, permission, syntax, schema, blocked, unknown — each with user-friendly message + actionable suggestion
- **20-color palette**: PlotlyChart expanded from 10 -> 20 perceptually distinct colors
- **Chart axis formatting**: Auto-detect dates -> `tickformat: '%b %Y'`, currency -> `tickprefix: '$'`, animated chart transitions
- **Print styles**: `@media print` rules in globals.css: `.no-print` hides interactive elements, force light colors, page breaks
- **Chart annotations**: `ChartAnnotation` interface (`{ id, x, y, text }`), added to `ChartConfig`. Annotation mode: click "Annotate" -> click data point -> enter text -> saved to DB via PATCH. Persisted across sessions
- **Pinned chart dashboard**: `Dashboard.tsx` uses `react-grid-layout` for drag-and-resize. 12-column grid, 80px row height, breakpoints at 996/768/480px. Layout positions persisted to `pinned_charts.layout` JSONB (debounced 500ms)
- **Data Explorer agent integration**: `wrapWithDomainContext()` prepends agent's system_prompt as `## Domain Context` before SQL instructions. Agent dropdown in header (teal badge), persisted per-session
- **Morphing orb loading**: SQL generation and insights loading use morphing orb animation (`animate-orb`) instead of spinner
- **Radar pulse easter egg**: Clicking the database icon emits expanding indigo radar rings

## Data Explorer Agent Mode
- **Agent query loop**: `agent-query-stream/route.ts` uses Vercel AI SDK `generateText()` with tools and `stopWhen: stepCountIs(maxSteps)` for multi-step SQL exploration
- **Tools**: `createDataExplorerTools()` in `utils/ai/data-explorer-tools.ts` provides `execute_sql`, `get_schema`, `get_sample_data` — all read-only. In catalog mode also: `search_tables`, `get_join_path`
- **Catalog mode** (>30 tables): Agent sees lightweight table catalog instead of full DDL. Uses `search_tables` to discover tables, `get_join_path` to find FK paths, `get_schema` with `tableNames` for full column details. Step limit raised to 12 (vs 5 for small DBs)
- **FK graph**: `buildFKGraph()` creates bidirectional adjacency list from schema FKs. `findJoinPath()` BFS finds shortest path. `findReachableTables()` finds all tables within N hops
- **Catalog builder**: `buildCatalogText()` produces ~80 tokens/table summary (name, description, PKs, FK targets, row count). 500 tables ≈ 15-20K tokens
- **Auto-catalog**: SSE endpoint (`catalog/generate/route.ts`) batches tables (10/batch), sends column info + 3 sample rows to LLM, gets 1-sentence descriptions + tags + categories. Row counts via `sys.partitions` (MSSQL) or `COUNT(*)` (SQLite)
- **Table metadata**: `table_metadata` table stores auto/user descriptions, tags, category, row counts. User descriptions override auto descriptions
- **Table descriptions for all DB sizes**: `buildDescriptionComments()` generates SQL-comment-style description text for injection into full-DDL prompts (small databases). Catalog mode (compact prompt + table router) still gated at 30+ tables
- **Catalog generation**: Available for all DB sizes (not just 30+). Banner with stop button, regenerate option, red warning for large DBs without descriptions. Schema matching uses name-only fallback for SQLite
- **Agent prompt**: `buildAgentSystemPrompt()` in `utils/ai/data-explorer-agent-prompt.ts` — standard mode or catalog mode with discovery-first approach and compound query patterns
- **SSE streaming**: `onStepFinish` callback streams `agent_step` events (tool_call, tool_result, reasoning, error_recovery) in real-time
- **Last successful result tracking**: Agent loop tracks `lastSuccessfulResult` and `lastSuccessfulSql` across steps — the final successful query result is used for charts/insights
- **Auto-generated insights**: After agent loop completes, auto-generates enhanced insights and charts using `buildEnhancedInsightSystemPrompt()` (no manual button click needed)
- **Agent steps timeline**: `AgentStepsTimeline.tsx` renders a vertical timeline of agent steps with icons per type, collapsible SQL/result details
- **Exchange model extended**: `Exchange` type includes `isAgentMode`, `agentSteps`, `statusMessage` for agent-specific state
- **Quick vs Agent mode**: `queryMode` state in `page.tsx` controls which submit handler runs (`handleSubmitQuestion` vs `handleSubmitAgentQuestion`)

## Agent-Powered Insights
- **Insight agent endpoint**: `insights-agent-stream/route.ts` — SSE endpoint for deep insight generation on existing results
- **Branched handler**: `handleRequestInsights` in `page.tsx` checks `exchange.isAgentMode` — agent mode calls SSE insight stream, quick mode calls simple `/api/data-explorer/query`
- **Insight agent prompt**: `buildInsightAgentSystemPrompt()` provides existing results summary + tools for follow-up queries
- **Synthesis step**: After agent loop, combines original explanation + agent analysis, feeds into `buildEnhancedInsightSystemPrompt()` for structured markdown output
- **Status messages**: InsightsPanel accepts `statusMessage` prop for real-time agent progress ("Analyzing data patterns...", "Agent analysis step 2...", "Synthesizing insights...")
- **Persistence**: Insights saved to `data_explorer_messages.insights` via `messageId` PATCH

## Chart Gallery UX
- **Smooth transitions**: Chart switching uses CSS opacity transition (150ms fade out, swap, fade in) instead of hard-swap
- **Arrow visibility**: Chart container has `overflow-hidden` and arrows use `z-20` to layer above Plotly's own elements (modebar, SVG)
- **Carousel navigation**: Left/right arrows + dot indicators, single chart visible at a time

## Chat Search
- `SearchModal.tsx` opens via `Cmd+K` or search icon in sidebar
- Debounced search (300ms) hits `/api/search?q=keyword`
- Server joins `chat_messages` + `chat_sessions`, filters by `ILIKE` on JSONB content cast to text
- Results grouped by session with match snippets, keyboard navigation (arrows + Enter + Escape)

## System Prompt Customization
- `SystemPromptEditor.tsx` modal with textarea + preset chips (Concise, Detailed, Code-focused, Creative)
- Stored per session in `chat_sessions.system_prompt` column
- `chat/route.ts` fetches `system_prompt` from session, falls back to agent prompt, then `DEFAULT_SYSTEM_PROMPT`
- PATCH `/api/sessions` accepts `system_prompt` (null clears custom prompt) and `agent_id`
- When an agent is active, SystemPromptEditor shows read-only mode with agent info and "Detach Agent" button

## AI Agent Store Integration
- **Hybrid local-first approach**: Users browse an external store, install agents locally, use them as named system prompts
- **External store API**: Proxied via `/api/agent-store/browse`, requires `AGENT_STORE_API_URL` env var (HuggingFace Space)
- **Local storage**: Installed agents stored in `installed_agents` table with full metadata snapshot
- **MVP scope**: Agents are named system prompts with metadata — `tools`/`skills` JSONB stored but not executed
- **Install flow**: Browse store tab -> click Install -> upsert into `installed_agents` (deduped by `user_id + store_agent_id`)
- **Usage flow**: Select agent from header dropdown or Installed tab -> sets `agent_id` on session -> `chat/route.ts` resolves prompt
- **Prompt priority**: Custom system prompt > agent system prompt > default prompt
- **Detach**: Copies agent's prompt to custom `system_prompt`, clears `agent_id` — allows editing independently
- **Uninstall**: `ON DELETE SET NULL` on `chat_sessions.agent_id` ensures sessions survive agent removal
- **Header UI**: Emerald/teal agent badge (when active) + agent dropdown button for quick-switching
- **AgentBrowser modal**: Two tabs (Store / Installed), search + category filters, install/uninstall/use actions
- **Fork support**: Forked sessions inherit `agent_id` from source session

## Keyboard Shortcuts
- `useKeyboardShortcuts` hook in `app/hooks/useKeyboardShortcuts.ts`
- Skips firing when user is typing (except Escape)
- Chat: `Cmd+K` (search), `Cmd+N` (new chat), `Cmd+/` (sidebar), `Escape` (close modals)
- Data Explorer: `Cmd+N` (new query), `Cmd+/` (sidebar), `Escape` (cancel refinement)

## Saved Queries
- Standalone table `saved_queries` tied to connection (not session)
- CRUD via `/api/data-explorer/saved-queries`
- Save button in ResultsPanel tab bar (inline name input)
- Sidebar "Saved Queries" collapsible section with play (re-run) + delete buttons

## Schema Browser
- `SchemaBrowser.tsx` fetches from existing `/api/data-explorer/schema` endpoint
- Collapsible tree: table -> columns with type badges, PK (key icon), FK (link icon)
- Click column -> inserts `"table"."column"` into query input via lifted state

## Streaming SQL Generation
- SSE via `/api/data-explorer/query-stream` using `ReadableStream`
- Stages: `status` -> `sql` -> `results` -> `explanation` + `charts` (parallel) -> `complete`
- Frontend parses events, updates exchange progressively
- Morphing orb animation + status text during loading (matches chat "Thinking" style)
- Original `/api/data-explorer/query` kept for non-streaming callers (refinement, insights)
- Both routes accept `agentId` for domain context injection via `wrapWithDomainContext()`

## Voice Input
- `VoiceInputButton.tsx` uses browser's Web Speech API (`SpeechRecognition || webkitSpeechRecognition`)
- Returns `null` if browser doesn't support it (graceful degradation)
- Mic icon pulses indigo when recording, continuous mode, stops on toggle
- Transcript appended to input value

## Chat Export
- Client-side generation following the CSV export pattern in Data Explorer
- `utils/chat-export.ts`: pure functions `exportChatAsText()` and `exportChatAsPdf()`
- Text export: role-labeled conversation with separator lines
- PDF export: styled jsPDF document with colored role labels, word-wrapped text, auto page breaks
- `ExportMenu.tsx`: dropdown in chat header, shown when messages exist

## File Upload
- `app/api/upload/route.ts`: FormData upload to Supabase Storage bucket `chat-files`
- Validates: max 10MB, allowed types (image/png, jpeg, gif, webp, pdf, text/plain, csv)
- `FileUploadButton.tsx`: paperclip icon, native file picker, multiple files
- `FilePreview.tsx`: images render as thumbnails (click-to-expand lightbox), non-images as icon + filename + download link
- Drag-and-drop overlay on chat container when vision model is selected
- Pending files strip below input with remove buttons + upload spinner
- `FileUploadButton` hidden when model doesn't support vision
- Vision flag in `MODEL_CATALOG`: true for GPT-4o, Claude Sonnet/Haiku, all Gemini; false for o3-mini, Ollama

## Chat Forking
- Fork from any message: creates new session "Fork of {title}" with messages up to that point
- `app/api/fork/route.ts`: copies messages, sets `forked_from_session_id` and `forked_at_message_id`
- Fork button appears in message hover actions (share icon) next to copy/edit

## Token/Cost Estimation
- `utils/token-costs.ts`: cost lookup per model (per 1M tokens for input/output)
- `chat/route.ts` saves `token_usage` JSONB on assistant messages via `result.usage`
- Messages API returns `token_usage` when available
- UI shows "~1,234 tokens · ~$0.002" on hover below assistant messages

## Chat Input Bar
- Two-row layout inside one rounded container:
  - **Top**: Full-width textarea for message input
  - **Bottom toolbar**: File upload (left), model selector with dropdown (left), voice input (right), send button (right)
- Model selector dropdown opens upward showing all providers grouped with their models
- Ollama models always selectable (local, no API key needed)
- Other provider models greyed out with `opacity-40` if no API key is saved
- Provider order in dropdown: Ollama, Anthropic, Google, OpenAI
- Active model highlighted in indigo

## Dynamic Ollama Model Discovery
- `/api/models` route fetches installed models from Ollama's `/api/tags` endpoint at `localhost:11434`
- Falls back to hardcoded `MODEL_CATALOG` if Ollama isn't running (3s timeout)
- Merges dynamic Ollama models with static catalog for other providers
- Only shows models actually installed locally

## Code Block Syntax Highlighting (Streaming)
- `CodeBlock.tsx` uses Shiki for async syntax highlighting with a module-level `highlightCache` (`Map<string, string>`)
- Cache survives component remounts caused by react-markdown rebuilding the tree on each streamed token
- Dark mode read synchronously from DOM — no `useState` lag that would cause cache key mismatches
- Displayed HTML derived directly from cache during render — no component state means remounts never flash empty
- Debounce (150ms) only when code is actively changing; immediate highlight on fresh mount with stable code
- `detectLanguage()` heuristic for unlabeled code blocks (Python, JS/TS, SQL, Bash, HTML, CSS, JSON, Rust, Go)

## Frontend Architecture (page.tsx)
- Single-page app with all state in `page.tsx`
- `useChat` hook with `DefaultChatTransport` for streaming
- Click-outside detection uses `mousedown` events with ref-based containment (not `stopPropagation`) to play nice with native `<select>` elements
- Sidebar uses CSS transitions (not conditional rendering) to avoid glitchy collapse/expand
- Dark mode toggle persists to `localStorage`, toggles `.dark` class on `<html>`

## Consistent Design Language
- Both Chat and Data Explorer pages share: indigo/purple color scheme, emerald status dot, in-flow `<header>` with `px-6 py-4`, floating absolute-positioned input with gradient overlay, `max-w-3xl` content centering, `mt-28` empty state, `text-3xl` headings, flex-wrap suggestion chips
- Data Explorer icon button and radar pulse use indigo (not orange) to match chat's lightning bolt
- Sidebar active session: indigo tinted bg (`indigo-500/[0.08]`) + `border-l-2 border-indigo-500` accent (both pages)
- Sidebar inactive hover: `white/[0.04]` in dark mode for softer highlight
- Header badges (model + agent): `dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]` inner highlight
- Message action buttons (copy/edit/fork): `hover:scale-110 active:scale-95` micro-interactions
- Suggestion chips: `hover:scale-[1.02] active:scale-[0.98]` tactile feedback
- Send button: `send-glow` class (indigo box-shadow) when input has text
- Loading indicator: morphing orbs (`animate-orb`) with shape-shifting border-radius, vertical float, pulsing indigo glow, and color shift (indigo -> violet -> lavender). "Thinking" label with `animate-pulse`. Shimmer bar below
- Assistant message bubbles: faint indigo ambient glow in dark mode
- Login button: `hover:shadow-xl hover:shadow-indigo-500/25` lift effect

## Web Search Tool
- Chat supports a web search tool via Tavily API (`TAVILY_API_KEY` env var)
- Integrated into `chat/route.ts` as an AI SDK tool alongside conversation

## SQL Editor Mode
- Third query mode in Data Explorer alongside Chat and Agent
- Direct SQL editing and execution, results shown below editor (not side panel)
- Run icon on SQL tab opens generated query in editor mode
- Charts skipped in Chat and SQL modes (only generated in Agent mode)

## Follow-up Suggestions
- Agent mode generates interactive follow-up suggestion buttons after each response
- Suggestion follow-ups route through the agent handler for full analysis
- Markdown formatting stripped from suggestion button labels

## Semantic Context (YAML)
- SQLite connections auto-load semantic context from YAML metadata files adjacent to the database
- `findMetadataPath()` discovers `.yaml`/`.yml` files, `loadSemanticContext()` parses and injects into prompts
- Provides business context (column meanings, relationships, domain knowledge)

## MSSQL Connection Enhancements
- Windows authentication via NTLM credentials and ODBC Driver 17 (msnodesqlv8)
- Named instance port discovery with SQL Server Browser protocol
- Server/database two-tier selector for quick connection setup
- Connection test required before save, edit support via PATCH endpoint
- Independent connection pools instead of global singleton (fixes Windows auth hang)

## Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, used in browser + server auth client
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — private, used in admin client for DB writes
- `DB_CONNECTIONS_ENCRYPTION_KEY` — symmetric key for encrypting API keys and DB passwords at rest
- `DATABASE_URL` — Postgres connection string used by dbmate for migrations
- `AGENT_STORE_API_URL` — server-only, base URL of HuggingFace Space API for agent store (e.g. `https://your-space.hf.space`)
- `TAVILY_API_KEY` — server-only, API key for Tavily web search tool in chat
