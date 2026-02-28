import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });
  }

  // Fetch messages in chronological order
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Rebuild the messages into the AI SDK's expected format
  const formattedMessages = data.map((msg) => {
    // We map over the parts array stored in Supabase to extract the raw text for the fallback 'content' field
    const rawText = Array.isArray(msg.content) 
      ? msg.content.map((p: any) => p.text || '').join('') 
      : msg.content;

    return {
      id: msg.id,
      role: msg.role,
      content: rawText, 
      parts: msg.content // The actual parts array used for rendering
    };
  });

  return NextResponse.json(formattedMessages);
}