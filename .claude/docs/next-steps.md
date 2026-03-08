# Next Steps & Handoff Context

## Current State (as of March 2026)
The app is fully functional with two main surfaces:
1. **Chat** (`app/page.tsx`) — multi-provider AI chat with agents, file upload, forking, export
2. **Data Explorer** (`app/data-explorer/page.tsx`) — natural language SQL querying with charts, dashboards, insights

Everything listed in `.claude/docs/features.md` is implemented and working. No known bugs are currently tracked.

## Where You Left Off
The most recent work focused on:
- Dashboard chart refinement via natural language (sparkle button on each card, inline text input, uses existing chart_refinement API)
- Dashboard inline SQL editor on chart cards (CodeMirror with run/cancel)
- Dashboard vertical compaction, improved resize handles, distinct trendline/reference colors
- AI-powered dashboard builder via PowerBI expert agent loop
- Dashboard enhancements: cross-filtering, slicers, tabs, KPI cards, fullscreen, auto-refresh, anomaly detection, PDF export, AI insights card
- YAML catalogue editor inline in Data Explorer
- Connection persistence across page refreshes, auto-switch to agent mode on dashboard view

## Key Files to Start With
- `app/page.tsx` — Chat UI, all chat state lives here (~2000+ lines, single-page architecture)
- `app/data-explorer/page.tsx` — Data Explorer UI, similar pattern
- `app/api/chat/route.ts` — Chat streaming endpoint (provider resolution, message saving)
- `app/api/data-explorer/query-stream/route.ts` — SSE streaming SQL generation
- `app/api/data-explorer/agent-query-stream/route.ts` — Agent loop SSE endpoint (tools + multi-step)
- `app/api/data-explorer/insights-agent-stream/route.ts` — Agent insight generation SSE endpoint
- `utils/ai/provider.ts` — Model catalog and `getModel()` factory
- `utils/ai/data-explorer-prompts.ts` — SQL generation, chart suggestion, and insight agent prompts
- `utils/ai/data-explorer-tools.ts` — Tool factory for agent loops
- `utils/ai/data-explorer-agent-prompt.ts` — Agent query system prompt

## Architecture Decisions to Know
- **All state in page.tsx**: Both pages use a single-component architecture with hooks. No global state library.
- **Two Supabase clients per route**: Auth client (cookie-based, for user verification) + Admin client (service role, for DB writes bypassing RLS)
- **Agents are just system prompts**: The `tools`/`skills` fields on `installed_agents` are stored but NOT executed. Agents only customize the system prompt.
- **Chart data is snapshot-based with optional refresh**: Pinned charts store a `results_snapshot`. They can be refreshed manually or via auto-refresh intervals that re-execute source SQL. Chart configs can be refined via natural language or inline SQL editing.
- **Streaming uses SSE, not WebSockets**: Data Explorer query-stream returns `ReadableStream` with named events.
- **Three query modes**: Chat mode (direct answers, no charts), SQL Editor mode (direct SQL editing + execution), and Agent mode (multi-step tool loop with charts + insights). Agent mode uses `generateText()` with tools, not `streamText()`.
- **Insight generation is mode-aware**: Quick mode uses simple `/api/data-explorer/query` endpoint; Agent mode uses `/api/data-explorer/insights-agent-stream` SSE endpoint with follow-up queries.

## Future Improvements (Prioritized)

### High Impact / Low Effort
- [ ] **Responsive mobile layout** — Both pages are desktop-only. The sidebar, split pane, and floating input need mobile breakpoints.
- [ ] **Error boundaries and loading states** — No React error boundaries exist. A crash in any component takes down the whole page.
- [ ] **Rate limiting on API routes** — Currently wide open. Add middleware-level rate limiting (especially for chat and query endpoints).
- [ ] **Custom local-only agents** — Let users create agents without needing the external store. Just a name + system prompt.

### High Impact / Medium Effort
- [x] ~~**Agent tools/skills execution** — Data Explorer agent mode now uses tools (execute_sql, get_schema, get_sample_data) via `generateText()` with `stopWhen: stepCountIs(5)`~~
- [ ] **Chat agent tools execution** — Chat-side agents still only customize the system prompt. Extend to allow tool execution in chat (not just Data Explorer).
- [ ] **PostgreSQL support in Data Explorer** — Only MSSQL and SQLite are supported. Adding Postgres would use the existing Supabase connection or a new `pg` driver.
- [x] ~~**Interactive drill-down / cross-filtering** — Click a data point on one chart to filter all other charts by that value (client-side cross-filtering)~~
- [x] ~~**Dashboard auto-refresh** — Per-chart configurable refresh intervals (30s, 1m, 5m, 15m) that re-execute source SQL~~
- [x] ~~**Dashboard filters** — Global filters via slicer widgets (multi-select, date range) that filter all pinned charts client-side~~

### Medium Impact
- [ ] **MySQL support in Data Explorer** — Similar to Postgres support, add a `mysql2` driver.
- [ ] **Natural language chart refinement with streaming** — Currently chart refinement is non-streaming. Add SSE like query-stream. (Dashboard refinement also non-streaming.)
- [ ] **Agent version sync** — Detect when a store agent has been updated, prompt user to reinstall.
- [ ] **Query result comparison** — Diff two queries side by side.
- [ ] **Sparkline mini-charts in data table cells** — Small inline charts for numeric columns.
- [ ] **Geographic/map chart type** — Choropleth for regional data using Plotly's map traces.

### Lower Priority / Higher Effort
- [ ] **Multi-agent pipeline** — Chain agents (e.g., SQL agent -> analysis agent -> report agent). Partially realized: insight agent already chains after query agent.
- [ ] **Scheduled/recurring queries with alerting** — Needs a job scheduler (cron or similar).
- [ ] **Conversation memory / context window management** — Currently only last 5 messages used for context.
- [ ] **Webhook integrations** — Slack/email notifications for query results.
- [ ] **API access for programmatic querying** — External clients hitting the data explorer API.
- [ ] **SQL autocomplete** — Schema-aware autocomplete in a manual SQL editor (would need CodeMirror or Monaco).
- [x] ~~**Agent-driven anomaly detection** — Dashboard anomaly detection button flags statistical outliers across pinned charts~~

## Gotchas & Things to Watch
1. **`page.tsx` is huge** — Both main pages have all state in one component. If refactoring, extract state into custom hooks (e.g., `useChatState`, `useDataExplorerState`) rather than adding a state library.
2. **Plotly is dynamically imported** — `react-plotly.js` and `plotly.js-dist-min` are loaded via `next/dynamic` with `ssr: false` to avoid SSR issues. Same for `react-grid-layout`.
3. **better-sqlite3 is native** — It requires `npm rebuild` after Node version changes. It's excluded from the webpack bundle via `serverComponentsExternalPackages` in `next.config`.
4. **Encryption keys** — `DB_CONNECTIONS_ENCRYPTION_KEY` is used for both API keys AND database connection passwords. Losing it means all encrypted data is unrecoverable.
5. **Model catalog is manual** — `MODEL_CATALOG` in `utils/ai/provider.ts` is a hardcoded list. New models from providers need to be added manually (except Ollama which is dynamic).
6. **RLS everywhere** — All tables have Row Level Security. The admin client bypasses it, but if you add a new table, you MUST add RLS policies or data will be invisible.
