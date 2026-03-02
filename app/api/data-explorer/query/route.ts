import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { getModel } from '@/utils/ai/provider';
import { executeQuery as executeMssql, schemaToPromptText, ConnectionConfig, SchemaTable } from '@/utils/mssql/connection';
import { executeQuery as executeSqlite, fetchSchema as fetchSqliteSchema } from '@/utils/sqlite/connection';
import {
  buildSqlGenerationSystemPrompt,
  buildChartSuggestionSystemPrompt,
  buildChartSuggestionUserPrompt,
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
  const { question, connectionId, sessionId } = body;

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
  const modelId = settings?.selected_model || 'llama3.2:1b';

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

  // 4. Generate SQL from natural language
  const schemaText = schemaToPromptText(schema);
  let sqlQuery: string;
  let explanation: string = '';
  const dialectLabel = dialect === 'sqlite' ? 'SQLite' : 'T-SQL';

  try {
    const sqlResult = await generateText({
      model,
      system: buildSqlGenerationSystemPrompt(schemaText, dialect),
      prompt: `Generate a ${dialectLabel} query for: ${question}\n\nRespond with ONLY the SQL query, nothing else.`,
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
    }, { status: 500 });
  }

  // 5. Execute SQL
  let results: { rows: Record<string, any>[]; columns: string[]; types: Record<string, string>; rowCount: number; executionTimeMs: number };
  try {
    if (isSqlite) {
      results = executeSqlite(conn.file_path, sqlQuery);
    } else {
      results = await executeMssql(mssqlConfig!, sqlQuery);
    }
  } catch (err: any) {
    // Return the SQL even if execution fails
    return NextResponse.json({
      sql: sqlQuery,
      explanation,
      error: `Query execution failed: ${err.message}`,
      results: null,
      chartConfig: null,
    });
  }

  // 6. Generate chart suggestion
  let chartConfig = null;
  if (results.rows.length > 0) {
    try {
      const chartResult = await generateText({
        model,
        system: buildChartSuggestionSystemPrompt(),
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
      chartConfig = JSON.parse(chartText);
    } catch {
      // Chart suggestion is optional — proceed without it
    }
  }

  // 7. Save exchange to data_explorer_messages
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
      execution_time_ms: results.executionTimeMs,
      row_count: results.rowCount,
    });
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
    sessionId: activeSessionId,
    error: null,
  });
}
