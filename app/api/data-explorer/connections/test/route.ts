import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { testConnection, ConnectionConfig } from '@/utils/mssql/connection';

export async function POST(req: Request) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  const config: ConnectionConfig = {
    server: body.server,
    port: body.port || 1433,
    database: body.database,
    username: body.username,
    password: body.password,
    domain: body.domain,
    authType: body.authType || 'sql',
    encrypt: body.encrypt ?? true,
    trustServerCertificate: body.trustServerCertificate ?? false,
  };

  const result = await testConnection(config);
  return NextResponse.json(result);
}
