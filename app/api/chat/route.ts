import { ollama } from 'ai-sdk-ollama';
import { streamText, convertToModelMessages } from 'ai';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  // Grab the session ID from the URL now!
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('id');
  const { messages } = await req.json();
  
  // 1. Securely verify the user
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();
  
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!sessionId) {
    return new Response("Missing Session ID", { status: 400 });
  }

  // 2. Create the admin client for guaranteed database writes
  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const firstUserMessage = messages.find((m: any) => m.role === 'user');
  let chatTitle = 'New Chat';
  
  if (firstUserMessage) {
    const textContent = typeof firstUserMessage.content === 'string' 
      ? firstUserMessage.content 
      : (firstUserMessage.parts ? firstUserMessage.parts.map((p: any) => p.text).join('') : 'New Chat');
    chatTitle = textContent.split('\n')[0].substring(0, 40);
  }

  // 3. Save Session (Logging errors if it fails)
  const { error: sessionError } = await dbAdmin
    .from('chat_sessions')
    .upsert({ id: sessionId, title: chatTitle, user_id: user.id }, { onConflict: 'id' });
    
  if (sessionError) console.error("Session Save Error:", sessionError);

  // 4. Save User Message
  const lastUserMessage = messages[messages.length - 1];
  const { error: msgError } = await dbAdmin.from('chat_messages').insert({
    session_id: sessionId,
    role: 'user',
    content: lastUserMessage.parts || [{ type: 'text', text: lastUserMessage.content || '' }]
  });

  if (msgError) console.error("User Msg Save Error:", msgError);

  // 5. Start Stream
  const result = streamText({
    model: ollama('llama3.2:1b'),
    system: "You are a highly analytical AI assistant. You excel at breaking down complex topics into structured explanations.",
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ responseMessage }) => {
      // 6. Save Assistant Message using admin client
      const { error: assistantMsgError } = await dbAdmin.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: responseMessage.parts
      });
      if (assistantMsgError) console.error("Assistant Msg Save Error:", assistantMsgError);
    },
  });
}