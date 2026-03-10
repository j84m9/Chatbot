/**
 * SQL syntax validation using node-sql-parser.
 * Used for pre-validation before DB execution and in retry loops.
 */

import { Parser } from 'node-sql-parser';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  tables?: string[];
  columns?: string[];
}

const parser = new Parser();

type ParserDialect = 'TransactSQL' | 'SQLite';

function mapDialect(dialect: 'tsql' | 'sqlite'): ParserDialect {
  return dialect === 'tsql' ? 'TransactSQL' : 'SQLite';
}

/**
 * Validate SQL syntax without hitting the database.
 * On parser crash/unsupported syntax, returns { valid: true } to avoid false negatives.
 */
export function validateSqlSyntax(
  sql: string,
  dialect: 'tsql' | 'sqlite',
): ValidationResult {
  try {
    const ast = parser.astify(sql, { database: mapDialect(dialect) });

    // Extract table and column info if available
    const tables: string[] = [];
    const columns: string[] = [];

    const astArray = Array.isArray(ast) ? ast : [ast];
    for (const node of astArray) {
      if (node && typeof node === 'object') {
        // Extract table names from FROM clause
        if ('from' in node && Array.isArray((node as any).from)) {
          for (const f of (node as any).from) {
            if (f?.table) tables.push(f.table);
          }
        }
        // Extract column names from SELECT
        if ('columns' in node && Array.isArray((node as any).columns)) {
          for (const c of (node as any).columns) {
            if (c?.expr?.column) columns.push(c.expr.column);
          }
        }
      }
    }

    return { valid: true, tables, columns };
  } catch (err: any) {
    const message = err?.message || String(err);

    // If it's a real syntax error, report it
    if (
      message.includes('Syntax error') ||
      message.includes('Expected') ||
      message.includes('Unexpected') ||
      message.includes('Parse error')
    ) {
      return { valid: false, error: message.split('\n')[0] };
    }

    // Parser crashed on valid-but-unsupported syntax — don't block
    return { valid: true };
  }
}
