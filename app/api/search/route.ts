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
  const q = searchParams.get('q')?.trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Search messages with ILIKE on content cast to text, joined with sessions
  const { data, error } = await dbAdmin
    .from('chat_messages')
    .select(`
      id,
      role,
      content,
      created_at,
      session_id,
      chat_sessions!inner (
        id,
        title,
        user_id
      )
    `)
    .eq('chat_sessions.user_id', user.id)
    .ilike('content::text', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Extract match snippets from the content
  const results = (data || []).map((msg: any) => {
    let matchSnippet = '';
    try {
      const parts = Array.isArray(msg.content) ? msg.content : [];
      const fullText = parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join(' ');

      const lowerText = fullText.toLowerCase();
      const idx = lowerText.indexOf(q.toLowerCase());
      if (idx >= 0) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(fullText.length, idx + q.length + 40);
        matchSnippet = (start > 0 ? '...' : '') + fullText.slice(start, end) + (end < fullText.length ? '...' : '');
      } else {
        matchSnippet = fullText.slice(0, 80) + (fullText.length > 80 ? '...' : '');
      }
    } catch {
      matchSnippet = 'Match found';
    }

    const session = msg.chat_sessions;
    return {
      sessionId: msg.session_id,
      sessionTitle: session?.title || 'Untitled',
      role: msg.role,
      matchSnippet,
      createdAt: msg.created_at,
    };
  });

  return NextResponse.json(results);
}
