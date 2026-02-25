import { ollama } from 'ai-sdk-ollama';
import { streamText, convertToModelMessages } from 'ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  // Extract the frontend-generated sessionId alongside the messages
  const { messages, sessionId } = await req.json();

  // 1. Create the session and log any errors
  const { error: sessionError } = await supabase
    .from('chat_sessions')
    .upsert({ id: sessionId }, { onConflict: 'id' });
    
  if (sessionError) console.error("Session Upsert Error:", sessionError);

  // 2. Save the User's Message
  const lastUserMessage = messages[messages.length - 1];
  const { error: userMsgError } = await supabase.from('chat_messages').insert({
    session_id: sessionId,
    role: 'user',
    content: lastUserMessage.parts
  });
  
  if (userMsgError) console.error("User Message Insert Error:", userMsgError);

  // 3. Start the AI Stream
  const result = streamText({
    model: ollama('llama3.2:1b'),
    system: "You are a highly analytical AI assistant. You excel at breaking down complex topics into structured explanations, drawing connections to theoretical physics, loop quantum gravity, and network science whenever relevant.",
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ responseMessage }) => {
      // 4. Save the Assistant's Message when the stream completes
      const { error: assistantMsgError } = await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: responseMessage.parts
      });
      
      if (assistantMsgError) console.error("Assistant Message Insert Error:", assistantMsgError);
    },
  });
}