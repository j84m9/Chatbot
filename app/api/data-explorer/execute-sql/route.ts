import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { executeQuery as executeMssql, ConnectionConfig } from '@/utils/mssql/connection';
import { executeQuery as executeSqlite } from '@/utils/sqlite/connection';

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
  const { sql: rawSql, connectionId, sessionId } = body;

  if (!rawSql || !connectionId) {
    return new Response('Missing sql or connectionId', { status: 400 });
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

        // 2. Execute SQL (validateSqlReadOnly is called inside executeQuery)
        sendEvent(controller, 'status', { step: 'executing', message: 'Running query...' });

        let results: { rows: Record<string, any>[]; columns: string[]; types: Record<string, string>; rowCount: number; executionTimeMs: number };
        try {
          if (isSqlite) {
            results = executeSqlite(conn.file_path, rawSql);
          } else {
            results = await executeMssql(mssqlConfig!, rawSql);
          }
        } catch (err: any) {
          sendEvent(controller, 'error', { message: err.message || 'Query execution failed', sql: rawSql });
          // Save failed query
          let activeSessionId = sessionId;
          if (!activeSessionId) {
            const { data: newSession } = await dbAdmin
              .from('data_explorer_sessions')
              .insert({ user_id: user.id, connection_id: connectionId, title: rawSql.substring(0, 50) })
              .select('id')
              .single();
            if (newSession) activeSessionId = newSession.id;
          }
          if (activeSessionId) {
            await dbAdmin.from('data_explorer_messages').insert({
              session_id: activeSessionId,
              question: rawSql,
              sql_query: rawSql,
              error: err.message || 'Query execution failed',
              message_type: 'direct_sql',
            });
          }
          sendEvent(controller, 'complete', { sessionId: activeSessionId });
          controller.close();
          return;
        }

        sendEvent(controller, 'sql', { sql: rawSql });
        sendEvent(controller, 'results', {
          results: {
            rows: results.rows,
            columns: results.columns,
            types: results.types,
            rowCount: results.rowCount,
            executionTimeMs: results.executionTimeMs,
          },
        });

        // 3. Save to database (SQL mode skips charts for speed)
        let activeSessionId = sessionId;
        if (!activeSessionId) {
          const { data: newSession } = await dbAdmin
            .from('data_explorer_sessions')
            .insert({ user_id: user.id, connection_id: connectionId, title: rawSql.substring(0, 50) })
            .select('id')
            .single();
          if (newSession) activeSessionId = newSession.id;
        }

        if (activeSessionId) {
          await dbAdmin.from('data_explorer_messages').insert({
            session_id: activeSessionId,
            question: rawSql,
            sql_query: rawSql,
            results: { rows: results.rows.slice(0, 100), columns: results.columns },
            execution_time_ms: results.executionTimeMs,
            row_count: results.rowCount,
            message_type: 'direct_sql',
          });
        }

        sendEvent(controller, 'complete', { sessionId: activeSessionId });
        controller.close();
      } catch (err: any) {
        sendEvent(controller, 'error', { message: err.message || 'Stream failed' });
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

