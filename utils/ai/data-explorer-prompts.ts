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

Suggest the best chart configuration for this data.`;
}
