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
- Add ORDER BY when results benefit from sorting
- Limit results with LIMIT 1000 unless the user specifies otherwise (do NOT use TOP)
- Use aggregate functions (COUNT, SUM, AVG, etc.) when the question implies summarization
- Handle date filtering with SQLite date functions (date(), time(), datetime(), strftime()) — do NOT use DATEADD, DATEDIFF, or GETDATE
- Use || for string concatenation, not +
- If the question is ambiguous, make a reasonable assumption and proceed

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
- Add ORDER BY when results benefit from sorting
- Limit results to TOP 1000 unless the user specifies otherwise
- Use aggregate functions (COUNT, SUM, AVG, etc.) when the question implies summarization
- Handle date filtering with proper T-SQL date functions (DATEADD, DATEDIFF, GETDATE, etc.)
- If the question is ambiguous, make a reasonable assumption and proceed

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
  return `You are a data visualization expert. Given query results, suggest the best chart configurations to visualize the data.

Respond with ONLY a valid JSON array (no markdown fences, no explanation). Each element has this structure:
{
  "chartType": "bar" | "line" | "scatter" | "pie" | "histogram" | "heatmap" | "grouped_bar" | "stacked_bar" | "area" | "box" | "funnel" | "waterfall" | "gauge",
  "title": "Chart title",
  "xColumn": "column name for x-axis",
  "yColumn": "column name for y-axis or values",
  "xLabel": "X axis label",
  "yLabel": "Y axis label",
  "colorColumn": "optional: categorical column for color grouping",
  "orientation": "optional: 'v' or 'h' for vertical/horizontal",
  "aggregation": "optional: 'sum' | 'avg' | 'count' | 'none'",
  "yAxisType": "optional: 'linear' | 'log'"
}

Rules:
- Suggest 1 chart for simple data (few columns, single metric)
- Suggest 2-3 charts for multi-dimensional data (multiple metrics, categories + time, etc.)
- Maximum 3 charts
- Always include a line or area chart if there's a time/date column
- Use "area" for time series showing volume or cumulative values
- Use "box" for distribution analysis across categories (salary by department, scores by group)
- Use "funnel" for pipeline or stage data with decreasing values (max 15 categories)
- Use "waterfall" for revenue breakdowns, cumulative effects, or sequential changes
- Use "gauge" ONLY for single-row results showing one KPI value
- Use "histogram" for single-column distribution analysis
- Use "heatmap" for two categorical columns with a numeric value
- Use "grouped_bar" when comparing categories across groups
- Use "stacked_bar" for parts-of-whole across categories
- Use "colorColumn" to group data by a categorical column
- Use "orientation": "h" for horizontal bars when category labels are long
- Use "bar" for categorical comparisons
- Use "line" for time series or trends
- Use "scatter" for correlation between two numeric columns
- Use "pie" for parts of a whole (only when fewer than 8 categories)
- Pick the most meaningful columns for each chart`;
}

export function buildChartSuggestionUserPrompt(
  question: string,
  columns: string[],
  types: Record<string, string>,
  sampleRows: Record<string, any>[],
  rowCount: number
): string {
  const colInfo = columns.map(c => `${c} (${types[c] || 'unknown'})`).join(', ');
  const sample = JSON.stringify(sampleRows.slice(0, 5), null, 2);

  return `The user asked: "${question}"

Query returned ${rowCount} rows with columns: ${colInfo}

Sample data (first 5 rows):
${sample}

Suggest the best chart configuration(s) for this data.`;
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

export function buildConversationContext(
  messages: { question: string; sql_query: string | null; row_count: number | null }[],
  maxChars: number = 4000
): string {
  if (messages.length === 0) return '';

  const blocks = messages.map((msg, i) => {
    const parts = [`--- Previous query ${i + 1} ---`, `Question: ${msg.question}`];
    if (msg.sql_query) parts.push(`SQL: ${msg.sql_query}`);
    if (msg.row_count !== null) parts.push(`Result: ${msg.row_count} rows`);
    return parts.join('\n');
  });

  // Build context from most recent messages first, staying under maxChars
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
  "yAxisType": "optional: 'linear' | 'log'"
}

Rules:
- Modify the chart(s) according to the user's instruction
- Keep configurations that weren't mentioned unchanged
- If user asks for a specific chart type, change it
- If user asks to add a chart, append to the array
- If user asks to remove a chart, remove it
- Maximum 3 charts total`;
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
