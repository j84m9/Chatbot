import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateText, streamText, stepCountIs } from 'ai';
import { getModel } from '@/utils/ai/provider';
import { schemaToPromptText, ConnectionConfig, SchemaTable } from '@/utils/mssql/connection';
import { fetchSchema as fetchSqliteSchema, executeQuery as executeSqlite } from '@/utils/sqlite/connection';
import {
  buildMultiChartSuggestionSystemPrompt,
  buildChartSuggestionUserPrompt,
  buildSessionTitlePrompt,
  buildConversationContext,
  buildEnhancedInsightSystemPrompt,
  buildEnhancedInsightUserPrompt,
} from '@/utils/ai/data-explorer-prompts';
import { createDataExplorerTools } from '@/utils/ai/data-explorer-tools';
import { buildAgentSystemPrompt } from '@/utils/ai/data-explorer-agent-prompt';
import { routeTables } from '@/utils/ai/table-router';
import { buildCatalog, buildCatalogText, TableMetadataRow } from '@/utils/ai/catalog-builder';
import { buildFKGraph } from '@/utils/ai/fk-graph';

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

        const schemaText = schemaToPromptText(schema, dialect);

        // 3b. Fetch agent domain context
        let domainContext: string | null = null;
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
            conversationContext = buildConversationContext(prevMessages.reverse());
          }
        }

        // 5. Create tools and run agent loop
        sendEvent(controller, 'status', { step: 'agent_thinking', message: 'Agent is thinking...' });

        const catalogMode = schema.length > 30;
        let catalogText = schemaText;
        let catalog;
        let fkGraph;

        if (catalogMode) {
          // Fetch table metadata for catalog mode
          const { data: metadataRows } = await dbAdmin
            .from('table_metadata')
            .select('*')
            .eq('connection_id', connectionId)
            .eq('user_id', user.id);

          const metadata: TableMetadataRow[] = metadataRows || [];
          catalog = buildCatalog(schema, metadata);
          fkGraph = buildFKGraph(schema);
          catalogText = buildCatalogText(schema, metadata);
        }

        const tools = createDataExplorerTools({
          dialect,
          schema,
          mssqlConfig,
          filePath: isSqlite ? conn.file_path : undefined,
          catalogMode,
          catalog,
          fkGraph,
        });

        // Pre-filter: identify relevant tables upfront in catalog mode
        let systemPrompt: string;
        let maxSteps: number;
        let agentPrompt = question;

        if (catalogMode && catalog) {
          sendEvent(controller, 'status', { step: 'agent_thinking', message: 'Identifying relevant tables...' });

          const preFilterResult = await routeTables({
            model,
            question,
            catalogText,
            schema,
            catalog,
            dialect,
            conversationContext: conversationContext || undefined,
          });

          // Always use discovery-first catalog prompt — DDL in tool results is
          // far more reliable than DDL in the system prompt for smaller models.
          systemPrompt = buildAgentSystemPrompt(dialect, catalogText, conversationContext, domainContext, catalogMode);

          if (preFilterResult.didRoute && preFilterResult.tableNames) {
            // Pre-filter succeeded — give the agent a routing hint so it can
            // skip search_tables and jump straight to get_schema
            sendEvent(controller, 'agent_step', {
              stepNumber: -1,
              type: 'tool_result' as const,
              toolName: 'table_router',
              toolResult: { tables: preFilterResult.tableNames, message: `Pre-selected tables: ${preFilterResult.tableNames.join(', ')}` },
            });
            const tableList = preFilterResult.tableNames.join(', ');
            agentPrompt = `${question}\n\n[Routing hint: The tables most likely relevant to this question are: ${tableList}. Start by calling get_schema with these table names to load their full column details, then write your SQL.]`;
            maxSteps = 10;
          } else {
            // Pre-filter failed — full discovery with 12 steps
            maxSteps = 12;
          }
        } else {
          systemPrompt = buildAgentSystemPrompt(dialect, schemaText, conversationContext, domainContext, false);
          maxSteps = 5;
        }

        const agentSteps: any[] = [];
        let lastSuccessfulResult: any = null;
        let lastSuccessfulSql: string | null = null;
        const allSuccessfulSqls: string[] = [];

        const stopAgentHeartbeat = startHeartbeat(controller);
        const result = await generateText({
          model,
          system: systemPrompt,
          prompt: agentPrompt,
          tools,
          stopWhen: stepCountIs(maxSteps),
          onStepFinish: (event) => {
            const stepNumber = event.stepNumber;

            // Process tool calls
            for (const toolCall of event.toolCalls) {
              const stepEvent = {
                stepNumber,
                type: 'tool_call' as const,
                toolName: toolCall.toolName,
                toolInput: (toolCall as any).input,
              };
              agentSteps.push(stepEvent);
              sendEvent(controller, 'agent_step', stepEvent);
            }

            // Process tool results
            for (const toolResult of event.toolResults) {
              const resultData = (toolResult as any).output as any;
              const stepEvent = {
                stepNumber,
                type: 'tool_result' as const,
                toolName: toolResult.toolName,
                toolResult: resultData,
              };
              agentSteps.push(stepEvent);
              sendEvent(controller, 'agent_step', stepEvent);

              // Track successful SQL executions
              if (toolResult.toolName === 'execute_sql' && resultData?.success) {
                lastSuccessfulResult = resultData;
                // Find the corresponding tool call to get the SQL
                const matchingCall = agentSteps.find(
                  s => s.type === 'tool_call' && s.toolName === 'execute_sql' && s.stepNumber === stepNumber
                );
                if (matchingCall?.toolInput?.sql) {
                  lastSuccessfulSql = matchingCall.toolInput.sql;
                  allSuccessfulSqls.push(matchingCall.toolInput.sql);
                }
              }

              // Track error recovery
              if (toolResult.toolName === 'execute_sql' && !resultData?.success) {
                const errorStep = {
                  stepNumber,
                  type: 'error_recovery' as const,
                  text: `Error: ${resultData?.error || 'Query failed'}. ${resultData?.suggestion || 'Retrying...'}`,
                };
                agentSteps.push(errorStep);
                sendEvent(controller, 'agent_step', errorStep);
              }
            }

            // Process reasoning text
            if (event.text) {
              const textStep = {
                stepNumber,
                type: 'reasoning' as const,
                text: event.text,
              };
              agentSteps.push(textStep);
              sendEvent(controller, 'agent_step', textStep);
            }

            sendEvent(controller, 'status', { step: 'agent_thinking', message: `Agent step ${stepNumber + 1}...` });
          },
        });

        stopAgentHeartbeat();

        // 5b. Fallback: if no SQL executed successfully, check if the model
        // wrote a tool call as text (common with smaller models after errors).
        // Extract the SQL and execute it directly.
        if (!lastSuccessfulResult) {
          const fallbackSql = extractSqlFromText(result.text);
          if (fallbackSql) {
            try {
              let fallbackResult;
              if (isSqlite) {
                fallbackResult = executeSqlite(conn.file_path, fallbackSql);
              } else if (mssqlConfig) {
                const { executeQuery: execMssql } = await import('@/utils/mssql/connection');
                fallbackResult = await execMssql(mssqlConfig, fallbackSql);
              }
              if (fallbackResult) {
                lastSuccessfulResult = {
                  success: true,
                  rows: fallbackResult.rows.slice(0, 100),
                  columns: fallbackResult.columns,
                  types: fallbackResult.types,
                  rowCount: fallbackResult.rowCount,
                  executionTimeMs: fallbackResult.executionTimeMs,
                };
                lastSuccessfulSql = fallbackSql;
                allSuccessfulSqls.push(fallbackSql);
                sendEvent(controller, 'agent_step', {
                  stepNumber: -1,
                  type: 'tool_result' as const,
                  toolName: 'execute_sql',
                  toolResult: lastSuccessfulResult,
                });
              }
            } catch {
              // Fallback execution failed — continue without results
            }
          }
        }

        // 6. Extract final answer and SQL result
        // Strip hallucinated content: fake tool calls, fake markdown tables,
        // fake code blocks, and fake result tables that small models fabricate
        const finalText = stripHallucinatedContent(result.text);
        const sqlQuery = allSuccessfulSqls.length > 1
          ? allSuccessfulSqls.map((s, i) => `-- Query ${i + 1}\n${s}`).join('\n\n')
          : lastSuccessfulSql;

        if (sqlQuery) {
          sendEvent(controller, 'sql', { sql: sqlQuery });
        }

        if (lastSuccessfulResult) {
          sendEvent(controller, 'results', {
            results: {
              rows: lastSuccessfulResult.rows,
              columns: lastSuccessfulResult.columns,
              types: lastSuccessfulResult.types,
              rowCount: lastSuccessfulResult.rowCount,
              executionTimeMs: lastSuccessfulResult.executionTimeMs,
            },
          });
        }

        // 7. Generate explanation + charts
        sendEvent(controller, 'status', { step: 'analyzing', message: 'Analyzing results...' });

        sendEvent(controller, 'explanation', { explanation: finalText || 'Agent analysis complete.' });

        let chartConfig: any = null;
        let chartConfigs: any[] | null = null;

        if (lastSuccessfulResult && lastSuccessfulResult.rows.length > 0) {
          try {
            const stopChartHeartbeat = startHeartbeat(controller);
            const chartText_ = await streamText({
              model,
              system: buildMultiChartSuggestionSystemPrompt(),
              prompt: buildChartSuggestionUserPrompt(
                question,
                lastSuccessfulResult.columns,
                lastSuccessfulResult.types,
                lastSuccessfulResult.rows,
                lastSuccessfulResult.rowCount,
              ),
            }).text;
            stopChartHeartbeat();
            let chartText = chartText_.trim();
            chartText = chartText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            const parsed = JSON.parse(chartText);
            if (Array.isArray(parsed)) {
              chartConfig = parsed[0] || null;
              chartConfigs = parsed;
            } else {
              chartConfig = parsed;
              chartConfigs = [parsed];
            }
          } catch {
            // Chart generation failed — not critical
          }
        }

        sendEvent(controller, 'charts', { chartConfig, chartConfigs });

        // 7b. Generate enhanced insights
        let insights: string | null = null;
        if (lastSuccessfulResult && lastSuccessfulResult.rows.length > 0) {
          try {
            sendEvent(controller, 'status', { step: 'insights', message: 'Generating data insights...' });
            const insightResult = await generateText({
              model,
              system: buildEnhancedInsightSystemPrompt(),
              prompt: buildEnhancedInsightUserPrompt(
                question,
                lastSuccessfulResult.columns,
                lastSuccessfulResult.types,
                lastSuccessfulResult.rows,
                lastSuccessfulResult.rowCount,
                finalText || '',
              ),
            });
            insights = insightResult.text.trim() || null;
          } catch {
            // Insight generation failed — not critical
          }
        }

        if (insights) {
          sendEvent(controller, 'insights', { insights });
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
            explanation: finalText || 'Agent analysis complete.',
            results: lastSuccessfulResult ? { rows: lastSuccessfulResult.rows.slice(0, 100), columns: lastSuccessfulResult.columns } : null,
            chart_config: chartConfig,
            chart_configs: chartConfigs,
            execution_time_ms: lastSuccessfulResult?.executionTimeMs ?? null,
            row_count: lastSuccessfulResult?.rowCount ?? null,
            message_type: 'agent_query',
            agent_steps: agentSteps,
            insights,
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
        sendEvent(controller, 'error', { message: err.message || 'Agent stream failed' });
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

/**
 * Extract SQL from the model's text output when it writes a tool call as JSON text
 * instead of making a proper structured tool call (common with smaller models).
 */
function extractSqlFromText(text: string): string | null {
  // Try to find a JSON tool call blob: {"name": "execute_sql", "parameters": {"sql": "..."}}
  const marker = '"execute_sql"';
  const idx = text.lastIndexOf(marker);
  if (idx !== -1) {
    const start = text.lastIndexOf('{', idx);
    if (start !== -1) {
      let depth = 0;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') {
          depth--;
          if (depth === 0) {
            try {
              const parsed = JSON.parse(text.substring(start, i + 1));
              if (parsed.parameters?.sql) return parsed.parameters.sql;
            } catch {
              break;
            }
          }
        }
      }
    }
  }

  // Fallback: extract SQL from a markdown code block
  const codeBlock = text.match(/```sql\s*([\s\S]*?)```/i);
  if (codeBlock) return codeBlock[1].trim();

  return null;
}

