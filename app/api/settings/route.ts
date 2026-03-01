import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const DEFAULTS = {
  selected_provider: 'ollama',
  selected_model: 'llama3.2:1b',
  openai_api_key: null,
  anthropic_api_key: null,
  google_api_key: null,
};

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return '...';
  return '...' + key.slice(-4);
}

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
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const settings = data || { ...DEFAULTS, user_id: user.id };

  return NextResponse.json({
    selected_provider: settings.selected_provider,
    selected_model: settings.selected_model,
    openai_api_key: maskKey(settings.openai_api_key),
    anthropic_api_key: maskKey(settings.anthropic_api_key),
    google_api_key: maskKey(settings.google_api_key),
  });
}

export async function POST(req: Request) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Build update payload — only include fields present in request body
  const updates: Record<string, any> = { user_id: user.id, updated_at: new Date().toISOString() };

  if (body.selected_provider !== undefined) updates.selected_provider = body.selected_provider;
  if (body.selected_model !== undefined) updates.selected_model = body.selected_model;

  // Only update API keys if the value isn't a masked placeholder
  const keyFields = ['openai_api_key', 'anthropic_api_key', 'google_api_key'] as const;
  for (const field of keyFields) {
    if (body[field] !== undefined && !body[field]?.startsWith('...')) {
      updates[field] = body[field] || null;
    }
  }

  const { data, error } = await dbAdmin
    .from('user_settings')
    .upsert(updates, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    selected_provider: data.selected_provider,
    selected_model: data.selected_model,
    openai_api_key: maskKey(data.openai_api_key),
    anthropic_api_key: maskKey(data.anthropic_api_key),
    google_api_key: maskKey(data.google_api_key),
  });
}
