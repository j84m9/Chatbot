# Chatbot

A full-stack AI chatbot built with Next.js, Supabase, and the Vercel AI SDK. Supports multiple AI providers via a Bring Your Own Key (BYOK) system with encrypted key storage.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **AI:** Vercel AI SDK v5 with streaming via `useChat` + `DefaultChatTransport`
- **Providers:** Ollama (local default), OpenAI, Anthropic, Google
- **Database:** Supabase (PostgreSQL) with Row Level Security
- **Auth:** Supabase Auth via `@supabase/ssr` (cookie-based, middleware-enforced)
- **Migrations:** SQL files in `db/migrations/`, managed with dbmate

## Features

- Chat streaming with multiple AI providers
- BYOK: bring your own API keys for OpenAI, Anthropic, and Google
- API keys encrypted at rest via pgcrypto
- Provider and model selection in settings
- Chat history sidebar with session management
- Edit and resend user messages
- Copy messages to clipboard
- Markdown rendering with code syntax highlighting (Shiki)
- Dark/light mode toggle
- Collapsible sidebar with CSS transitions
- Data Explorer: natural language queries against MSSQL databases with auto-generated charts (Plotly)
- Row Level Security on all user data tables

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

3. **Run database migrations:**

   ```bash
   dbmate up
   ```

4. **Start the dev server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  page.tsx                          Main chat UI
  layout.tsx                        Root layout (Geist fonts, dark mode)
  login/page.tsx                    Login/signup form
  login/actions.ts                  Auth server actions
  api/
    chat/route.ts                   Streams AI responses, saves messages
    sessions/route.ts               List/delete chat sessions
    messages/route.ts               Fetch messages for a session
    settings/route.ts               User provider/model/API key settings
    models/route.ts                 Static model catalog
    data-explorer/
      query/route.ts                Natural language to SQL pipeline
      connections/route.ts          CRUD for MSSQL connections
      schema/route.ts               Fetch database schema
      sessions/route.ts             Data explorer session management
utils/
  ai/provider.ts                    getModel() factory, MODEL_CATALOG
  ai/data-explorer-prompts.ts       Prompt templates for SQL generation
  supabase/server.ts                Server-side Supabase client
  supabase/client.ts                Browser-side Supabase client
  mssql/connection.ts               MSSQL connection and query utilities
db/migrations/                      SQL migration files (dbmate format)
```

## Database Schema

- **`chat_sessions`** — Chat sessions with titles, scoped to users (RLS)
- **`chat_messages`** — Messages stored as JSONB parts arrays, linked to sessions (RLS via session ownership)
- **`profiles`** — User profiles (username, name, DOB, phone) with RLS
- **`user_settings`** — Provider/model selection and encrypted API keys with RLS
- **`db_connections`** — MSSQL connection configs with encrypted passwords (RLS)
- **`data_explorer_sessions`** / **`data_explorer_messages`** — Data explorer history (RLS)

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
```
