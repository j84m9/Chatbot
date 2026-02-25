import { ollama } from 'ai-sdk-ollama';
import { streamText, convertToModelMessages } from 'ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  // THE ACTUAL FIX: Extract 'id' directly from the JSON payload
  const { messages, id: sessionId } = await req.json();

  if (!sessionId) {
    return new Response("Missing Session ID", { status: 400 });
  }

  // 1. "Register" the session
  await supabase
    .from('chat_sessions')
    .upsert({ id: sessionId }, { onConflict: 'id' });

  // 2. Save User Message
  const lastUserMessage = messages[messages.length - 1];
  await supabase.from('chat_messages').insert({
    session_id: sessionId,
    role: 'user',
    content: lastUserMessage.parts || [{ type: 'text', text: lastUserMessage.content }]
  });

  // 3. Start AI Stream
  const result = streamText({
    model: ollama('llama3.2:1b'),
    system: "You are a highly analytical AI assistant. You excel at breaking down complex topics into structured explanations.",
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ responseMessage }) => {
      // 4. Save Assistant Message
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: responseMessage.parts || [{ type: 'text', text: responseMessage.content }]
      });
    },
  });
}