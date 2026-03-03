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
    .from('installed_agents')
    .select('*')
    .eq('user_id', user.id)
    .order('installed_at', { ascending: false });

  if (error) {
    console.error('Error fetching installed agents:', error);
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
  const {
    store_agent_id,
    name,
    description,
    system_prompt,
    job_category,
    logo_url,
    downloads,
    tools,
    skills,
    parent_agent_id,
    store_created_by,
  } = body;

  if (!store_agent_id || !name || !system_prompt) {
    return NextResponse.json({ error: 'Missing required fields: store_agent_id, name, system_prompt' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await dbAdmin
    .from('installed_agents')
    .upsert(
      {
        user_id: user.id,
        store_agent_id,
        name,
        description: description || null,
        system_prompt,
        job_category: job_category || null,
        logo_url: logo_url || null,
        downloads: downloads || 0,
        tools: tools || [],
        skills: skills || [],
        parent_agent_id: parent_agent_id || null,
        store_created_by: store_created_by || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,store_agent_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error installing agent:', error);
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
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing agent id' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await dbAdmin
    .from('installed_agents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error uninstalling agent:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
