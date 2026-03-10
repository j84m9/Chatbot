import { tool, generateText, LanguageModel } from 'ai';
import { z } from 'zod';
import { executeQuery as executeMssql, fetchSampleRows as fetchMssqlSampleRows, schemaToPromptText, ConnectionConfig, SchemaTable } from '@/utils/mssql/connection';
import { executeQuery as executeSqlite, fetchSampleRows as fetchSqliteSampleRows } from '@/utils/sqlite/connection';
import { categorizeError, buildMultiChartSuggestionSystemPrompt, buildChartSuggestionUserPrompt } from '@/utils/ai/data-explorer-prompts';
import { CatalogEntry, searchCatalog } from '@/utils/ai/catalog-builder';
import { FKGraph, findJoinPath } from '@/utils/ai/fk-graph';
import { validateSqlSyntax } from '@/utils/ai/sql-validator';
import { detectChartType } from '@/utils/ai/chart-detector';
import { computeColumnStats, ColumnStats } from '@/utils/ai/statistics';

export interface DataExplorerToolContext {
  dialect: 'tsql' | 'sqlite';
  schema: SchemaTable[];
  // MSSQL
  mssqlConfig?: ConnectionConfig | null;
  // SQLite
  filePath?: string;
  // Catalog mode (for large databases)
  catalogMode?: boolean;
  catalog?: CatalogEntry[];
  fkGraph?: FKGraph;
  // For compute_statistics tool — returns last successful query result
  getLastResult?: () => { rows: Record<string, any>[]; columns: string[]; types: Record<string, string> } | null;
}

