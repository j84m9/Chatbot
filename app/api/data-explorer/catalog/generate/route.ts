import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { getModel } from '@/utils/ai/provider';
import { SchemaTable } from '@/utils/mssql/connection';
import { fetchSchema as fetchSqliteSchema } from '@/utils/sqlite/connection';
import { ConnectionConfig } from '@/utils/mssql/connection';

const schemaCache = new Map<string, { schema: SchemaTable[]; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function sendEvent(controller: ReadableStreamDefaultController, stage: string, data: any) {
  const chunk = `data: ${JSON.stringify({ stage, data })}\n\n`;
  controller.enqueue(new TextEncoder().encode(chunk));
}

function buildDescriptionPrompt(tables: { name: string; schema: string; columns: string[]; sampleRows: Record<string, any>[]; fks: string[] }[]): string {
  const tableBlocks = tables.map((t) => {
    const colList = t.columns.join(', ');
    const fkList = t.fks.length > 0 ? `\nForeign keys: ${t.fks.join('; ')}` : '';
    const sampleBlock = t.sampleRows.length > 0
      ? `\nSample rows:\n${t.sampleRows.map((r) => JSON.stringify(r)).join('\n')}`
      : '';
    return `### [${t.schema}].[${t.name}]\nColumns: ${colList}${fkList}${sampleBlock}`;
  }).join('\n\n');

  return `You are a database documentation assistant. For each table below, generate:
1. A concise 1-sentence description of what data the table stores
2. 1-3 relevant tags (lowercase, single words like "sales", "inventory", "users")
3. A category (e.g. "Sales", "Inventory", "HR", "Finance", "System", "Reference")

Respond with a JSON array matching the order of tables. Each entry:
{ "name": "<table_name>", "schema": "<schema_name>", "description": "<1 sentence>", "tags": ["tag1", "tag2"], "category": "<Category>" }

Return ONLY valid JSON, no markdown fences.

${tableBlocks}`;
}

export async function POST(req: Request) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { connectionId } = body;

  if (!connectionId) {
    return new Response('Missing connectionId', { status: 400 });
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

        sendEvent(controller, 'progress', { total: schema.length, completed: 0, message: 'Starting catalog generation...' });

        // 4. Process tables in batches of 10
        const batchSize = 10;
        let completed = 0;

        for (let i = 0; i < schema.length; i += batchSize) {
          const batch = schema.slice(i, i + batchSize);

          // Collect sample rows for each table in the batch
          const tablesForPrompt = await Promise.all(
            batch.map(async (table) => {
              let sampleRows: Record<string, any>[] = [];
              try {
                if (isSqlite && conn.file_path) {
                  const { fetchSampleRows } = await import('@/utils/sqlite/connection');
                  sampleRows = fetchSampleRows(conn.file_path, table.name, 3);
                } else if (mssqlConfig) {
                  const { fetchSampleRows } = await import('@/utils/mssql/connection');
                  sampleRows = await fetchSampleRows(mssqlConfig, table.schema, table.name, 3);
                }
              } catch {
                // Sample data not critical
              }

              return {
                name: table.name,
                schema: table.schema,
                columns: table.columns.map((c) => `${c.name} (${c.type}${c.isPrimaryKey ? ', PK' : ''}${!c.nullable ? ', NOT NULL' : ''})`),
                sampleRows,
                fks: (table.foreignKeys || []).map((fk) => `${fk.fromColumn} -> ${fk.toTable}(${fk.toColumn})`),
              };
            })
          );

          // Get row count estimates
          const rowCounts = new Map<string, number>();
          try {
            if (isSqlite && conn.file_path) {
              const { executeQuery } = await import('@/utils/sqlite/connection');
              for (const table of batch) {
                try {
                  const result = executeQuery(conn.file_path, `SELECT COUNT(*) as cnt FROM "${table.name}"`);
                  if (result.rows.length > 0) {
                    rowCounts.set(table.name, result.rows[0].cnt);
                  }
                } catch {
                  // Count not critical
                }
              }
            } else if (mssqlConfig && dialect === 'tsql') {
              const { executeQuery } = await import('@/utils/mssql/connection');
              const tableNames = batch.map((t) => `'${t.name}'`).join(',');
              try {
                const result = await executeQuery(mssqlConfig, `
                  SELECT t.name AS table_name, SUM(p.rows) AS row_count
                  FROM sys.tables t
                  JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
                  WHERE t.name IN (${tableNames})
                  GROUP BY t.name
                `);
                for (const row of result.rows) {
                  rowCounts.set(row.table_name, row.row_count);
                }
              } catch {
                // Row count not critical
              }
            }
          } catch {
            // Row counts not critical
          }

          // Call LLM for descriptions
          try {
            const prompt = buildDescriptionPrompt(tablesForPrompt);
            const result = await generateText({ model, prompt });

            let text = result.text.trim();
            text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            const descriptions: { name: string; schema: string; description: string; tags: string[]; category: string }[] = JSON.parse(text);

            // Upsert into table_metadata
            for (const desc of descriptions) {
              // Match by name+schema first, fall back to name-only (LLMs often return
              // wrong schema values for SQLite where the real schema is "main")
              const table = batch.find(
                (t) => t.name.toLowerCase() === desc.name.toLowerCase() && t.schema.toLowerCase() === (desc.schema || '').toLowerCase()
              ) || batch.find(
                (t) => t.name.toLowerCase() === desc.name.toLowerCase()
              );
              if (!table) continue;

              const rowCount = rowCounts.get(table.name) ?? null;

              await dbAdmin
                .from('table_metadata')
                .upsert(
                  {
                    connection_id: connectionId,
                    user_id: user.id,
                    table_schema: table.schema,
                    table_name: table.name,
                    auto_description: desc.description,
                    tags: desc.tags || [],
                    category: desc.category || null,
                    relationship_summary: (table.foreignKeys || [])
                      .map((fk) => `${fk.fromColumn} -> ${fk.toTable}`)
                      .join(', ') || null,
                    estimated_row_count: rowCount,
                    auto_cataloged_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'connection_id,table_schema,table_name' }
                );
            }
          } catch (err: any) {
            // Log but continue — partial catalog is still useful
            sendEvent(controller, 'batch_error', {
              batch: i / batchSize + 1,
              message: err.message || 'Failed to generate descriptions for batch',
            });
          }

          completed += batch.length;
          sendEvent(controller, 'progress', {
            total: schema.length,
            completed,
            message: `Cataloged ${completed} of ${schema.length} tables...`,
          });
        }

        sendEvent(controller, 'complete', {
          total: schema.length,
          completed,
          message: 'Catalog generation complete',
        });
        controller.close();
      } catch (err: any) {
        sendEvent(controller, 'error', { message: err.message || 'Catalog generation failed' });
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
