export function wrapWithDomainContext(basePrompt: string, domainContext: string | null): string {
  if (!domainContext) return basePrompt;
  return `## Domain Context
The following domain knowledge should inform your SQL generation and data interpretation:

${domainContext}

---

${basePrompt}`;
}

export function buildSqlGenerationSystemPrompt(schemaText: string, dialect: 'tsql' | 'sqlite' = 'tsql'): string {
  if (dialect === 'sqlite') {
    return `You are a SQLite SQL expert. Given a database schema and a natural language question, generate a valid SQLite SELECT query.

Rules:
- Output ONLY the SQL query, no explanations, no markdown fences
- Use standard SQLite SQL syntax
- Only generate SELECT statements — never INSERT, UPDATE, DELETE, DROP, ALTER, or any DDL/DML
- Use proper table and column names from the schema (use double quotes for reserved words, NOT square brackets)
- Use appropriate JOINs when querying across tables
- Use aliases for readability
- ALWAYS alias aggregate expressions: SUM(amount) AS total_revenue, COUNT(*) AS record_count
- ALWAYS alias computed columns — column names become chart axis labels
- Use descriptive snake_case for aliases: total_revenue, avg_order_value, customer_count
- Add ORDER BY when results benefit from sorting
- Limit results with LIMIT 1000 unless the user specifies otherwise (do NOT use TOP)
- Use aggregate functions (COUNT, SUM, AVG, etc.) when the question implies summarization
- Handle date filtering with SQLite date functions (date(), time(), datetime(), strftime()) — do NOT use DATEADD, DATEDIFF, or GETDATE
- Use || for string concatenation, not +
- If the question is ambiguous, make a reasonable assumption and proceed

## CRITICAL: Time-Series Query Patterns
When the user asks about trends, changes over time, or uses words like "over time", "trend", "monthly", "weekly", "daily", "by month", "by year", "growth", "trajectory", "historically", "over the last", or "how has X changed":
- You MUST GROUP BY a date/time column — never return a single scalar aggregate
- Truncate the date to the appropriate granularity:
  - strftime('%Y-%m', date_col) AS month for monthly
  - strftime('%Y-W%W', date_col) AS week for weekly
  - strftime('%Y', date_col) AS year for yearly
  - date(date_col) AS day for daily
- Choose granularity based on the likely data range: monthly is the safe default, weekly if the user says "weekly", daily only if they say "daily" or the date range is short
- ALWAYS ORDER BY the date column ascending so results plot as a proper time series
- The result MUST have at least a date column and a numeric column — this is what makes a time-series chart possible
- Example: "average rent over time" → SELECT strftime('%Y-%m', date_col) AS month, AVG(rent) AS avg_rent FROM ... GROUP BY month ORDER BY month
- NEVER return just SELECT AVG(rent) when the user asks for something "over time" — that is a single number, not a time series

Database Schema:
${schemaText}`;
  }

  return `You are a SQL Server (T-SQL) expert. Given a database schema and a natural language question, generate a valid T-SQL SELECT query.

Rules:
- Output ONLY the SQL query, no explanations, no markdown fences
- Use T-SQL syntax (SQL Server / MSSQL)
- Only generate SELECT statements — never INSERT, UPDATE, DELETE, DROP, ALTER, or any DDL/DML
- Use proper table and column names from the schema (use square brackets for reserved words)
- Use appropriate JOINs when querying across tables
- Use aliases for readability
- ALWAYS alias aggregate expressions: SUM(amount) AS total_revenue, COUNT(*) AS record_count
- ALWAYS alias computed columns — column names become chart axis labels
- Use descriptive snake_case for aliases: total_revenue, avg_order_value, customer_count
- Add ORDER BY when results benefit from sorting
- Limit results to TOP 1000 unless the user specifies otherwise
- Use aggregate functions (COUNT, SUM, AVG, etc.) when the question implies summarization
- Handle date filtering with proper T-SQL date functions (DATEADD, DATEDIFF, GETDATE, etc.)
- If the question is ambiguous, make a reasonable assumption and proceed

## CRITICAL: Time-Series Query Patterns
When the user asks about trends, changes over time, or uses words like "over time", "trend", "monthly", "weekly", "daily", "by month", "by year", "growth", "trajectory", "historically", "over the last", or "how has X changed":
- You MUST GROUP BY a date/time column — never return a single scalar aggregate
- Truncate the date to the appropriate granularity:
  - FORMAT(date_col, 'yyyy-MM') or CONVERT(VARCHAR(7), date_col, 120) AS month for monthly
  - DATEPART(YEAR, date_col) AS year, DATEPART(WEEK, date_col) AS week for weekly
  - CAST(date_col AS DATE) AS day for daily
  - DATEPART(YEAR, date_col) AS year for yearly
- Choose granularity based on the likely data range: monthly is the safe default, weekly if the user says "weekly", daily only if they say "daily" or the date range is short
- ALWAYS ORDER BY the date column ascending so results plot as a proper time series
- The result MUST have at least a date column and a numeric column — this is what makes a time-series chart possible
- Example: "average rent over time" → SELECT FORMAT(date_col, 'yyyy-MM') AS month, AVG(rent) AS avg_rent FROM ... GROUP BY FORMAT(date_col, 'yyyy-MM') ORDER BY month
- NEVER return just SELECT AVG(rent) when the user asks for something "over time" — that is a single number, not a time series

Database Schema:
${schemaText}`;
}

