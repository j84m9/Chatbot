import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { getModel } from '@/utils/ai/provider';
import { executeQuery as executeMssql, schemaToPromptText, ConnectionConfig, SchemaTable, fetchSampleRows as fetchMssqlSampleRows } from '@/utils/mssql/connection';
import { executeQuery as executeSqlite, fetchSchema as fetchSqliteSchema, fetchSampleRows as fetchSqliteSampleRows } from '@/utils/sqlite/connection';
import {
  buildSqlGenerationSystemPromptWithContext,
  buildMultiChartSuggestionSystemPrompt,
  buildChartSuggestionUserPrompt,
  buildSessionTitlePrompt,
  buildConversationContext,
  buildChartRefinementSystemPrompt,
  buildChartRefinementUserPrompt,
  buildSqlRefinementUserPrompt,
  buildInsightSystemPrompt,
  buildInsightUserPrompt,
  categorizeError,
  wrapWithDomainContext,
} from '@/utils/ai/data-explorer-prompts';

// Reuse the schema cache from the schema route
const schemaCache = new Map<string, { schema: SchemaTable[]; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { question, connectionId, sessionId, messageType, parentMessageId, chartConfigs: currentChartConfigs, exchangeData } = body;

  if (!question || !connectionId) {
    return NextResponse.json({ error: 'Missing question or connectionId' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Fetch connection + decrypt password
  const { data: conn, error: connError } = await dbAdmin
    .from('db_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .single();

  if (connError || !conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
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

  // 2. Get cached schema or fetch fresh
  let schema: SchemaTable[];
  const cached = schemaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    schema = cached.schema;
  } else {
    try {
      if (isSqlite) {
        schema = fetchSqliteSchema(conn.file_path);
      } else {
        const { fetchSchema } = await import('@/utils/mssql/connection');
        schema = await fetchSchema(mssqlConfig!);
      }
      schemaCache.set(connectionId, { schema, fetchedAt: Date.now() });
    } catch (err: any) {
      return NextResponse.json({ error: `Schema fetch failed: ${err.message}` }, { status: 500 });
    }
  }

  // 3. Resolve user's AI model
  const { data: settings } = await dbAdmin
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const provider = settings?.selected_provider || 'ollama';
  const modelId = settings?.selected_model || 'llama3.2:3b';

  // Decrypt API keys (backward-compatible: falls back to plain text if decrypt fails)
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

  let model;
  try {
    model = getModel({ provider, model: modelId, apiKey: keyMap[provider] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // Fetch agent domain context
  let domainContext: string | null = null;
  let resolvedAgentId = body.agentId || null;
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

  // Route by message type
  const type = messageType || 'query';

  if (type === 'chart_refinement') {
    return handleChartRefinement(model, question, currentChartConfigs, exchangeData, sessionId, parentMessageId, dbAdmin);
  }

  if (type === 'insight') {
    return handleInsightGeneration(model, question, exchangeData, body.messageId, dbAdmin);
  }

  // For sql_refinement, we generate new SQL then execute it (falls through to standard flow with modified prompt)
  let schemaText = schemaToPromptText(schema, dialect);

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
      // Skip
    }
  }
  if (sampleTexts.length > 0) {
    schemaText += '\n\n## Sample Data\n' + sampleTexts.join('\n');
  }

  // 4. Fetch conversation context (last 5 messages from session)
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

  // 5. Generate SQL from natural language
  let sqlQuery: string;
  let explanation: string = '';
  const dialectLabel = dialect === 'sqlite' ? 'SQLite' : 'T-SQL';

  try {
    let prompt: string;
    if (type === 'sql_refinement' && exchangeData?.sql) {
      prompt = buildSqlRefinementUserPrompt(question, exchangeData.sql, exchangeData.question || '', dialect);
    } else {
      prompt = `Generate a ${dialectLabel} query for: ${question}\n\nRespond with ONLY the SQL query, nothing else.`;
    }

    const sqlResult = await generateText({
      model,
      system: wrapWithDomainContext(buildSqlGenerationSystemPromptWithContext(schemaText, dialect, conversationContext), domainContext),
      prompt,
    });

    sqlQuery = sqlResult.text.trim();
    // Clean markdown fences if the model includes them
    sqlQuery = sqlQuery.replace(/^```(?:sql)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // Generate explanation
    const explResult = await generateText({
      model,
      prompt: `In one sentence, explain what this SQL query does:\n${sqlQuery}`,
    });
    explanation = explResult.text.trim();
  } catch (err: any) {
    return NextResponse.json({
      error: `AI generation failed: ${err.message}`,
      sql: null,
      explanation: null,
      results: null,
      chartConfig: null,
      chartConfigs: null,
    }, { status: 500 });
  }

  // 6. Execute SQL
  let results: { rows: Record<string, any>[]; columns: string[]; types: Record<string, string>; rowCount: number; executionTimeMs: number };
  try {
    if (isSqlite) {
      results = executeSqlite(conn.file_path, sqlQuery);
    } else {
      results = await executeMssql(mssqlConfig!, sqlQuery);
    }
  } catch (err: any) {
    const categorized = categorizeError(err);
    return NextResponse.json({
      sql: sqlQuery,
      explanation,
      error: `Query execution failed: ${categorized.message}`,
      errorSuggestion: categorized.suggestion,
      results: null,
      chartConfig: null,
      chartConfigs: null,
    });
  }

  // 7. Generate chart suggestions (multi-chart)
  let chartConfigs: any[] | null = null;
  let chartConfig: any = null;
  if (results.rows.length > 0) {
    try {
      const chartResult = await generateText({
        model,
        system: buildMultiChartSuggestionSystemPrompt(),
        prompt: buildChartSuggestionUserPrompt(
          question,
          results.columns,
          results.types,
          results.rows,
          results.rowCount,
        ),
      });

      let chartText = chartResult.text.trim();
      chartText = chartText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(chartText);

      // Handle both array and single object responses
      if (Array.isArray(parsed)) {
        chartConfigs = parsed;
        chartConfig = parsed[0] || null;
      } else {
        chartConfig = parsed;
        chartConfigs = [parsed];
      }
    } catch {
      // Chart suggestion is optional — proceed without it
    }
  }

  // 8. Save exchange to data_explorer_messages
  let activeSessionId = sessionId;
  if (!activeSessionId) {
    // Create a new session
    const title = question.substring(0, 50);
    const { data: newSession } = await dbAdmin
      .from('data_explorer_sessions')
      .insert({ user_id: user.id, connection_id: connectionId, title })
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
      chart_config: chartConfig,
      chart_configs: chartConfigs,
      execution_time_ms: results.executionTimeMs,
      row_count: results.rowCount,
      message_type: type,
      parent_message_id: parentMessageId || null,
    });

    // 9. Generate AI session title (after 1st and 3rd query)
    const { count } = await dbAdmin
      .from('data_explorer_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', activeSessionId);

    const msgCount = count || 0;
    if (msgCount === 1 || msgCount === 3) {
      generateSessionTitle(model, activeSessionId, dbAdmin).catch(() => {});
    }
  }

  return NextResponse.json({
    sql: sqlQuery,
    explanation,
    results: {
      rows: results.rows,
      columns: results.columns,
      types: results.types,
      rowCount: results.rowCount,
      executionTimeMs: results.executionTimeMs,
    },
    chartConfig,
    chartConfigs,
    sessionId: activeSessionId,
    error: null,
  });
}

// Generate and update session title asynchronously
async function generateSessionTitle(model: any, sessionId: string, dbAdmin: any) {
  const { data: messages } = await dbAdmin
    .from('data_explorer_messages')
    .select('question')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(5);

  if (!messages || messages.length === 0) return;

  const questions = messages.map((m: any) => m.question);

  try {
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
  } catch {
    // Title generation is optional
  }
}

// Handle chart refinement (no SQL execution needed)
async function handleChartRefinement(
  model: any,
  instruction: string,
  currentConfigs: any[],
  exchangeData: any,
  sessionId: string | null,
  parentMessageId: string | null,
  dbAdmin: any,
) {
  if (!currentConfigs || !exchangeData?.results) {
    return NextResponse.json({ error: 'Missing chart configs or exchange data' }, { status: 400 });
  }

  try {
    const result = await generateText({
      model,
      system: buildChartRefinementSystemPrompt(),
      prompt: buildChartRefinementUserPrompt(
        instruction,
        currentConfigs,
        exchangeData.results.columns,
        exchangeData.results.types,
        exchangeData.results.rowCount,
      ),
    });

    let text = result.text.trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(text);

    const chartConfigs = Array.isArray(parsed) ? parsed : [parsed];
    const chartConfig = chartConfigs[0] || null;

    // Save refinement message
    if (sessionId) {
      await dbAdmin.from('data_explorer_messages').insert({
        session_id: sessionId,
        question: instruction,
        chart_config: chartConfig,
        chart_configs: chartConfigs,
        message_type: 'chart_refinement',
        parent_message_id: parentMessageId || null,
      });
    }

    return NextResponse.json({
      chartConfig,
      chartConfigs,
      error: null,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: `Chart refinement failed: ${err.message}`,
      chartConfig: null,
      chartConfigs: null,
    }, { status: 500 });
  }
}

// Handle insight generation
async function handleInsightGeneration(
  model: any,
  question: string,
  exchangeData: any,
  messageId: string | null,
  dbAdmin: any,
) {
  if (!exchangeData?.results) {
    return NextResponse.json({ error: 'Missing exchange data' }, { status: 400 });
  }

  try {
    const result = await generateText({
      model,
      system: buildInsightSystemPrompt(),
      prompt: buildInsightUserPrompt(
        question,
        exchangeData.results.columns,
        exchangeData.results.rows,
        exchangeData.results.rowCount,
      ),
    });

    const insights = result.text.trim();

    // Persist insights to the parent message row
    if (messageId) {
      await dbAdmin
        .from('data_explorer_messages')
        .update({ insights })
        .eq('id', messageId);
    }

    return NextResponse.json({
      insights,
      error: null,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: `Insight generation failed: ${err.message}`,
      insights: null,
    }, { status: 500 });
  }
}
