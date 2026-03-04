import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function PATCH(request: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { messageId, chart_configs } = body;

  if (!messageId || !chart_configs) {
    return NextResponse.json({ error: 'Missing messageId or chart_configs' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify ownership via session join
  const { data: message } = await dbAdmin
    .from('data_explorer_messages')
    .select('id, session_id')
    .eq('id', messageId)
    .single();

  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const { data: session } = await dbAdmin
    .from('data_explorer_sessions')
    .select('id')
    .eq('id', message.session_id)
    .eq('user_id', user.id)
    .single();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { error } = await dbAdmin
    .from('data_explorer_messages')
    .update({ chart_configs, chart_config: chart_configs[0] || null })
    .eq('id', messageId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET(request: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify the user owns this session
  const { data: session, error: sessionError } = await dbAdmin
    .from('data_explorer_sessions')
    .select('id, connection_id, agent_id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Fetch messages ordered chronologically
  const { data: messages, error: msgError } = await dbAdmin
    .from('data_explorer_messages')
    .select('id, question, sql_query, explanation, results, chart_config, chart_configs, error, execution_time_ms, row_count, message_type, parent_message_id, insights, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  return NextResponse.json({
    connectionId: session.connection_id,
    agentId: session.agent_id,
    messages: messages ?? [],
  });
}