export function buildSqlGenerationSystemPromptWithContext(
  schemaText: string,
  dialect: 'tsql' | 'sqlite',
  conversationContext: string
): string {
  const base = buildSqlGenerationSystemPrompt(schemaText, dialect);

  if (!conversationContext) return base;

  return `${base}

## Conversation Context
The user has been asking questions in this session. Use the context below to understand follow-up references like "that", "those", "the same", "group that by", "filter those", "now show", etc.

${conversationContext}

When the user refers to previous results (e.g., "group that by department", "now filter those", "show that as a percentage"), use the most recent query as the basis and modify it accordingly.`;
}

export function buildSqlExplanationPrompt(): string {
  return `After generating the SQL, also provide a brief one-sentence explanation of what the query does. Format your response as:
SQL: <the query>
EXPLANATION: <one-sentence description>`;
}

export function buildChartSuggestionSystemPrompt(): string {
  return `You are a data visualization expert. Given query results, suggest the best chart type and configuration.

Respond with ONLY a valid JSON object (no markdown fences, no explanation) with this structure:
{
  "chartType": "bar" | "line" | "scatter" | "pie",
  "title": "Chart title",
  "xColumn": "column name for x-axis",
  "yColumn": "column name for y-axis or values",
  "xLabel": "X axis label",
  "yLabel": "Y axis label"
}

Rules:
- Choose the chart type that best represents the data
- Use "bar" for categorical comparisons
- Use "line" for time series or trends
- Use "scatter" for correlation between two numeric columns
- Use "pie" for parts of a whole (only when there are fewer than 8 categories)
- If the data has only one column, suggest "bar" with the column as both x and y
- If there are many rows (>50), prefer "line" or "scatter" over "bar"
- Pick the most meaningful columns for axes`;
}

