import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function GET() {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await dbAdmin
    .from('db_connections')
    .select('id, name, server, port, database_name, username, domain, auth_type, encrypt, trust_server_certificate, db_type, file_path, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const dbType = body.dbType || 'mssql';

  const encryptionKey = process.env.DB_CONNECTIONS_ENCRYPTION_KEY;
  if (dbType !== 'sqlite' && !encryptionKey) {
    return NextResponse.json({ error: 'Encryption key not configured' }, { status: 500 });
  }

  // Encrypt password if provided
  let passwordEncrypted: string | null = null;
  if (body.password && encryptionKey) {
    const { data: encResult, error: encError } = await dbAdmin.rpc('encrypt_text', {
      plain_text: body.password,
      encryption_key: encryptionKey,
    });
    if (encError) {
      return NextResponse.json({ error: 'Failed to encrypt password' }, { status: 500 });
    }
    passwordEncrypted = encResult;
  }

  const insertData: Record<string, any> = {
    user_id: user.id,
    name: body.name,
    db_type: dbType,
  };

  if (dbType === 'sqlite') {
    insertData.file_path = body.filePath;
    insertData.server = 'local';
    insertData.port = 0;
    insertData.database_name = body.filePath;
    insertData.auth_type = 'sql';
  } else {
    insertData.server = body.server;
    insertData.port = body.port || 1433;
    insertData.database_name = body.database;
    insertData.username = body.username || null;
    insertData.password_encrypted = passwordEncrypted;
    insertData.domain = body.domain || null;
    insertData.auth_type = body.authType || 'sql';
    insertData.encrypt = body.encrypt ?? true;
    insertData.trust_server_certificate = body.trustServerCertificate ?? false;
  }

  const { data, error } = await dbAdmin
    .from('db_connections')
    .insert(insertData)
    .select('id, name, server, port, database_name, username, domain, auth_type, encrypt, trust_server_certificate, db_type, file_path, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get('id');

  if (!connectionId) {
    return NextResponse.json({ error: 'Missing connection id' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await dbAdmin
    .from('db_connections')
    .delete()
    .eq('id', connectionId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
