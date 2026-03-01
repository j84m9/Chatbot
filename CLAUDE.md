# Chatbot Project

## Overview
A full-stack AI chatbot built with Next.js 16, Supabase, and the Vercel AI SDK v5. Supports multiple AI providers (Ollama, OpenAI, Anthropic, Google) via a Bring Your Own Key (BYOK) system. Dark/light theme, collapsible sidebar, chat history, user profiles.

## Tech Stack
- **Framework**: Next.js 16 (App Router) with React 19, TypeScript, Tailwind CSS v4
- **AI**: Vercel AI SDK v5 (`ai`, `@ai-sdk/react`) with `useChat` hook + `DefaultChatTransport`
- **Providers**: `ai-sdk-ollama`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Auth**: Supabase Auth via `@supabase/ssr` (cookie-based, middleware-enforced)
- **Migrations**: SQL files in `db/migrations/`, managed with dbmate

## Project Structure
```
app/
  page.tsx              — Main chat UI (sidebar, messages, input, settings panel)
  layout.tsx            — Root layout (Geist fonts, dark class on <html>)
  globals.css           — Tailwind imports, dark variant, custom animations
  login/
    page.tsx            — Login/signup form
    actions.ts          — Server actions: login() and signup()
  api/
    chat/route.ts       — POST: streams AI response, saves user+assistant messages
    sessions/route.ts   — GET: list sessions, DELETE: remove session + messages
    messages/route.ts   — GET: fetch messages for a session (rebuilds AI SDK format)
    settings/route.ts   — GET/POST: user provider/model/API key settings
    models/route.ts     — GET: static model catalog + provider names
utils/
  ai/provider.ts        — getModel() factory, MODEL_CATALOG, PROVIDER_NAMES
  supabase/
    server.ts           — Server-side Supabase client (cookie-based)
    client.ts           — Browser-side Supabase client
middleware.ts           — Auth guard: redirects unauthenticated users to /login
db/migrations/          — SQL migration files (dbmate format)
```

## Database Schema

### `chat_sessions`
- `id` UUID PK, `created_at` TIMESTAMPTZ, `title` TEXT, `user_id` UUID (FK to auth.users)

### `chat_messages`
- `id` UUID PK, `session_id` UUID (FK), `role` TEXT, `content` JSONB (parts array), `created_at`

### `profiles`
- `user_id` UUID PK (FK to auth.users), `username` TEXT UNIQUE, `first_name`, `last_name`, `dob` DATE nullable, `phone` TEXT nullable

### `user_settings`
- `user_id` UUID PK (FK to auth.users), `selected_provider` TEXT default 'ollama', `selected_model` TEXT default 'llama3.2:1b', `openai_api_key` TEXT, `anthropic_api_key` TEXT, `google_api_key` TEXT, `updated_at` TIMESTAMPTZ
- RLS enabled: users can only SELECT/INSERT/UPDATE their own row

## Key Patterns

### Auth Pattern
All API routes use a two-client pattern:
1. `createAuthClient()` (from `@supabase/ssr`) to verify the user's cookie
2. `createAdminClient()` (from `@supabase/supabase-js` with service role key) to bypass RLS for database writes

### AI Provider Resolution
- User settings are stored in `user_settings` table (provider, model, API keys)
- `chat/route.ts` fetches settings on each request, calls `getModel()` to instantiate the right provider
- Frontend never sends API keys per-request; they're read server-side
- API keys are masked on GET (`...xxxx`), POST ignores masked values

### Frontend Architecture (page.tsx ~690 lines)
- Single-page app with all state in `page.tsx`
- `useChat` hook with `DefaultChatTransport` for streaming
- Click-outside detection uses `mousedown` events with ref-based containment (not `stopPropagation`) to play nice with native `<select>` elements
- Sidebar uses CSS transitions (not conditional rendering) to avoid glitchy collapse/expand
- Dark mode toggle persists to `localStorage`, toggles `.dark` class on `<html>`

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, used in browser + server auth client
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — private, used in admin client for DB writes

## Implemented Features
- [x] User auth (login/signup with email or username)
- [x] Chat streaming with Ollama (local default)
- [x] BYOK: OpenAI, Anthropic, Google provider support
- [x] Provider/model selection in settings dropdown
- [x] API key save with masked display
- [x] Chat history sidebar with session list
- [x] Delete chat sessions
- [x] Collapsible sidebar (CSS transitions, icons visible when collapsed)
- [x] Edit & resend user messages
- [x] Copy message to clipboard
- [x] Dark/light mode toggle
- [x] Lightning animation easter egg
- [x] Suggestion chips on empty state
- [x] Custom thin scrollbar styling
- [x] Polished UI: gradient bubbles, frosted header, ambient glow

## Known Issues
- `app/login/page.tsx` uses `useSearchParams()` without a `<Suspense>` boundary, causing a build warning (not a runtime issue in dev)
- `middleware.ts` has debug `console.log` statements that should be cleaned up for production
- `FormEvent` type in `page.tsx:211` is deprecated (minor, non-breaking)
- `app/api/messages/route.ts` creates an admin client at module scope (should be per-request for serverless)

## Future Improvements
- [ ] Markdown rendering for assistant messages (code blocks, bold, lists)
- [ ] Streaming code syntax highlighting
- [ ] File/image upload support
- [ ] Chat search functionality
- [ ] Export chat as PDF/text
- [ ] System prompt customization per chat
- [ ] Rename chat sessions
- [ ] Responsive mobile layout
- [ ] Rate limiting on API routes
- [ ] Encrypt API keys at rest (pgcrypto)
- [ ] Add `<Suspense>` boundary around login page
- [ ] Clean up middleware debug logs
- [ ] Move module-scope admin client in messages route to per-request
- [ ] Add error boundaries and loading states
- [ ] Keyboard shortcuts (Cmd+K for new chat, etc.)