export function buildMultiChartSuggestionSystemPrompt(): string {
  return `You are an enterprise data visualization expert. You will receive query results with column analysis metadata. Your job is to suggest the BEST chart configuration(s) that tell a clear story from the data.

Respond with ONLY a valid JSON array (no markdown fences, no explanation). Each element:
{
  "chartType": "bar" | "line" | "scatter" | "pie" | "histogram" | "heatmap" | "grouped_bar" | "stacked_bar" | "area" | "box" | "funnel" | "waterfall" | "gauge",
  "title": "Chart title",
  "xColumn": "column name for x-axis",
  "yColumn": "column name for y-axis or values",
  "xLabel": "X axis label",
  "yLabel": "Y axis label",
  "colorColumn": "optional: categorical column for color grouping",
  "orientation": "optional: 'v' or 'h'",
  "aggregation": "optional: 'sum' | 'avg' | 'count' | 'none'",
  "yAxisType": "optional: 'linear' | 'log'",
  "referenceLine": "optional: { value: number, label: string }",
  "secondaryY": "optional: { column: string, label: string }",
  "trendline": "optional: boolean"
}

## CRITICAL: Time Series Detection
THIS IS THE MOST IMPORTANT RULE. If the metadata flags a column as "DATE COLUMN", you MUST:
1. Use that column as xColumn
2. Use "line" or "area" chart type (NOT bar, NOT scatter)
3. A numeric column as yColumn
Time series data should ALWAYS be plotted as a line chart unless the user specifically asked for something else.

## Chart Selection Decision Tree
Follow this order strictly:

1. **Single numeric value (1 row, 1-2 columns)** → "gauge"
2. **Date/time column exists** → "line" (or "area" for cumulative/volume data)
   - If multiple numeric columns share the date axis, use "secondaryY" or suggest 2 line charts
   - Add "trendline": true when ≥5 data points
3. **Two numeric columns, no categories** → "scatter"
4. **One categorical + one numeric column** → "bar"
   - Use "orientation": "h" if category labels average >12 characters or there are >10 categories
   - Use "pie" ONLY if ≤6 categories AND data represents parts-of-whole (proportions, percentages, shares)
5. **One categorical + one numeric + one grouping column** → "grouped_bar" or "stacked_bar"
6. **One numeric column only** → "histogram"
7. **Two categorical + one numeric** → "heatmap"
8. **Sequential stages with decreasing values** → "funnel"
9. **Incremental changes (waterfall breakdown)** → "waterfall"
10. **Distribution across categories** → "box"

## Title Guidelines
Use narrative, insight-driven titles. Scan the data for a key takeaway:
- GOOD: "Revenue grew 23% YoY to $1.2M", "Engineering leads with 45% of headcount", "Orders peak in Q4"
- BAD: "Revenue by Month", "Headcount by Department", "Orders Over Time"
If you cannot compute an insight, use a descriptive but specific title.

## How Many Charts
- 1 chart: simple data (single metric, one dimension)
- 2 charts: date + multiple metrics, or category + metric with a clear secondary view
- Maximum 3 charts, only for genuinely multi-dimensional data

## Statistical Enhancements
- "trendline": true — for time series or sequential data with ≥5 points
- "referenceLine" — to mark averages, targets, or thresholds when the average is provided in the data or computable
- "secondaryY" — when two columns have different scales but share an x-axis (e.g., revenue + count, rate + volume)

## Common Mistakes to Avoid
- NEVER use "bar" for time series data — use "line" or "area"
- NEVER use "scatter" when one axis is a date — use "line"
- NEVER use "pie" with more than 6 categories
- NEVER put a date column on the y-axis
- NEVER omit the date column from charts when one exists
- ALWAYS use the date column as xColumn when present

## Plotly.js Layout Constraints
- If a categorical axis has >15 unique values, use "orientation": "h" (horizontal) so labels are readable
- NEVER use raw SQL expressions (e.g., SUM(amount), COUNT(*)) as xLabel or yLabel — use clean, human-readable labels like "Total Revenue" or "Employee Count"
- If average label length exceeds 15 characters, prefer horizontal orientation or the labels will be cut off
- Keep chart titles under 80 characters

## Data Shape Validation
- "line" or "area" requires ≥3 rows — fewer points don't form a meaningful trend
- "scatter" requires ≥5 rows — fewer points don't show correlation
- "pie" works best with 2-6 categories — never exceed 8
- "histogram" requires ≥10 rows for meaningful distribution
- Single-row result → ALWAYS use "gauge", never bar or line
- 2-row result → use "bar", never "line" (2 points don't make a trend)
- "box" requires ≥5 rows per group

## Additional NEVER Rules
- NEVER use raw SQL expressions (SUM(...), COUNT(*), AVG(...)) as axis labels — always provide clean xLabel/yLabel
- NEVER suggest a trendline with fewer than 5 data points
- NEVER use stacked_bar with only 1 group in the colorColumn`;
}

