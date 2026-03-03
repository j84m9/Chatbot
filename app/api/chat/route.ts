import { streamText, convertToModelMessages } from 'ai';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getModel } from '@/utils/ai/provider';

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

  // 5. Fetch user settings and resolve the model
  const { data: settings } = await dbAdmin
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const provider = settings?.selected_provider || 'ollama';
  const modelId = settings?.selected_model || 'llama3.2:1b';

  // Decrypt API keys (backward-compatible: falls back to plain text if decrypt fails)
  const encryptionKey = process.env.DB_CONNECTIONS_ENCRYPTION_KEY;
  async function decryptApiKey(value: string | null): Promise<string | null> {
    if (!value || !encryptionKey) return value;
    try {
      const { data } = await dbAdmin.rpc('decrypt_text', {
        encrypted_text: value,
        encryption_key: encryptionKey,
      });
      return data || value;
    } catch {
      return value;
    }
  }

  const keyMap: Record<string, string | null> = {
    openai: await decryptApiKey(settings?.openai_api_key),
    anthropic: await decryptApiKey(settings?.anthropic_api_key),
    google: await decryptApiKey(settings?.google_api_key),
  };

  let model;
  try {
    model = getModel({ provider, model: modelId, apiKey: keyMap[provider] });
  } catch (err: any) {
    return new Response(err.message, { status: 400 });
  }

  // 6. Resolve system prompt
  const DEFAULT_SYSTEM_PROMPT = `You are a highly analytical AI assistant. You excel at breaking down complex topics into structured explanations.

When asked to plot, graph, or visualize a mathematical function or data, generate an interactive chart using a plotly code fence. NEVER respond with Python/matplotlib code or say you cannot create plots.

Format for math functions:
\`\`\`plotly
{"chartType":"line","title":"sin(x)","function":"Math.sin(x)","xMin":-10,"xMax":10,"points":200,"xLabel":"x","yLabel":"y"}
\`\`\`

For multiple functions on one chart:
\`\`\`plotly
{"chartType":"line","title":"Trig Functions","functions":[{"expr":"Math.sin(x)","label":"sin(x)"},{"expr":"Math.cos(x)","label":"cos(x)"}],"xMin":-6.28,"xMax":6.28,"points":200,"xLabel":"x","yLabel":"y"}
\`\`\`

For data-based charts:
\`\`\`plotly
{"chartType":"bar","title":"Sales","data":{"x":["Q1","Q2","Q3","Q4"],"y":[100,200,150,300]},"xLabel":"Quarter","yLabel":"Revenue"}
\`\`\`

Supported chartType values: "line", "scatter", "bar", "pie".
Use JavaScript Math functions: Math.sin, Math.cos, Math.tan, Math.exp, Math.log, Math.sqrt, Math.abs, Math.pow, Math.PI, Math.E. For x^n use Math.pow(x,n).

Always include a brief text explanation before or after the chart.`;

  // Fetch custom system prompt from session (graceful if column doesn't exist yet)
  let systemPrompt = DEFAULT_SYSTEM_PROMPT;
  try {
    const { data: sessionData } = await dbAdmin
      .from('chat_sessions')
      .select('system_prompt')
      .eq('id', sessionId)
      .single();

    if (sessionData?.system_prompt) {
      systemPrompt = sessionData.system_prompt;
    }
  } catch {
    // system_prompt column may not exist yet — use default
  }

  // Start Stream
  const result = streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ responseMessage }) => {
      // 7. Save Assistant Message using admin client
      // Await usage from the streamText result (resolves after stream ends)
      let tokenUsage = null;
      try {
        const usage = await result.usage;
        if (usage) {
          tokenUsage = {
            promptTokens: usage.inputTokens || 0,
            completionTokens: usage.outputTokens || 0,
            totalTokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
            model: modelId,
          };
        }
      } catch {
        // Usage not available for this provider — skip
      }

      const { error: assistantMsgError } = await dbAdmin.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: responseMessage.parts,
        ...(tokenUsage ? { token_usage: tokenUsage } : {}),
      });
      if (assistantMsgError) console.error("Assistant Msg Save Error:", assistantMsgError);
    },
  });
}