# Chatbot

A full-stack AI chatbot and data exploration platform built with Next.js, Supabase, and the Vercel AI SDK. Supports multiple AI providers via a Bring Your Own Key (BYOK) system with encrypted key storage.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **AI:** Vercel AI SDK v5 with streaming via `useChat` + `DefaultChatTransport`
- **Providers:** Ollama (local default), OpenAI (GPT-5 series), Anthropic, Google
- **Database:** Supabase (PostgreSQL) with Row Level Security
- **Auth:** Supabase Auth via `@supabase/ssr` (cookie-based, middleware-enforced)
- **Charts:** react-plotly.js with 13 chart types and enterprise-grade rendering
- **Dashboard:** react-grid-layout for drag-and-resize pinned chart dashboard
- **Local DB:** better-sqlite3 for read-only SQLite querying
- **Migrations:** SQL files in `db/migrations/`, managed with dbmate

## Features

### Chat
- Multi-provider AI chat streaming (Ollama, OpenAI, Anthropic, Google)
- BYOK: bring your own API keys, encrypted at rest via pgcrypto
- Web search tool via Tavily API
- Weather tool with animated SVG icons
- AI Agent Store: browse, install, and use agents as named system prompts
- System prompt customization with presets and agent detach
- Chat history sidebar with session management, search (Cmd+K), and rename
- Edit & resend messages, copy to clipboard, fork conversations
- File/image upload with drag-and-drop (vision-capable models)
- Voice input via Web Speech API
- Token usage tracking and cost estimation
- Chat export as Text and PDF
- Markdown rendering with Shiki syntax highlighting
- Dark/light mode, collapsible sidebar, keyboard shortcuts

### Data Explorer
- **Three query modes:**
  - **Chat mode** — Natural language questions, direct answers (no charts)
  - **SQL Editor mode** — Direct SQL editing and execution
  - **Agent mode** — Multi-step agentic loop with tools (execute_sql, get_schema, get_sample_data), auto-generated charts + insights
- MSSQL and SQLite database support
- MSSQL Windows authentication (NTLM, ODBC Driver 17)
- Server/database two-tier selector for quick connection setup
- Auto-generated multi-charts (Plotly) with 13 chart types and 20-color palette
- KPI summary cards with smart formatting ($, %, K/M abbreviation)
- Enhanced data table with sorting, number formatting, conditional coloring
- Chart type switcher, chart annotations, chart refinement via natural language
- Pinned chart dashboard with drag-and-resize grid layout
- Dashboard chart refinement via natural language (sparkle button on each card)
- Dashboard inline SQL editor for pinned charts
- AI-powered dashboard builder (natural language → full dashboard)
- Dashboard tabs, cross-filtering, slicer widgets, global filters
- Dashboard KPI cards, fullscreen chart view, editable titles
- Dashboard auto-refresh with configurable intervals
- Dashboard anomaly detection and PDF export
- AI-generated insights card on dashboard
- AI-generated data insights with agent-powered deep analysis
- Interactive follow-up suggestions in Agent mode
- Table descriptions for all database sizes (AI-generated via catalog system)
- Catalog mode for large databases (30+ tables): compact catalog + table router + on-demand schema
- Semantic YAML context for SQLite databases
- Schema browser with search, inline description editing, tag badges
- Saved/pinned queries per connection
- Conversation context for follow-up queries
- PDF export (landscape A4 with KPIs, charts, table, SQL, insights)
- CSV export for table results
- Pop-out report window with print support
- YAML catalogue editor for semantic context
- SSE streaming with progressive status updates

