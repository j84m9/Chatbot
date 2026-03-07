import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { streamText } from 'ai';
import { getModel } from '@/utils/ai/provider';
import { executeQuery as executeMssql, ConnectionConfig, SchemaTable } from '@/utils/mssql/connection';
import { executeQuery as executeSqlite } from '@/utils/sqlite/connection';
import {
  buildMultiChartSuggestionSystemPrompt,
  buildChartSuggestionUserPrompt,
  buildSessionTitlePrompt,
} from '@/utils/ai/data-explorer-prompts';

function sendEvent(controller: ReadableStreamDefaultController, stage: string, data: any) {
  const chunk = `data: ${JSON.stringify({ stage, data })}\n\n`;
  controller.enqueue(new TextEncoder().encode(chunk));
}

function startHeartbeat(controller: ReadableStreamDefaultController, intervalMs = 5000) {
  const id = setInterval(() => {
    try { controller.enqueue(new TextEncoder().encode(': heartbeat\n\n')); } catch { clearInterval(id); }
  }, intervalMs);
  return () => clearInterval(id);
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

        // 3. Generate chart suggestions via AI
        sendEvent(controller, 'status', { step: 'analyzing', message: 'Analyzing results...' });

        // Resolve AI model
        const { data: settings } = await dbAdmin
          .from('user_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        const provider = settings?.selected_provider || 'ollama';
        const modelId = settings?.selected_model || 'llama3.2:3b';

        async function decryptApiKey(value: string | null): Promise<string | null> {
          if (!value || !encryptionKey) return value;
          try {
            const { data } = await dbAdmin.rpc('decrypt_text', {
              encrypted_text: value,
              encryption_key: encryptionKey,
            });
            return data || value;
          } catch {
            return value;
          }
        }

        const keyMap: Record<string, string | null> = {
          openai: await decryptApiKey(settings?.openai_api_key),
          anthropic: await decryptApiKey(settings?.anthropic_api_key),
          google: await decryptApiKey(settings?.google_api_key),
        };

        const model = getModel({ provider, model: modelId, apiKey: keyMap[provider] });

        const stopHeartbeat = startHeartbeat(controller);

        let chartPromise: Promise<{ chartConfig: any; chartConfigs: any[] | null }> = Promise.resolve({ chartConfig: null, chartConfigs: null });
        if (results.rows.length > 0) {
          chartPromise = Promise.resolve(streamText({
            model,
            system: buildMultiChartSuggestionSystemPrompt(),
            prompt: buildChartSuggestionUserPrompt(
              rawSql,
              results.columns,
              results.types,
              results.rows,
              results.rowCount,
            ),
          }).text).then(text => {
            let chartText = text.trim();
            chartText = chartText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            const parsed = JSON.parse(chartText);
            if (Array.isArray(parsed)) {
              return { chartConfig: parsed[0] || null, chartConfigs: parsed };
            }
            return { chartConfig: parsed, chartConfigs: [parsed] };
          }).catch(() => ({ chartConfig: null, chartConfigs: null }));
        }

        const charts = await chartPromise;
        stopHeartbeat();

        sendEvent(controller, 'charts', { chartConfig: charts.chartConfig, chartConfigs: charts.chartConfigs });

        // 4. Save to database
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
            chart_config: charts.chartConfig,
            chart_configs: charts.chartConfigs,
            execution_time_ms: results.executionTimeMs,
            row_count: results.rowCount,
            message_type: 'direct_sql',
          });

          // Generate AI title on 1st or 3rd message
          const { count } = await dbAdmin
            .from('data_explorer_messages')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', activeSessionId);

          const msgCount = count || 0;
          if (msgCount === 1 || msgCount === 3) {
            generateSessionTitle(model, activeSessionId, dbAdmin).catch(() => {});
          }
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

async function generateSessionTitle(model: any, sessionId: string, dbAdmin: any) {
  const { data: messages } = await dbAdmin
    .from('data_explorer_messages')
    .select('question')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(5);

  if (!messages || messages.length === 0) return;
  const questions = messages.map((m: any) => m.question);

  const titleText = await streamText({
    model,
    prompt: buildSessionTitlePrompt(questions),
  }).text;

  const title = titleText.trim().replace(/^["']|["']$/g, '');
  if (title && title.length > 0 && title.length <= 100) {
    await dbAdmin
      .from('data_explorer_sessions')
      .update({ ai_title: title, title })
      .eq('id', sessionId);
  }
}