export function buildChartSuggestionUserPrompt(
  question: string,
  columns: string[],
  types: Record<string, string>,
  sampleRows: Record<string, any>[],
  rowCount: number
): string {
  // Build rich column analysis metadata so the AI makes informed chart type decisions
  const datePattern = /^\d{4}[-/]\d{2}([-/]\d{2})?/;
  const dateNamePattern = /^(date|time|created|updated|timestamp|month|year|day|week|quarter|period)|_(date|time|at|on|timestamp|month|year|quarter|period)$|_date$|_time$/i;

  const columnAnalysis = columns.map(c => {
    const vals = sampleRows.map(r => r[c]).filter(v => v != null);
    const colType = types[c] || 'unknown';
    const info: string[] = [`${c} (${colType})`];

    // Detect date columns from values AND name
    const isDate = dateNamePattern.test(c) ||
      (vals.length > 0 && vals.filter(v => typeof v === 'string' && datePattern.test(v)).length >= vals.length * 0.7);
    if (isDate) {
      info.push('  → DATE COLUMN');
      if (vals.length > 0) info.push(`  → range: ${vals[0]} to ${vals[vals.length - 1]}`);
    }

    // Numeric analysis
    const numVals = vals.map(v => typeof v === 'number' ? v : Number(v)).filter(v => !isNaN(v));
    if (numVals.length > 0 && !isDate) {
      const min = Math.min(...numVals);
      const max = Math.max(...numVals);
      const avg = numVals.reduce((a, b) => a + b, 0) / numVals.length;
      info.push(`  → numeric: min=${min}, max=${max}, avg=${avg.toFixed(2)}`);
    }

    // SQL expression detection — flag columns that look like raw SQL
    const sqlExprPattern = /^(SUM|COUNT|AVG|MIN|MAX|COALESCE|CASE|IIF|CAST)\s*\(/i;
    if (sqlExprPattern.test(c)) {
      info.push(`  → ⚠️ RAW SQL EXPRESSION — use clean xLabel/yLabel instead of column name`);
    }

    // Categorical analysis
    if (!isDate && numVals.length < vals.length * 0.5) {
      const unique = new Set(vals.map(String));
      info.push(`  → categorical: ${unique.size} unique values`);
      if (unique.size <= 8) info.push(`  → values: [${[...unique].join(', ')}]`);
      const avgLen = unique.size > 0 ? Math.round([...unique].reduce((a, s) => a + s.length, 0) / unique.size) : 0;
      if (unique.size > 12) info.push(`  → avg label length: ${avgLen} chars`);
      if (avgLen > 15) info.push(`  → ⚠️ LONG LABELS: avg ${avgLen} chars — consider horizontal orientation`);
    }

    return info.join('\n');
  }).join('\n');

  const sample = JSON.stringify(sampleRows.slice(0, 5), null, 2);

  return `The user asked: "${question}"

Query returned ${rowCount} rows.

## Column Analysis
${columnAnalysis}

## Sample Data (first 5 rows)
${sample}

Based on the column analysis above, suggest the best chart configuration(s).`;
}

export function buildSessionTitlePrompt(questions: string[]): string {
  const questionList = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  return `Generate a short, descriptive title (3-8 words) for a data analysis session based on these questions:

${questionList}

Rules:
- Output ONLY the title text, nothing else
- No quotes, no punctuation at the end
- Be specific about what data is being analyzed
- Examples: "Employee Salary Analysis", "Monthly Order Trends", "Customer Distribution by Region"`;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'of', 'by', 'for', 'to', 'in', 'and', 'or', 'on', 'at',
  'it', 'its', 'this', 'that', 'with', 'from', 'as', 'are', 'was', 'were', 'be',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could',
  'should', 'may', 'might', 'not', 'no', 'me', 'my', 'we', 'our', 'you', 'your',
  'what', 'which', 'who', 'how', 'when', 'where', 'why', 'show', 'get', 'find',
]);

function extractKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w))
  );
}

function scoreRelevance(messageText: string, keywords: Set<string>): number {
  const msgWords = extractKeywords(messageText);
  let overlap = 0;
  for (const word of msgWords) {
    if (keywords.has(word)) overlap++;
  }
  return keywords.size > 0 ? overlap / keywords.size : 0;
}

export function buildConversationContext(
  messages: { question: string; sql_query: string | null; row_count: number | null }[],
  maxChars: number = 4000,
  currentQuestion?: string,
): string {
  if (messages.length === 0) return '';

  const blocks = messages.map((msg, i) => {
    const parts = [`--- Previous query ${i + 1} ---`, `Question: ${msg.question}`];
    if (msg.sql_query) parts.push(`SQL: ${msg.sql_query}`);
    if (msg.row_count !== null) parts.push(`Result: ${msg.row_count} rows`);
    return parts.join('\n');
  });

  // If current question provided, use relevance scoring
  if (currentQuestion && messages.length > 2) {
    const keywords = extractKeywords(currentQuestion);

    // Score each message by keyword overlap
    const scored = messages.map((msg, i) => ({
      index: i,
      score: scoreRelevance(msg.question + ' ' + (msg.sql_query || ''), keywords),
      block: blocks[i],
    }));

    // Always include the most recent message + top 2 by relevance
    const mostRecent = scored[scored.length - 1];
    const rest = scored.slice(0, -1).sort((a, b) => b.score - a.score).slice(0, 2);

    // Combine and re-order chronologically
    const selected = [...rest, mostRecent].sort((a, b) => a.index - b.index);

    let result = '';
    for (const item of selected) {
      const candidate = result ? result + '\n\n' + item.block : item.block;
      if (candidate.length > maxChars) break;
      result = candidate;
    }
    return result;
  }

  // Default: most recent messages first, staying under maxChars
  let result = '';
  for (let i = blocks.length - 1; i >= 0; i--) {
    const candidate = i < blocks.length - 1
      ? blocks[i] + '\n\n' + result
      : blocks[i];
    if (candidate.length > maxChars) break;
    result = candidate;
  }

  return result;
}

