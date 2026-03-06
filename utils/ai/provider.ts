import { ollama } from 'ai-sdk-ollama';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export const PROVIDER_NAMES: Record<string, string> = {
  ollama: 'Local Model',
  anthropic: 'Anthropic',
  google: 'Google',
  openai: 'OpenAI',
};

export const MODEL_CATALOG: Record<string, { id: string; label: string; vision?: boolean }[]> = {
  ollama: [],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', vision: true },
    { id: 'claude-haiku-4-20250414', label: 'Claude Haiku 4', vision: true },
  ],
  google: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', vision: true },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', vision: true },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', vision: true },
  ],
  openai: [
    { id: 'gpt-5.4', label: 'GPT-5.4', vision: true },
    { id: 'gpt-5.4-pro', label: 'GPT-5.4 Pro', vision: true },
    { id: 'gpt-5.3-chat-latest', label: 'GPT-5.3 Instant', vision: true },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', vision: true },
    { id: 'o4-mini', label: 'o4-mini', vision: false },
    { id: 'gpt-4o', label: 'GPT-4o', vision: true },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', vision: true },
    { id: 'o3-mini', label: 'o3-mini', vision: false },
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
