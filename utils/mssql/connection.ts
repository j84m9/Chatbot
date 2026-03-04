import sql from 'mssql';

export interface ConnectionConfig {
  server: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
  domain?: string;
  authType: 'sql' | 'windows';
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

export interface SchemaColumn {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  is_primary_key: boolean;
}

export interface ForeignKey {
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface SchemaTable {
  schema: string;
  name: string;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey: boolean;
  }[];
  foreignKeys?: ForeignKey[];
}

const BLOCKED_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
  'EXEC', 'EXECUTE', 'GRANT', 'REVOKE', 'DENY', 'MERGE', 'BULK',
  'OPENROWSET', 'OPENDATASOURCE', 'xp_', 'sp_configure', 'SHUTDOWN',
  'DBCC', 'BACKUP', 'RESTORE',
];

/** Strip characters that could be prompt injection from identifiers */
export function sanitizeIdentifier(name: string): string {
  return name.replace(/[^\w\s._-]/g, '');
}

export function buildPoolConfig(config: ConnectionConfig): sql.config {
  const poolConfig: sql.config = {
    server: config.server,
    port: config.port,
    database: config.database,
    options: {
      encrypt: config.encrypt ?? true,
      trustServerCertificate: config.trustServerCertificate ?? false,
    },
    connectionTimeout: 15000,
    requestTimeout: 30000,
    pool: {
      max: 1,
      min: 0,
      idleTimeoutMillis: 10000,
    },
  };

  if (config.authType === 'windows') {
    poolConfig.domain = config.domain;
    poolConfig.user = config.username;
    poolConfig.password = config.password;
  } else {
    poolConfig.user = config.username;
    poolConfig.password = config.password;
  }

  return poolConfig;
}

export async function testConnection(config: ConnectionConfig): Promise<{ success: boolean; version?: string; error?: string }> {
  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await sql.connect(buildPoolConfig(config));
    const result = await pool.request().query('SELECT @@VERSION AS version');
    const version = result.recordset[0]?.version?.split('\n')[0] || 'Connected';
    return { success: true, version };
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection failed' };
  } finally {
    if (pool) await pool.close();
  }
}

export async function fetchSchema(config: ConnectionConfig): Promise<SchemaTable[]> {
  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await sql.connect(buildPoolConfig(config));

    const result = await pool.request().query(`
      SELECT
        c.TABLE_SCHEMA AS table_schema,
        c.TABLE_NAME AS table_name,
        c.COLUMN_NAME AS column_name,
        c.DATA_TYPE AS data_type,
        c.IS_NULLABLE AS is_nullable,
        CASE WHEN kcu.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        ON tc.TABLE_SCHEMA = c.TABLE_SCHEMA
        AND tc.TABLE_NAME = c.TABLE_NAME
        AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
        AND kcu.TABLE_NAME = tc.TABLE_NAME
        AND kcu.COLUMN_NAME = c.COLUMN_NAME
      WHERE c.TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
      ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION
    `);

    const tableMap = new Map<string, SchemaTable>();

    for (const row of result.recordset) {
      const key = `${row.table_schema}.${row.table_name}`;
      if (!tableMap.has(key)) {
        tableMap.set(key, {
          schema: row.table_schema,
          name: row.table_name,
          columns: [],
        });
      }
      tableMap.get(key)!.columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        isPrimaryKey: row.is_primary_key === 1,
      });
    }

    // Fetch foreign keys
    const fkResult = await pool.request().query(`
      SELECT
        OBJECT_SCHEMA_NAME(fk.parent_object_id) AS from_schema,
        OBJECT_NAME(fk.parent_object_id) AS from_table,
        COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS from_column,
        OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS to_schema,
        OBJECT_NAME(fk.referenced_object_id) AS to_table,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS to_column
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      ORDER BY from_schema, from_table
    `);

    for (const row of fkResult.recordset) {
      const key = `${row.from_schema}.${row.from_table}`;
      const table = tableMap.get(key);
      if (table) {
        if (!table.foreignKeys) table.foreignKeys = [];
        table.foreignKeys.push({
          fromColumn: row.from_column,
          toTable: `${row.to_schema}.${row.to_table}`,
          toColumn: row.to_column,
        });
      }
    }

    return Array.from(tableMap.values());
  } finally {
    if (pool) await pool.close();
  }
}

export function schemaToPromptText(schema: SchemaTable[]): string {
  return schema.map(table => {
    const safeTableName = sanitizeIdentifier(table.name);
    const safeSchema = sanitizeIdentifier(table.schema);
    const cols = table.columns.map(c => {
      const safeName = sanitizeIdentifier(c.name);
      let desc = `  ${safeName} ${c.type}`;
      if (c.isPrimaryKey) desc += ' PK';
      if (!c.nullable) desc += ' NOT NULL';
      return desc;
    }).join('\n');
    const fks = (table.foreignKeys || []).map(fk =>
      `  FK: ${sanitizeIdentifier(fk.fromColumn)} -> ${sanitizeIdentifier(fk.toTable)}(${sanitizeIdentifier(fk.toColumn)})`
    ).join('\n');
    const parts = [`[${safeSchema}].[${safeTableName}]`, cols];
    if (fks) parts.push(fks);
    return parts.join('\n');
  }).join('\n\n');
}

function validateSqlReadOnly(sqlText: string): { valid: boolean; reason?: string } {
  // Strip string literals to avoid false positives (e.g. WHERE status = 'DELETED')
  const stripped = sqlText
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
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
export async function fetchSampleRows(config: ConnectionConfig, schema: string, tableName: string, limit: number = 3): Promise<Record<string, any>[]> {
  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await sql.connect(buildPoolConfig(config));
    const safeName = sanitizeIdentifier(tableName);
    const safeSchema = sanitizeIdentifier(schema);
    const result = await pool.request().query(`SELECT TOP ${limit} * FROM [${safeSchema}].[${safeName}]`);
    return result.recordset || [];
  } catch {
    return [];
  } finally {
    if (pool) await pool.close();
  }
}

function injectTopIfMissing(sqlText: string, maxRows: number): string {
  const upper = sqlText.toUpperCase().trim();
  if (upper.includes('TOP ') || upper.includes('TOP(')) {
    return sqlText;
  }
  return sqlText.replace(/^SELECT\b/i, `SELECT TOP ${maxRows}`);
}

export async function executeQuery(
  config: ConnectionConfig,
  sqlText: string,
  maxRows: number = 1000
): Promise<{ rows: Record<string, any>[]; columns: string[]; types: Record<string, string>; rowCount: number; executionTimeMs: number }> {
  const validation = validateSqlReadOnly(sqlText);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const safeSql = injectTopIfMissing(sqlText, maxRows);
  let pool: sql.ConnectionPool | null = null;

  try {
    const poolConfig = buildPoolConfig(config);
    poolConfig.options = { ...poolConfig.options, readOnlyIntent: true };
    pool = await sql.connect(poolConfig);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    const startTime = Date.now();
    try {
      const request = new sql.Request(transaction);
      const result = await request.query(safeSql);
      const executionTimeMs = Date.now() - startTime;

      const rows = result.recordset || [];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      const types: Record<string, string> = {};
      if (result.recordset?.columns) {
        for (const [colName, colInfo] of Object.entries(result.recordset.columns as Record<string, any>)) {
          types[colName] = colInfo.type?.declaration || 'unknown';
        }
      }

      return { rows, columns, types, rowCount: rows.length, executionTimeMs };
    } finally {
      await transaction.rollback();
    }
  } finally {
    if (pool) await pool.close();
  }
}