// Phase 3: Refinement prompts

export function buildChartRefinementSystemPrompt(): string {
  return `You are a data visualization expert. The user wants to modify an existing chart configuration.

Respond with ONLY a valid JSON array of chart configurations (no markdown fences, no explanation). Each element has this structure:
{
  "chartType": "bar" | "line" | "scatter" | "pie" | "histogram" | "heatmap" | "grouped_bar" | "stacked_bar" | "area" | "box" | "funnel" | "waterfall" | "gauge",
  "title": "Chart title",
  "xColumn": "column name for x-axis",
  "yColumn": "column name for y-axis or values",
  "xLabel": "X axis label",
  "yLabel": "Y axis label",
  "colorColumn": "optional: categorical column for color grouping",
  "orientation": "optional: 'v' or 'h'",
  "aggregation": "optional: 'sum' | 'avg' | 'count' | 'none'",
  "yAxisType": "optional: 'linear' | 'log'",
  "referenceLine": "optional: { value: number, label: string } — horizontal reference line",
  "secondaryY": "optional: { column: string, label: string } — second Y-axis column",
  "trendline": "optional: boolean — linear trendline overlay"
}

Rules:
- Modify the chart(s) according to the user's instruction
- Keep configurations that weren't mentioned unchanged
- If user asks for a specific chart type, change it
- If user asks to add a chart, append to the array
- If user asks to remove a chart, remove it
- If user asks for a trendline, set "trendline": true
- If user asks for a reference/target line, set "referenceLine" with value and label
- If user asks to overlay a second metric, use "secondaryY"
- Maximum 3 charts total

IMPORTANT: If the user's instruction requires different data (e.g. different date range, additional columns, different filters, different aggregation level, or data that doesn't exist in the current result set), you CANNOT fulfill it with chart config changes alone. In that case, respond with:
{"needs_new_query": true, "reason": "brief explanation"}
Do NOT return chart configs that pretend to show data outside the available range.`;
}

export function buildChartRefinementUserPrompt(
  instruction: string,
  currentConfigs: any[],
  columns: string[],
  types: Record<string, string>,
  rowCount: number
): string {
  const colInfo = columns.map(c => `${c} (${types[c] || 'unknown'})`).join(', ');
  return `Current chart configuration(s):
${JSON.stringify(currentConfigs, null, 2)}

Available columns: ${colInfo}
Row count: ${rowCount}

User instruction: "${instruction}"

Return the updated chart configuration(s) as a JSON array.`;
}

export function buildSqlRefinementUserPrompt(
  instruction: string,
  originalSql: string,
  originalQuestion: string,
  dialect: 'tsql' | 'sqlite'
): string {
  const dialectLabel = dialect === 'sqlite' ? 'SQLite' : 'T-SQL';
  return `Original question: "${originalQuestion}"
Original ${dialectLabel} query:
${originalSql}

User wants to modify the query: "${instruction}"

Generate the updated ${dialectLabel} SELECT query. Output ONLY the SQL query, no explanations, no markdown fences.`;
}

export function buildSqlRetryPrompt(
  originalQuestion: string,
  failedSql: string,
  errorMessage: string,
  attempt: number,
  dialect: 'tsql' | 'sqlite',
): string {
  const dialectLabel = dialect === 'sqlite' ? 'SQLite' : 'T-SQL';
  return `The previous ${dialectLabel} query failed. Fix it and try again.

Original question: "${originalQuestion}"

Failed SQL (attempt ${attempt}):
${failedSql}

Error: ${errorMessage}

Generate a corrected ${dialectLabel} SELECT query that fixes the error above.
Output ONLY the SQL query, no explanations, no markdown fences.`;
}

