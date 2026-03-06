import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { createClient as createAuthClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getModel } from '@/utils/ai/provider';
import { createWeatherTool } from '@/utils/ai/weather-tool';

export async function POST(req: Request) {
  // Grab the session ID and optional agent ID from the URL
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('id');
  const agentId = url.searchParams.get('agentId');
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
  const sessionData: Record<string, any> = { id: sessionId, title: chatTitle, user_id: user.id };
  if (agentId) sessionData.agent_id = agentId;
  const { error: sessionError } = await dbAdmin
    .from('chat_sessions')
    .upsert(sessionData, { onConflict: 'id' });
    
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
  const modelId = settings?.selected_model || 'llama3.2:3b';

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
  const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant. Respond naturally and conversationally to all questions. NEVER generate charts, code, or JSON unless the user explicitly asks you to plot, graph, or visualize something.

CHART RULES — only when the user asks to plot/graph/chart:
- You MUST use a \`\`\`plotly code fence (NOT \`\`\`json)
- All values must be valid JSON (use numbers like -6.28, not Math.PI)
- Use JavaScript Math expressions ONLY inside "function"/"expr" string values

Single function:
\`\`\`plotly
{"chartType":"line","title":"sin(x)","function":"Math.sin(x)","xMin":-6.28,"xMax":6.28,"points":200,"xLabel":"x","yLabel":"y"}
\`\`\`

Multiple functions:
\`\`\`plotly
{"chartType":"line","title":"Trig Functions","functions":[{"expr":"Math.sin(x)","label":"sin(x)"},{"expr":"Math.cos(x)","label":"cos(x)"}],"xMin":-6.28,"xMax":6.28,"points":200,"xLabel":"x","yLabel":"y"}
\`\`\`

Data chart:
\`\`\`plotly
{"chartType":"bar","title":"Sales","data":{"x":["Q1","Q2","Q3","Q4"],"y":[100,200,150,300]},"xLabel":"Quarter","yLabel":"Revenue"}
\`\`\`

Supported chartType: "line", "scatter", "bar", "pie". Math functions: Math.sin, Math.cos, Math.tan, Math.exp, Math.log, Math.sqrt, Math.abs, Math.pow(x,n), Math.PI, Math.E.

WEATHER RULES — when the user asks about weather, temperature, or forecasts:
- Call the get_weather tool with the location
- After receiving the tool result, write a brief conversational sentence, then emit the FULL tool result JSON inside a \`\`\`weather code fence
- Example: "Here's the current weather in Tokyo:" followed by \`\`\`weather {…tool result JSON…} \`\`\`
- If the tool returns an error, respond with plain text explaining the issue — do NOT emit a weather code fence`;

  // Fetch custom system prompt from session, with agent fallback
  let systemPrompt = DEFAULT_SYSTEM_PROMPT;
  try {
    const { data: sessionData } = await dbAdmin
      .from('chat_sessions')
      .select('system_prompt, agent_id')
      .eq('id', sessionId)
      .single();

    if (sessionData?.system_prompt) {
      // Custom system prompt takes priority
      systemPrompt = sessionData.system_prompt;
    } else if (sessionData?.agent_id) {
      // Fall back to agent's system prompt
      const { data: agentData } = await dbAdmin
        .from('installed_agents')
        .select('system_prompt')
        .eq('id', sessionData.agent_id)
        .single();

      if (agentData?.system_prompt) {
        systemPrompt = agentData.system_prompt;
      }
    }
  } catch {
    // system_prompt/agent_id columns may not exist yet — use default
  }

  // Append model identity so the AI can answer "which model" questions
  systemPrompt += `\n\nYou are currently running as "${modelId}" via the ${provider} provider.`;

  // Start Stream
  const result = streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: { get_weather: createWeatherTool() },
    stopWhen: stepCountIs(2),
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