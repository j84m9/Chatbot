import { NextResponse } from 'next/server';
import { MODEL_CATALOG, PROVIDER_NAMES } from '@/utils/ai/provider';

export async function GET() {
  // Ollama: single "Local Model" entry using the first installed model
  let ollamaModels: { id: string; label: string; vision: boolean }[] = [];
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
    // Ollama not running
  }

  const models = { ...MODEL_CATALOG, ollama: ollamaModels };
  return NextResponse.json({ models, providers: PROVIDER_NAMES });
}