export function createDataExplorerTools(ctx: DataExplorerToolContext) {
  let baseTools: Record<string, any> = {
    execute_sql: tool({
      description: 'Execute a read-only SQL query against the database and return the results. Use this to test queries and get data.',
      inputSchema: z.object({
        sql: z.string().describe('The SQL SELECT query to execute'),
        purpose: z.string().describe('Brief description of why this query is being run'),
      }),
      execute: async ({ sql }: { sql: string; purpose: string }) => {
        const startTime = Date.now();

        // Pre-validate SQL syntax before hitting the database
        const validation = validateSqlSyntax(sql, ctx.dialect);
        if (!validation.valid) {
          return {
            success: false,
            error: `SQL syntax error: ${validation.error}`,
            errorCategory: 'syntax',
            suggestion: 'Fix the SQL syntax and try again.',
            executionTimeMs: Date.now() - startTime,
          };
        }

        try {
          let result: { rows: Record<string, any>[]; columns: string[]; types: Record<string, string>; rowCount: number; executionTimeMs: number };
          if (ctx.dialect === 'sqlite' && ctx.filePath) {
            result = executeSqlite(ctx.filePath, sql);
          } else if (ctx.mssqlConfig) {
            result = await executeMssql(ctx.mssqlConfig, sql);
          } else {
            return { success: false, error: 'No database connection configured', errorCategory: 'connection', suggestion: 'Check the database connection settings.' };
          }
          return {
            success: true,
            rows: result.rows.slice(0, 100),
            columns: result.columns,
            types: result.types,
            rowCount: result.rowCount,
            executionTimeMs: result.executionTimeMs,
          };
        } catch (err: any) {
          const categorized = categorizeError(err);
          let suggestion = categorized.suggestion;

          // For schema errors, include actual column names from referenced tables
          // so the model can immediately retry without needing get_schema
          if (categorized.category === 'schema') {
            const tableHints = extractReferencedTableColumns(sql, ctx.schema);
            suggestion = tableHints
              ? `Available columns for referenced tables:\n${tableHints}\nRetry using only these exact column names.`
              : 'Call get_schema to verify the exact table and column names, then retry.';
          }

          return {
            success: false,
            error: err.message || categorized.message,
            errorCategory: categorized.category,
            suggestion,
            executionTimeMs: Date.now() - startTime,
          };
        }
      },
    }),

    get_schema: tool({
      description: ctx.catalogMode
        ? 'Get full column-level schema for specific tables. Use this AFTER discovering relevant tables via search_tables. Pass exact table names to get detailed column info, types, and foreign keys.'
        : 'Get the database schema (tables, columns, types, foreign keys). Use this to understand the database structure before writing SQL.',
      inputSchema: z.object({
        tableFilter: z.string().optional().describe('Optional filter to narrow results to tables containing this string in their name'),
        tableNames: z.array(z.string()).optional().describe('Exact table names to retrieve schema for (more precise than tableFilter)'),
      }),
      execute: async ({ tableFilter, tableNames }: { tableFilter?: string; tableNames?: string[] }) => {
        let filtered = ctx.schema;

        if (tableNames && tableNames.length > 0) {
          const nameSet = new Set(tableNames.map(n => n.toLowerCase()));
          filtered = ctx.schema.filter(t => nameSet.has(t.name.toLowerCase()));
        } else if (tableFilter) {
          const lower = tableFilter.toLowerCase();
          filtered = ctx.schema.filter(t => t.name.toLowerCase().includes(lower));
        }

        if (filtered.length === 0) {
          return { schema: 'No tables found matching the filter.', tableCount: 0 };
        }

        // In catalog mode, include descriptions from catalog if available
        let schemaText = schemaToPromptText(filtered, ctx.dialect);
        if (ctx.catalogMode && ctx.catalog) {
          const descLines: string[] = [];
          for (const table of filtered) {
            const entry = ctx.catalog.find(
              (c) => c.name.toLowerCase() === table.name.toLowerCase() && c.schema.toLowerCase() === table.schema.toLowerCase()
            );
            if (entry?.description) {
              descLines.push(`-- ${entry.qualifiedName}: ${entry.description}`);
            }
          }
          if (descLines.length > 0) {
            schemaText = descLines.join('\n') + '\n\n' + schemaText;
          }
        }

        return { schema: schemaText, tableCount: filtered.length };
      },
    }),

    get_sample_data: tool({
      description: 'Get 5 sample rows from a specific table. Use this to understand what the data looks like before writing queries.',
      inputSchema: z.object({
        tableName: z.string().describe('The name of the table to sample'),
        schemaName: z.string().optional().describe('Schema name (for MSSQL, e.g. "dbo"). Defaults to "main" for SQLite.'),
      }),
      execute: async ({ tableName, schemaName }: { tableName: string; schemaName?: string }) => {
        try {
          let rows: Record<string, any>[];
          if (ctx.dialect === 'sqlite' && ctx.filePath) {
            rows = fetchSqliteSampleRows(ctx.filePath, tableName, 5);
          } else if (ctx.mssqlConfig) {
            rows = await fetchMssqlSampleRows(ctx.mssqlConfig, schemaName || 'dbo', tableName, 5);
          } else {
            return { success: false, error: 'No database connection configured' };
          }
          return { success: true, rows, rowCount: rows.length };
        } catch (err: any) {
          return { success: false, error: err.message || 'Failed to fetch sample data' };
        }
      },
    }),
  };

  // Add compute_statistics tool when getLastResult is available
  if (ctx.getLastResult) {
    const getLastResult = ctx.getLastResult;
    baseTools = {
      ...baseTools,
      compute_statistics: tool({
        description: 'Compute statistical summary (min, max, mean, median, stdev, percentiles) for columns in the last successful query result. Use this to provide precise statistics instead of estimating.',
        inputSchema: z.object({
          columns: z.array(z.string()).describe('Column names to compute statistics for. Use "*" for all columns.'),
        }),
        execute: async ({ columns: requestedCols }: { columns: string[] }) => {
          const lastResult = getLastResult();
          if (!lastResult || lastResult.rows.length === 0) {
            return { success: false, error: 'No query results available. Run execute_sql first.' };
          }

          const colsToAnalyze = requestedCols.includes('*')
            ? lastResult.columns
            : requestedCols.filter(c => lastResult.columns.includes(c));

          if (colsToAnalyze.length === 0) {
            return { success: false, error: `None of the requested columns found. Available: ${lastResult.columns.join(', ')}` };
          }

          const stats: Record<string, ColumnStats> = {};
          for (const col of colsToAnalyze) {
            const values = lastResult.rows.map(r => r[col]);
            stats[col] = computeColumnStats(values);
          }

          return { success: true, statistics: stats, rowCount: lastResult.rows.length };
        },
      }),
    } as typeof baseTools;
  }

  // Add catalog-mode-only tools
  if (ctx.catalogMode && ctx.catalog && ctx.fkGraph) {
    const catalog = ctx.catalog;
    const fkGraph = ctx.fkGraph;

    return {
      ...baseTools,

      search_tables: tool({
        description: 'Search the table catalog by keyword. Matches against table names, descriptions, tags, and categories. Use this to discover relevant tables before loading their full schema.',
        inputSchema: z.object({
          keyword: z.string().describe('Search term to find relevant tables (e.g. "customer", "order", "invoice")'),
        }),
        execute: async ({ keyword }: { keyword: string }) => {
          const results = searchCatalog(catalog, keyword);
          if (results.length === 0) {
            return { tables: [], count: 0, suggestion: 'Try a different keyword or a broader search term.' };
          }
          return {
            tables: results.map((e) => ({
              name: e.qualifiedName,
              description: e.description || 'No description available',
              primaryKeys: e.primaryKeys,
              relatedTables: e.foreignKeyTargets,
              tags: e.tags,
              category: e.category,
              estimatedRows: e.estimatedRowCount,
            })),
            count: results.length,
          };
        },
      }),

      get_join_path: tool({
        description: 'Find the shortest foreign key path between two tables. Returns the chain of joins needed to connect them. Use this to understand how tables relate before writing JOINs.',
        inputSchema: z.object({
          fromTable: z.string().describe('Starting table name'),
          toTable: z.string().describe('Target table name'),
        }),
        execute: async ({ fromTable, toTable }: { fromTable: string; toTable: string }) => {
          const path = findJoinPath(fkGraph, fromTable, toTable);
          if (path === null) {
            return {
              connected: false,
              message: `No foreign key path found between "${fromTable}" and "${toTable}" within 5 hops. They may not be directly related — try joining through an intermediate table, or check if the relationship uses a different pattern.`,
            };
          }
          if (path.length === 0) {
            return { connected: true, message: 'Same table — no join needed.', path: [] };
          }
          return {
            connected: true,
            path: path.map((step) => ({
              from: `${step.fromTable}.${step.fromColumn}`,
              to: `${step.toTable}.${step.toColumn}`,
            })),
            joinSql: path
              .map((step) => `JOIN ${step.toTable} ON ${step.fromTable}.${step.fromColumn} = ${step.toTable}.${step.toColumn}`)
              .join('\n'),
          };
        },
      }),
    };
  }

  return baseTools;
}

