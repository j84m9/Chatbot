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

### SQL Accuracy & Reliability (High Priority)
- [ ] **Few-shot example library** — Per-database exemplar Q→SQL pairs stored in `table_metadata` or a new `query_examples` table. Inject the 3-5 most relevant examples (by embedding similarity or keyword match) into the SQL generation prompt. This is the single biggest accuracy booster — [research shows](https://cloud.google.com/blog/products/databases/techniques-for-improving-text-to-sql) few-shot examples dramatically reduce hallucinated column names and wrong JOINs.
- [ ] **Execution-based validation** — After executing SQL, run sanity checks: if the user asked for "top 10" but got 0 rows, auto-retry with relaxed filters. If results have unexpected NULLs in key columns, flag it. Only ~3% of SQL errors are syntax errors caught at parse time; the rest are semantic errors that only show up as wrong results.
- [ ] **Query decomposition for complex questions** — When the user asks a compound question ("show me revenue by region and compare it to last quarter"), decompose into sub-queries, execute each, then synthesize. The agent mode partially does this, but a structured decomposition step before SQL generation would improve quick mode too.
- [ ] **Confidence scoring** — After generating SQL, have the LLM rate its confidence (high/medium/low) based on schema match and question complexity. Show this to the user. Low-confidence queries could auto-trigger agent mode for verification.
- [ ] **Query result caching** — Cache SQL→results for identical queries within a session. Avoid re-executing the same SQL when switching tabs or toggling chart/table views. Also enables instant back-navigation to previous results.

### Analytics & Visualization (High Priority)
- [ ] **Click-to-drill-down on charts** — Click a bar segment or data point to auto-generate a filtered follow-up query. E.g., clicking "Q3" on a quarterly revenue chart generates "show me Q3 revenue broken down by product." This is the most requested feature in modern BI tools.
- [ ] **Dashboard cross-filtering** — Clicking a value on one dashboard chart filters all other charts by that dimension. Requires a shared filter state across pinned charts and re-execution of source SQL with injected WHERE clauses.
- [ ] **Comparison mode** — Side-by-side period comparison (this month vs last month, this year vs last year). The agent can generate comparison queries, but a dedicated UI showing two result sets with delta highlighting would be much more useful.
- [ ] **Calculated columns / derived metrics** — Let users define computed fields (e.g., `profit = revenue - cost`) that are applied client-side to query results. Stored per-connection so they persist across sessions.
- [ ] **Smart auto-suggestions after results** — After query results arrive, analyze the data shape and proactively suggest drill-downs: "This data has 5 regions — want to see a breakdown by region?" Currently suggestions come from the LLM text; this would be deterministic and data-driven.
- [ ] **Threshold alerts on dashboard** — Let users set alert rules on pinned charts (e.g., "notify me if avg response time > 500ms"). Checks run on auto-refresh. Visual indicator on the chart when threshold is breached.

### Agent Intelligence (Medium-High Priority)
- [ ] **Multi-query narrative synthesis** — After the agent runs 3-5 queries, generate a structured executive summary that weaves findings from ALL queries into a coherent narrative with section headers, not just the last query's results. Think "analyst memo" format.
- [ ] **Automatic data profiling in agent mode** — Before writing SQL, have the agent run a quick profile query (row counts, date ranges, NULL rates) on relevant tables. This prevents queries that return empty results because of wrong date filters or missing data.
- [ ] **Query plan explanation** — Show users a plain-English breakdown of what the SQL does and why each JOIN/filter was chosen. Helps build trust and lets users catch mistakes before execution.
- [ ] **Learning from corrections** — When a user refines a query ("no, I meant by fiscal quarter not calendar quarter"), store the correction as a few-shot example for future similar questions on that database.

### Data Connectivity (Medium Priority)
- [ ] **Snowflake connector** — Add Snowflake as a connection type. Could optionally use Cortex Analyst as a backend for SQL generation while keeping the visualization layer. Use the `snowflake-sdk` npm package.
- [ ] **PostgreSQL support** — Only MSSQL and SQLite are supported. Adding Postgres would use a `pg` driver. High value since many teams use Postgres.
- [ ] **MySQL support** — Similar to Postgres, add a `mysql2` driver.
- [ ] **Query federation** — Query across multiple connected databases in a single session. The agent could run queries on DB-A and DB-B, then join the results client-side.

### UI & Experience (Medium Priority)
- [ ] **Responsive mobile layout** — Both pages are desktop-only. The sidebar, split pane, and floating input need mobile breakpoints.
- [ ] **Error boundaries and loading states** — No React error boundaries exist. A crash in any component takes down the whole page.
- [ ] **Natural language chart refinement with streaming** — Currently chart refinement is non-streaming. Add SSE like query-stream for real-time feedback.
- [ ] **SQL autocomplete in editor** — Schema-aware autocomplete in the SQL editor mode using CodeMirror's completion API. Table/column names, SQL keywords.
- [ ] **Query result comparison** — Diff two queries side by side with highlighted deltas.
- [ ] **Sparkline mini-charts in data table cells** — Small inline charts for numeric columns in the table view.
- [ ] **Geographic/map chart type** — Choropleth for regional data using Plotly's map traces.
- [ ] **Export to Excel/PowerPoint** — Beyond CSV/PDF, export chart + data as .xlsx or .pptx for enterprise sharing.

### Infrastructure (Lower Priority)
- [ ] **Rate limiting on API routes** — Currently wide open. Add middleware-level rate limiting.
- [ ] **Custom local-only agents** — Let users create agents without the external store. Just a name + system prompt.
- [ ] **Chat agent tools execution** — Chat-side agents still only customize the system prompt. Extend to allow tool execution.
- [ ] **Multi-agent pipeline** — Chain agents (e.g., SQL agent -> analysis agent -> report agent).
- [ ] **Scheduled/recurring queries with alerting** — Needs a job scheduler (cron or similar).
- [ ] **Webhook integrations** — Slack/email notifications for query results.
- [ ] **API access for programmatic querying** — External clients hitting the data explorer API.

### Completed
- [x] ~~Agent tools/skills execution — Data Explorer agent mode uses tools via `generateText()` with `stopWhen: stepCountIs(5)`~~
- [x] ~~Interactive drill-down / cross-filtering on dashboard~~
- [x] ~~Dashboard auto-refresh — Per-chart configurable refresh intervals~~
- [x] ~~Dashboard filters — Global filters via slicer widgets~~
- [x] ~~Agent-driven anomaly detection on dashboard~~
- [x] ~~SQL retry loop with pre-validation (up to 3 attempts)~~
- [x] ~~Deterministic fallback chart detection~~
- [x] ~~Column profiling and schema enrichment~~
- [x] ~~Compute statistics agent tool~~
- [x] ~~Smarter conversation context with keyword relevance~~
- [x] ~~Adaptive dashboard layout~~
- [x] ~~Semantic YAML context for MSSQL~~

## Gotchas & Things to Watch
1. **`page.tsx` is huge** — Both main pages have all state in one component. If refactoring, extract state into custom hooks (e.g., `useChatState`, `useDataExplorerState`) rather than adding a state library.
2. **Plotly is dynamically imported** — `react-plotly.js` and `plotly.js-dist-min` are loaded via `next/dynamic` with `ssr: false` to avoid SSR issues. Same for `react-grid-layout`.
3. **better-sqlite3 is native** — It requires `npm rebuild` after Node version changes. It's excluded from the webpack bundle via `serverComponentsExternalPackages` in `next.config`.
4. **Encryption keys** — `DB_CONNECTIONS_ENCRYPTION_KEY` is used for both API keys AND database connection passwords. Losing it means all encrypted data is unrecoverable.
5. **Model catalog is manual** — `MODEL_CATALOG` in `utils/ai/provider.ts` is a hardcoded list. New models from providers need to be added manually (except Ollama which is dynamic).
6. **RLS everywhere** — All tables have Row Level Security. The admin client bypasses it, but if you add a new table, you MUST add RLS policies or data will be invisible.
