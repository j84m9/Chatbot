import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { fetchSchema, ConnectionConfig } from '@/utils/mssql/connection';

// In-memory schema cache: connectionId -> { schema, fetchedAt }
const schemaCache = new Map<string, { schema: any; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get('connectionId');
  const refresh = searchParams.get('refresh') === 'true';

  if (!connectionId) {
    return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 });
  }

  // Check cache first
  if (!refresh) {
    const cached = schemaCache.get(connectionId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json({ schema: cached.schema, cached: true });
    }
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

  try {
    const schema = await fetchSchema(config);
    schemaCache.set(connectionId, { schema, fetchedAt: Date.now() });
    return NextResponse.json({ schema, cached: false });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch schema' }, { status: 500 });
  }
}