/**
 * Extract table names from SQL (FROM/JOIN clauses) and return their column names.
 * Helps the agent self-correct without needing a separate get_schema call.
 */
function extractReferencedTableColumns(sql: string, schema: SchemaTable[]): string | null {
  // Match table names after FROM and JOIN keywords (handles aliases)
  const tablePattern = /(?:FROM|JOIN)\s+(?:\[?(\w+)\]?\.)?\[?(\w+)\]?(?:\s+(?:AS\s+)?(\w+))?/gi;
  const found = new Set<string>();
  let match;
  while ((match = tablePattern.exec(sql)) !== null) {
    found.add(match[2].toLowerCase());
  }

  if (found.size === 0) return null;

  const lines: string[] = [];
  for (const tableName of found) {
    const table = schema.find(t => t.name.toLowerCase() === tableName);
    if (table) {
      const cols = table.columns.map(c => c.name).join(', ');
      lines.push(`  ${table.name}: ${cols}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

// ═══════════════════════════════════════════════════
// Dashboard Agent Tools
// ═══════════════════════════════════════════════════

export interface DashboardAgentToolContext extends DataExplorerToolContext {
  dbAdmin: any;
  userId: string;
  connectionId: string;
  dashboardId?: string | null;
  model: LanguageModel;
  sendEvent: (stage: string, data: any) => void;
}

function computeDefaultLayout(purpose: string, purposeIndex: number): { x: number; y: number; w: number; h: number } {
  switch (purpose) {
    case 'kpi':
      return { x: (purposeIndex % 4) * 3, y: 0, w: 3, h: 2 };
    case 'trend':
      return { x: 0, y: 2 + purposeIndex * 3, w: 12, h: 3 };
    case 'breakdown':
      return { x: 0, y: 5 + purposeIndex * 3, w: 6, h: 3 };
    case 'ranking':
      return { x: 6, y: 5 + purposeIndex * 3, w: 6, h: 3 };
    case 'correlation':
    case 'detail':
    default:
      return { x: 0, y: 8 + purposeIndex * 3, w: 12, h: 3 };
  }
}

function purposeToChartType(purpose: string): string {
  switch (purpose) {
    case 'kpi': return 'gauge';
    case 'trend': return 'line';
    case 'breakdown': return 'bar';
    case 'ranking': return 'bar';
    case 'correlation': return 'scatter';
    case 'detail': return 'bar';
    default: return 'bar';
  }
}

function extractChartJsonArray(text: string): any[] | null {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        const parsed = JSON.parse(fenceMatch[1].trim());
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch { /* continue */ }
    }
    const start = text.indexOf('[');
    if (start >= 0) {
      let depth = 0;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '[') depth++;
        else if (text[i] === ']') depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch { break; }
        }
      }
    }
    const objStart = text.indexOf('{');
    if (objStart >= 0) {
      let depth = 0;
      for (let i = objStart; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        if (depth === 0) {
          try { return [JSON.parse(text.slice(objStart, i + 1))]; } catch { break; }
        }
      }
    }
    return null;
  }
}

export function createDashboardAgentTools(ctx: DashboardAgentToolContext) {
  const baseTools = createDataExplorerTools(ctx);
  const purposeCounters = new Map<string, number>();
  let totalChartIndex = 0;

  return {
    ...baseTools,

    pin_chart: tool({
      description: 'Pin a chart to the dashboard. Executes the SQL, generates a chart configuration, and saves it. Use this after verifying your SQL works with execute_sql.',
      inputSchema: z.object({
        sql: z.string().describe('The SQL SELECT query to execute for this chart'),
        title: z.string().describe('Narrative, insight-driven chart title (e.g. "Revenue grew 23% YoY to $1.2M")'),
        chartTypeHint: z.string().optional().describe('Preferred chart type: bar, line, pie, scatter, area, gauge, grouped_bar, stacked_bar'),
        purpose: z.enum(['kpi', 'trend', 'breakdown', 'ranking', 'correlation', 'detail']).describe('The role this chart plays in the dashboard layout'),
      }),
      execute: async ({ sql, title, chartTypeHint, purpose }: { sql: string; title: string; chartTypeHint?: string; purpose: string }) => {
        try {
          // 1. Execute SQL
          let queryResult: { rows: Record<string, any>[]; columns: string[]; types: Record<string, string>; rowCount: number; executionTimeMs: number };
          if (ctx.dialect === 'sqlite' && ctx.filePath) {
            queryResult = executeSqlite(ctx.filePath, sql);
          } else if (ctx.mssqlConfig) {
            queryResult = await executeMssql(ctx.mssqlConfig, sql);
          } else {
            return { success: false, error: 'No database connection configured' };
          }

          if (queryResult.rows.length === 0) {
            return { success: false, error: 'Query returned no rows', suggestion: 'Try a different query that returns data.' };
          }

          // 2. Generate chart config via LLM
          let chartConfig: any = null;
          try {
            const chartResult = await generateText({
              model: ctx.model,
              system: buildMultiChartSuggestionSystemPrompt(),
              prompt: buildChartSuggestionUserPrompt(
                title,
                queryResult.columns,
                queryResult.types,
                queryResult.rows.slice(0, 10),
                queryResult.rowCount,
              ),
            });
            const configs = extractChartJsonArray(chartResult.text);
            if (configs && configs.length > 0) {
              chartConfig = { ...configs[0], title: configs[0].title || title };
            }
          } catch {
            // LLM chart gen failed — use fallback
          }

          // 3. Fallback: deterministic chart detection
          if (!chartConfig) {
            const detected = detectChartType(
              queryResult.columns,
              queryResult.types,
              queryResult.rows,
              queryResult.rowCount,
            );
            chartConfig = {
              ...detected,
              title,
            };
            // Override with hint/purpose if provided
            if (chartTypeHint) {
              chartConfig.chartType = chartTypeHint;
            }
            if (purpose === 'ranking') {
              chartConfig.orientation = 'h';
            }
          }

          // 4. Compute layout
          const purposeIdx = purposeCounters.get(purpose) || 0;
          purposeCounters.set(purpose, purposeIdx + 1);
          const layout = computeDefaultLayout(purpose, purposeIdx);

          // 5. Get next display_order
          const { data: existing } = await ctx.dbAdmin
            .from('pinned_charts')
            .select('display_order')
            .eq('user_id', ctx.userId)
            .eq('connection_id', ctx.connectionId)
            .order('display_order', { ascending: false })
            .limit(1);

          const nextOrder = existing && existing.length > 0 ? existing[0].display_order + 1 : 0;

          // 6. Insert pinned chart
          const insertData: Record<string, any> = {
            user_id: ctx.userId,
            connection_id: ctx.connectionId,
            title: chartConfig.title || title,
            chart_config: chartConfig,
            results_snapshot: {
              rows: queryResult.rows,
              columns: queryResult.columns,
              types: queryResult.types,
            },
            source_sql: sql,
            source_question: title,
            display_order: nextOrder,
            layout,
          };

          if (ctx.dashboardId) {
            insertData.dashboard_id = ctx.dashboardId;
          }

          const { data: pinned, error: pinError } = await ctx.dbAdmin
            .from('pinned_charts')
            .insert(insertData)
            .select()
            .single();

          if (pinError || !pinned) {
            return { success: false, error: `Failed to pin chart: ${pinError?.message || 'Unknown error'}` };
          }

          // 7. Emit SSE event
          totalChartIndex++;
          ctx.sendEvent('chart_added', {
            id: pinned.id,
            title: chartConfig.title || title,
            chartType: chartConfig.chartType,
            purpose,
            index: totalChartIndex,
            rowCount: queryResult.rowCount,
          });

          return {
            success: true,
            chartId: pinned.id,
            title: chartConfig.title || title,
            chartType: chartConfig.chartType,
            rowCount: queryResult.rowCount,
            columns: queryResult.columns,
            purpose,
          };
        } catch (err: any) {
          const categorized = categorizeError(err);
          return {
            success: false,
            error: err.message || categorized.message,
            errorCategory: categorized.category,
            suggestion: categorized.suggestion,
          };
        }
      },
    }),

    add_slicer: tool({
      description: 'Add a slicer filter panel to the dashboard. Use date_range for time-based filtering, multi_select for categorical filtering.',
      inputSchema: z.object({
        column: z.string().describe('The column name to filter on'),
        filterType: z.enum(['multi_select', 'date_range']).describe('Type of filter: multi_select for categories, date_range for dates'),
        label: z.string().optional().describe('Display label for the slicer (defaults to column name)'),
      }),
      execute: async ({ column, filterType, label }: { column: string; filterType: string; label?: string }) => {
        try {
          const displayLabel = label || column.replace(/_/g, ' ');

          const { data: slicer, error: slicerError } = await ctx.dbAdmin
            .from('pinned_charts')
            .insert({
              user_id: ctx.userId,
              connection_id: ctx.connectionId,
              title: displayLabel,
              item_type: 'slicer',
              slicer_config: { column, filterType },
              chart_config: {},
              results_snapshot: { rows: [], columns: [] },
              display_order: 100,
              ...(ctx.dashboardId ? { dashboard_id: ctx.dashboardId } : {}),
            })
            .select()
            .single();

          if (slicerError || !slicer) {
            return { success: false, error: `Failed to add slicer: ${slicerError?.message || 'Unknown error'}` };
          }

          ctx.sendEvent('slicer_added', { id: slicer.id, column, filterType, label: displayLabel });

          return { success: true, slicerId: slicer.id, column, filterType, label: displayLabel };
        } catch (err: any) {
          return { success: false, error: err.message || 'Failed to add slicer' };
        }
      },
    }),

    set_layout: tool({
      description: 'Update the position and size of a chart on the dashboard grid. Coordinates are in grid units (12 columns wide).',
      inputSchema: z.object({
        chartId: z.string().describe('The ID of the pinned chart to reposition'),
        x: z.number().describe('Grid column position (0-11)'),
        y: z.number().describe('Grid row position'),
        w: z.number().describe('Width in grid columns (1-12)'),
        h: z.number().describe('Height in grid rows'),
      }),
      execute: async ({ chartId, x, y, w, h }: { chartId: string; x: number; y: number; w: number; h: number }) => {
        try {
          const { error: updateError } = await ctx.dbAdmin
            .from('pinned_charts')
            .update({ layout: { x, y, w, h } })
            .eq('id', chartId)
            .eq('user_id', ctx.userId);

          if (updateError) {
            return { success: false, error: `Failed to update layout: ${updateError.message}` };
          }

          ctx.sendEvent('layout_updated', { chartId, x, y, w, h });

          return { success: true, chartId, layout: { x, y, w, h } };
        } catch (err: any) {
          return { success: false, error: err.message || 'Failed to update layout' };
        }
      },
    }),
  };
}