### Model Support
- Dynamic Ollama model discovery (auto-detects installed local models)
- Model selector redesigned as collapsible accordion grouped by provider
- GPT-5 series (GPT-5, GPT-5.3 Instant, GPT-5.4 Pro), Claude, Gemini models
- Vision capability guard for file upload

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project
- [dbmate](https://github.com/amacneil/dbmate) (for migrations)
- Ollama running locally (optional, for the default local provider)

### Setup

1. **Clone and install dependencies:**

   ```bash
   git clone <repo-url>
   cd chatbot
   npm install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

   Fill in your `.env`:

   | Variable | Description |
   |----------|-------------|
   | `DATABASE_URL` | Postgres connection string (used by dbmate) |
   | `SUPABASE_URL` | Supabase project URL (server-side) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side, bypasses RLS) |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client-side) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client-side) |
   | `DB_CONNECTIONS_ENCRYPTION_KEY` | Symmetric key for encrypting API keys at rest (generate with `openssl rand -base64 32`) |
   | `AGENT_STORE_API_URL` | Base URL for AI Agent Store API (HuggingFace Space) |
   | `TAVILY_API_KEY` | API key for Tavily web search tool (optional) |

3. **Run database migrations:**

   ```bash
   dbmate up
   ```

4. **Start the dev server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

5. **Demo database:** `data/demo.db` is included in the repo (11 tables of sample data). To regenerate: `npx tsx scripts/seed-demo-db.ts`

## Project Structure

```
app/
  page.tsx                          Main chat UI
  data-explorer/page.tsx            Data Explorer UI (three query modes)
  data-explorer/report/page.tsx     Pop-out report window
  layout.tsx                        Root layout (Geist fonts, dark mode)
  login/page.tsx                    Login/signup form
  api/
    chat/route.ts                   Streams AI responses, saves messages
    sessions/route.ts               List/delete/rename chat sessions
    messages/route.ts               Fetch messages for a session
    settings/route.ts               User provider/model/API key settings
    models/route.ts                 Dynamic Ollama + static model catalog
    search/route.ts                 Full-text chat search
    upload/route.ts                 File upload to Supabase Storage
    fork/route.ts                   Fork conversation from any message
    agents/route.ts                 Installed agents CRUD
    agent-store/browse/route.ts     Proxy to external agent store API
    data-explorer/
      query-stream/route.ts         SSE streaming SQL generation (quick mode)
      agent-query-stream/route.ts   SSE agent loop with tools (agent mode)
      insights-agent-stream/route.ts SSE agent insight generation
      catalog/route.ts              Table metadata CRUD
      catalog/generate/route.ts     SSE auto-catalog generation
      connections/route.ts          Database connection CRUD (MSSQL + SQLite)
      schema/route.ts               Fetch and cache database schema
      sessions/route.ts             Data explorer session management
      saved-queries/route.ts        Saved queries per connection
      pinned-charts/route.ts        Pinned chart dashboard CRUD
      pinned-charts/refresh/route.ts Re-execute source SQL for chart refresh
      dashboards/route.ts           Dashboard metadata CRUD (title, filters)
      dashboard-builder-stream/route.ts SSE agent for AI dashboard building
  components/
    data-explorer/
      ResultsPanel.tsx              SQL/Table/Chart/Insights tabs, export
      QueryChat.tsx                 Chat interface for queries
      ConnectionManager.tsx         Database connection modal
      PlotlyChart.tsx               13 chart types, annotations, color grouping
      ChartGallery.tsx              Carousel with navigation, pin/refine
      AgentStepsTimeline.tsx        Agent tool call timeline
      Dashboard.tsx                 Pinned chart grid dashboard with tabs, cross-filter, slicers
      DashboardChartCard.tsx        Individual chart card with refine, SQL edit, annotations
      DashboardKPICard.tsx          Auto-detected KPI metric card for dashboard
      DashboardSlicerCard.tsx       Slicer filter widget card for dashboard
      DashboardInsightsCard.tsx     AI insights card for dashboard
      FullscreenChartModal.tsx      Fullscreen chart overlay
      SchemaBrowser.tsx             Schema tree with descriptions, catalog generation
      KPICards.tsx                  Auto-detected summary metrics
      DataTable.tsx                 Enhanced table with sorting/formatting
      InsightsPanel.tsx             AI-generated insights
utils/
  ai/provider.ts                    getModel() factory, MODEL_CATALOG
  ai/data-explorer-prompts.ts       Prompt templates for SQL/chart/insight generation
  ai/data-explorer-agent-prompt.ts  Agent query system prompt
  ai/data-explorer-tools.ts         Tool factory for agent loops
  ai/catalog-builder.ts             Table catalog builder, description comments
  ai/fk-graph.ts                    FK graph (BFS join paths)
  ai/semantic-context.ts            Semantic YAML context loader
  supabase/server.ts                Server-side Supabase client
  supabase/client.ts                Browser-side Supabase client
  mssql/connection.ts               MSSQL connection and query utilities
  sqlite/connection.ts              SQLite read-only connection and queries
db/migrations/                      SQL migration files (dbmate format)
data/demo.db                        Pre-seeded SQLite demo database
```

## Database Schema

- **`chat_sessions`** — Chat sessions with titles, system prompts, agent assignments (RLS)
- **`chat_messages`** — Messages as JSONB parts arrays with token usage tracking (RLS)
- **`profiles`** — User profiles (username, name, DOB, phone) with RLS
- **`user_settings`** — Provider/model selection and encrypted API keys (RLS)
- **`installed_agents`** — Agents installed from store with system prompts (RLS)
- **`db_connections`** — MSSQL + SQLite connection configs with encrypted passwords (RLS)
- **`data_explorer_sessions`** / **`data_explorer_messages`** — Data explorer history with agent steps (RLS)
- **`table_metadata`** — AI-generated table descriptions, tags, categories for all DB sizes (RLS)
- **`saved_queries`** — Pinned queries per connection (RLS)
- **`dashboards`** — Dashboard metadata with global filters (one per user per connection, RLS)
- **`pinned_charts`** — Dashboard chart/slicer/insights items with grid layout, source SQL, auto-refresh (RLS)

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
```
