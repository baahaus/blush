import type { TokenUsage } from './types.js';

/**
 * Per-model pricing rates (USD per 1M tokens).
 * Cache reads are typically discounted vs standard input.
 */
const pricing: Record<string, { input: number; output: number; cacheRead?: number }> = {
  // Anthropic
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5 },
  'claude-sonnet-4-6-20250610': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-sonnet-4-20250514': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cacheRead: 0.08 },
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'o1': { input: 15, output: 60 },
  'o1-mini': { input: 1.1, output: 4.4 },
  'o3-mini': { input: 1.1, output: 4.4 },
  // Codex (GPT-5.x) -- estimate similar to GPT-4o for now
  'gpt-5.4': { input: 2.5, output: 10 },
  'gpt-5.4-mini': { input: 0.15, output: 0.6 },
};

/**
 * Estimate the USD cost for a given model and token usage.
 * Returns null if the model has no known pricing.
 */
export function estimateCost(
  model: string,
  usage: Pick<TokenUsage, 'inputTokens' | 'outputTokens' | 'cacheReadTokens'>,
): number | null {
  const rates = pricing[model];
  if (!rates) return null;

  const inputTokens = usage.inputTokens - (usage.cacheReadTokens || 0);
  const cacheTokens = usage.cacheReadTokens || 0;
  const cacheRate = rates.cacheRead ?? rates.input;

  return (
    inputTokens * rates.input +
    cacheTokens * cacheRate +
    usage.outputTokens * rates.output
  ) / 1_000_000;
}
