import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { getModel } from '@/utils/ai/provider';
import { executeQuery as executeMssql, schemaToPromptText, ConnectionConfig, SchemaTable } from '@/utils/mssql/connection';
import { executeQuery as executeSqlite, fetchSchema as fetchSqliteSchema } from '@/utils/sqlite/connection';
import {
  buildSqlGenerationSystemPromptWithContext,
  buildMultiChartSuggestionSystemPrompt,
  buildChartSuggestionUserPrompt,
  buildSessionTitlePrompt,
  buildConversationContext,
} from '@/utils/ai/data-explorer-prompts';

// Reuse the schema cache
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
  const { question, connectionId, sessionId } = body;

  if (!question || !connectionId) {
    return new Response('Missing question or connectionId', { status: 400 });
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

        // 3. Resolve AI model
        const { data: settings } = await dbAdmin
          .from('user_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        const provider = settings?.selected_provider || 'ollama';
        const modelId = settings?.selected_model || 'llama3.2:1b';

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

        const schemaText = schemaToPromptText(schema);

        // 4. Conversation context
        let conversationContext = '';
        if (sessionId) {
          const { data: prevMessages } = await dbAdmin
            .from('data_explorer_messages')
            .select('question, sql_query, row_count')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false })
            .limit(5);

          if (prevMessages && prevMessages.length > 0) {
            conversationContext = buildConversationContext(prevMessages.reverse());
          }
        }

        // 5. Generate SQL
        sendEvent(controller, 'status', { step: 'generating_sql', message: 'Generating SQL...' });

        const dialectLabel = dialect === 'sqlite' ? 'SQLite' : 'T-SQL';
        const sqlResult = await generateText({
          model,
          system: buildSqlGenerationSystemPromptWithContext(schemaText, dialect, conversationContext),
          prompt: `Generate a ${dialectLabel} query for: ${question}\n\nRespond with ONLY the SQL query, nothing else.`,
        });

        let sqlQuery = sqlResult.text.trim();
        sqlQuery = sqlQuery.replace(/^```(?:sql)?\s*/i, '').replace(/\s*```$/i, '').trim();

        sendEvent(controller, 'sql', { sql: sqlQuery });

        // 6. Execute SQL
        sendEvent(controller, 'status', { step: 'executing', message: 'Running query...' });

        let results: { rows: Record<string, any>[]; columns: string[]; types: Record<string, string>; rowCount: number; executionTimeMs: number };
        try {
          if (isSqlite) {
            results = executeSqlite(conn.file_path, sqlQuery);
          } else {
            results = await executeMssql(mssqlConfig!, sqlQuery);
          }
        } catch (err: any) {
          sendEvent(controller, 'error', { message: `Query execution failed: ${err.message}`, sql: sqlQuery });
          // Still save the message
          let activeSessionId = sessionId;
          if (!activeSessionId) {
            const { data: newSession } = await dbAdmin
              .from('data_explorer_sessions')
              .insert({ user_id: user.id, connection_id: connectionId, title: question.substring(0, 50) })
              .select('id')
              .single();
            if (newSession) activeSessionId = newSession.id;
          }
          if (activeSessionId) {
            await dbAdmin.from('data_explorer_messages').insert({
              session_id: activeSessionId,
              question,
              sql_query: sqlQuery,
              error: `Query execution failed: ${err.message}`,
              message_type: 'query',
            });
          }
          sendEvent(controller, 'complete', { sessionId: activeSessionId });
          controller.close();
          return;
        }

        sendEvent(controller, 'results', {
          results: {
            rows: results.rows,
            columns: results.columns,
            types: results.types,
            rowCount: results.rowCount,
            executionTimeMs: results.executionTimeMs,
          },
        });

        // 7. Generate explanation + charts in parallel
        sendEvent(controller, 'status', { step: 'analyzing', message: 'Analyzing results...' });

        const explPromise = generateText({
          model,
          prompt: `In one sentence, explain what this SQL query does:\n${sqlQuery}`,
        }).then(r => r.text.trim()).catch(() => 'Query executed.');

        let chartPromise: Promise<{ chartConfig: any; chartConfigs: any[] | null }> = Promise.resolve({ chartConfig: null, chartConfigs: null });
        if (results.rows.length > 0) {
          chartPromise = generateText({
            model,
            system: buildMultiChartSuggestionSystemPrompt(),
            prompt: buildChartSuggestionUserPrompt(
              question,
              results.columns,
              results.types,
              results.rows,
              results.rowCount,
            ),
          }).then(r => {
            let chartText = r.text.trim();
            chartText = chartText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            const parsed = JSON.parse(chartText);
            if (Array.isArray(parsed)) {
              return { chartConfig: parsed[0] || null, chartConfigs: parsed };
            }
            return { chartConfig: parsed, chartConfigs: [parsed] };
          }).catch(() => ({ chartConfig: null, chartConfigs: null }));
        }

        const [explanation, charts] = await Promise.all([explPromise, chartPromise]);

        sendEvent(controller, 'explanation', { explanation });
        sendEvent(controller, 'charts', { chartConfig: charts.chartConfig, chartConfigs: charts.chartConfigs });

        // 8. Save to database
        let activeSessionId = sessionId;
        if (!activeSessionId) {
          const { data: newSession } = await dbAdmin
            .from('data_explorer_sessions')
            .insert({ user_id: user.id, connection_id: connectionId, title: question.substring(0, 50) })
            .select('id')
            .single();
          if (newSession) activeSessionId = newSession.id;
        }

        if (activeSessionId) {
          await dbAdmin.from('data_explorer_messages').insert({
            session_id: activeSessionId,
            question,
            sql_query: sqlQuery,
            explanation,
            results: { rows: results.rows.slice(0, 100), columns: results.columns },
            chart_config: charts.chartConfig,
            chart_configs: charts.chartConfigs,
            execution_time_ms: results.executionTimeMs,
            row_count: results.rowCount,
            message_type: 'query',
          });

          // Generate AI title
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

  const result = await generateText({
    model,
    prompt: buildSessionTitlePrompt(questions),
  });

  const title = result.text.trim().replace(/^["']|["']$/g, '');
  if (title && title.length > 0 && title.length <= 100) {
    await dbAdmin
      .from('data_explorer_sessions')
      .update({ ai_title: title, title })
      .eq('id', sessionId);
  }
}
