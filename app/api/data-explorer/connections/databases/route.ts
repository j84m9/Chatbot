import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { listDatabases, ConnectionConfig } from '@/utils/mssql/connection';

export async function GET(request: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get('connectionId');

  if (!connectionId) {
    return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch connection details
  const { data: conn, error: connError } = await dbAdmin
    .from('db_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .single();

  if (connError || !conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  if (conn.db_type !== 'mssql') {
    return NextResponse.json({ error: 'Only MSSQL connections support listing databases' }, { status: 400 });
  }

  // Decrypt password
  const encryptionKey = process.env.DB_CONNECTIONS_ENCRYPTION_KEY;
  let password: string | undefined;
  if (conn.password_encrypted && encryptionKey) {
    const { data: decrypted, error: decError } = await dbAdmin.rpc('decrypt_text', {
      encrypted_text: conn.password_encrypted,
      encryption_key: encryptionKey,
    });
    if (!decError) password = decrypted;
  }

  const config: ConnectionConfig = {
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

  const result = await listDatabases(config);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Find existing databases on this server for this user
  const { data: existingConns } = await dbAdmin
    .from('db_connections')
    .select('database_name')
    .eq('user_id', user.id)
    .eq('server', conn.server)
    .eq('db_type', 'mssql');

  const existingDatabases = (existingConns || []).map((c: any) => c.database_name);

  return NextResponse.json({ databases: result.databases, existingDatabases });
}
