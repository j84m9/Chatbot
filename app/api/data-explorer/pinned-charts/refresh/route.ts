import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { executeQuery as executeMssql, ConnectionConfig } from '@/utils/mssql/connection';
import { executeQuery as executeSqlite } from '@/utils/sqlite/connection';

export async function POST(request: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { chartId, overrideSql } = body;

  if (!chartId) {
    return NextResponse.json({ error: 'Missing chartId' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch the pinned chart
  const { data: chart, error: chartError } = await dbAdmin
    .from('pinned_charts')
    .select('*')
    .eq('id', chartId)
    .eq('user_id', user.id)
    .single();

  if (chartError || !chart) {
    return NextResponse.json({ error: 'Chart not found' }, { status: 404 });
  }

  const sql = overrideSql || chart.source_sql;
  if (!sql) {
    return NextResponse.json({ error: 'No source SQL available for this chart' }, { status: 400 });
  }

  // Fetch connection and decrypt password
  const { data: conn, error: connError } = await dbAdmin
    .from('db_connections')
    .select('*')
    .eq('id', chart.connection_id)
    .eq('user_id', user.id)
    .single();

  if (connError || !conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  const isSqlite = conn.db_type === 'sqlite';
  const encryptionKey = process.env.DB_CONNECTIONS_ENCRYPTION_KEY;

  try {
    let results: { rows: Record<string, any>[]; columns: string[]; types: Record<string, string>; rowCount: number; executionTimeMs: number };

    if (isSqlite) {
      results = executeSqlite(conn.file_path, sql);
    } else {
      let password: string | undefined;
      if (conn.password_encrypted && encryptionKey) {
        const { data: decrypted } = await dbAdmin.rpc('decrypt_text', {
          encrypted_text: conn.password_encrypted,
          encryption_key: encryptionKey,
        });
        if (decrypted) password = decrypted;
      }

      const mssqlConfig: ConnectionConfig = {
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

      results = await executeMssql(mssqlConfig, sql);
    }

    // Update the pinned chart with new data
    const now = new Date().toISOString();
    const newSnapshot = {
      rows: results.rows,
      columns: results.columns,
      types: results.types,
    };

    const { error: updateError } = await dbAdmin
      .from('pinned_charts')
      .update({
        results_snapshot: newSnapshot,
        last_refreshed_at: now,
      })
      .eq('id', chartId)
      .eq('user_id', user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      results_snapshot: newSnapshot,
      last_refreshed_at: now,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Query execution failed' }, { status: 500 });
  }
}