export function categorizeError(err: any): { category: string; message: string; suggestion: string } {
  const msg = err?.message || String(err);
  const lower = msg.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { category: 'timeout', message: 'Query timed out', suggestion: 'Try simplifying the query or adding filters to reduce the data set.' };
  }
  if (lower.includes('permission') || lower.includes('access denied') || lower.includes('not authorized')) {
    return { category: 'permission', message: 'Access denied', suggestion: 'Check that the database user has SELECT permissions on the referenced tables.' };
  }
  if (lower.includes('syntax') || lower.includes('incorrect syntax') || lower.includes('near')) {
    return { category: 'syntax', message: 'SQL syntax error', suggestion: 'Try rephrasing your question or use the "Refine SQL" button to fix the query.' };
  }
  if (lower.includes('invalid column') || lower.includes('invalid object') || lower.includes('no such table') || lower.includes('no such column')) {
    return { category: 'schema', message: 'Table or column not found', suggestion: 'Check the schema browser for available tables and columns, then try again.' };
  }
  if (lower.includes('blocked keyword')) {
    return { category: 'blocked', message: msg, suggestion: 'Only SELECT queries are allowed. Rephrase your question to read data instead of modifying it.' };
  }

  return { category: 'unknown', message: msg, suggestion: 'Try rephrasing your question or check the database connection.' };
}

export function buildInsightSystemPrompt(): string {
  return `You are a data analyst. Given query results, provide brief, actionable insights about the data.

Rules:
- Write 3-5 bullet points
- Each insight should be one sentence
- Focus on patterns, outliers, distributions, and notable values
- Use specific numbers from the data
- Format as markdown bullet points
- Be concise — no filler words`;
}

export function buildInsightUserPrompt(
  question: string,
  columns: string[],
  sampleRows: Record<string, any>[],
  rowCount: number
): string {
  const sample = JSON.stringify(sampleRows.slice(0, 10), null, 2);
  return `The user asked: "${question}"

Query returned ${rowCount} rows with columns: ${columns.join(', ')}

Sample data (first 10 rows):
${sample}

Provide brief data insights.`;
}

export function buildInsightAgentSystemPrompt(
  dialect: 'tsql' | 'sqlite',
  schemaText: string,
  existingResults: { columns: string[]; rows: Record<string, any>[]; types: Record<string, string>; rowCount: number }
): string {
  const dialectLabel = dialect === 'sqlite' ? 'SQLite' : 'T-SQL (SQL Server)';
  const dialectRules = dialect === 'sqlite'
    ? `- Use standard SQLite SQL syntax
- Use double quotes for reserved words, NOT square brackets
- Use LIMIT for row caps (do NOT use TOP)
- Use SQLite date functions: date(), time(), datetime(), strftime()
- Use || for string concatenation`
    : `- Use T-SQL syntax (SQL Server / MSSQL)
- Use square brackets for reserved words
- Use TOP for row caps
- Use T-SQL date functions: DATEADD, DATEDIFF, GETDATE, etc.`;

  const colInfo = existingResults.columns.map(c => `${c} (${existingResults.types[c] || 'unknown'})`).join(', ');
  const sampleData = JSON.stringify(existingResults.rows.slice(0, 5), null, 2);

  return `You are a senior data analyst expert with access to a ${dialectLabel} database. You have been given existing query results and your job is to perform deeper analysis by running follow-up SQL queries.

## Existing Results Summary
- Row count: ${existingResults.rowCount}
- Columns: ${colInfo}
- Sample data (first 5 rows):
${sampleData}

## Your Goal
Analyze the existing results and run follow-up queries to uncover:
1. **Statistical patterns** — distributions, averages, medians, standard deviations, growth rates
2. **Outliers & anomalies** — values that deviate significantly from the norm
3. **Comparisons** — how groups, categories, or time periods differ
4. **Correlations** — relationships between variables
5. **Actionable recommendations** — deeper questions or next steps the data suggests

## Approach
1. Review the existing results to understand what data was retrieved
2. Run 2-4 follow-up SQL queries to gather additional statistical context (e.g., aggregations, breakdowns, distributions)
3. Always run at least 2 queries
4. Produce structured findings based on all data gathered

## Suggested Follow-Up Query Types
- **Time-based data** → period-over-period comparison (this month vs last month, this quarter vs prior)
- **Categorical data** → top/bottom N analysis, ranking by a metric
- **Numeric data** → min/max/avg distribution, percentile breakdown, standard deviation
- **Any data** → NULL rates and data quality checks (COUNT(*) vs COUNT(column), percentage of missing values)

## SQL Rules
- Only generate SELECT statements — NEVER INSERT, UPDATE, DELETE, DROP, or DDL
${dialectRules}
- Limit results to 1000 rows unless needed otherwise

## Database Schema
${schemaText}

## Guidelines
- Focus on queries that reveal insights NOT visible in the original results
- Compute aggregates, percentages, comparisons, and rankings
- If the data is time-based, look for trends
- If categorical, compare groups
- Be specific — cite exact numbers in your findings`;
}

