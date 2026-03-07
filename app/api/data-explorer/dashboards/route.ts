import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

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

  // Fetch all dashboards (tabs) for this connection
  const { data: existing } = await dbAdmin
    .from('dashboards')
    .select('*')
    .eq('user_id', user.id)
    .eq('connection_id', connectionId)
    .order('tab_order', { ascending: true });

  if (existing && existing.length > 0) {
    return NextResponse.json(existing);
  }

  // Create default dashboard tab
  const { data: created, error } = await dbAdmin
    .from('dashboards')
    .insert({
      user_id: user.id,
      connection_id: connectionId,
      title: 'Dashboard',
      global_filters: [],
      tab_order: 0,
      is_default: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json([created]);
}

export async function POST(request: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { connection_id, title } = body;

  if (!connection_id || !title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get next tab_order
  const { data: existing } = await dbAdmin
    .from('dashboards')
    .select('tab_order')
    .eq('user_id', user.id)
    .eq('connection_id', connection_id)
    .order('tab_order', { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? existing[0].tab_order + 1 : 0;

  const { data, error } = await dbAdmin
    .from('dashboards')
    .insert({
      user_id: user.id,
      connection_id,
      title,
      global_filters: [],
      tab_order: nextOrder,
      is_default: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.global_filters !== undefined) updates.global_filters = body.global_filters;
  if (body.tab_order !== undefined) updates.tab_order = body.tab_order;

  const { error } = await dbAdmin
    .from('dashboards')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const connectionId = searchParams.get('connectionId');

  if (!id || !connectionId) {
    return NextResponse.json({ error: 'Missing id or connectionId' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Prevent deleting the last tab
  const { data: allTabs } = await dbAdmin
    .from('dashboards')
    .select('id')
    .eq('user_id', user.id)
    .eq('connection_id', connectionId);

  if (!allTabs || allTabs.length <= 1) {
    return NextResponse.json({ error: 'Cannot delete the last tab' }, { status: 400 });
  }

  // Delete cascades pinned_charts via FK
  const { error } = await dbAdmin
    .from('dashboards')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
