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

/**
 * Get the mssql module — uses msnodesqlv8 native driver for Windows integrated
 * auth when available (Windows only), otherwise falls back to tedious.
 */
function getNativeDriver(): typeof sql | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('mssql/msnodesqlv8');
  } catch {
    return null;
  }
}

/** Open an independent connection pool using the best available driver. */
async function openPool(config: sql.config, authType: 'sql' | 'windows'): Promise<sql.ConnectionPool> {
  if (authType === 'windows') {
    const native = getNativeDriver();
    if (native) {
      const pool = new native.ConnectionPool(config);
      return pool.connect();
    }
  }
  const pool = new sql.ConnectionPool(config);
  return pool.connect();
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

/**
 * Parse a server string that may contain an instance name or port.
 * Formats: "server", "server\\instance", "server,port"
 */
function parseServerString(input: string): { server: string; port?: number; instanceName?: string } {
  // server,port format
  const commaIdx = input.indexOf(',');
  if (commaIdx !== -1) {
    const server = input.slice(0, commaIdx).trim();
    const port = parseInt(input.slice(commaIdx + 1).trim(), 10);
    return { server, ...(Number.isFinite(port) ? { port } : {}) };
  }

  // server\instance format
  const slashIdx = input.indexOf('\\');
  if (slashIdx !== -1) {
    const server = input.slice(0, slashIdx).trim();
    const instanceName = input.slice(slashIdx + 1).trim();
    return { server, instanceName };
  }

  return { server: input.trim() };
}

export function buildPoolConfig(config: ConnectionConfig): sql.config {
  const parsed = parseServerString(config.server);

  const hasDatabase = config.database && config.database !== 'default';

  // When using a named instance, omit port so SQL Browser resolves it dynamically
  const usePort = parsed.port ?? (parsed.instanceName ? undefined : config.port);

  const poolConfig: sql.config = {
    server: parsed.server,
    ...(usePort != null ? { port: usePort } : {}),
    ...(hasDatabase ? { database: config.database } : {}),
    options: {
      encrypt: config.encrypt ?? true,
      trustServerCertificate: config.trustServerCertificate ?? false,
      ...(parsed.instanceName ? { instanceName: parsed.instanceName } : {}),
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
    const native = getNativeDriver();
    if (native) {
      // True Windows integrated auth via msnodesqlv8 — build ODBC connection string
      const serverPart = parsed.instanceName
        ? `${parsed.server}\\${parsed.instanceName}`
        : usePort != null
          ? `${parsed.server},${usePort}`
          : parsed.server;
      const parts = [
        'Driver={ODBC Driver 17 for SQL Server}',
        `Server=${serverPart}`,
        'Trusted_Connection=Yes',
      ];
      if (hasDatabase) parts.push(`Database=${config.database}`);
      if (config.encrypt ?? true) parts.push('Encrypt=Yes');
      if (config.trustServerCertificate) parts.push('TrustServerCertificate=Yes');
      (poolConfig as any).connectionString = parts.join(';');
    } else {
      // Fallback: NTLM via tedious — requires explicit credentials
      if (config.domain) poolConfig.domain = config.domain;
      poolConfig.user = config.username;
      poolConfig.password = config.password;
    }
  } else {
    poolConfig.user = config.username;
    poolConfig.password = config.password;
  }

  return poolConfig;
}

export async function testConnection(config: ConnectionConfig): Promise<{ success: boolean; version?: string; error?: string }> {
  let pool: sql.ConnectionPool | null = null;
  try {
    pool = await openPool(buildPoolConfig(config), config.authType);
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
    pool = await openPool(buildPoolConfig(config), config.authType);

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

export function schemaToPromptText(schema: SchemaTable[], dialect?: 'tsql' | 'sqlite'): string {
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
    // Use SQLite-friendly format (just table name) vs T-SQL format ([schema].[table])
    const header = dialect === 'sqlite'
      ? safeTableName
      : `[${safeSchema}].[${safeTableName}]`;
    const parts = [header, cols];
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
    pool = await openPool(buildPoolConfig(config), config.authType);
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
    pool = await openPool(poolConfig, config.authType);

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
