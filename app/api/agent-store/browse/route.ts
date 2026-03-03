import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiUrl = process.env.AGENT_STORE_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: 'Agent store not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || '';

  // Build query string for external API
  const params = new URLSearchParams({ is_public: 'true' });
  if (search) params.set('search', search);
  if (category) params.set('category', category);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${apiUrl}/agents?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ error: 'Agent store unavailable' }, { status: 502 });
    }

    const agents = await res.json();

    // Fetch user's installed store_agent_ids to mark which are installed
    const dbAdmin = createAdminClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: installed } = await dbAdmin
      .from('installed_agents')
      .select('store_agent_id')
      .eq('user_id', user.id);

    const installedIds = new Set((installed || []).map(a => a.store_agent_id));

    // Add isInstalled flag to each agent
    const enriched = (Array.isArray(agents) ? agents : []).map((agent: any) => ({
      ...agent,
      isInstalled: installedIds.has(agent.id),
    }));

    return NextResponse.json(enriched);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Agent store request timed out' }, { status: 504 });
    }
    console.error('Agent store browse error:', err);
    return NextResponse.json({ error: 'Failed to reach agent store' }, { status: 502 });
  }
}
