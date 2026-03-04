# Next Steps & Handoff Context

## Current State (as of March 2026)
The app is fully functional with two main surfaces:
1. **Chat** (`app/page.tsx`) — multi-provider AI chat with agents, file upload, forking, export
2. **Data Explorer** (`app/data-explorer/page.tsx`) — natural language SQL querying with charts, dashboards, insights

Everything listed in `.claude/docs/features.md` is implemented and working. No known bugs are currently tracked.

## Where You Left Off
The most recent work focused on:
- Chart annotations (click data points to add text labels, persisted to DB)
- Pinned chart dashboard with drag-and-resize grid (`react-grid-layout`)
- Data Explorer agent integration (agents inject domain context into SQL prompts)
- Various UX polish (morphing orb loader, micro-interactions, dark mode depth)

## Key Files to Start With
- `app/page.tsx` — Chat UI, all chat state lives here (~2000+ lines, single-page architecture)
- `app/data-explorer/page.tsx` — Data Explorer UI, similar pattern
- `app/api/chat/route.ts` — Chat streaming endpoint (provider resolution, message saving)
- `app/api/data-explorer/query-stream/route.ts` — SSE streaming SQL generation
- `utils/ai/provider.ts` — Model catalog and `getModel()` factory
- `utils/ai/data-explorer-prompts.ts` — SQL generation and chart suggestion prompts

## Architecture Decisions to Know
- **All state in page.tsx**: Both pages use a single-component architecture with hooks. No global state library.
- **Two Supabase clients per route**: Auth client (cookie-based, for user verification) + Admin client (service role, for DB writes bypassing RLS)
- **Agents are just system prompts**: The `tools`/`skills` fields on `installed_agents` are stored but NOT executed. Agents only customize the system prompt.
- **Chart data is frozen**: Pinned charts store a `results_snapshot` — they don't re-query the database on load.
- **Streaming uses SSE, not WebSockets**: Data Explorer query-stream returns `ReadableStream` with named events.

## Future Improvements (Prioritized)

### High Impact / Low Effort
- [ ] **Responsive mobile layout** — Both pages are desktop-only. The sidebar, split pane, and floating input need mobile breakpoints.
- [ ] **Error boundaries and loading states** — No React error boundaries exist. A crash in any component takes down the whole page.
- [ ] **Rate limiting on API routes** — Currently wide open. Add middleware-level rate limiting (especially for chat and query endpoints).
- [ ] **Custom local-only agents** — Let users create agents without needing the external store. Just a name + system prompt.

### High Impact / Medium Effort
- [ ] **Agent tools/skills execution** — The big MVP gap. `tools`/`skills` JSONB is stored but agents can't actually execute tools. Would need a tool execution runtime.
- [ ] **PostgreSQL support in Data Explorer** — Only MSSQL and SQLite are supported. Adding Postgres would use the existing Supabase connection or a new `pg` driver.
- [ ] **Interactive drill-down** — Click a chart segment to filter and re-query. Would tie Plotly click events to SQL WHERE clause generation.
- [ ] **Dashboard auto-refresh** — Pinned charts are static snapshots. Add a refresh button and optional auto-refresh interval that re-executes the source query.
- [ ] **Dashboard filters** — Global date range / category selectors that filter all pinned charts. Would require re-running each chart's source SQL with added WHERE clauses.

### Medium Impact
- [ ] **MySQL support in Data Explorer** — Similar to Postgres support, add a `mysql2` driver.
- [ ] **Natural language chart refinement with streaming** — Currently chart refinement is non-streaming. Add SSE like query-stream.
- [ ] **Agent version sync** — Detect when a store agent has been updated, prompt user to reinstall.
- [ ] **Query result comparison** — Diff two queries side by side.
- [ ] **Sparkline mini-charts in data table cells** — Small inline charts for numeric columns.
- [ ] **Geographic/map chart type** — Choropleth for regional data using Plotly's map traces.

### Lower Priority / Higher Effort
- [ ] **Multi-agent pipeline** — Chain agents (e.g., SQL agent -> analysis agent -> report agent).
- [ ] **Scheduled/recurring queries with alerting** — Needs a job scheduler (cron or similar).
- [ ] **Conversation memory / context window management** — Currently only last 5 messages used for context.
- [ ] **Webhook integrations** — Slack/email notifications for query results.
- [ ] **API access for programmatic querying** — External clients hitting the data explorer API.
- [ ] **SQL autocomplete** — Schema-aware autocomplete in a manual SQL editor (would need CodeMirror or Monaco).
- [ ] **Agent-driven anomaly detection** — Agents that proactively flag outliers in query results.

## Gotchas & Things to Watch
1. **`page.tsx` is huge** — Both main pages have all state in one component. If refactoring, extract state into custom hooks (e.g., `useChatState`, `useDataExplorerState`) rather than adding a state library.
2. **Plotly is dynamically imported** — `react-plotly.js` and `plotly.js-dist-min` are loaded via `next/dynamic` with `ssr: false` to avoid SSR issues. Same for `react-grid-layout`.
3. **better-sqlite3 is native** — It requires `npm rebuild` after Node version changes. It's excluded from the webpack bundle via `serverComponentsExternalPackages` in `next.config`.
4. **Encryption keys** — `DB_CONNECTIONS_ENCRYPTION_KEY` is used for both API keys AND database connection passwords. Losing it means all encrypted data is unrecoverable.
5. **Model catalog is manual** — `MODEL_CATALOG` in `utils/ai/provider.ts` is a hardcoded list. New models from providers need to be added manually (except Ollama which is dynamic).
6. **RLS everywhere** — All tables have Row Level Security. The admin client bypasses it, but if you add a new table, you MUST add RLS policies or data will be invisible.
