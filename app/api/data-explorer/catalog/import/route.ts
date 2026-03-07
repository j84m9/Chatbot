import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { connectionId, entries } = body;

  if (!connectionId || !entries || typeof entries !== 'object') {
    return NextResponse.json({ error: 'Missing connectionId or entries' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const rows = Object.entries(entries).map(([tableName, entry]: [string, any]) => ({
    connection_id: connectionId,
    user_id: user.id,
    table_schema: entry.schema || 'dbo',
    table_name: tableName,
    user_description: entry.description || null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    category: entry.category || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await dbAdmin
    .from('table_metadata')
    .upsert(rows, { onConflict: 'connection_id,table_schema,table_name' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ imported: rows.length });
}