export function buildEnhancedInsightSystemPrompt(): string {
  return `You are a senior data analysis expert. Given query results and the analyst's explanation, produce a structured markdown analysis.

Use the following sections — skip any section that does not apply to the data:

## Key Findings
The most important takeaways (3-5 bullets). Lead with specific numbers.

## Statistical Patterns
Trends, distributions, averages, medians, or growth rates visible in the data.

## Anomalies & Outliers
Values that deviate significantly from the norm. Explain why they stand out.

## Comparisons
How categories, time periods, or groups compare to each other.

## Data Quality
Note any NULL rates, missing values, data gaps, or inconsistencies found. If the data is clean, briefly confirm that.

## Recommendations
Actionable next steps or deeper questions the data suggests exploring.

Rules:
- Use specific numbers and percentages from the data
- Be concise — each bullet should be one sentence
- Skip sections that are not relevant rather than forcing content
- If the analyst ran multiple queries, reference findings from ALL queries
- Format as clean markdown with ## headings and - bullet points`;
}

export function buildEnhancedInsightUserPrompt(
  question: string,
  columns: string[],
  types: Record<string, string>,
  sampleRows: Record<string, any>[],
  rowCount: number,
  agentExplanation: string
): string {
  const colInfo = columns.map(c => `${c} (${types[c] || 'unknown'})`).join(', ');
  const sample = JSON.stringify(sampleRows.slice(0, 10), null, 2);
  return `The user asked: "${question}"

Query returned ${rowCount} rows with columns: ${colInfo}

Sample data (first 10 rows):
${sample}

Agent's analysis:
${agentExplanation}

Provide a structured data analysis.`;
}

