import { tool } from 'ai';
import { z } from 'zod';
import { executeQuery as executeMssql, fetchSampleRows as fetchMssqlSampleRows, schemaToPromptText, ConnectionConfig, SchemaTable } from '@/utils/mssql/connection';
import { executeQuery as executeSqlite, fetchSampleRows as fetchSqliteSampleRows } from '@/utils/sqlite/connection';
import { categorizeError } from '@/utils/ai/data-explorer-prompts';

export interface DataExplorerToolContext {
  dialect: 'tsql' | 'sqlite';
  schema: SchemaTable[];
  // MSSQL
  mssqlConfig?: ConnectionConfig | null;
  // SQLite
  filePath?: string;
}

export function createDataExplorerTools(ctx: DataExplorerToolContext) {
  return {
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
          return {
            success: false,
            error: categorized.message,
            errorCategory: categorized.category,
            suggestion: categorized.suggestion,
            executionTimeMs: Date.now() - startTime,
          };
        }
      },
    }),

    get_schema: tool({
      description: 'Get the database schema (tables, columns, types, foreign keys). Use this to understand the database structure before writing SQL.',
      inputSchema: z.object({
        tableFilter: z.string().optional().describe('Optional filter to narrow results to tables containing this string in their name'),
      }),
      execute: async ({ tableFilter }: { tableFilter?: string }) => {
        let filtered = ctx.schema;
        if (tableFilter) {
          const lower = tableFilter.toLowerCase();
          filtered = ctx.schema.filter(t => t.name.toLowerCase().includes(lower));
        }
        if (filtered.length === 0) {
          return { schema: 'No tables found matching the filter.', tableCount: 0 };
        }
        return { schema: schemaToPromptText(filtered), tableCount: filtered.length };
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
}
