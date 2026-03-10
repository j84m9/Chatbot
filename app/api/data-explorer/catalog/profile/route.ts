import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { SchemaTable, ConnectionConfig } from '@/utils/mssql/connection';
import { fetchSchema as fetchSqliteSchema, executeQuery as executeSqlite } from '@/utils/sqlite/connection';
import { profileTable } from '@/utils/ai/table-profiler';

const schemaCache = new Map<string, { schema: SchemaTable[]; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function sendEvent(controller: ReadableStreamDefaultController, stage: string, data: any) {
  const chunk = `data: ${JSON.stringify({ stage, data })}\n\n`;
  controller.enqueue(new TextEncoder().encode(chunk));
}

export async function POST(req: Request) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { connectionId } = body;

  if (!connectionId) {
    return new Response('Missing connectionId', { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const dbAdmin = createAdminClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // 1. Fetch connection
        const { data: conn, error: connError } = await dbAdmin
          .from('db_connections')
          .select('*')
          .eq('id', connectionId)
          .eq('user_id', user.id)
          .single();

        if (connError || !conn) {
          sendEvent(controller, 'error', { message: 'Connection not found' });
          controller.close();
          return;
        }

        const isSqlite = conn.db_type === 'sqlite';
        const dialect: 'tsql' | 'sqlite' = isSqlite ? 'sqlite' : 'tsql';
        const encryptionKey = process.env.DB_CONNECTIONS_ENCRYPTION_KEY;
        let password: string | undefined;
        let mssqlConfig: ConnectionConfig | null = null;

        if (!isSqlite) {
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

        // 2. Get schema
        let schema: SchemaTable[];
        const cached = schemaCache.get(connectionId);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
          schema = cached.schema;
        } else {
          if (isSqlite) {
            schema = fetchSqliteSchema(conn.file_path);
          } else {
            const { fetchSchema } = await import('@/utils/mssql/connection');
            schema = await fetchSchema(mssqlConfig!);
          }
          schemaCache.set(connectionId, { schema, fetchedAt: Date.now() });
        }

        // 3. Profile tables in batches of 5
        sendEvent(controller, 'status', { message: 'Starting table profiling...' });

        // Create execute function for profiler
        const execute = async (sql: string) => {
          if (isSqlite && conn.file_path) {
            const result = executeSqlite(conn.file_path, sql);
            return { rows: result.rows, columns: result.columns };
          } else if (mssqlConfig) {
            const { executeQuery: execMssql } = await import('@/utils/mssql/connection');
            const result = await execMssql(mssqlConfig, sql);
            return { rows: result.rows, columns: result.columns };
          }
          throw new Error('No database connection');
        };

        const batchSize = 5;
        let profiled = 0;
        const totalTables = schema.length;

        for (let i = 0; i < totalTables; i += batchSize) {
          const batch = schema.slice(i, i + batchSize);

          const batchPromises = batch.map(async (table) => {
            try {
              const columns = table.columns.map(c => ({
                name: c.name,
                type: c.type,
              }));

              const profiles = await profileTable(execute, table.name, columns, dialect);

              // Upsert column_profiles into table_metadata
              const { data: existing } = await dbAdmin
                .from('table_metadata')
                .select('id')
                .eq('connection_id', connectionId)
                .eq('user_id', user.id)
                .eq('table_name', table.name)
                .eq('table_schema', table.schema)
                .single();

              if (existing) {
                await dbAdmin
                  .from('table_metadata')
                  .update({ column_profiles: profiles })
                  .eq('id', existing.id);
              } else {
                await dbAdmin
                  .from('table_metadata')
                  .insert({
                    connection_id: connectionId,
                    user_id: user.id,
                    table_name: table.name,
                    table_schema: table.schema,
                    column_profiles: profiles,
                  });
              }

              return { table: table.name, success: true, columnCount: Object.keys(profiles).length };
            } catch (err: any) {
              return { table: table.name, success: false, error: err.message };
            }
          });

          const results = await Promise.all(batchPromises);
          profiled += results.length;

          sendEvent(controller, 'progress', {
            profiled,
            total: totalTables,
            batch: results,
            message: `Profiled ${profiled}/${totalTables} tables...`,
          });
        }

        sendEvent(controller, 'complete', {
          profiled,
          total: totalTables,
          message: `Profiling complete: ${profiled} tables processed.`,
        });
        controller.close();
      } catch (err: any) {
        sendEvent(controller, 'error', { message: err.message || 'Profiling failed' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
