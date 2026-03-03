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

const KEY_FIELDS = ['openai_api_key', 'anthropic_api_key', 'google_api_key'] as const;

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return '...';
  return '...' + key.slice(-4);
}

async function decryptKey(
  dbAdmin: any,
  encryptedValue: string | null,
): Promise<string | null> {
  if (!encryptedValue) return null;
  const encryptionKey = process.env.DB_CONNECTIONS_ENCRYPTION_KEY;
  if (!encryptionKey) return encryptedValue;

  try {
    const { data: decrypted } = await dbAdmin.rpc('decrypt_text', {
      encrypted_text: encryptedValue,
      encryption_key: encryptionKey,
    });
    return decrypted || null;
  } catch {
    // Decryption failed — treat as no key rather than exposing encrypted blob
    return null;
  }
}

async function encryptKey(
  dbAdmin: any,
  plainText: string,
): Promise<string> {
  const encryptionKey = process.env.DB_CONNECTIONS_ENCRYPTION_KEY;
  if (!encryptionKey) return plainText;

  const { data: encrypted } = await dbAdmin.rpc('encrypt_text', {
    plain_text: plainText,
    encryption_key: encryptionKey,
  });
  return encrypted || plainText;
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

  // Decrypt keys before masking
  const decryptedKeys = await Promise.all(
    KEY_FIELDS.map((field) => decryptKey(dbAdmin, settings[field]))
  );

  return NextResponse.json({
    selected_provider: settings.selected_provider,
    selected_model: settings.selected_model,
    openai_api_key: maskKey(decryptedKeys[0]),
    anthropic_api_key: maskKey(decryptedKeys[1]),
    google_api_key: maskKey(decryptedKeys[2]),
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

  // Only update API keys if the value isn't a masked placeholder — encrypt before storing
  for (const field of KEY_FIELDS) {
    if (body[field] !== undefined && !body[field]?.startsWith('...')) {
      if (body[field]) {
        updates[field] = await encryptKey(dbAdmin, body[field]);
      } else {
        updates[field] = null;
      }
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

  // Decrypt keys for the response mask
  const decryptedKeys = await Promise.all(
    KEY_FIELDS.map((field) => decryptKey(dbAdmin, data[field]))
  );

  return NextResponse.json({
    selected_provider: data.selected_provider,
    selected_model: data.selected_model,
    openai_api_key: maskKey(decryptedKeys[0]),
    anthropic_api_key: maskKey(decryptedKeys[1]),
    google_api_key: maskKey(decryptedKeys[2]),
  });
}