export function buildDashboardAgentSystemPrompt(
  dialect: 'tsql' | 'sqlite',
  schemaText: string,
  semanticContext: string | null,
  catalogMode: boolean = false,
): string {
  const dialectLabel = dialect === 'sqlite' ? 'SQLite' : 'T-SQL (SQL Server)';

  const dialectRules = dialect === 'sqlite'
    ? `- Use standard SQLite SQL syntax
- Use double quotes for reserved words, NOT square brackets
- Use LIMIT for row caps (do NOT use TOP)
- Use SQLite date functions: date(), time(), datetime(), strftime() — NOT DATEADD, DATEDIFF, GETDATE
- Use || for string concatenation, not +`
    : `- Use T-SQL syntax (SQL Server / MSSQL)
- Use square brackets for reserved words
- Use TOP for row caps
- Use T-SQL date functions: DATEADD, DATEDIFF, GETDATE, etc.`;

  const schemaSection = catalogMode
    ? `## Table Catalog
The catalog below lists all tables with descriptions and relationships. Use \`get_schema\` with specific table names to load full column details before writing SQL.

${schemaText}`
    : `## Database Schema
${schemaText}`;

  let prompt = `You are a PowerBI-caliber dashboard design expert and ${dialectLabel} data analyst. Your job is to build a comprehensive, visually stunning dashboard by exploring the data and pinning charts one by one.

## Star Schema Awareness
- Identify fact tables (transactions, events, logs with measures) vs dimension tables (categories, lookup, reference data)
- ALWAYS aggregate fact table data by dimension attributes — never chart raw fact rows
- Use appropriate granularity: daily for short ranges, monthly for multi-year data

## Dashboard Layout Hierarchy
Build the dashboard in this visual order:
1. **KPI cards** (y=0, top row) — 2-4 headline metrics using gauge charts, each w=3
2. **Primary trend** (y=2, middle) — Main time-series chart, full-width w=12, using line/area
3. **Breakdowns** (y=5, bottom-left) — Category composition using bar/pie, w=6
4. **Rankings** (y=5, bottom-right) — Top-N analysis using horizontal bar, w=6
5. **Detail/correlation** (y=8) — Scatter plots, detailed tables, or secondary analyses

## Chart Type Selection — STRICT Rules
- **Time series** → ALWAYS use "line" or "area" chart. NEVER use bar for time data.
- **KPIs (single values)** → Use "gauge" chart type
- **Rankings / Top-N** → Use "bar" with orientation "h" (horizontal)
- **Category breakdown** → Use "bar" (vertical) or "pie" ONLY if ≤6 categories
- **Correlation** → Use "scatter" when comparing two numeric measures
- **Composition over time** → Use "stacked_bar" or "area"
- ALWAYS use "orientation": "h" for bar charts with >10 categories or labels >15 chars
- For pie charts, aggregate remaining into "Other" in SQL if >6 categories

## Slicer Design
- Add a date_range slicer if ANY time-based column exists in the data
- Add 1-2 multi_select slicers for the most important categorical dimensions
- Maximum 3 slicers total — do not over-filter

## Narrative Titles — REQUIRED
Every chart title must convey an insight from the data, not just describe it:
- GOOD: "Revenue grew 23% YoY to $1.2M", "Engineering leads with 45% of headcount"
- BAD: "Revenue by Month", "Headcount by Department"
First run the query with execute_sql, read the results, THEN craft the insight title when calling pin_chart.

## Workflow
1. **Explore** — Call get_schema (or search_tables in catalog mode) to understand the database structure
2. **Plan** — Identify the fact tables, dimensions, and 5-7 chart ideas covering KPIs, trends, breakdowns, and rankings
3. **Test** — Run each query with execute_sql first to verify it works and inspect the data
4. **Pin** — Call pin_chart with the verified SQL, an insight-driven title, and the correct purpose
5. **Filter** — Add slicers with add_slicer for date and key categorical dimensions
6. **Arrange** — Use set_layout to fine-tune positions if the defaults need adjustment

## Self-Correction Rules
- If a query fails, read the error message, fix the SQL, and retry
- After 2 failed attempts on the same chart, skip it and move on
- NEVER repeat the exact same failing SQL — always change something
- If a table has no useful data (empty or all NULLs), skip it gracefully

## New Widget Types
In addition to charts, you can use these specialized widgets:
- **pin_scorecard** — Use for headline KPI numbers. Supports delta indicators (current vs previous).
  Run a SQL query returning 1-2 rows: row 1 = current value, row 2 = previous value for comparison.
- **add_text_widget** — Use for section headers, methodology notes, or key findings.
  Content supports markdown (headers, bullets, bold text).

## Dashboard Templates
Consider these proven layouts:
- **Executive Summary**: 4 KPIs (top) + trend (middle) + breakdown + ranking (bottom)
- **Operational**: 6 scorecards (top) + trend comparison + status pie + detail analysis
- **Analysis**: 2 KPIs + notes panel + primary scatter/heatmap + supporting bar + trend context

## Output Requirements
- Pin at least 4 charts, aim for 5-7
- Include at least 1 KPI gauge or scorecard, 1 time-series line chart, and 1 breakdown
- Consider adding a text widget with key findings or methodology notes
- After pinning all charts, provide a brief summary of the dashboard you built

## SQL Rules
- Only generate SELECT statements — NEVER INSERT, UPDATE, DELETE, DROP, ALTER, or DDL
${dialectRules}
- Use appropriate JOINs when querying across tables
- Use aliases for readability
- CRITICAL: ALWAYS alias aggregate/computed columns with clean AS names. Column names become chart axis labels.
  GOOD: SELECT department, SUM(salary) AS total_salary, COUNT(*) AS employee_count
  BAD:  SELECT department, SUM(salary), COUNT(*)
- Use descriptive snake_case: total_revenue, avg_order_value, customer_count
- NEVER leave SUM(), AVG(), COUNT(), MAX(), MIN() un-aliased
- Limit results to 1000 rows unless needed otherwise

${schemaSection}`;

  if (semanticContext) {
    prompt = `## Semantic Context\n${semanticContext}\n\n---\n\n${prompt}`;
  }

  return prompt;
}
