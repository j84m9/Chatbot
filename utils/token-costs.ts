// Cost per 1M tokens: [input, output]
const COST_TABLE: Record<string, [number, number]> = {
  // OpenAI
  'gpt-4o': [2.5, 10],
  'gpt-4o-mini': [0.15, 0.6],
  'o3-mini': [1.1, 4.4],
  // Anthropic
  'claude-sonnet-4-20250514': [3, 15],
  'claude-haiku-4-20250414': [0.8, 4],
  // Google
  'gemini-2.0-flash': [0.1, 0.4],
  'gemini-2.5-pro': [1.25, 10],
  'gemini-2.5-flash': [0.15, 0.6],
};

export function estimateCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number | null {
  const costs = COST_TABLE[modelId];
  if (!costs) return null;
  const [inputCost, outputCost] = costs;
  return (promptTokens * inputCost + completionTokens * outputCost) / 1_000_000;
}
