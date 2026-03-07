import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { schemaToPromptText, ConnectionConfig, SchemaTable } from '@/utils/mssql/connection';
import { fetchSchema as fetchSqliteSchema, fetchSampleRows as fetchSqliteSampleRows } from '@/utils/sqlite/connection';
import { generateSemanticYaml } from '@/utils/ai/generate-semantic-yaml';

const MAX_TABLES = 30;
const SAMPLE_ROWS_PER_TABLE = 5;

export async function POST(req: Request) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { connectionId } = body;

  if (!connectionId) {
    return Response.json({ error: 'Missing connectionId' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: conn, error: connError } = await dbAdmin
    .from('db_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .single();

  if (connError || !conn) {
    return Response.json({ error: 'Connection not found' }, { status: 404 });
  }

  const isSqlite = conn.db_type === 'sqlite';
  const encryptionKey = process.env.DB_CONNECTIONS_ENCRYPTION_KEY;
  let mssqlConfig: ConnectionConfig | null = null;

  if (!isSqlite) {
    let password: string | undefined;
    if (conn.password_encrypted && encryptionKey) {
      const { data: decrypted } = await dbAdmin.rpc('decrypt_text', {
        encrypted_text: conn.password_encrypted,
        encryption_key: encryptionKey,
      });
      if (decrypted) password = decrypted;
    }
    mssqlConfig = {
      server: conn.server,
      port: conn.port,
      database: conn.database_name,
      username: conn.username,
      password,
      domain: conn.domain,
      authType: conn.auth_type,
      encrypt: conn.encrypt,
      trustServerCertificate: conn.trust_server_certificate,
    };
  }

  // Fetch schema
  let schema: SchemaTable[];
  if (isSqlite) {
    schema = fetchSqliteSchema(conn.file_path);
  } else {
    const { fetchSchema } = await import('@/utils/mssql/connection');
    schema = await fetchSchema(mssqlConfig!);
  }

  // Cap at MAX_TABLES
  const tablesToProcess = schema.slice(0, MAX_TABLES);

  // Fetch sample rows per table
  const sampleData: { tableName: string; rows: Record<string, any>[] }[] = [];
  for (const table of tablesToProcess) {
    try {
      let rows: Record<string, any>[];
      if (isSqlite) {
        rows = fetchSqliteSampleRows(conn.file_path, table.name, SAMPLE_ROWS_PER_TABLE);
      } else {
        const { fetchSampleRows: fetchMssqlSampleRows } = await import('@/utils/mssql/connection');
        rows = await fetchMssqlSampleRows(mssqlConfig!, table.schema, table.name, SAMPLE_ROWS_PER_TABLE);
      }
      sampleData.push({ tableName: table.name, rows });
    } catch {
      sampleData.push({ tableName: table.name, rows: [] });
    }
  }

  // Generate YAML
  const schemaForYaml = tablesToProcess.map(t => ({
    name: t.name,
    columns: t.columns.map(c => ({ name: c.name, type: c.type })),
  }));

  const yamlContent = generateSemanticYaml(schemaForYaml, sampleData);

  return Response.json({ yaml: yamlContent });
}
