import { ollama } from 'ai-sdk-ollama';
import { streamText, convertToModelMessages } from 'ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { messages, id: sessionId } = await req.json();

  if (!sessionId) {
    return new Response("Missing Session ID", { status: 400 });
  }

  // 1. Generate a title by safely extracting text from the first user message
  const firstUserMessage = messages.find((m: any) => m.role === 'user');
  let chatTitle = 'New Chat';
  
  if (firstUserMessage) {
    // The SDK might store the text in .content (string) or .parts (array)
    const textContent = typeof firstUserMessage.content === 'string' 
      ? firstUserMessage.content 
      : (firstUserMessage.parts ? firstUserMessage.parts.map((p: any) => p.text).join('') : 'New Chat');
      
    chatTitle = textContent.split('\n')[0].substring(0, 40);
  }

  // 2. Save the session with the new title
  await supabase
    .from('chat_sessions')
    .upsert({ id: sessionId, title: chatTitle }, { onConflict: 'id' });

  // 3. Save User Message 
  // (We cast to `any` on content here to safely catch strings from the frontend JSON without TypeScript complaining)
  const lastUserMessage = messages[messages.length - 1];
  await supabase.from('chat_messages').insert({
    session_id: sessionId,
    role: 'user',
    content: lastUserMessage.parts || [{ type: 'text', text: lastUserMessage.content || '' }]
  });

  // 4. Start AI Stream
  const result = streamText({
    model: ollama('llama3.2:1b'),
    system: "You are a highly analytical AI assistant. You excel at breaking down complex topics into structured explanations.",
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ responseMessage }) => {
      // 5. Save Assistant Message
      // (Strictly using .parts to satisfy the new Vercel AI SDK UIMessage typings)
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: responseMessage.parts
      });
    },
  });
}