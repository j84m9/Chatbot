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
  const dashboardId = searchParams.get('dashboardId');

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let query = dbAdmin
    .from('pinned_charts')
    .select('*')
    .eq('user_id', user.id)
    .order('display_order', { ascending: true });

  if (dashboardId) {
    query = query.eq('dashboard_id', dashboardId);
  } else if (connectionId) {
    query = query.eq('connection_id', connectionId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { connection_id, title, chart_config, results_snapshot, source_message_id, source_sql, source_question, item_type, slicer_config, dashboard_id } = body;

  // Slicers don't need chart_config/results_snapshot
  if (!connection_id || !title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (item_type !== 'slicer' && (!chart_config || !results_snapshot)) {
    return NextResponse.json({ error: 'Missing chart_config or results_snapshot' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get next display_order
  const { data: existing } = await dbAdmin
    .from('pinned_charts')
    .select('display_order')
    .eq('user_id', user.id)
    .eq('connection_id', connection_id)
    .order('display_order', { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? existing[0].display_order + 1 : 0;

  const insertData: Record<string, any> = {
    user_id: user.id,
    connection_id,
    title,
    chart_config: chart_config || {},
    results_snapshot: results_snapshot || { rows: [], columns: [] },
    source_message_id: source_message_id || null,
    source_sql: source_sql || null,
    source_question: source_question || null,
    display_order: nextOrder,
    item_type: item_type || 'chart',
  };
  if (slicer_config) insertData.slicer_config = slicer_config;
  if (dashboard_id) insertData.dashboard_id = dashboard_id;

  const { data, error } = await dbAdmin
    .from('pinned_charts')
    .insert(insertData)
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

  const updates: Record<string, any> = {};
  if (body.layout !== undefined) updates.layout = body.layout;
  if (body.chart_config !== undefined) updates.chart_config = body.chart_config;
  if (body.title !== undefined) updates.title = body.title;
  if (body.auto_refresh_interval !== undefined) updates.auto_refresh_interval = body.auto_refresh_interval;
  if (body.last_refreshed_at !== undefined) updates.last_refreshed_at = body.last_refreshed_at;
  if (body.results_snapshot !== undefined) updates.results_snapshot = body.results_snapshot;
  if (body.dashboard_id !== undefined) updates.dashboard_id = body.dashboard_id;

  const { error } = await dbAdmin
    .from('pinned_charts')
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

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await dbAdmin
    .from('pinned_charts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
