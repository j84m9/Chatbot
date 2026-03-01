import { ollama } from 'ai-sdk-ollama';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export const PROVIDER_NAMES: Record<string, string> = {
  ollama: 'Ollama',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};

export const MODEL_CATALOG: Record<string, { id: string; label: string }[]> = {
  ollama: [
    { id: 'llama3.2:1b', label: 'Llama 3.2 1B' },
    { id: 'llama3.2:3b', label: 'Llama 3.2 3B' },
    { id: 'llama3.1:8b', label: 'Llama 3.1 8B' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'o3-mini', label: 'o3-mini' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-haiku-4-20250414', label: 'Claude Haiku 4' },
  ],
  google: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
};

export function getModel({
  provider,
  model,
  apiKey,
}: {
  provider: string;
  model: string;
  apiKey?: string | null;
}) {
  switch (provider) {
    case 'openai': {
      if (!apiKey) throw new Error('OpenAI API key is required');
      const openai = createOpenAI({ apiKey });
      return openai(model);
    }
    case 'anthropic': {
      if (!apiKey) throw new Error('Anthropic API key is required');
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model);
    }
    case 'google': {
      if (!apiKey) throw new Error('Google API key is required');
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model);
    }
    case 'ollama':
    default:
      return ollama(model);
  }
}
