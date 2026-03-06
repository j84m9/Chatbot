import { tool } from 'ai';
import { z } from 'zod';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

export function createWebSearchTool() {
  return tool({
    description:
      'Search the web for current information. Use this when the user asks about recent events, news, or anything that may require up-to-date information.',
    inputSchema: z.object({
      query: z.string().describe('The search query to look up on the web'),
    }),
    execute: async ({ query }) => {
      try {
        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) {
          return { error: 'Tavily API key is not configured.' };
        }

        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: 5,
            include_answer: false,
          }),
        });

        if (!res.ok) {
          return { error: `Search API failed: ${res.statusText}` };
        }

        const data = await res.json();

        return {
          query,
          results: (data.results || []).map((r: TavilyResult) => ({
            title: r.title,
            url: r.url,
            content: r.content,
          })),
          searchedAt: new Date().toISOString(),
        };
      } catch (err: any) {
        return { error: err.message || 'Failed to search the web' };
      }
    },
  });
}
