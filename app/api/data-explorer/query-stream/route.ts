import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateText, streamText } from 'ai';
import { getModel } from '@/utils/ai/provider';
import { executeQuery as executeMssql, schemaToPromptText, ConnectionConfig, SchemaTable, fetchSampleRows as fetchMssqlSampleRows } from '@/utils/mssql/connection';
import { executeQuery as executeSqlite, fetchSchema as fetchSqliteSchema, fetchSampleRows as fetchSqliteSampleRows } from '@/utils/sqlite/connection';
import {
  buildSqlGenerationSystemPromptWithContext,
  buildSessionTitlePrompt,
  buildConversationContext,
  buildSqlRetryPrompt,
  categorizeError,
  wrapWithDomainContext,
} from '@/utils/ai/data-explorer-prompts';
import { validateSqlSyntax } from '@/utils/ai/sql-validator';
import { detectChartType, isSimpleQuery } from '@/utils/ai/chart-detector';
import { loadSemanticContext, loadSemanticContextFromString, findMetadataPath } from '@/utils/ai/semantic-context';
import { buildDescriptionComments, enrichSchemaWithProfiles, TableMetadataRow } from '@/utils/ai/catalog-builder';

// Reuse the schema cache
const schemaCache = new Map<string, { schema: SchemaTable[]; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function sendEvent(controller: ReadableStreamDefaultController, stage: string, data: any) {
  const chunk = `data: ${JSON.stringify({ stage, data })}\n\n`;
  controller.enqueue(new TextEncoder().encode(chunk));
}

/** Send SSE comment heartbeats to keep the connection alive during long AI calls. */
function startHeartbeat(controller: ReadableStreamDefaultController, intervalMs = 5000) {
  const id = setInterval(() => {
    try { controller.enqueue(new TextEncoder().encode(': heartbeat\n\n')); } catch { clearInterval(id); }
  }, intervalMs);
  return () => clearInterval(id);
}

/** Run streamText and return the full text, keeping the SSE connection alive via heartbeat. */
async function streamTextWithHeartbeat(
  controller: ReadableStreamDefaultController,
  opts: Parameters<typeof streamText>[0],
) {
  const stopHeartbeat = startHeartbeat(controller);
  try {
    const result = streamText(opts);
    return await result.text;
  } finally {
    stopHeartbeat();
  }
}

export async function POST(req: Request) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { question, connectionId, sessionId, agentId } = body;

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

        let schemaText = schemaToPromptText(schema, dialect);

        // 3a-bis. Fetch table descriptions and column profiles
        const { data: metadataRows } = await dbAdmin
          .from('table_metadata')
          .select('table_schema, table_name, auto_description, user_description, column_profiles')
          .eq('connection_id', connectionId)
          .eq('user_id', user.id);

        if (metadataRows && metadataRows.length > 0) {
          const descBlock = buildDescriptionComments(metadataRows as unknown as TableMetadataRow[]);
          if (descBlock) {
            schemaText = descBlock + '\n\n' + schemaText;
          }

          // Enrich schema with column profile stats
          const profileMap: Record<string, Record<string, any>> = {};
          for (const row of metadataRows) {
            if (row.column_profiles && typeof row.column_profiles === 'object') {
              profileMap[row.table_name] = row.column_profiles as Record<string, any>;
            }
          }
          if (Object.keys(profileMap).length > 0) {
            schemaText = enrichSchemaWithProfiles(schemaText, profileMap);
          }
        }

        // 3a. Load semantic context for any connection type
        let semanticContext: string | null = null;
        if (isSqlite && conn.file_path) {
          const metadataPath = findMetadataPath(conn.file_path);
          if (metadataPath) {
            semanticContext = loadSemanticContext(metadataPath);
          }
        }
        // Also check DB-stored semantic context (works for MSSQL and SQLite)
        if (!semanticContext && conn.semantic_context) {
          semanticContext = loadSemanticContextFromString(conn.semantic_context);
        }

        // 3b. Fetch sample rows (capped at 15 tables)
        const tablesToSample = schema.slice(0, 15);
        const sampleTexts: string[] = [];
        for (const table of tablesToSample) {
          try {
            let sampleRows: Record<string, any>[];
            if (isSqlite) {
              sampleRows = fetchSqliteSampleRows(conn.file_path, table.name, 3);
            } else {
              sampleRows = await fetchMssqlSampleRows(mssqlConfig!, table.schema, table.name, 3);
            }
            if (sampleRows.length > 0) {
              sampleTexts.push(`Sample rows from ${table.name}: ${JSON.stringify(sampleRows)}`);
            }
          } catch {
            // Skip tables that fail
          }
        }
        if (sampleTexts.length > 0) {
          schemaText += '\n\n## Sample Data\n' + sampleTexts.join('\n');
        }

        // 3c. Fetch agent domain context
        let domainContext: string | null = null;
        // Check session for agent_id, or use agentId from body
        let resolvedAgentId = agentId || null;
        if (sessionId && !resolvedAgentId) {
          const { data: existingSession } = await dbAdmin
            .from('data_explorer_sessions')
            .select('agent_id')
            .eq('id', sessionId)
            .single();
          if (existingSession?.agent_id) resolvedAgentId = existingSession.agent_id;
        }
        if (resolvedAgentId) {
          const { data: agent } = await dbAdmin
            .from('installed_agents')
            .select('system_prompt')
            .eq('id', resolvedAgentId)
            .single();
          if (agent?.system_prompt) domainContext = agent.system_prompt;
        }

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
            conversationContext = buildConversationContext(prevMessages.reverse(), 4000, question);
          }
        }

        // 5. Generate SQL with retry loop (up to 3 attempts)
        const dialectLabel = dialect === 'sqlite' ? 'SQLite' : 'T-SQL';
        let sqlSystemPrompt = wrapWithDomainContext(buildSqlGenerationSystemPromptWithContext(schemaText, dialect, conversationContext), domainContext);
        if (semanticContext) {
          sqlSystemPrompt = `## Semantic Context\n${semanticContext}\n\n---\n\n${sqlSystemPrompt}`;
        }

        const MAX_RETRIES = 3;
        let sqlQuery = '';
        let results: { rows: Record<string, any>[]; columns: string[]; types: Record<string, string>; rowCount: number; executionTimeMs: number } | null = null;
        let lastError: string | null = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          // Generate SQL
          if (attempt === 1) {
            sendEvent(controller, 'status', { step: 'generating_sql', message: 'Generating SQL...' });
          } else {
            sendEvent(controller, 'status', { step: 'retrying', message: `Fixing SQL (attempt ${attempt})...` });
          }

          const prompt = attempt === 1
            ? `Generate a ${dialectLabel} query for: ${question}\n\nRespond with ONLY the SQL query, nothing else.`
            : buildSqlRetryPrompt(question, sqlQuery, lastError!, attempt, dialect);

          const sqlText = await streamTextWithHeartbeat(controller, {
            model,
            system: sqlSystemPrompt,
            prompt,
          });

          sqlQuery = sqlText.trim().replace(/^```(?:sql)?\s*/i, '').replace(/\s*```$/i, '').trim();
          sendEvent(controller, 'sql', { sql: sqlQuery });

          // Pre-validate syntax
          const validation = validateSqlSyntax(sqlQuery, dialect);
          if (!validation.valid) {
            lastError = `SQL syntax error: ${validation.error}`;
            sendEvent(controller, 'status', { step: 'retrying', message: `Syntax error detected, retrying...` });
            continue;
          }

          // Execute SQL
          sendEvent(controller, 'status', { step: 'executing', message: 'Running query...' });
          try {
            if (isSqlite) {
              results = executeSqlite(conn.file_path, sqlQuery);
            } else {
              results = await executeMssql(mssqlConfig!, sqlQuery);
            }
            break; // Success — exit retry loop
          } catch (err: any) {
            const categorized = categorizeError(err);
            lastError = categorized.message;

            if (attempt === MAX_RETRIES) {
              // Final attempt failed
              sendEvent(controller, 'error', {
                message: `Query execution failed: ${categorized.message}`,
                suggestion: categorized.suggestion,
                sql: sqlQuery,
              });
              let activeSessionId = sessionId;
              if (!activeSessionId) {
                const sessionInsert: any = { user_id: user.id, connection_id: connectionId, title: question.substring(0, 50) };
                if (resolvedAgentId) sessionInsert.agent_id = resolvedAgentId;
                const { data: newSession } = await dbAdmin
                  .from('data_explorer_sessions')
                  .insert(sessionInsert)
                  .select('id')
                  .single();
                if (newSession) activeSessionId = newSession.id;
              }
              if (activeSessionId) {
                await dbAdmin.from('data_explorer_messages').insert({
                  session_id: activeSessionId,
                  question,
                  sql_query: sqlQuery,
                  error: `Query execution failed: ${categorized.message}`,
                  message_type: 'query',
                });
              }
              sendEvent(controller, 'complete', { sessionId: activeSessionId });
              controller.close();
              return;
            }
          }
        }

        if (!results) {
          sendEvent(controller, 'error', { message: 'All retry attempts failed' });
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

        // 7. Generate explanation (chat mode skips charts for speed)
        sendEvent(controller, 'status', { step: 'analyzing', message: 'Summarizing...' });

        const resultPreview = JSON.stringify(results.rows.slice(0, 10));
        const explanation = await streamTextWithHeartbeat(controller, {
          model,
          prompt: `The user asked: "${question}"\n\nSQL query:\n${sqlQuery}\n\nResults (${results.rowCount} row${results.rowCount === 1 ? '' : 's'}):\n${resultPreview}\n\nAnswer the user's question directly using the results. Be concise (1-2 sentences). Lead with the answer, not what the query does.`,
        }).then(t => t.trim()).catch(() => 'Query executed.');

        sendEvent(controller, 'explanation', { explanation });

        // 7b. Deterministic chart detection (zero-latency, no LLM call)
        let chartConfig: any = null;
        let chartConfigs: any[] | null = null;
        if (results.rows.length > 0 && results.columns.length >= 1) {
          const detected = detectChartType(results.columns, results.types, results.rows, results.rowCount);
          chartConfig = { ...detected };
          chartConfigs = [chartConfig];
          sendEvent(controller, 'charts', { chartConfig, chartConfigs });
        }

        // 8. Save to database
        let activeSessionId = sessionId;
        if (!activeSessionId) {
          const sessionInsert: any = { user_id: user.id, connection_id: connectionId, title: question.substring(0, 50) };
          if (resolvedAgentId) sessionInsert.agent_id = resolvedAgentId;
          const { data: newSession } = await dbAdmin
            .from('data_explorer_sessions')
            .insert(sessionInsert)
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
