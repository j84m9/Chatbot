import { tool } from 'ai';
import { z } from 'zod';
import { executeQuery as executeMssql, fetchSampleRows as fetchMssqlSampleRows, schemaToPromptText, ConnectionConfig, SchemaTable } from '@/utils/mssql/connection';
import { executeQuery as executeSqlite, fetchSampleRows as fetchSqliteSampleRows } from '@/utils/sqlite/connection';
import { categorizeError } from '@/utils/ai/data-explorer-prompts';
import { CatalogEntry, searchCatalog } from '@/utils/ai/catalog-builder';
import { FKGraph, findJoinPath } from '@/utils/ai/fk-graph';

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
}

export function createDataExplorerTools(ctx: DataExplorerToolContext) {
  const baseTools = {
    execute_sql: tool({
      description: 'Execute a read-only SQL query against the database and return the results. Use this to test queries and get data.',
      inputSchema: z.object({
        sql: z.string().describe('The SQL SELECT query to execute'),
        purpose: z.string().describe('Brief description of why this query is being run'),
      }),
      execute: async ({ sql }: { sql: string; purpose: string }) => {
        const startTime = Date.now();
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
