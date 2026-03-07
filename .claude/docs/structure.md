# Project Structure

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
      agent-query-stream/route.ts — POST: SSE agent loop (generateText + tools) for multi-step SQL exploration, auto-generates charts + insights
      insights-agent-stream/route.ts — POST: SSE agent loop for deep insight generation on existing results (follow-up queries + synthesis)
      catalog/route.ts      — GET/PATCH/DELETE: table metadata CRUD per connection
      catalog/generate/route.ts — POST: SSE auto-catalog generation (batch LLM descriptions, tags, categories)
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
      ChartGallery.tsx  — Carousel gallery with prev/next navigation, dot indicators, pin/annotate/refine buttons, smooth fade transitions
      AgentStepsTimeline.tsx — Timeline visualization of agent tool calls, results, reasoning, and error recovery steps
      Dashboard.tsx     — Pinned chart dashboard with react-grid-layout drag-and-resize grid
      ChartTypeSwitcher.tsx — Horizontal strip of chart type icon buttons for local type switching
      KPICards.tsx       — Auto-detected summary metric cards with smart formatting and staggered entrance
      DataTable.tsx     — Enhanced table with sorting, number formatting, conditional coloring, text truncation
      InsightsPanel.tsx — AI-generated data insights with regenerate
      DataExplorerSidebar.tsx — Sidebar with connections, schema browser, saved queries, sessions (AI titles), settings
      SchemaBrowser.tsx — Collapsible tree view with search, descriptions, inline editing, tag badges, catalog generation
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
  ai/data-explorer-prompts.ts — Prompt templates for SQL generation, chart suggestion, insight agent, and agent domain context wrapping
  ai/data-explorer-agent-prompt.ts — System prompt builder for the Data Explorer agent query loop (standard + catalog mode)
  ai/data-explorer-tools.ts — Tool factory (execute_sql, get_schema, get_sample_data + catalog mode: search_tables, get_join_path)
  ai/fk-graph.ts            — FK graph builder (bidirectional adjacency list, BFS join path, reachable tables)
  ai/catalog-builder.ts     — Table catalog builder (merge schema + metadata, compact text for prompts, description comments for small DBs, search)
  ai/semantic-context.ts    — Semantic YAML context loader for SQLite databases
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