/**
 * Strip hallucinated content that small models fabricate in their text output:
 * fake tool call JSON blobs, fake markdown result tables, and SQL code blocks
 * (since real results come from actual tool execution, not model text).
 */
function stripHallucinatedContent(text: string): string {
  let cleaned = text;

  // Remove fake JSON tool call blobs: {"name": "...", "parameters": {...}}
  cleaned = cleaned.replace(/```(?:python|json)?\s*\{[\s\S]*?"(?:name|tool_name)"[\s\S]*?\}\s*;?\s*```/gi, '');
  cleaned = cleaned.replace(/\{[\s]*"(?:name|tool_name)"[\s]*:[\s]*"[^"]*"[\s\S]*?"parameters"[\s\S]*?\}\s*;?/g, '');

  // Remove SQL code blocks (the real SQL is shown separately in the UI)
  cleaned = cleaned.replace(/```sql\s*[\s\S]*?```/gi, '');

  // Remove fake markdown tables (rows of | col | col | patterns)
  // Match a header row + separator row + data rows
  cleaned = cleaned.replace(/\n*\|[^\n]+\|\s*\n\|[\s\-:|]+\|\s*\n(?:\|[^\n]+\|\s*\n?)*/g, '');

  // Remove lines like "Here are the results:" that precede fake tables
  cleaned = cleaned.replace(/(?:Here are the results|I'll execute this query|I'll examine the output)[^\n]*\n?/gi, '');

  // Collapse excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned || 'Analysis complete.';
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

  const titleResult = await generateText({
    model,
    prompt: buildSessionTitlePrompt(questions),
  });

  const title = titleResult.text.trim().replace(/^["']|["']$/g, '');
  if (title && title.length > 0 && title.length <= 100) {
    await dbAdmin
      .from('data_explorer_sessions')
      .update({ ai_title: title, title })
      .eq('id', sessionId);
  }
}
