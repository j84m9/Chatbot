import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateText, streamText } from 'ai';
import { getModel } from '@/utils/ai/provider';
import { schemaToPromptText, ConnectionConfig, SchemaTable } from '@/utils/mssql/connection';
import { fetchSchema as fetchSqliteSchema, executeQuery as executeSqlite } from '@/utils/sqlite/connection';
import {
  buildDashboardPlannerPrompt,
  buildMultiChartSuggestionSystemPrompt,
  buildChartSuggestionUserPrompt,
} from '@/utils/ai/data-explorer-prompts';
import { detectFilterableColumns } from '@/utils/dashboard-filters';

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

function extractJsonFromText(text: string): any[] | null {
  try {
    // Try direct parse
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // Strip markdown fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try { return JSON.parse(fenceMatch[1].trim()); } catch {}
    }
    // Find first [ bracket
    const start = text.indexOf('[');
    if (start >= 0) {
      let depth = 0;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '[') depth++;
        else if (text[i] === ']') depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch { break; }
        }
      }
    }
    return null;
  }
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

        sendEvent(controller, 'status', { message: 'Planning dashboard...' });

        // 4. Generate query plan
        const plannerPrompt = buildDashboardPlannerPrompt(schemaText, dialect);
        const planResult = await generateText({
          model,
          system: plannerPrompt,
          prompt: userRequest,
        });

        const plan = extractJsonFromText(planResult.text);
        if (!plan || plan.length === 0) {
          sendEvent(controller, 'error', { message: 'Failed to generate dashboard plan. Try a more specific request.' });
          controller.close();
          stopHeartbeat();
          return;
        }

        sendEvent(controller, 'plan', { queries: plan.length });

        // 5. Execute each query and generate chart
        const allResults: { rows: Record<string, any>[]; columns: string[] }[] = [];

        for (let i = 0; i < plan.length; i++) {
          const item = plan[i];
          sendEvent(controller, 'status', { message: `Executing query ${i + 1}/${plan.length}: ${item.title}` });

          try {
            // Execute SQL
            let queryResult: { rows: Record<string, any>[]; columns: string[]; types: Record<string, string>; rowCount: number };
            if (isSqlite) {
              queryResult = executeSqlite(conn.file_path, item.sql);
            } else {
              const { executeQuery: executeMssql } = await import('@/utils/mssql/connection');
              queryResult = await executeMssql(mssqlConfig!, item.sql);
            }

            if (queryResult.rows.length === 0) {
              continue; // Skip empty results
            }

            allResults.push({ rows: queryResult.rows, columns: queryResult.columns });

            // Generate chart config via LLM
            const chartSystemPrompt = buildMultiChartSuggestionSystemPrompt();
            const chartUserPrompt = buildChartSuggestionUserPrompt(
              item.title,
              queryResult.columns,
              queryResult.types,
              queryResult.rows.slice(0, 10),
              queryResult.rowCount
            );

            const chartResult = await streamText({
              model,
              system: chartSystemPrompt,
              prompt: chartUserPrompt,
            });

            let chartText = '';
            for await (const chunk of chartResult.textStream) {
              chartText += chunk;
            }

            let chartConfigs = extractJsonFromText(chartText);
            if (!chartConfigs || chartConfigs.length === 0) {
              // Fallback: use hint to build a basic config
              chartConfigs = [{
                chartType: item.chartHint || 'bar',
                title: item.title,
                xColumn: queryResult.columns[0],
                yColumn: queryResult.columns.length > 1 ? queryResult.columns[1] : queryResult.columns[0],
                xLabel: queryResult.columns[0],
                yLabel: queryResult.columns.length > 1 ? queryResult.columns[1] : queryResult.columns[0],
              }];
            }

            // Use the first chart config
            const chartConfig = { ...chartConfigs[0], title: chartConfigs[0].title || item.title };

            // Pin the chart to the dashboard
            const { data: existing } = await dbAdmin
              .from('pinned_charts')
              .select('display_order')
              .eq('user_id', user.id)
              .eq('connection_id', connectionId)
              .order('display_order', { ascending: false })
              .limit(1);

            const nextOrder = existing && existing.length > 0 ? existing[0].display_order + 1 : 0;

            const insertData: Record<string, any> = {
              user_id: user.id,
              connection_id: connectionId,
              title: chartConfig.title || item.title,
              chart_config: chartConfig,
              results_snapshot: {
                rows: queryResult.rows,
                columns: queryResult.columns,
                types: queryResult.types,
              },
              source_sql: item.sql,
              source_question: item.title,
              display_order: nextOrder + i,
            };

            if (dashboardId) {
              insertData.dashboard_id = dashboardId;
            }

            const { data: pinned } = await dbAdmin
              .from('pinned_charts')
              .insert(insertData)
              .select()
              .single();

            if (pinned) {
              sendEvent(controller, 'chart_added', { id: pinned.id, title: chartConfig.title, index: i + 1, total: plan.length });
            }
          } catch (err: any) {
            sendEvent(controller, 'status', { message: `Query ${i + 1} failed: ${err.message?.slice(0, 100)}` });
            // Continue to next query
          }
        }

        // 6. Auto-add slicers from collected results
        if (allResults.length > 0) {
          sendEvent(controller, 'status', { message: 'Adding slicer filters...' });

          // Build mock PinnedChart array for detectFilterableColumns
          const mockCharts = allResults.map((r, idx) => ({
            id: `tmp-${idx}`,
            results_snapshot: r,
            chart_config: {},
            item_type: 'chart',
          }));

          const { dateColumns, categoricalColumns } = detectFilterableColumns(mockCharts as any);
          const slicerColumns = [
            ...dateColumns.slice(0, 1).map(c => ({ column: c, filterType: 'date_range' as const })),
            ...categoricalColumns.slice(0, 1).map(c => ({ column: c, filterType: 'multi_select' as const })),
          ];

          for (const slicer of slicerColumns) {
            try {
              const { data: slicerPin } = await dbAdmin
                .from('pinned_charts')
                .insert({
                  user_id: user.id,
                  connection_id: connectionId,
                  title: slicer.column.replace(/_/g, ' '),
                  item_type: 'slicer',
                  slicer_config: { column: slicer.column, filterType: slicer.filterType },
                  chart_config: {},
                  results_snapshot: { rows: [], columns: [] },
                  display_order: 100,
                  ...(dashboardId ? { dashboard_id: dashboardId } : {}),
                })
                .select()
                .single();

              if (slicerPin) {
                sendEvent(controller, 'slicer_added', { id: slicerPin.id, column: slicer.column });
              }
            } catch {
              // Skip failed slicers
            }
          }
        }

        sendEvent(controller, 'complete', {});
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
