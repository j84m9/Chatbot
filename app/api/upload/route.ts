import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
]);

export async function POST(req: Request) {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `File type not allowed: ${file.type}` },
      { status: 400 }
    );
  }

  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await dbAdmin.storage
    .from('chat-files')
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { data: { publicUrl } } = dbAdmin.storage
    .from('chat-files')
    .getPublicUrl(storagePath);

  return NextResponse.json({
    url: publicUrl,
    mediaType: file.type,
    filename: file.name,
  });
}
