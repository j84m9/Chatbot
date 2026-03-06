import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateText, streamText, stepCountIs } from 'ai';
import { getModel } from '@/utils/ai/provider';
import { schemaToPromptText, ConnectionConfig, SchemaTable } from '@/utils/mssql/connection';
import { fetchSchema as fetchSqliteSchema } from '@/utils/sqlite/connection';
import {
  buildInsightAgentSystemPrompt,
  buildEnhancedInsightSystemPrompt,
  buildEnhancedInsightUserPrompt,
} from '@/utils/ai/data-explorer-prompts';
import { createDataExplorerTools } from '@/utils/ai/data-explorer-tools';

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
  const { question, connectionId, messageId, existingResults, existingExplanation } = body;

  if (!question || !connectionId || !existingResults) {
    return new Response('Missing required fields', { status: 400 });
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

        // 4. Create tools and run insight agent loop
        sendEvent(controller, 'status', { message: 'Analyzing data patterns...' });

        const tools = createDataExplorerTools({
          dialect,
          schema,
          mssqlConfig,
          filePath: isSqlite ? conn.file_path : undefined,
        });

        const systemPrompt = buildInsightAgentSystemPrompt(dialect, schemaText, existingResults);

        const agentPrompt = existingExplanation
          ? `The user asked: "${question}"\n\nPrevious analysis:\n${existingExplanation}\n\nRun follow-up queries to produce deeper, more detailed insights about this data.`
          : `The user asked: "${question}"\n\nAnalyze the existing results and run follow-up queries to produce detailed insights.`;

        let stepCount = 0;

        const stopAgentHeartbeat = startHeartbeat(controller);
        const result = await generateText({
          model,
          system: systemPrompt,
          prompt: agentPrompt,
          tools,
          stopWhen: stepCountIs(5),
          onStepFinish: (event) => {
            stepCount = event.stepNumber + 1;

            for (const toolCall of event.toolCalls) {
              sendEvent(controller, 'agent_step', {
                stepNumber: event.stepNumber,
                type: 'tool_call',
                toolName: toolCall.toolName,
                toolInput: (toolCall as any).input,
              });
            }

            for (const toolResult of event.toolResults) {
              const resultData = (toolResult as any).output as any;
              sendEvent(controller, 'agent_step', {
                stepNumber: event.stepNumber,
                type: 'tool_result',
                toolName: toolResult.toolName,
                toolResult: resultData,
              });
            }

            sendEvent(controller, 'status', { message: `Agent analysis step ${stepCount}...` });
          },
        });

        stopAgentHeartbeat();

        // 5. Synthesize final insights using enhanced insight prompts
        sendEvent(controller, 'status', { message: 'Synthesizing insights...' });

        const agentAnalysis = result.text || '';
        const combinedExplanation = existingExplanation
          ? `${existingExplanation}\n\nDeeper analysis:\n${agentAnalysis}`
          : agentAnalysis;

        let insights: string | null = null;
        try {
          const stopInsightHeartbeat = startHeartbeat(controller);
          const insightText = await streamText({
            model,
            system: buildEnhancedInsightSystemPrompt(),
            prompt: buildEnhancedInsightUserPrompt(
              question,
              existingResults.columns,
              existingResults.types,
              existingResults.rows,
              existingResults.rowCount,
              combinedExplanation,
            ),
          }).text;
          stopInsightHeartbeat();
          insights = insightText.trim() || null;
        } catch {
          // Fall back to agent's raw analysis if synthesis fails
          insights = agentAnalysis || null;
        }

        if (insights) {
          sendEvent(controller, 'insights', { insights });
        }

        // 6. Persist insights to database
        if (messageId) {
          await dbAdmin
            .from('data_explorer_messages')
            .update({ insights })
            .eq('id', messageId);
        }

        sendEvent(controller, 'complete', {});
        controller.close();
      } catch (err: any) {
        sendEvent(controller, 'error', { message: err.message || 'Insight agent stream failed' });
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
