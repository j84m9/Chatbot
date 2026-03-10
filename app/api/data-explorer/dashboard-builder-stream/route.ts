import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateText, stepCountIs } from 'ai';
import { getModel } from '@/utils/ai/provider';
import { schemaToPromptText, ConnectionConfig, SchemaTable } from '@/utils/mssql/connection';
import { fetchSchema as fetchSqliteSchema } from '@/utils/sqlite/connection';
import { buildDashboardAgentSystemPrompt } from '@/utils/ai/data-explorer-prompts';
import { createDashboardAgentTools } from '@/utils/ai/data-explorer-tools';
import { routeTables } from '@/utils/ai/table-router';
import { buildCatalog, buildCatalogText, buildDescriptionComments, TableMetadataRow } from '@/utils/ai/catalog-builder';
import { buildFKGraph } from '@/utils/ai/fk-graph';
import { loadSemanticContext, loadSemanticContextFromString, findMetadataPath, formatFewShotExamples } from '@/utils/ai/semantic-context';

const schemaCache = new Map<string, { schema: SchemaTable[]; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

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
  const { request: userRequest, connectionId, dashboardId } = body;

  if (!userRequest || !connectionId) {
    return new Response('Missing request or connectionId', { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const stopHeartbeat = startHeartbeat(controller);

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
          stopHeartbeat();
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

        // 3a. Load semantic context for any connection type
        let semanticContext: string | null = null;
        if (isSqlite && conn.file_path) {
          const metadataPath = findMetadataPath(conn.file_path);
          if (metadataPath) {
            semanticContext = loadSemanticContext(metadataPath);
          }
        }
        if (!semanticContext && conn.semantic_context) {
          semanticContext = loadSemanticContextFromString(conn.semantic_context);
        }

        // 3b. Load few-shot examples
        let fewShotBlock: string | null = null;
        if (conn.few_shot_examples) {
          fewShotBlock = formatFewShotExamples(conn.few_shot_examples);
        }

        // 4. Catalog mode for large databases
        sendEvent(controller, 'status', { message: 'Agent is exploring the database...' });

        const { data: metadataRows } = await dbAdmin
          .from('table_metadata')
          .select('*')
          .eq('connection_id', connectionId)
          .eq('user_id', user.id);
        const metadata: TableMetadataRow[] = metadataRows || [];

        const catalogMode = schema.length > 30;
        let catalogText = schemaText;
        let catalog;
        let fkGraph;

        if (catalogMode) {
          catalog = buildCatalog(schema, metadata);
          fkGraph = buildFKGraph(schema);
          catalogText = buildCatalogText(schema, metadata);
        } else if (metadata.length > 0) {
          const descBlock = buildDescriptionComments(metadata);
          if (descBlock) {
            catalogText = descBlock + '\n\n' + catalogText;
          }
        }

        // 5. Create dashboard agent tools
        const boundSendEvent = (stage: string, data: any) => sendEvent(controller, stage, data);
        const tools = createDashboardAgentTools({
          dialect,
          schema,
          mssqlConfig,
          filePath: isSqlite ? conn.file_path : undefined,
          catalogMode,
          catalog,
          fkGraph,
          dbAdmin,
          userId: user.id,
          connectionId,
          dashboardId,
          model,
          sendEvent: boundSendEvent,
        });

        // 6. Build system prompt and configure agent loop
        let systemPrompt = buildDashboardAgentSystemPrompt(dialect, catalogText, semanticContext, catalogMode);
        if (fewShotBlock) {
          systemPrompt = `${fewShotBlock}\n\n---\n\n${systemPrompt}`;
        }
        let maxSteps = 15;
        let agentPrompt = userRequest;

        // Pre-filter tables in catalog mode
        if (catalogMode && catalog) {
          sendEvent(controller, 'status', { message: 'Identifying relevant tables...' });

          const preFilterResult = await routeTables({
            model,
            question: userRequest,
            catalogText,
            schema,
            catalog,
            dialect,
          });

          if (preFilterResult.didRoute && preFilterResult.tableNames) {
            const tableList = preFilterResult.tableNames.join(', ');
            agentPrompt = `${userRequest}\n\n[Routing hint: The tables most likely relevant are: ${tableList}. Start by calling get_schema with these table names.]`;
          }
          maxSteps = 18;
        }

        // 7. Run agent loop
        const agentSteps: any[] = [];

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

            sendEvent(controller, 'status', { message: `Agent step ${stepNumber + 1}...` });
          },
        });

        // 8. Complete
        sendEvent(controller, 'complete', { summary: result.text || 'Dashboard built successfully.' });
      } catch (err: any) {
        sendEvent(controller, 'error', { message: err.message || 'Dashboard build failed' });
      } finally {
        stopHeartbeat();
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
