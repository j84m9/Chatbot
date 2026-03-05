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

## Setup After Clone
1. `npm install`
2. Copy `.env` with Supabase credentials and `DB_CONNECTIONS_ENCRYPTION_KEY`
3. `dbmate up` — runs all migrations (including SQLite support columns on `db_connections`)
4. `npm run dev`
5. The `data/demo.db` is included in the repo — no seeding needed. To regenerate: `npx tsx scripts/seed-demo-db.ts`

## Documentation
Detailed docs are split into focused files under `.claude/docs/`:

- **[Project Structure](.claude/docs/structure.md)** — Full file tree with descriptions of every file
- **[Database Schema](.claude/docs/database.md)** — All tables, columns, RLS policies, and demo database
- **[Key Patterns](.claude/docs/patterns.md)** — Auth, encryption, AI provider resolution, Data Explorer architecture, design language, and all feature-specific patterns
- **[Implemented Features](.claude/docs/features.md)** — Complete checklist of everything built
- **[Next Steps & Handoff](.claude/docs/next-steps.md)** — Current state, where work left off, prioritized future improvements, gotchas, and key files to start with

## Quick Reference

### Key Entry Points
- `app/page.tsx` — Chat UI (all chat state lives here)
- `app/data-explorer/page.tsx` — Data Explorer UI (quick mode + agent mode)
- `app/api/chat/route.ts` — Chat streaming endpoint
- `app/api/data-explorer/query-stream/route.ts` — SSE streaming SQL generation (quick mode)
- `app/api/data-explorer/agent-query-stream/route.ts` — SSE agent loop with tools (agent mode)
- `app/api/data-explorer/insights-agent-stream/route.ts` — SSE agent insight generation
- `utils/ai/provider.ts` — Model catalog and `getModel()` factory
- `utils/ai/data-explorer-tools.ts` — Tool factory for agent loops (execute_sql, get_schema, get_sample_data)

### Auth Pattern
All API routes use two Supabase clients: `createAuthClient()` for cookie verification, `createAdminClient()` (service role) for DB writes bypassing RLS.

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — private
- `DB_CONNECTIONS_ENCRYPTION_KEY` — symmetric key for encrypting API keys and DB passwords
- `DATABASE_URL` — Postgres connection string for dbmate migrations
- `AGENT_STORE_API_URL` — server-only, base URL for agent store API

## Known Issues
None currently tracked.
