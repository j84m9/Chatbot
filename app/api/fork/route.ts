import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId, messageId } = await req.json();

  if (!sessionId || !messageId) {
    return NextResponse.json({ error: 'Missing sessionId or messageId' }, { status: 400 });
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch the source session
  const { data: sourceSession, error: sessionError } = await dbAdmin
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (sessionError || !sourceSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Fetch messages up to and including the target message
  const { data: targetMsg } = await dbAdmin
    .from('chat_messages')
    .select('created_at')
    .eq('id', messageId)
    .single();

  if (!targetMsg) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const { data: messages, error: msgsError } = await dbAdmin
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .lte('created_at', targetMsg.created_at)
    .order('created_at', { ascending: true });

  if (msgsError) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }

  // Create the forked session
  const newSessionId = crypto.randomUUID();
  const forkTitle = `Fork of ${sourceSession.title || 'Chat'}`;

  const { error: newSessionError } = await dbAdmin.from('chat_sessions').insert({
    id: newSessionId,
    title: forkTitle,
    user_id: user.id,
    system_prompt: sourceSession.system_prompt,
    agent_id: sourceSession.agent_id,
    forked_from_session_id: sessionId,
    forked_at_message_id: messageId,
  });

  if (newSessionError) {
    console.error('Fork session create error:', newSessionError);
    return NextResponse.json({ error: 'Failed to create forked session' }, { status: 500 });
  }

  // Copy messages to the new session
  if (messages && messages.length > 0) {
    const copies = messages.map(msg => ({
      session_id: newSessionId,
      role: msg.role,
      content: msg.content,
      ...(msg.token_usage ? { token_usage: msg.token_usage } : {}),
    }));

    const { error: copyError } = await dbAdmin.from('chat_messages').insert(copies);

    if (copyError) {
      console.error('Fork message copy error:', copyError);
      return NextResponse.json({ error: 'Failed to copy messages' }, { status: 500 });
    }
  }

  return NextResponse.json({ id: newSessionId, title: forkTitle });
}
