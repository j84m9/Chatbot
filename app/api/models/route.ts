import { NextResponse } from 'next/server';
import { MODEL_CATALOG, PROVIDER_NAMES } from '@/utils/ai/provider';

export async function GET() {
  return NextResponse.json({ models: MODEL_CATALOG, providers: PROVIDER_NAMES });
}
