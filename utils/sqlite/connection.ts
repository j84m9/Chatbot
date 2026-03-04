import Database from 'better-sqlite3';
import type { SchemaTable, ForeignKey } from '@/utils/mssql/connection';

const BLOCKED_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
  'ATTACH', 'DETACH', 'REINDEX', 'VACUUM', 'REPLACE',
];

/** Strip characters that could be prompt injection from identifiers */
export function sanitizeIdentifier(name: string): string {
  return name.replace(/[^\w\s._-]/g, '');
}

export function testConnection(filePath: string): { success: boolean; version?: string; error?: string } {
  try {
    const db = new Database(filePath, { readonly: true });
    try {
      const row = db.prepare('SELECT sqlite_version() AS version').get() as { version: string };
      return { success: true, version: `SQLite ${row.version}` };
    } finally {
      db.close();
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection failed' };
  }
}

export function fetchSchema(filePath: string): SchemaTable[] {
  const db = new Database(filePath, { readonly: true });
  try {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as { name: string }[];

    const schema: SchemaTable[] = [];

    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info("${table.name}")`).all() as {
        cid: number; name: string; type: string; notnull: number; pk: number;
      }[];

      // Fetch foreign keys for this table
      const fkRows = db.prepare(`PRAGMA foreign_key_list("${table.name}")`).all() as {
        id: number; seq: number; table: string; from: string; to: string;
      }[];

      const foreignKeys: ForeignKey[] = fkRows.map(fk => ({
        fromColumn: fk.from,
        toTable: fk.table,
        toColumn: fk.to,
      }));

      schema.push({
        schema: 'main',
        name: table.name,
        columns: columns.map(col => ({
          name: col.name,
          type: col.type || 'TEXT',
          nullable: col.notnull === 0,
          isPrimaryKey: col.pk > 0,
        })),
        foreignKeys: foreignKeys.length > 0 ? foreignKeys : undefined,
      });
    }

    return schema;
  } finally {
    db.close();
  }
}

function validateSqlReadOnly(sqlText: string): { valid: boolean; reason?: string } {
  // Strip string literals to avoid false positives (e.g. WHERE status = 'DELETED')
  const stripped = sqlText
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")   // single-quoted strings → ''
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');   // double-quoted strings → ""
  const upper = stripped.toUpperCase().replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  for (const keyword of BLOCKED_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(upper)) {
      return { valid: false, reason: `Blocked keyword detected: ${keyword}` };
    }
  }

  return { valid: true };
}

/** Fetch sample rows for prompt context */
export function fetchSampleRows(filePath: string, tableName: string, limit: number = 3): Record<string, any>[] {
  const db = new Database(filePath, { readonly: true });
  try {
    const safeName = sanitizeIdentifier(tableName);
    return db.prepare(`SELECT * FROM "${safeName}" LIMIT ${limit}`).all() as Record<string, any>[];
  } catch {
    return [];
  } finally {
    db.close();
  }
}

function injectLimitIfMissing(sqlText: string, maxRows: number): string {
  const upper = sqlText.toUpperCase().trim();
  if (upper.includes('LIMIT ')) {
    return sqlText;
  }
  return `${sqlText.replace(/;\s*$/, '')} LIMIT ${maxRows}`;
}

export function executeQuery(
  filePath: string,
  sqlText: string,
  maxRows: number = 1000
): { rows: Record<string, any>[]; columns: string[]; types: Record<string, string>; rowCount: number; executionTimeMs: number } {
  const validation = validateSqlReadOnly(sqlText);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const safeSql = injectLimitIfMissing(sqlText, maxRows);
  const db = new Database(filePath, { readonly: true });

  try {
    const startTime = Date.now();
    const stmt = db.prepare(safeSql);
    const rows = stmt.all() as Record<string, any>[];
    const executionTimeMs = Date.now() - startTime;

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    const types: Record<string, string> = {};
    for (const col of columns) {
      const sample = rows.find(r => r[col] != null);
      if (sample) {
        types[col] = typeof sample[col];
      } else {
        types[col] = 'unknown';
      }
    }

    return { rows, columns, types, rowCount: rows.length, executionTimeMs };
  } finally {
    db.close();
  }
}
