import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js'; // The original direct import

export async function GET() {
  // 1. Securely verify the user's cookie
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Create the admin client to bypass RLS and fetch the data safely
  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Try with system_prompt column first; fall back without it if migration hasn't run
  let data: any[] | null = null;
  let error: any = null;

  const primary = await dbAdmin
    .from('chat_sessions')
    .select('id, created_at, title, system_prompt, agent_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (primary.error) {
    // Column may not exist yet — retry without it
    const fallback = await dbAdmin
      .from('chat_sessions')
      .select('id, created_at, title')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    data = fallback.data;
    error = fallback.error;
  } else {
    data = primary.data;
  }

  if (error) {
    console.error("Error fetching sessions:", error);
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
  const { id, title, system_prompt, agent_id } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing session id' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const updates: Record<string, any> = {};
  if (title !== undefined) updates.title = title;
  if (system_prompt !== undefined) updates.system_prompt = system_prompt;
  if (agent_id !== undefined) updates.agent_id = agent_id;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  let { error } = await dbAdmin
    .from('chat_sessions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  // If system_prompt column doesn't exist yet, retry without it
  if (error && system_prompt !== undefined) {
    const safeUpdates: Record<string, any> = {};
    if (title !== undefined) safeUpdates.title = title;

    if (Object.keys(safeUpdates).length > 0) {
      const retry = await dbAdmin
        .from('chat_sessions')
        .update(safeUpdates)
        .eq('id', id)
        .eq('user_id', user.id);
      error = retry.error;
    } else {
      // Only system_prompt was requested and column doesn't exist
      return NextResponse.json({ success: true });
    }
  }

  if (error) {
    console.error("Error updating session:", error);
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
  const sessionId = searchParams.get('id');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session id' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Delete messages first, then the session
  await dbAdmin.from('chat_messages').delete().eq('session_id', sessionId);
  const { error } = await dbAdmin
    .from('chat_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', user.id);

  if (error) {
    console.error("Error deleting session:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}