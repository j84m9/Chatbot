import { NextResponse } from 'next/server';
import { MODEL_CATALOG, PROVIDER_NAMES } from '@/utils/ai/provider';

export async function GET() {
  // Fetch actually installed Ollama models instead of using hardcoded list
  let ollamaModels = MODEL_CATALOG.ollama;
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.models && Array.isArray(data.models) && data.models.length > 0) {
        ollamaModels = data.models.map((m: any) => ({
          id: m.name,
          label: m.name,
          vision: false,
        }));
      }
    }
  } catch {
    // Ollama not running — fall back to hardcoded catalog
  }

  const models = { ...MODEL_CATALOG, ollama: ollamaModels };
  return NextResponse.json({ models, providers: PROVIDER_NAMES });
}
